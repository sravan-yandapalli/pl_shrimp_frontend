import { NextResponse } from "next/server";

import {
  SageMakerRuntimeClient,
  InvokeEndpointCommand,
} from "@aws-sdk/client-sagemaker-runtime";

import {
  S3Client,
  GetObjectCommand,
} from "@aws-sdk/client-s3";

import {
  getSignedUrl,
} from "@aws-sdk/s3-request-presigner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// ============================================================
// AWS CONFIGURATION
// ============================================================

const REGION =
  process.env.NEXT_PUBLIC_DIZIAQUA_REGION ||
  "ap-south-1";

const credentials = {
  accessKeyId:
    process.env.NEXT_PUBLIC_DIZIAQUA_ACCESS_KEY_ID ||
    "",

  secretAccessKey:
    process.env.NEXT_PUBLIC_DIZIAQUA_SECRET_ACCESS_KEY ||
    "",
};

// ============================================================
// AWS CLIENTS
// ============================================================

const smClient =
  new SageMakerRuntimeClient({
    region: REGION,
    credentials,
  });

const s3Client =
  new S3Client({
    region: REGION,
    credentials,
  });

// ============================================================
// CONFIGURATION
// ============================================================

const ENDPOINT_NAME =
  "shrimp-yolo-endpoint";

const DEFAULT_BUCKET =
  process.env.NEXT_PUBLIC_DIZIAQUA_S3_BUCKET ||
  "diziaqua-images-320698389233";

// ============================================================
// TYPES
// ============================================================

type BoundingBoxPrediction = {
  class: number;

  confidence: number;

  bbox: [
    number,
    number,
    number,
    number
  ];
};

type SageMakerResponse = {
  success?: boolean;

  shrimp_count?: number;

  predictions?: BoundingBoxPrediction[];

  annotated_image_url?: string;

  error?: string;
};

// ============================================================
// LOGGING
// ============================================================

function log(
  message: string,
  data?: unknown
) {
  console.log(
    `[DIZIAQUA] ${new Date().toISOString()} - ${message}`,
    data ?? ""
  );
}

// ============================================================
// INVOKE SAGEMAKER
// ============================================================

async function invokeSageMaker(
  bucket: string,
  key: string
): Promise<SageMakerResponse> {

  const payload =
    JSON.stringify({
      bucket,
      key,
    });

  log(
    "INVOKING SAGEMAKER",
    {
      endpoint:
        ENDPOINT_NAME,

      bucket,

      key,
    }
  );

  const response =
    await smClient.send(
      new InvokeEndpointCommand({
        EndpointName:
          ENDPOINT_NAME,

        ContentType:
          "application/json",

        Accept:
          "application/json",

        Body:
          Buffer.from(payload),
      })
    );

  // ==========================================================
  // CHECK BODY
  // ==========================================================

  if (!response.Body) {
    throw new Error(
      "SageMaker returned an empty response."
    );
  }

  // ==========================================================
  // READ RESPONSE
  // ==========================================================

  const responseText =
    Buffer
      .from(response.Body)
      .toString("utf-8");

  log(
    "SAGEMAKER RAW RESPONSE",
    responseText
  );

  // ==========================================================
  // PARSE JSON
  // ==========================================================

  let result:
    SageMakerResponse;

  try {

    result =
      JSON.parse(
        responseText
      ) as SageMakerResponse;

  } catch {

    throw new Error(
      "Invalid JSON returned by SageMaker: " +
      responseText
    );
  }

  // ==========================================================
  // SAGEMAKER APPLICATION ERROR
  // ==========================================================

  if (result.error) {

    throw new Error(
      result.error
    );
  }

  // ==========================================================
  // LOG SUCCESS
  // ==========================================================

  log(
    "SAGEMAKER SUCCESS",
    {
      shrimpCount:
        result.shrimp_count ??
        0,

      predictionCount:
        result.predictions?.length ??
        0,

      annotatedImageUrl:
        result.annotated_image_url ??
        null,
    }
  );

  return result;
}

// ============================================================
// CREATE PRESIGNED ANNOTATED IMAGE URL
// ============================================================

async function createPresignedImageUrl(
  bucket: string,
  annotatedS3Url: string
): Promise<string> {

  // ==========================================================
  // PARSE URL
  // ==========================================================

  let parsedUrl: URL;

  try {

    parsedUrl =
      new URL(
        annotatedS3Url
      );

  } catch {

    throw new Error(
      "Invalid annotated image URL returned by SageMaker."
    );
  }

  // ==========================================================
  // EXTRACT S3 OBJECT KEY
  //
  // Example:
  //
  // /annotated/counted_f70cecf6.jpg
  //
  // becomes:
  //
  // annotated/counted_f70cecf6.jpg
  // ==========================================================

  const annotatedKey =
    decodeURIComponent(
      parsedUrl.pathname
        .replace(/^\/+/, "")
    );

  if (!annotatedKey) {

    throw new Error(
      "Could not determine annotated image S3 key."
    );
  }

  log(
    "ANNOTATED IMAGE KEY",
    {
      bucket,
      key:
        annotatedKey,
    }
  );

  // ==========================================================
  // CREATE GET COMMAND
  // ==========================================================

  const command =
    new GetObjectCommand({
      Bucket:
        bucket,

      Key:
        annotatedKey,
    });

  // ==========================================================
  // CREATE PRESIGNED URL
  // ==========================================================

  const signedUrl =
    await getSignedUrl(
      s3Client,
      command,
      {
        expiresIn:
          3600,
      }
    );

  log(
    "PRESIGNED URL CREATED"
  );

  return signedUrl;
}

// ============================================================
// POST /api/count
// ============================================================

export async function POST(
  request: Request
) {

  const startTime =
    Date.now();

  try {

    // ========================================================
    // 1. READ REQUEST
    // ========================================================

    const body =
      await request.json();

    const bucket =
      body.bucket ||
      DEFAULT_BUCKET;

    const key =
      body.key;

    log(
      "COUNT REQUEST RECEIVED",
      {
        bucket,
        key,
      }
    );

    // ========================================================
    // 2. VALIDATE
    // ========================================================

    if (
      typeof key !== "string" ||
      !key.trim()
    ) {

      return NextResponse.json(
        {
          success: false,

          message:
            "Missing image key.",
        },
        {
          status: 400,
        }
      );
    }

    // ========================================================
    // 3. INVOKE SAGEMAKER
    // ========================================================

    const smResult =
      await invokeSageMaker(
        bucket,
        key
      );

    // ========================================================
    // 4. CREATE PRESIGNED IMAGE URL
    // ========================================================

    let annotatedImageUrl:
      string | null = null;

    if (
      typeof smResult.annotated_image_url ===
      "string" &&
      smResult.annotated_image_url.length >
        0
    ) {

      annotatedImageUrl =
        await createPresignedImageUrl(
          bucket,
          smResult.annotated_image_url
        );

    } else {

      log(
        "WARNING: SageMaker did not return annotated_image_url"
      );
    }

    // ========================================================
    // 5. PROCESSING TIME
    // ========================================================

    const processingTimeMs =
      Date.now() -
      startTime;

    // ========================================================
    // 6. CREATE RESPONSE
    // ========================================================

    const responseData = {

      success: true,

      // ------------------------------------------------------
      // SHRIMP COUNT
      // ------------------------------------------------------

      count:
        smResult.shrimp_count ??
        0,

      // ------------------------------------------------------
      // ORIGINAL FILE
      // ------------------------------------------------------

      fileName:
        key,

      // ------------------------------------------------------
      // ANNOTATED IMAGE
      // ------------------------------------------------------
      //
      // THIS IS THE PRESIGNED URL.
      //
      annotatedImageUrl,

      // Also provide imageUrl for frontend compatibility.
      imageUrl:
        annotatedImageUrl,

      // ------------------------------------------------------
      // PREDICTIONS
      // ------------------------------------------------------

      results:
        smResult.predictions ??
        [],

      // ------------------------------------------------------
      // INPUT
      // ------------------------------------------------------

      input: {
        bucket,
        key,
      },

      // ------------------------------------------------------
      // PROCESSING TIME
      // ------------------------------------------------------

      processingTimeMs,
    };

    // ========================================================
    // LOG RESPONSE
    // ========================================================

    log(
      "RETURNING RESULT",
      {
        count:
          responseData.count,

        annotatedImageAvailable:
          Boolean(
            responseData.annotatedImageUrl
          ),

        processingTimeMs:
          responseData.processingTimeMs,
      }
    );

    // ========================================================
    // RETURN
    // ========================================================

    return NextResponse.json(
      responseData,
      {
        status: 200,

        headers: {
          "Cache-Control":
            "no-store",

          "Content-Type":
            "application/json",
        },
      }
    );

  } catch (error) {

    // ========================================================
    // ERROR
    // ========================================================

    const processingTimeMs =
      Date.now() -
      startTime;

    const message =
      error instanceof Error
        ? error.message
        : String(error);

    console.error(
      "[DIZIAQUA] COUNT API ERROR:",
      error
    );

    return NextResponse.json(
      {
        success: false,

        message,

        processingTimeMs,
      },
      {
        status: 500,

        headers: {
          "Cache-Control":
            "no-store",
        },
      }
    );
  }
}
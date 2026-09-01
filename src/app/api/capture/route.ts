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
// SAGEMAKER ENDPOINT
// ============================================================

const ENDPOINT_NAME =
  "shrimp-yolo-endpoint";

// ============================================================
// DEFAULT S3 BUCKET
// ============================================================

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

type SageMakerPredictionResponse = {
  shrimp_count?: number;

  predictions?: BoundingBoxPrediction[];

  // Returned by inference.py
  annotated_image_url?: string;

  error?: string;
};

// ============================================================
// LOGGING
// ============================================================

function logStep(
  step: string,
  data?: unknown
) {
  console.log(
    `[DIZIAQUA] ${new Date().toISOString()} - ${step}`,
    data ?? ""
  );
}

// ============================================================
// CREATE PRESIGNED URL
// ============================================================

async function createAnnotatedImageUrl(
  bucket: string,
  s3Url: string
): Promise<string> {

  logStep(
    "ANNOTATED S3 URL RECEIVED",
    s3Url
  );

  let url: URL;

  try {
    url = new URL(s3Url);
  } catch {
    throw new Error(
      "Invalid annotated image URL returned by SageMaker."
    );
  }

  // ----------------------------------------------------------
  // Convert URL pathname into S3 object key
  //
  // Example:
  //
  // /annotated/counted_81a2fc2a.jpg
  //
  // becomes:
  //
  // annotated/counted_81a2fc2a.jpg
  // ----------------------------------------------------------

  const annotatedKey =
    decodeURIComponent(
      url.pathname.replace(/^\/+/, "")
    );

  if (!annotatedKey) {
    throw new Error(
      "Annotated image S3 key is empty."
    );
  }

  logStep(
    "ANNOTATED S3 KEY",
    {
      bucket,
      annotatedKey,
    }
  );

  // ----------------------------------------------------------
  // Verify/create presigned GET URL
  // ----------------------------------------------------------

  const signedUrl =
    await getSignedUrl(
      s3Client,

      new GetObjectCommand({
        Bucket: bucket,
        Key: annotatedKey,
      }),

      {
        expiresIn: 3600,
      }
    );

  logStep(
    "PRESIGNED ANNOTATED IMAGE URL CREATED"
  );

  return signedUrl;
}

// ============================================================
// CALL SAGEMAKER
// ============================================================

async function callSageMakerCounter(
  bucket: string,
  key: string
): Promise<SageMakerPredictionResponse> {

  logStep(
    "STARTING SAGEMAKER INVOCATION",
    {
      endpoint: ENDPOINT_NAME,
      bucket,
      key,
    }
  );

  // ----------------------------------------------------------
  // Payload sent to SageMaker
  // ----------------------------------------------------------

  const payload =
    JSON.stringify({
      bucket,
      key,
    });

  logStep(
    "SAGEMAKER PAYLOAD",
    payload
  );

  // ----------------------------------------------------------
  // Invoke endpoint
  // ----------------------------------------------------------

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

  // ----------------------------------------------------------
  // Validate response
  // ----------------------------------------------------------

  if (!response.Body) {
    throw new Error(
      "SageMaker returned an empty response."
    );
  }

  const responseText =
    Buffer
      .from(response.Body)
      .toString("utf-8");

  logStep(
    "SAGEMAKER RAW RESPONSE",
    responseText
  );

  // ----------------------------------------------------------
  // Parse JSON
  // ----------------------------------------------------------

  let result:
    SageMakerPredictionResponse;

  try {

    result =
      JSON.parse(
        responseText
      ) as SageMakerPredictionResponse;

  } catch {

    throw new Error(
      "SageMaker returned invalid JSON: " +
      responseText
    );
  }

  // ----------------------------------------------------------
  // Handle inference error
  // ----------------------------------------------------------

  if (result.error) {
    throw new Error(
      result.error
    );
  }

  // ----------------------------------------------------------
  // Log success
  // ----------------------------------------------------------

  logStep(
    "SAGEMAKER SUCCESS",
    {
      shrimpCount:
        result.shrimp_count ?? 0,

      predictionCount:
        result.predictions?.length ?? 0,

      annotatedImage:
        result.annotated_image_url ||
        null,
    }
  );

  return result;
}

// ============================================================
// POST
// ============================================================

export async function POST(
  request: Request
) {

  const requestStart =
    Date.now();

  logStep(
    "========================================"
  );

  logStep(
    "NEW SHRIMP COUNT REQUEST"
  );

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

    logStep(
      "FRONTEND REQUEST",
      {
        bucket,
        key,
      }
    );

    // ========================================================
    // 2. VALIDATE KEY
    // ========================================================

    if (!key) {

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
    // 3. CALL SAGEMAKER
    // ========================================================

    const smResult =
      await callSageMakerCounter(
        bucket,
        key
      );

    // ========================================================
    // 4. CREATE PRESIGNED ANNOTATED IMAGE URL
    // ========================================================

    let annotatedImageUrl:
      string | null = null;

    if (
      smResult.annotated_image_url
    ) {

      annotatedImageUrl =
        await createAnnotatedImageUrl(
          bucket,
          smResult.annotated_image_url
        );

    } else {

      logStep(
        "WARNING: SAGEMAKER DID NOT RETURN ANNOTATED IMAGE URL"
      );
    }

    // ========================================================
    // 5. PROCESSING TIME
    // ========================================================

    const totalTime =
      Date.now() -
      requestStart;

    // ========================================================
    // 6. FINAL RESPONSE
    // ========================================================

    const responseData = {

      success: true,

      // ------------------------------------------------------
      // Count
      // ------------------------------------------------------

      count:
        smResult.shrimp_count ??
        0,

      // ------------------------------------------------------
      // Original uploaded file
      // ------------------------------------------------------

      fileName:
        key,

      // ------------------------------------------------------
      // IMPORTANT:
      // PRESIGNED URL FOR FRONTEND
      // ------------------------------------------------------

      annotatedImageUrl,

      // ------------------------------------------------------
      // Predictions
      // ------------------------------------------------------

      results:
        smResult.predictions ||
        [],

      // ------------------------------------------------------
      // Input information
      // ------------------------------------------------------

      input: {
        bucket,
        key,
      },

      // ------------------------------------------------------
      // Processing time
      // ------------------------------------------------------

      processingTimeMs:
        totalTime,
    };

    logStep(
      "RETURNING RESULT TO FRONTEND",
      {
        count:
          responseData.count,

        annotatedImageAvailable:
          !!responseData.annotatedImageUrl,

        processingTimeMs:
          responseData.processingTimeMs,
      }
    );

    // ========================================================
    // 7. RETURN JSON
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
    // ERROR HANDLING
    // ========================================================

    const totalTime =
      Date.now() -
      requestStart;

    const message =
      error instanceof Error
        ? error.message
        : String(error);

    console.error(
      "[DIZIAQUA] REQUEST FAILED:",
      error
    );

    logStep(
      "REQUEST FAILED",
      {
        message,
        processingTimeMs:
          totalTime,
      }
    );

    return NextResponse.json(
      {
        success: false,

        message,

        processingTimeMs:
          totalTime,
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
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
// DEFAULT BUCKET
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
  // Send S3 location to SageMaker
  // ----------------------------------------------------------

  const payload =
    JSON.stringify({
      bucket,
      key,
    });

  logStep(
    "SAGEMAKER PAYLOAD CREATED",
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
      "SageMaker returned an empty response"
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
  // Handle SageMaker error
  // ----------------------------------------------------------

  if (result.error) {

    throw new Error(
      result.error
    );
  }

  // ----------------------------------------------------------
  // Log result
  // ----------------------------------------------------------

  logStep(
    "SAGEMAKER SUCCESS",
    {
      count:
        result.shrimp_count ?? 0,

      predictions:
        result.predictions?.length ?? 0,

      annotatedImageUrl:
        result.annotated_image_url ??
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

  try {

    // ========================================================
    // 1. READ FRONTEND REQUEST
    // ========================================================

    const body =
      await request.json();

    const bucket =
      body.bucket ||
      DEFAULT_BUCKET;

    const key =
      body.key;

    logStep(
      "NEW SHRIMP COUNT REQUEST",
      {
        bucket,
        key,
      }
    );

    // ========================================================
    // 2. VALIDATE
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
    // 4. CREATE PRESIGNED URL
    // ========================================================

    let annotatedImageUrl:
      string | null = null;

    if (
      smResult.annotated_image_url
    ) {

      // ------------------------------------------------------
      // Extract the S3 key from the URL returned by SageMaker.
      //
      // Example:
      //
      // https://bucket.s3.ap-south-1.amazonaws.com/
      // annotated/counted_abc12345.jpg
      //
      // becomes:
      //
      // annotated/counted_abc12345.jpg
      // ------------------------------------------------------

      let annotatedKey = "";

      try {

        const parsedUrl =
          new URL(
            smResult.annotated_image_url
          );

        annotatedKey =
          decodeURIComponent(
            parsedUrl.pathname
              .replace(/^\/+/, "")
          );

      } catch {

        throw new Error(
          "Invalid annotated image URL returned by SageMaker."
        );
      }

      if (!annotatedKey) {

        throw new Error(
          "Could not determine annotated S3 key."
        );
      }

      logStep(
        "GENERATING PRESIGNED ANNOTATED IMAGE URL",
        {
          bucket,
          annotatedKey,
        }
      );

      // ------------------------------------------------------
      // Generate private S3 download URL
      // ------------------------------------------------------

      annotatedImageUrl =
        await getSignedUrl(
          s3Client,

          new GetObjectCommand({
            Bucket:
              bucket,

            Key:
              annotatedKey,
          }),

          {
            expiresIn:
              3600,
          }
        );

      logStep(
        "PRESIGNED URL CREATED",
        {
          annotatedKey,
        }
      );
    }

    // ========================================================
    // 5. PROCESSING TIME
    // ========================================================

    const totalTime =
      Date.now() -
      requestStart;

    // ========================================================
    // 6. RETURN TO FRONTEND
    // ========================================================

    const finalResponse = {

      success: true,

      count:
        smResult.shrimp_count ??
        0,

      fileName:
        key,

      // IMPORTANT:
      // This is now a presigned URL.
      annotatedImageUrl,

      // Keep original field too.
      annotated_image_url:
        smResult.annotated_image_url ??
        null,

      processingTimeMs:
        totalTime,

      input: {
        bucket,
        key,
      },

      results:
        smResult.predictions ||
        [],
    };

    logStep(
      "RETURNING RESULT TO FRONTEND",
      {
        count:
          finalResponse.count,

        annotatedImageAvailable:
          !!annotatedImageUrl,

        processingTimeMs:
          totalTime,
      }
    );

    return NextResponse.json(
      finalResponse,
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
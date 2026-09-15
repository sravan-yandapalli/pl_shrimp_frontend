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
  process.env.AWS_REGION ||
  process.env.NEXT_PUBLIC_DIZIAQUA_REGION ||
  "ap-south-1";

const DEFAULT_BUCKET =
  process.env.DIZIAQUA_S3_BUCKET ||
  process.env.NEXT_PUBLIC_DIZIAQUA_S3_BUCKET ||
  "diziaqua-images-320698389233";

const ENDPOINT_NAME =
  process.env.SAGEMAKER_ENDPOINT_NAME ||
  "shrimp-yolo-v2-prod";

// ============================================================
// AWS CLIENTS
// ============================================================
//
// Credentials are intentionally NOT hard-coded here.
//
// AWS SDK v3 will use the server-side credential provider chain:
// AWS_ACCESS_KEY_ID
// AWS_SECRET_ACCESS_KEY
// AWS_SESSION_TOKEN (when using temporary credentials)
//

const smClient =
  new SageMakerRuntimeClient({
    region: REGION,
  });

const s3Client =
  new S3Client({
    region: REGION,
  });

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
    number,
  ];
};

type SageMakerPredictionResponse = {
  shrimp_count?: number;

  predictions?: BoundingBoxPrediction[];

  annotated_image_url?: string;

  error?: string;

  [key: string]: unknown;
};

// ============================================================
// LOGGING
// ============================================================

function logStep(
  step: string,
  data?: unknown,
) {
  console.log(
    `[DIZIAQUA] ${new Date().toISOString()} - ${step}`,
    data ?? "",
  );
}

// ============================================================
// CREATE PRESIGNED ANNOTATED IMAGE URL
// ============================================================

async function createAnnotatedImageUrl(
  bucket: string,
  s3Url: string,
): Promise<string> {
  logStep(
    "ANNOTATED S3 URL RECEIVED",
    s3Url,
  );

  let url: URL;

  try {
    url = new URL(s3Url);
  } catch {
    throw new Error(
      "Invalid annotated image URL returned by SageMaker.",
    );
  }

  // ----------------------------------------------------------
  // Convert S3 URL pathname into object key
  //
  // Example:
  //
  // https://bucket.s3.amazonaws.com/
  // annotated/counted_123.jpg
  //
  // becomes:
  //
  // annotated/counted_123.jpg
  // ----------------------------------------------------------

  const annotatedKey =
    decodeURIComponent(
      url.pathname.replace(
        /^\/+/,
        "",
      ),
    );

  if (!annotatedKey) {
    throw new Error(
      "Annotated image S3 key is empty.",
    );
  }

  logStep(
    "ANNOTATED S3 KEY",
    {
      bucket,
      annotatedKey,
    },
  );

  // ----------------------------------------------------------
  // Create presigned GET URL
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
      },
    );

  logStep(
    "PRESIGNED ANNOTATED IMAGE URL CREATED",
  );

  return signedUrl;
}

// ============================================================
// CALL SAGEMAKER
// ============================================================

async function callSageMakerCounter(
  bucket: string,
  key: string,
): Promise<SageMakerPredictionResponse> {
  logStep(
    "STARTING SAGEMAKER INVOCATION",
    {
      endpoint:
        ENDPOINT_NAME,

      region:
        REGION,

      bucket,
      key,
    },
  );

  // ----------------------------------------------------------
  // Payload sent to inference.py
  // ----------------------------------------------------------

  const payload =
    JSON.stringify({
      bucket,
      key,
    });

  logStep(
    "SAGEMAKER PAYLOAD",
    payload,
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
          Buffer.from(
            payload,
          ),
      }),
    );

  // ----------------------------------------------------------
  // Validate response
  // ----------------------------------------------------------

  if (!response.Body) {
    throw new Error(
      "SageMaker returned an empty response.",
    );
  }

  const responseText =
    Buffer
      .from(
        response.Body,
      )
      .toString("utf-8");

  logStep(
    "SAGEMAKER RAW RESPONSE",
    responseText,
  );

  // ----------------------------------------------------------
  // Parse JSON
  // ----------------------------------------------------------

  let result:
    SageMakerPredictionResponse;

  try {
    result =
      JSON.parse(
        responseText,
      ) as SageMakerPredictionResponse;
  } catch {
    throw new Error(
      "SageMaker returned invalid JSON: " +
        responseText,
    );
  }

  // ----------------------------------------------------------
  // Handle inference error
  // ----------------------------------------------------------

  if (result.error) {
    throw new Error(
      result.error,
    );
  }

  // ----------------------------------------------------------
  // Log success
  // ----------------------------------------------------------

  logStep(
    "SAGEMAKER SUCCESS",
    {
      shrimpCount:
        result.shrimp_count ??
        0,

      predictionCount:
        result.predictions
          ?.length ?? 0,

      annotatedImage:
        result.annotated_image_url ||
        null,
    },
  );

  return result;
}

// ============================================================
// POST
// ============================================================

export async function POST(
  request: Request,
) {
  const requestStart =
    Date.now();

  logStep(
    "========================================",
  );

  logStep(
    "NEW SHRIMP COUNT REQUEST",
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
      },
    );

    // ========================================================
    // 2. VALIDATE BUCKET
    // ========================================================

    if (
      typeof bucket !==
        "string" ||
      bucket.length === 0
    ) {
      return NextResponse.json(
        {
          success: false,

          message:
            "Missing S3 bucket.",
        },
        {
          status: 400,
        },
      );
    }

    // ========================================================
    // 3. VALIDATE KEY
    // ========================================================

    if (
      typeof key !==
        "string" ||
      key.length === 0
    ) {
      return NextResponse.json(
        {
          success: false,

          message:
            "Missing image key.",
        },
        {
          status: 400,
        },
      );
    }

    // ========================================================
    // 4. CALL SAGEMAKER
    // ========================================================

    const smResult =
      await callSageMakerCounter(
        bucket,
        key,
      );

    // ========================================================
    // 5. CREATE PRESIGNED
    //    ANNOTATED IMAGE URL
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
        await createAnnotatedImageUrl(
          bucket,
          smResult.annotated_image_url,
        );
    } else {
      logStep(
        "WARNING: SAGEMAKER DID NOT RETURN ANNOTATED IMAGE URL",
      );
    }

    // ========================================================
    // 6. PROCESSING TIME
    // ========================================================

    const totalTime =
      Date.now() -
      requestStart;

    // ========================================================
    // 7. FINAL RESPONSE
    // ========================================================

    const responseData = {
      success: true,

      // ------------------------------------------------------
      // Shrimp count
      // ------------------------------------------------------

      count:
        smResult.shrimp_count ??
        0,

      // ------------------------------------------------------
      // Uploaded file
      // ------------------------------------------------------

      fileName:
        key,

      // ------------------------------------------------------
      // Annotated image
      // ------------------------------------------------------

      annotatedImageUrl,

      // ------------------------------------------------------
      // Predictions
      // ------------------------------------------------------

      results:
        smResult.predictions ||
        [],

      // ------------------------------------------------------
      // Input
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
      },
    );

    // ========================================================
    // 8. RETURN JSON
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
      },
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
      error,
    );

    logStep(
      "REQUEST FAILED",
      {
        message,
        processingTimeMs:
          totalTime,
      },
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
      },
    );
  }
}
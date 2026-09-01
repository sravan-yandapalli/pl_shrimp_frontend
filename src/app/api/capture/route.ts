import { NextResponse } from "next/server";

import {
  SageMakerRuntimeClient,
  InvokeEndpointCommand,
} from "@aws-sdk/client-sagemaker-runtime";

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

const smClient = new SageMakerRuntimeClient({
  region: REGION,
  credentials,
});

// ============================================================
// SAGEMAKER ENDPOINT
// ============================================================

const ENDPOINT_NAME = "shrimp-yolo-endpoint";

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

  // IMPORTANT:
  // This is returned by your inference.py
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
  // Send S3 bucket + key to SageMaker
  // ----------------------------------------------------------

  const payload = JSON.stringify({
    bucket,
    key,
  });

  const payloadBytes =
    Buffer.byteLength(payload);

  logStep(
    "SAGEMAKER PAYLOAD CREATED",
    {
      payloadBytes,
      payloadMB: (
        payloadBytes /
        1024 /
        1024
      ).toFixed(4),
      payload,
    }
  );

  // ----------------------------------------------------------
  // Invoke SageMaker
  // ----------------------------------------------------------

  logStep(
    "CALLING SAGEMAKER ENDPOINT",
    ENDPOINT_NAME
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

  // ----------------------------------------------------------
  // Check response
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
  // SageMaker application-level error
  // ----------------------------------------------------------

  if (result.error) {
    throw new Error(
      result.error
    );
  }

  // ----------------------------------------------------------
  // Log successful result
  // ----------------------------------------------------------

  logStep(
    "SAGEMAKER SUCCESS",
    {
      count:
        result.shrimp_count,

      predictions:
        result.predictions?.length ||
        0,

      annotatedImageUrl:
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

    // --------------------------------------------------------
    // 1. READ REQUEST FROM FRONTEND
    // --------------------------------------------------------

    const body =
      await request.json();

    const bucket =
      body.bucket ||
      DEFAULT_BUCKET;

    const key =
      body.key;

    logStep(
      "PAYLOAD RECEIVED",
      {
        bucket,
        key,
      }
    );

    // --------------------------------------------------------
    // 2. VALIDATE IMAGE KEY
    // --------------------------------------------------------

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

    // --------------------------------------------------------
    // 3. CALL SAGEMAKER
    // --------------------------------------------------------

    const smResult =
      await callSageMakerCounter(
        bucket,
        key
      );

    // --------------------------------------------------------
    // 4. PROCESSING TIME
    // --------------------------------------------------------

    const totalTime =
      Date.now() -
      requestStart;

    // --------------------------------------------------------
    // 5. GET ANNOTATED IMAGE URL
    //
    // inference.py already returns:
    //
    // "annotated_image_url": s3_url
    //
    // So we simply pass it to the frontend.
    // --------------------------------------------------------

    const annotatedImageUrl =
      smResult.annotated_image_url ??
      null;

    // --------------------------------------------------------
    // 6. LOG RESULT
    // --------------------------------------------------------

    logStep(
      "RETURNING RESULT TO FRONTEND",
      {
        count:
          smResult.shrimp_count ??
          0,

        predictions:
          smResult.predictions?.length ||
          0,

        annotatedImageUrl,

        processingTimeMs:
          totalTime,
      }
    );

    // --------------------------------------------------------
    // 7. RETURN RESULT
    // --------------------------------------------------------

    return NextResponse.json(
      {
        success: true,

        // ------------------------------------------
        // Shrimp count
        // ------------------------------------------

        count:
          smResult.shrimp_count ??
          0,

        // ------------------------------------------
        // ORIGINAL FILE NAME / S3 KEY
        // ------------------------------------------

        fileName:
          key,

        // ------------------------------------------
        // ANNOTATED IMAGE
        // IMPORTANT
        // ------------------------------------------

        annotatedImageUrl,

        // ------------------------------------------
        // Also return the original SageMaker field
        // for debugging / compatibility
        // ------------------------------------------

        annotated_image_url:
          smResult.annotated_image_url ??
          null,

        // ------------------------------------------
        // Processing time
        // ------------------------------------------

        processingTimeMs:
          totalTime,

        // ------------------------------------------
        // Input information
        // ------------------------------------------

        input: {
          bucket,
          key,
        },

        // ------------------------------------------
        // Bounding box results
        // ------------------------------------------

        results:
          smResult.predictions ||
          [],
      },
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

    // --------------------------------------------------------
    // ERROR HANDLING
    // --------------------------------------------------------

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
      "TOTAL TIME",
      `${totalTime} ms`
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
      }
    );
  }
}
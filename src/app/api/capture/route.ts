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

// Your SageMaker endpoint
const ENDPOINT_NAME = "shrimp-yolo-endpoint";

// Default S3 bucket
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
  // IMPORTANT
  //
  // We DO NOT download the image here.
  //
  // We DO NOT convert the image to Base64.
  //
  // We send only the S3 bucket + key.
  //
  // SageMaker inference.py will download the original image
  // directly from S3 and then split it into 640x640 tiles.
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
  // Invoke SageMaker synchronously
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

  logStep(
    "SAGEMAKER SUCCESS",
    {
      count:
        result.shrimp_count,

      predictions:
        result.predictions?.length ||
        0,
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
    // 1. Read request from frontend
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
    // 2. Validate key
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
    // 3. Call SageMaker
    // --------------------------------------------------------

    const smResult =
      await callSageMakerCounter(
        bucket,
        key
      );

    // --------------------------------------------------------
    // 4. Calculate processing time
    // --------------------------------------------------------

    const totalTime =
      Date.now() -
      requestStart;

    // --------------------------------------------------------
    // 5. Return result to frontend
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

        processingTimeMs:
          totalTime,
      }
    );

    return NextResponse.json(
      {
        success: true,

        count:
          smResult.shrimp_count ??
          0,

        fileName:
          key,

        processingTimeMs:
          totalTime,

        input: {
          bucket,
          key,
        },

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
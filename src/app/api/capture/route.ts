import { NextResponse } from "next/server";

import {
  S3Client,
  GetObjectCommand,
} from "@aws-sdk/client-s3";

import {
  SageMakerRuntimeClient,
  InvokeEndpointCommand,
} from "@aws-sdk/client-sagemaker-runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const REGION =
  process.env.NEXT_PUBLIC_DIZIAQUA_REGION || "ap-south-1";

const DEFAULT_BUCKET =
  process.env.NEXT_PUBLIC_DIZIAQUA_S3_BUCKET ||
  "diziaqua-images-320698389233";

const credentials = {
  accessKeyId:
    process.env.NEXT_PUBLIC_DIZIAQUA_ACCESS_KEY_ID || "",

  secretAccessKey:
    process.env.NEXT_PUBLIC_DIZIAQUA_SECRET_ACCESS_KEY || "",
};

const s3Client = new S3Client({
  region: REGION,
  credentials,
});

const smClient = new SageMakerRuntimeClient({
  region: REGION,
  credentials,
});

/*
 * THIS IS THE IMPORTANT CHANGE.
 *
 * Your actual SageMaker Serverless endpoint:
 */
const ENDPOINT_NAME = "shrimp-yolo-endpoint";

type PredictionInput = {
  bucket: string;
  key: string;
};

type BoundingBoxPrediction = {
  class: number;
  confidence: number;
  bbox: [number, number, number, number];
};

type SageMakerPredictionResponse = {
  shrimp_count?: number;
  predictions?: BoundingBoxPrediction[];
  error?: string;
};

function logStep(
  step: string,
  data?: unknown
) {
  console.log(
    `[DIZIAQUA] ${new Date().toISOString()} - ${step}`,
    data ?? ""
  );
}

async function callSageMakerCounter(
  bucket: string,
  key: string
): Promise<SageMakerPredictionResponse> {

  logStep(
    "STARTING SAGEMAKER SERVERLESS INVOCATION",
    {
      endpoint: ENDPOINT_NAME,
      bucket,
      key,
    }
  );

  // ---------------------------------------------
  // 1. Download image from S3
  // ---------------------------------------------

  const getImg = await s3Client.send(
    new GetObjectCommand({
      Bucket: bucket,
      Key: key,
    })
  );

  const imgBytes =
    await getImg.Body?.transformToByteArray();

  if (!imgBytes || imgBytes.length === 0) {
    throw new Error(
      "Empty file received from S3"
    );
  }

  logStep(
    "IMAGE DOWNLOADED FROM S3",
    {
      bytes: imgBytes.length,

      mb:
        imgBytes.length /
        1024 /
        1024,
    }
  );

  // ---------------------------------------------
  // 2. Convert image to Base64
  // ---------------------------------------------

  const base64Image =
    Buffer.from(imgBytes).toString("base64");

  /*
   * Your inference.py expects:
   *
   * {
   *   "image": "BASE64..."
   * }
   */

  const payload = JSON.stringify({
    image: base64Image,
  });

  const payloadBytes =
    Buffer.byteLength(payload);

  logStep(
    "SAGEMAKER PAYLOAD CREATED",
    {
      payloadBytes,

      payloadMB:
        (
          payloadBytes /
          1024 /
          1024
        ).toFixed(2),
    }
  );

  /*
   * Serverless request payload must remain
   * within SageMaker's payload limit.
   */

  if (
    payloadBytes >
    4 * 1024 * 1024
  ) {
    throw new Error(
      "Image is too large for SageMaker Serverless. " +
      "Resize/compress the image before inference."
    );
  }

  // ---------------------------------------------
  // 3. SYNCHRONOUS invocation
  // ---------------------------------------------
  //
  // OLD:
  // InvokeEndpointAsyncCommand
  //
  // NEW:
  // InvokeEndpointCommand
  //
  // ---------------------------------------------

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

  // ---------------------------------------------
  // 4. Read response
  // ---------------------------------------------

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

  const result =
    JSON.parse(
      responseText
    ) as SageMakerPredictionResponse;

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
        result.predictions?.length || 0,
    }
  );

  return result;
}

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

    // -----------------------------------------
    // 1. Read request body
    // -----------------------------------------

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

    if (!key) {

      return NextResponse.json(
        {
          success: false,
          message:
            "Missing bucket or key.",
        },
        {
          status: 400,
        }
      );
    }

    // -----------------------------------------
    // 2. Invoke SageMaker
    // -----------------------------------------

    const smResult =
      await callSageMakerCounter(
        bucket,
        key
      );

    const totalTime =
      Date.now() -
      requestStart;

    // -----------------------------------------
    // 3. Return result to frontend
    // -----------------------------------------

    return NextResponse.json(
      {
        success: true,

        count:
          smResult.shrimp_count ?? 0,

        fileName:
          key,

        processingTimeMs:
          totalTime,

        input:
          {
            bucket,
            key,
          },

        results:
          smResult.predictions || [],
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

    const totalTime =
      Date.now() -
      requestStart;

    const message =
      error instanceof Error
        ? error.message
        : String(error);

    logStep(
      "REQUEST FAILED"
    );

    logStep(
      "ERROR",
      message
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
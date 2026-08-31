import { NextResponse } from "next/server";
import {
  SageMakerRuntimeClient,
  InvokeEndpointCommand,
} from "@aws-sdk/client-sagemaker-runtime";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// ============================================================
// AWS CONFIGURATION
// ============================================================

const REGION = process.env.NEXT_PUBLIC_DIZIAQUA_REGION || "ap-south-1";

const credentials = {
  accessKeyId: process.env.NEXT_PUBLIC_DIZIAQUA_ACCESS_KEY_ID || "",
  secretAccessKey: process.env.NEXT_PUBLIC_DIZIAQUA_SECRET_ACCESS_KEY || "",
};

const smClient = new SageMakerRuntimeClient({
  region: REGION,
  credentials,
});

const s3Client = new S3Client({
  region: REGION,
  credentials,
});

const ENDPOINT_NAME = "shrimp-yolo-endpoint";
const DEFAULT_BUCKET =
  process.env.NEXT_PUBLIC_DIZIAQUA_S3_BUCKET || "diziaqua-images-320698389233";

// ============================================================
// TYPES
// ============================================================

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

// ============================================================
// LOGGING
// ============================================================

function logStep(step: string, data?: unknown) {
  console.log(`[DIZIAQUA] ${new Date().toISOString()} - ${step}`, data ?? "");
}

// ============================================================
// CALL SAGEMAKER
// ============================================================

async function callSageMakerCounter(
  bucket: string,
  key: string
): Promise<SageMakerPredictionResponse> {
  logStep("STARTING SAGEMAKER INVOCATION", {
    endpoint: ENDPOINT_NAME,
    bucket,
    key,
  });

  // 1. Download image from S3
  logStep("DOWNLOADING IMAGE FROM S3 FOR INFERENCE", { bucket, key });
  const s3Response = await s3Client.send(
    new GetObjectCommand({
      Bucket: bucket,
      Key: key,
    })
  );

  const byteArray = await s3Response.Body?.transformToByteArray();
  if (!byteArray) {
    throw new Error("Failed to read image bytes from S3");
  }

  // 2. Convert to Base64
  const base64Image = Buffer.from(byteArray).toString("base64");

  // 3. Send payload formatted with the 'image' key SageMaker expects
  const payload = JSON.stringify({
    image: base64Image,
  });

  const payloadBytes = Buffer.byteLength(payload);
  logStep("SAGEMAKER PAYLOAD CREATED", {
    payloadBytes,
    payloadMB: (payloadBytes / 1024 / 1024).toFixed(4),
  });

  // 4. Invoke SageMaker
  logStep("CALLING SAGEMAKER ENDPOINT", ENDPOINT_NAME);
  const response = await smClient.send(
    new InvokeEndpointCommand({
      EndpointName: ENDPOINT_NAME,
      ContentType: "application/json",
      Accept: "application/json",
      Body: Buffer.from(payload),
    })
  );

  if (!response.Body) {
    throw new Error("SageMaker returned an empty response");
  }

  const responseText = Buffer.from(response.Body).toString("utf-8");
  logStep("SAGEMAKER RAW RESPONSE", responseText);

  let result: SageMakerPredictionResponse;
  try {
    result = JSON.parse(responseText) as SageMakerPredictionResponse;
  } catch {
    throw new Error("SageMaker returned invalid JSON: " + responseText);
  }

  if (result.error) {
    throw new Error(result.error);
  }

  logStep("SAGEMAKER SUCCESS", {
    count: result.shrimp_count,
    predictions: result.predictions?.length || 0,
  });

  return result;
}

// ============================================================
// POST
// ============================================================

export async function POST(request: Request) {
  const requestStart = Date.now();
  logStep("========================================");
  logStep("NEW SHRIMP COUNT REQUEST");

  try {
    const body = await request.json();
    const bucket = body.bucket || DEFAULT_BUCKET;
    const key = body.key;

    logStep("PAYLOAD RECEIVED", { bucket, key });

    if (!key) {
      return NextResponse.json(
        { success: false, message: "Missing image key." },
        { status: 400 }
      );
    }

    const smResult = await callSageMakerCounter(bucket, key);
    const totalTime = Date.now() - requestStart;

    logStep("RETURNING RESULT TO FRONTEND", {
      count: smResult.shrimp_count ?? 0,
      predictions: smResult.predictions?.length || 0,
      processingTimeMs: totalTime,
    });

    return NextResponse.json(
      {
        success: true,
        count: smResult.shrimp_count ?? 0,
        fileName: key,
        processingTimeMs: totalTime,
        input: { bucket, key },
        results: smResult.predictions || [],
      },
      {
        status: 200,
        headers: {
          "Cache-Control": "no-store",
          "Content-Type": "application/json",
        },
      }
    );
  } catch (error) {
    const totalTime = Date.now() - requestStart;
    const message = error instanceof Error ? error.message : String(error);

    console.error("[DIZIAQUA] REQUEST FAILED:", error);
    logStep("TOTAL TIME", `${totalTime} ms`);

    return NextResponse.json(
      { success: false, message, processingTimeMs: totalTime },
      { status: 500 }
    );
  }
}
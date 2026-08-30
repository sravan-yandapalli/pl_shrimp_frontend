import { NextResponse } from "next/server";
import { S3Client, GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { SageMakerRuntimeClient, InvokeEndpointAsyncCommand } from "@aws-sdk/client-sagemaker-runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60; // Allows enough time for the scale-to-zero server to wake up

// ============================================================
// AWS CLIENTS (Uses credentials from .env.local)
// ============================================================

const s3Client = new S3Client({
  region: process.env.AWS_REGION || "ap-south-1",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || "",
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || "",
  },
});

const smClient = new SageMakerRuntimeClient({
  region: process.env.AWS_REGION || "ap-south-1",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || "",
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || "",
  },
});

const ENDPOINT_NAME = "shrimp-async-endpoint";

// ============================================================
// TYPES
// ============================================================

type PredictionInput = {
  bucket: string;
  key: string;
};

// Replaces 'any' to fix your TypeScript error
type BoundingBoxPrediction = {
  class: number;
  confidence: number;
  bbox: [number, number, number, number];
};

type SageMakerPredictionResponse = {
  status: "success" | "error";
  count?: number;
  input?: PredictionInput;
  results?: BoundingBoxPrediction[];
  error?: string;
};

// ============================================================
// DEBUG LOGGER
// ============================================================

function logStep(step: string, data?: unknown) {
  console.log(`[DIZIAQUA] ${new Date().toISOString()} - ${step}`, data ?? "");
}

// ============================================================
// CALL SAGEMAKER (ASYNC POLLING LOGIC)
// ============================================================

async function callSageMakerCounter(
  bucket: string,
  key: string
): Promise<SageMakerPredictionResponse> {
  logStep("STARTING SAGEMAKER INVOCATION PROCESS");

  // 1. Download original image from S3
  logStep("1. Downloading image from S3", { bucket, key });
  const getImg = await s3Client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  const imgBytes = await getImg.Body?.transformToByteArray();
  
  if (!imgBytes) throw new Error("Empty file received from S3");
  const base64Image = Buffer.from(imgBytes).toString("base64");

  // 2. Upload JSON Payload for SageMaker Container
  const payloadKey = `async-inputs/payload-${Date.now()}.json`;
  logStep("2. Uploading Base64 JSON payload for SageMaker", { payloadKey });
  
  await s3Client.send(new PutObjectCommand({
    Bucket: bucket,
    Key: payloadKey,
    Body: JSON.stringify({ image: base64Image }),
    ContentType: "application/json"
  }));

  // 3. Invoke the Async Endpoint
  logStep("3. Invoking SageMaker Async Endpoint");
  const invokeRes = await smClient.send(new InvokeEndpointAsyncCommand({
    EndpointName: ENDPOINT_NAME,
    InputLocation: `s3://${bucket}/${payloadKey}`,
  }));

  const outputLocation = invokeRes.OutputLocation; 
  if (!outputLocation) throw new Error("SageMaker did not return an OutputLocation");
  
  // Extract just the key from the s3://bucket/key URI
  const outputKey = outputLocation.replace(`s3://${bucket}/`, "");
  logStep("   Waiting for result at", outputLocation);

  // 4. Poll S3 for the Output File (Container is processing)
  let resultData = null;
  const maxRetries = 35; // 35 retries * 1.5s = ~52 seconds
  
  for (let i = 0; i < maxRetries; i++) {
    await new Promise(resolve => setTimeout(resolve, 1500)); 
    try {
      const getOut = await s3Client.send(new GetObjectCommand({ Bucket: bucket, Key: outputKey }));
      const outStr = await getOut.Body?.transformToString();
      if (outStr) {
        resultData = JSON.parse(outStr);
        break; 
      }
    } catch (err: unknown) {
      const e = err as Error; // Fixes TypeScript 'any' error in catch block
      if (e.name !== "NoSuchKey" && e.name !== "NotFound") {
        logStep("POLLING ERROR", e);
        throw e;
      }
    }
  }

  if (!resultData) {
    throw new Error("SageMaker inference timed out. The server might still be waking up (Cold Start).");
  }

  logStep("SAGEMAKER SUCCESS", { count: resultData.shrimp_count });

  return {
    status: "success",
    count: resultData.shrimp_count,
    results: resultData.predictions,
  };
}

// ============================================================
// POST /api/capture
// ============================================================

export async function POST(request: Request) {
  const requestStart = Date.now();

  logStep("========================================");
  logStep("NEW PROCESSING REQUEST (VIA SAGEMAKER)");

  try {
    const body = await request.json();
    const { bucket, key } = body;

    logStep("PAYLOAD RECEIVED", { bucket, key });

    if (!bucket || !key) {
      return NextResponse.json(
        { success: false, message: "Missing bucket or key in request." },
        { status: 400 }
      );
    }

    const smResult = await callSageMakerCounter(bucket, key);
    const totalTime = Date.now() - requestStart;

    logStep("REQUEST COMPLETE", {
      totalTime: `${totalTime} ms`,
      count: smResult.count,
    });
    logStep("========================================");

    return NextResponse.json(
      {
        success: true,
        count: smResult.count,
        fileName: key,
        processingTimeMs: totalTime,
        input: { bucket, key },
        results: smResult.results || [],
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

    logStep("========================================");
    logStep("REQUEST FAILED");
    logStep("ERROR", message);
    logStep("TOTAL TIME", `${totalTime} ms`);
    logStep("========================================");

    return NextResponse.json(
      {
        success: false,
        message,
        processingTimeMs: totalTime,
      },
      { status: 500 }
    );
  }
}
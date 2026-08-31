import { NextResponse } from "next/server";
import {
  SageMakerRuntimeClient,
  InvokeEndpointCommand,
} from "@aws-sdk/client-sagemaker-runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const REGION = process.env.NEXT_PUBLIC_DIZIAQUA_REGION || "ap-south-1";

const credentials = {
  accessKeyId: process.env.NEXT_PUBLIC_DIZIAQUA_ACCESS_KEY_ID || "",
  secretAccessKey: process.env.NEXT_PUBLIC_DIZIAQUA_SECRET_ACCESS_KEY || "",
};

const smClient = new SageMakerRuntimeClient({
  region: REGION,
  credentials,
});

const ENDPOINT_NAME = "shrimp-yolo-endpoint";
const DEFAULT_BUCKET =
  process.env.NEXT_PUBLIC_DIZIAQUA_S3_BUCKET || "diziaqua-images-320698389233";

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

function logStep(step: string, data?: unknown) {
  console.log(`[DIZIAQUA] ${new Date().toISOString()} - ${step}`, data ?? "");
}

async function callSageMakerCounter(
  bucket: string,
  key: string
): Promise<SageMakerPredictionResponse> {
  logStep("STARTING SAGEMAKER INVOCATION", { endpoint: ENDPOINT_NAME, bucket, key });

  const payload = JSON.stringify({ bucket, key });

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

  return result;
}

export async function POST(request: Request) {
  const requestStart = Date.now();
  try {
    const body = await request.json();
    const bucket = body.bucket || DEFAULT_BUCKET;
    const key = body.key;

    if (!key) {
      return NextResponse.json({ success: false, message: "Missing image key." }, { status: 400 });
    }

    const smResult = await callSageMakerCounter(bucket, key);
    const totalTime = Date.now() - requestStart;

    return NextResponse.json({
      success: true,
      count: smResult.shrimp_count ?? 0,
      fileName: key,
      processingTimeMs: totalTime,
      input: { bucket, key },
      results: smResult.predictions || [],
    }, { status: 200 });
  } catch (error) {
    const totalTime = Date.now() - requestStart;
    const message = error instanceof Error ? error.message : String(error);
    console.error("[DIZIAQUA] REQUEST FAILED:", error);
    return NextResponse.json({ success: false, message, processingTimeMs: totalTime }, { status: 500 });
  }
}
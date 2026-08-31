import { NextResponse } from "next/server";

import {
  SageMakerRuntimeClient,
  InvokeEndpointCommand,
} from "@aws-sdk/client-sagemaker-runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

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

const ENDPOINT_NAME = "shrimp-yolo-endpoint";

export async function GET() {
  const start = Date.now();

  try {
    console.log(
      "[DIZIAQUA] Starting SageMaker warm-up..."
    );

    const payload = JSON.stringify({
      warmup: true,
    });

    const response = await smClient.send(
      new InvokeEndpointCommand({
        EndpointName: ENDPOINT_NAME,

        ContentType: "application/json",

        Accept: "application/json",

        Body: Buffer.from(payload),
      })
    );

    const responseText = response.Body
      ? Buffer.from(response.Body).toString("utf-8")
      : "";

    let result: unknown = null;

    if (responseText) {
      try {
        result = JSON.parse(responseText);
      } catch {
        result = responseText;
      }
    }

    const elapsed = Date.now() - start;

    console.log(
      "[DIZIAQUA] SageMaker warm-up completed",
      {
        endpoint: ENDPOINT_NAME,
        elapsedMs: elapsed,
        result,
      }
    );

    return NextResponse.json({
      success: true,
      warm: true,
      endpoint: ENDPOINT_NAME,
      processingTimeMs: elapsed,
      result,
    });

  } catch (error) {
    const elapsed = Date.now() - start;

    const message =
      error instanceof Error
        ? error.message
        : String(error);

    console.error(
      "[DIZIAQUA] SageMaker warm-up failed:",
      error
    );

    return NextResponse.json(
      {
        success: false,
        warm: false,
        endpoint: ENDPOINT_NAME,
        message,
        processingTimeMs: elapsed,
      },
      {
        status: 500,
      }
    );
  }
}
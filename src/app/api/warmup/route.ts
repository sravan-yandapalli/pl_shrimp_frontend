import { NextResponse } from "next/server";
import {
  SageMakerRuntimeClient,
  InvokeEndpointCommand,
} from "@aws-sdk/client-sagemaker-runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const REGION = process.env.NEXT_PUBLIC_DIZIAQUA_REGION || "ap-south-1";
const credentials = {
  accessKeyId: process.env.NEXT_PUBLIC_DIZIAQUA_ACCESS_KEY_ID || "",
  secretAccessKey: process.env.NEXT_PUBLIC_DIZIAQUA_SECRET_ACCESS_KEY || "",
};

const smClient = new SageMakerRuntimeClient({ region: REGION, credentials });
const ENDPOINT_NAME = "shrimp-yolo-endpoint";

export async function GET() {
  try {
    // Send a minimal blank/dummy payload to wake up the serverless container
    const dummyPayload = JSON.stringify({ image: "" });

    await smClient.send(
      new InvokeEndpointCommand({
        EndpointName: ENDPOINT_NAME,
        ContentType: "application/json",
        Accept: "application/json",
        Body: Buffer.from(dummyPayload),
      })
    );

    return NextResponse.json({ success: true, warmed: true }, { status: 200 });
  } catch {
    // We catch errors silently here because a cold start failure on a warm-up 
    // ping is normal if the payload schema expects a real image; the point 
    // is simply to trigger the container initialization sequence.
    return NextResponse.json({ success: true, warmed: false }, { status: 200 });
  }
}
import { NextResponse } from "next/server";
import {
  SageMakerRuntimeClient,
  InvokeEndpointCommand,
} from "@aws-sdk/client-sagemaker-runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const REGION =
  process.env.NEXT_PUBLIC_DIZIAQUA_REGION || "ap-south-1";

const credentials = {
  accessKeyId:
    process.env.NEXT_PUBLIC_DIZIAQUA_ACCESS_KEY_ID || "",

  secretAccessKey:
    process.env.NEXT_PUBLIC_DIZIAQUA_SECRET_ACCESS_KEY || "",
};

const smClient = new SageMakerRuntimeClient({
  region: REGION,
  credentials,
});

const ENDPOINT_NAME = "shrimp-yolo-endpoint";

const DEFAULT_BUCKET =
  process.env.NEXT_PUBLIC_DIZIAQUA_S3_BUCKET ||
  "diziaqua-images-320698389233";

export async function GET() {
  try {
    console.log(
      "[DIZIAQUA] Starting SageMaker warm-up..."
    );

    /*
     * IMPORTANT:
     *
     * The new inference.py expects:
     *
     * {
     *   "bucket": "...",
     *   "key": "..."
     * }
     *
     * We therefore no longer send:
     *
     * {
     *   "image": ""
     * }
     */

    /*
     * This is only a warm-up request.
     *
     * The key does not need to contain a real image
     * for the purpose of starting the SageMaker container.
     *
     * inference.py will receive the request and then
     * return an S3 error because the object does not exist.
     *
     * The important part is that SageMaker starts the
     * container and loads best.pt.
     */

    const warmupPayload = JSON.stringify({
      bucket: DEFAULT_BUCKET,
      key: "__warmup__/dummy.jpg",
    });

    console.log(
      "[DIZIAQUA] Invoking SageMaker endpoint:",
      ENDPOINT_NAME
    );

    try {
      await smClient.send(
        new InvokeEndpointCommand({
          EndpointName: ENDPOINT_NAME,

          ContentType: "application/json",

          Accept: "application/json",

          Body: Buffer.from(warmupPayload),
        })
      );

      console.log(
        "[DIZIAQUA] SageMaker warm-up completed"
      );

      return NextResponse.json(
        {
          success: true,
          warmed: true,
        },
        {
          status: 200,
        }
      );

    } catch (error) {

      /*
       * The dummy S3 object does not exist.
       *
       * That is expected.
       *
       * The invocation itself still causes SageMaker
       * Serverless to start the container if it was cold.
       */

      console.log(
        "[DIZIAQUA] Warm-up invocation returned an error:",
        error instanceof Error
          ? error.message
          : String(error)
      );

      return NextResponse.json(
        {
          success: true,
          warmed: true,
          message:
            "Warm-up invocation sent. Container should be initialized.",
        },
        {
          status: 200,
        }
      );
    }

  } catch (error) {

    console.error(
      "[DIZIAQUA] Warm-up failed:",
      error
    );

    return NextResponse.json(
      {
        success: false,
        warmed: false,
        message:
          error instanceof Error
            ? error.message
            : String(error),
      },
      {
        status: 500,
      }
    );
  }
}
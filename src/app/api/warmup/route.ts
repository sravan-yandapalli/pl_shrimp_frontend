import { NextResponse } from "next/server";

import {
  SageMakerRuntimeClient,
  InvokeEndpointCommand,
} from "@aws-sdk/client-sagemaker-runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// ============================================================
// CONFIGURATION
// ============================================================

const REGION =
  process.env.DIZIAQUA_REGION ||
  "ap-south-1";

const ACCESS_KEY_ID =
  process.env.DIZIAQUA_ACCESS_KEY_ID ||
  "";

const SECRET_ACCESS_KEY =
  process.env.DIZIAQUA_SECRET_ACCESS_KEY ||
  "";

const ENDPOINT_NAME =
  process.env.SAGEMAKER_ENDPOINT_NAME ||
  "shrimp-yolo-v2-prod";

// ============================================================
// SAGEMAKER CLIENT
// ============================================================

const smClient =
  new SageMakerRuntimeClient({
    region: REGION,

    credentials: {
      accessKeyId:
        ACCESS_KEY_ID,

      secretAccessKey:
        SECRET_ACCESS_KEY,
    },
  });

// ============================================================
// GET
// ============================================================

export async function GET() {
  const start =
    Date.now();

  try {
    console.log(
      "[DIZIAQUA] Starting SageMaker warm-up...",
    );

    console.log(
      "[DIZIAQUA] SageMaker configuration:",
      {
        region:
          REGION,

        endpoint:
          ENDPOINT_NAME,
      },
    );

    // --------------------------------------------------------
    // VALIDATE CREDENTIALS
    // --------------------------------------------------------

    if (
      !ACCESS_KEY_ID ||
      !SECRET_ACCESS_KEY
    ) {
      throw new Error(
        "DIZIAQUA AWS credentials are missing.",
      );
    }

    // --------------------------------------------------------
    // WARMUP PAYLOAD
    // --------------------------------------------------------

    const payload =
      JSON.stringify({
        warmup: true,
      });

    // --------------------------------------------------------
    // INVOKE SAGEMAKER
    // --------------------------------------------------------

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

    // --------------------------------------------------------
    // READ RESPONSE
    // --------------------------------------------------------

    const responseText =
      response.Body
        ? Buffer
            .from(
              response.Body,
            )
            .toString(
              "utf-8",
            )
        : "";

    // --------------------------------------------------------
    // PARSE RESPONSE
    // --------------------------------------------------------

    let result: unknown =
      null;

    if (responseText) {
      try {
        result =
          JSON.parse(
            responseText,
          );
      } catch {
        result =
          responseText;
      }
    }

    const elapsed =
      Date.now() -
      start;

    // --------------------------------------------------------
    // SUCCESS LOG
    // --------------------------------------------------------

    console.log(
      "[DIZIAQUA] SageMaker warm-up completed",
      {
        endpoint:
          ENDPOINT_NAME,

        elapsedMs:
          elapsed,

        result,
      },
    );

    // --------------------------------------------------------
    // RESPONSE
    // --------------------------------------------------------

    return NextResponse.json({
      success: true,

      warm: true,

      endpoint:
        ENDPOINT_NAME,

      processingTimeMs:
        elapsed,

      result,
    });
  } catch (error) {
    const elapsed =
      Date.now() -
      start;

    const message =
      error instanceof Error
        ? error.message
        : String(error);

    console.error(
      "[DIZIAQUA] SageMaker warm-up failed:",
      error,
    );

    return NextResponse.json(
      {
        success: false,

        warm: false,

        endpoint:
          ENDPOINT_NAME,

        message,

        processingTimeMs:
          elapsed,
      },
      {
        status: 500,
      },
    );
  }
}
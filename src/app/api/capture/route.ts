import { NextResponse } from "next/server";

import {
  SageMakerRuntimeClient,
  InvokeEndpointCommand,
} from "@aws-sdk/client-sagemaker-runtime";

import {
  S3Client,
  GetObjectCommand,
} from "@aws-sdk/client-s3";

import {
  getSignedUrl,
} from "@aws-sdk/s3-request-presigner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// ============================================================
// AWS CONFIG
// ============================================================

const REGION =
  process.env.NEXT_PUBLIC_DIZIAQUA_REGION ||
  "ap-south-1";

const credentials = {
  accessKeyId:
    process.env.NEXT_PUBLIC_DIZIAQUA_ACCESS_KEY_ID || "",

  secretAccessKey:
    process.env.NEXT_PUBLIC_DIZIAQUA_SECRET_ACCESS_KEY || "",
};

// ============================================================
// CLIENTS
// ============================================================

const smClient =
  new SageMakerRuntimeClient({
    region: REGION,
    credentials,
  });

const s3Client =
  new S3Client({
    region: REGION,
    credentials,
  });

// ============================================================
// CONFIG
// ============================================================

const ENDPOINT_NAME =
  "shrimp-yolo-endpoint";

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

type SageMakerResponse = {
  success?: boolean;

  shrimp_count?: number;

  predictions?: BoundingBoxPrediction[];

  annotated_image_url?: string;

  error?: string;
};

// ============================================================
// LOGGING
// ============================================================

function log(
  message: string,
  data?: unknown
) {
  console.log(
    `[DIZIAQUA] ${message}`,
    data ?? ""
  );
}

// ============================================================
// SAGEMAKER
// ============================================================

async function invokeSageMaker(
  bucket: string,
  key: string
): Promise<SageMakerResponse> {

  const payload = JSON.stringify({
    bucket,
    key,
  });

  log(
    "Invoking SageMaker",
    {
      endpoint: ENDPOINT_NAME,
      bucket,
      key,
    }
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

  if (!response.Body) {
    throw new Error(
      "SageMaker returned an empty response."
    );
  }

  const text =
    Buffer
      .from(response.Body)
      .toString("utf-8");

  log(
    "SageMaker response",
    text
  );

  let result: SageMakerResponse;

  try {
    result =
      JSON.parse(text) as SageMakerResponse;
  } catch {
    throw new Error(
      "Invalid JSON returned by SageMaker: " +
      text
    );
  }

  if (result.error) {
    throw new Error(
      result.error
    );
  }

  return result;
}

// ============================================================
// PRESIGNED ANNOTATED IMAGE URL
// ============================================================

async function createPresignedImageUrl(
  bucket: string,
  annotatedS3Url: string
): Promise<string> {

  let parsed: URL;

  try {
    parsed =
      new URL(annotatedS3Url);
  } catch {
    throw new Error(
      "Invalid annotated image URL from SageMaker."
    );
  }

  const key =
    decodeURIComponent(
      parsed.pathname.replace(/^\/+/, "")
    );

  if (!key) {
    throw new Error(
      "Could not determine annotated image S3 key."
    );
  }

  log(
    "Creating presigned URL",
    {
      bucket,
      key,
    }
  );

  const command =
    new GetObjectCommand({
      Bucket: bucket,
      Key: key,
    });

  const signedUrl =
    await getSignedUrl(
      s3Client,
      command,
      {
        expiresIn: 3600,
      }
    );

  return signedUrl;
}

// ============================================================
// POST
// ============================================================

export async function POST(
  request: Request
) {

  const start =
    Date.now();

  try {

    // --------------------------------------------------------
    // 1. READ REQUEST
    // --------------------------------------------------------

    const body =
      await request.json();

    const bucket =
      body.bucket ||
      DEFAULT_BUCKET;

    const key =
      body.key;

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

    log(
      "Count request",
      {
        bucket,
        key,
      }
    );

    // --------------------------------------------------------
    // 2. SAGEMAKER
    // --------------------------------------------------------

    const result =
      await invokeSageMaker(
        bucket,
        key
      );

    // --------------------------------------------------------
    // 3. CREATE PRESIGNED URL
    // --------------------------------------------------------

    let annotatedImageUrl:
      string | null = null;

    if (
      result.annotated_image_url
    ) {

      annotatedImageUrl =
        await createPresignedImageUrl(
          bucket,
          result.annotated_image_url
        );

    } else {

      log(
        "WARNING: No annotated_image_url returned"
      );
    }

    // --------------------------------------------------------
    // 4. PROCESSING TIME
    // --------------------------------------------------------

    const processingTimeMs =
      Date.now() - start;

    // --------------------------------------------------------
    // 5. FINAL RESPONSE
    // --------------------------------------------------------

    const responseData = {

      success: true,

      count:
        result.shrimp_count ?? 0,

      fileName:
        key,

      // Frontend should use this
      imageUrl:
        annotatedImageUrl,

      // Keep explicit name too
      annotatedImageUrl:
        annotatedImageUrl,

      results:
        result.predictions ?? [],

      input: {
        bucket,
        key,
      },

      processingTimeMs,
    };

    log(
      "Returning result",
      {
        count:
          responseData.count,

        annotatedImageAvailable:
          !!responseData.annotatedImageUrl,

        processingTimeMs,
      }
    );

    return NextResponse.json(
      responseData,
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

    const message =
      error instanceof Error
        ? error.message
        : String(error);

    const processingTimeMs =
      Date.now() - start;

    console.error(
      "[DIZIAQUA] Count API error:",
      error
    );

    return NextResponse.json(
      {
        success: false,

        message,

        processingTimeMs,
      },
      {
        status: 500,

        headers: {
          "Cache-Control":
            "no-store",
        },
      }
    );
  }
}
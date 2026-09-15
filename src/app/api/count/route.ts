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
// CONFIGURATION
// ============================================================

const REGION =
  process.env.DIZIAQUA_REGION ||
  "ap-south-1";

const S3_BUCKET =
  process.env.NEXT_PUBLIC_DIZIAQUA_S3_BUCKET ||
  "diziaqua-images-320698389233";

const ACCESS_KEY_ID =
  process.env.NEXT_PUBLIC_DIZIAQUA_ACCESS_KEY_ID ||
  "";

const SECRET_ACCESS_KEY =
  process.env.NEXT_PUBLIC_DIZIAQUA_SECRET_ACCESS_KEY ||
  "";

const ENDPOINT_NAME =
  process.env.SAGEMAKER_ENDPOINT_NAME ||
  "shrimp-yolo-v2-prod";

// ============================================================
// AWS CLIENTS
// ============================================================

const credentials = {
  accessKeyId:
    ACCESS_KEY_ID,

  secretAccessKey:
    SECRET_ACCESS_KEY,
};

const smClient =
  new SageMakerRuntimeClient({
    region:
      REGION,

    credentials,
  });

const s3Client =
  new S3Client({
    region:
      REGION,

    credentials,
  });

// ============================================================
// TYPES
// ============================================================

interface Prediction {
  class?: number;

  confidence?: number;

  bbox?: [
    number,
    number,
    number,
    number,
  ];

  [key: string]: unknown;
}

interface SageMakerResult {
  shrimp_count?: number;

  predictions?: Prediction[];

  annotated_image_url?: string;

  error?: string;

  status?: string;

  success?: boolean;

  [key: string]: unknown;
}

// ============================================================
// CREATE PRESIGNED ANNOTATED IMAGE URL
// ============================================================

async function createAnnotatedImageUrl(
  bucket: string,
  s3Url: string,
): Promise<string> {
  let url: URL;

  try {
    url =
      new URL(
        s3Url,
      );
  } catch {
    throw new Error(
      "Invalid annotated image URL returned by SageMaker.",
    );
  }

  // ----------------------------------------------------------
  // GET OBJECT KEY
  // ----------------------------------------------------------

  const annotatedKey =
    decodeURIComponent(
      url.pathname.replace(
        /^\/+/,
        "",
      ),
    );

  if (!annotatedKey) {
    throw new Error(
      "Annotated image key is empty.",
    );
  }

  console.log(
    "[DIZIAQUA] Annotated image key:",
    annotatedKey,
  );

  // ----------------------------------------------------------
  // PRESIGNED GET URL
  // ----------------------------------------------------------

  const signedUrl =
    await getSignedUrl(
      s3Client,

      new GetObjectCommand({
        Bucket:
          bucket,

        Key:
          annotatedKey,
      }),

      {
        expiresIn: 3600,
      },
    );

  return signedUrl;
}

// ============================================================
// SAGEMAKER INVOCATION
// ============================================================

async function invokeSageMaker(
  bucket: string,
  key: string,
): Promise<SageMakerResult> {
  console.log(
    "[DIZIAQUA] Starting SageMaker inference:",
    {
      region:
        REGION,

      endpoint:
        ENDPOINT_NAME,

      bucket,

      key,
    },
  );

  // ----------------------------------------------------------
  // PAYLOAD
  // ----------------------------------------------------------

  const payload =
    JSON.stringify({
      bucket,

      key,
    });

  console.log(
    "[DIZIAQUA] SageMaker payload:",
    payload,
  );

  // ----------------------------------------------------------
  // INVOKE
  // ----------------------------------------------------------

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

  // ----------------------------------------------------------
  // RESPONSE BODY
  // ----------------------------------------------------------

  if (!response.Body) {
    throw new Error(
      "SageMaker returned an empty response.",
    );
  }

  const responseText =
    Buffer
      .from(
        response.Body,
      )
      .toString(
        "utf-8",
      );

  console.log(
    "[DIZIAQUA] SageMaker response:",
    responseText,
  );

  // ----------------------------------------------------------
  // PARSE JSON
  // ----------------------------------------------------------

  let result:
    SageMakerResult;

  try {
    result =
      JSON.parse(
        responseText,
      ) as SageMakerResult;
  } catch {
    throw new Error(
      "SageMaker returned invalid JSON: " +
        responseText,
    );
  }

  // ----------------------------------------------------------
  // INFERENCE ERROR
  // ----------------------------------------------------------

  if (result.error) {
    throw new Error(
      result.error,
    );
  }

  return result;
}

// ============================================================
// POST
// ============================================================

export async function POST(
  request: Request,
) {
  const start =
    Date.now();

  try {
    console.log(
      "[DIZIAQUA] ========================================",
    );

    console.log(
      "[DIZIAQUA] New count request",
    );

    // --------------------------------------------------------
    // CHECK CREDENTIALS
    // --------------------------------------------------------

    if (
      !ACCESS_KEY_ID ||
      !SECRET_ACCESS_KEY
    ) {
      return NextResponse.json(
        {
          success: false,

          message:
            "DIZIAQUA AWS credentials are missing from .env.local.",
        },
        {
          status: 500,
        },
      );
    }

    // --------------------------------------------------------
    // READ REQUEST
    // --------------------------------------------------------

    const body =
      await request.json();

    const bucket =
      typeof body.bucket ===
        "string" &&
      body.bucket.length > 0
        ? body.bucket
        : S3_BUCKET;

    const key =
      body.key;

    console.log(
      "[DIZIAQUA] Count request:",
      {
        bucket,
        key,
      },
    );

    // --------------------------------------------------------
    // VALIDATE KEY
    // --------------------------------------------------------

    if (
      typeof key !==
        "string" ||
      key.length === 0
    ) {
      return NextResponse.json(
        {
          success: false,

          message:
            "Missing image key.",
        },
        {
          status: 400,
        },
      );
    }

    // --------------------------------------------------------
    // SAGEMAKER
    // --------------------------------------------------------

    const result =
      await invokeSageMaker(
        bucket,
        key,
      );

    // --------------------------------------------------------
    // COUNT
    // --------------------------------------------------------

    const count =
      typeof result.shrimp_count ===
        "number"
        ? result.shrimp_count
        : 0;

    console.log(
      "[DIZIAQUA] Shrimp count:",
      count,
    );

    // --------------------------------------------------------
    // ANNOTATED IMAGE
    // --------------------------------------------------------

    let annotatedImageUrl:
      string | null =
        null;

    if (
      typeof result.annotated_image_url ===
        "string" &&
      result.annotated_image_url.length >
        0
    ) {
      annotatedImageUrl =
        await createAnnotatedImageUrl(
          bucket,

          result.annotated_image_url,
        );
    }

    // --------------------------------------------------------
    // PROCESSING TIME
    // --------------------------------------------------------

    const processingTimeMs =
      Date.now() -
      start;

    // --------------------------------------------------------
    // RESPONSE
    // --------------------------------------------------------

    const responseData = {
      success: true,

      count,

      shrimp_count:
        count,

      fileName:
        key,

      annotatedImageUrl,

      imageUrl:
        annotatedImageUrl,

      results:
        result.predictions ||
        [],

      predictions:
        result.predictions ||
        [],

      processingTimeMs,

      bucket,

      key,

      endpoint:
        ENDPOINT_NAME,
    };

    console.log(
      "[DIZIAQUA] Final count result:",
      {
        count,

        annotatedImageAvailable:
          !!annotatedImageUrl,

        processingTimeMs,
      },
    );

    return NextResponse.json(
      responseData,
      {
        status: 200,

        headers: {
          "Cache-Control":
            "no-store",
        },
      },
    );
  } catch (error) {
    const processingTimeMs =
      Date.now() -
      start;

    console.error(
      "[DIZIAQUA] Count request failed:",
      error,
    );

    return NextResponse.json(
      {
        success: false,

        message:
          error instanceof Error
            ? error.message
            : String(error),

        processingTimeMs,
      },
      {
        status: 500,

        headers: {
          "Cache-Control":
            "no-store",
        },
      },
    );
  }
}
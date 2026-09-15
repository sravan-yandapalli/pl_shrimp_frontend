import { NextResponse } from "next/server";

import {
  S3Client,
  PutObjectCommand,
} from "@aws-sdk/client-s3";

import {
  getSignedUrl,
} from "@aws-sdk/s3-request-presigner";

import crypto from "crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ============================================================
// AWS CONFIGURATION
// ============================================================

const REGION =
  process.env.NEXT_PUBLIC_DIZIAQUA_REGION ||
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

// ============================================================
// VALIDATE CREDENTIALS
// ============================================================

if (
  !ACCESS_KEY_ID ||
  !SECRET_ACCESS_KEY
) {
  console.warn(
    "[DIZIAQUA] AWS credentials are missing from .env.local",
  );
}

// ============================================================
// S3 CLIENT
// ============================================================

const s3Client =
  new S3Client({
    region: REGION,

    credentials: {
      accessKeyId:
        ACCESS_KEY_ID,

      secretAccessKey:
        SECRET_ACCESS_KEY,
    },

    requestChecksumCalculation:
      "WHEN_REQUIRED",
  });

// ============================================================
// ALLOWED IMAGE TYPES
// ============================================================

const ALLOWED_CONTENT_TYPES =
  new Set([
    "image/jpeg",
    "image/png",
    "image/webp",
  ]);

// ============================================================
// FILE EXTENSION
// ============================================================

function getExtension(
  contentType: string,
) {
  switch (contentType) {
    case "image/png":
      return "png";

    case "image/webp":
      return "webp";

    case "image/jpeg":
    default:
      return "jpg";
  }
}

// ============================================================
// POST
// ============================================================

export async function POST(
  request: Request,
) {
  try {
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
            "AWS credentials are missing from .env.local.",
        },
        {
          status: 500,
        },
      );
    }

    // --------------------------------------------------------
    // DEFAULT CONTENT TYPE
    // --------------------------------------------------------

    let contentType =
      "image/jpeg";

    // --------------------------------------------------------
    // READ REQUEST
    // --------------------------------------------------------

    try {
      const body =
        await request.json();

      if (
        body &&
        typeof body.contentType ===
          "string" &&
        ALLOWED_CONTENT_TYPES.has(
          body.contentType,
        )
      ) {
        contentType =
          body.contentType;
      }
    } catch {
      // Default to JPEG.
    }

    // --------------------------------------------------------
    // DATE
    // --------------------------------------------------------

    const now =
      new Date();

    const year =
      String(
        now.getFullYear(),
      );

    const month =
      String(
        now.getMonth() + 1,
      ).padStart(
        2,
        "0",
      );

    const day =
      String(
        now.getDate(),
      ).padStart(
        2,
        "0",
      );

    const hours =
      String(
        now.getHours(),
      ).padStart(
        2,
        "0",
      );

    const minutes =
      String(
        now.getMinutes(),
      ).padStart(
        2,
        "0",
      );

    const seconds =
      String(
        now.getSeconds(),
      ).padStart(
        2,
        "0",
      );

    const timestamp =
      `${year}${month}${day}_${hours}${minutes}${seconds}`;

    // --------------------------------------------------------
    // RANDOM ID
    // --------------------------------------------------------

    const randomId =
      crypto
        .randomBytes(4)
        .toString("hex");

    // --------------------------------------------------------
    // EXTENSION
    // --------------------------------------------------------

    const extension =
      getExtension(
        contentType,
      );

    // --------------------------------------------------------
    // S3 KEY
    // --------------------------------------------------------

    const key =
      `uploads/pl_capture_${timestamp}_${randomId}.${extension}`;

    // --------------------------------------------------------
    // S3 COMMAND
    // --------------------------------------------------------

    const command =
      new PutObjectCommand({
        Bucket:
          S3_BUCKET,

        Key:
          key,

        ContentType:
          contentType,
      });

    // --------------------------------------------------------
    // PRESIGNED URL
    // --------------------------------------------------------

    const uploadUrl =
      await getSignedUrl(
        s3Client,

        command,

        {
          expiresIn: 300,
        },
      );

    // --------------------------------------------------------
    // LOG
    // --------------------------------------------------------

    console.log(
      "[DIZIAQUA] Generated upload URL:",
      {
        bucket:
          S3_BUCKET,

        key,

        contentType,
      },
    );

    // --------------------------------------------------------
    // RESPONSE
    // --------------------------------------------------------

    return NextResponse.json(
      {
        success: true,

        uploadUrl,

        key,

        bucket:
          S3_BUCKET,

        contentType,
      },
      {
        status: 200,

        headers: {
          "Cache-Control":
            "no-store",
        },
      },
    );
  } catch (error) {
    console.error(
      "[DIZIAQUA] Error generating pre-signed URL:",
      error,
    );

    return NextResponse.json(
      {
        success: false,

        message:
          error instanceof Error
            ? error.message
            : "Failed to generate upload URL",
      },
      {
        status: 500,
      },
    );
  }
}
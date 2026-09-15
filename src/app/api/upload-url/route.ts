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

const REGION =
  process.env.AWS_REGION ||
  process.env.NEXT_PUBLIC_DIZIAQUA_REGION ||
  "ap-south-1";

const S3_BUCKET =
  process.env.DIZIAQUA_S3_BUCKET ||
  process.env.NEXT_PUBLIC_DIZIAQUA_S3_BUCKET ||
  "diziaqua-images-320698389233";

/*
 * IMPORTANT:
 *
 * Do not manually put credentials here.
 *
 * The AWS SDK will use the server-side credential provider chain.
 *
 * This allows:
 *   AWS_ACCESS_KEY_ID
 *   AWS_SECRET_ACCESS_KEY
 *   AWS_SESSION_TOKEN
 *
 * to be used from the server environment.
 */
const s3Client = new S3Client({
  region: REGION,
});

const ALLOWED_CONTENT_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

function getExtension(
  contentType: string,
): string {
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

export async function POST(
  request: Request,
) {
  try {
    let contentType = "image/jpeg";

    /*
     * Frontend sends:
     *
     * {
     *   contentType: "image/jpeg"
     * }
     *
     * or:
     *
     * {
     *   contentType: "image/png"
     * }
     */
    try {
      const body = await request.json();

      if (
        body &&
        typeof body.contentType === "string" &&
        ALLOWED_CONTENT_TYPES.has(
          body.contentType,
        )
      ) {
        contentType = body.contentType;
      }
    } catch {
      /*
       * No JSON body:
       * keep JPEG as default.
       */
    }

    const now = new Date();

    const year = String(
      now.getFullYear(),
    );

    const month = String(
      now.getMonth() + 1,
    ).padStart(2, "0");

    const day = String(
      now.getDate(),
    ).padStart(2, "0");

    const hours = String(
      now.getHours(),
    ).padStart(2, "0");

    const minutes = String(
      now.getMinutes(),
    ).padStart(2, "0");

    const seconds = String(
      now.getSeconds(),
    ).padStart(2, "0");

    const timestamp =
      `${year}${month}${day}_${hours}${minutes}${seconds}`;

    const randomId = crypto
      .randomBytes(4)
      .toString("hex");

    const extension =
      getExtension(contentType);

    const key =
      `uploads/pl_capture_${timestamp}_${randomId}.${extension}`;

    const command =
      new PutObjectCommand({
        Bucket: S3_BUCKET,
        Key: key,
        ContentType: contentType,
      });

    const uploadUrl =
      await getSignedUrl(
        s3Client,
        command,
        {
          expiresIn: 300,
        },
      );

    console.log(
      "[DIZIAQUA] Generated upload URL:",
      {
        bucket: S3_BUCKET,
        key,
        contentType,
      },
    );

    return NextResponse.json(
      {
        success: true,
        uploadUrl,
        key,
        bucket: S3_BUCKET,
        contentType,
      },
      {
        status: 200,
        headers: {
          "Cache-Control": "no-store",
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
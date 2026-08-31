import { NextResponse } from "next/server";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import crypto from "crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const REGION = process.env.NEXT_PUBLIC_DIZIAQUA_REGION || "ap-south-1";
const S3_BUCKET =
  process.env.NEXT_PUBLIC_DIZIAQUA_S3_BUCKET || "diziaqua-images-320698389233";

const s3Client = new S3Client({
  region: REGION,
  credentials: {
    accessKeyId: process.env.NEXT_PUBLIC_DIZIAQUA_ACCESS_KEY_ID || "",
    secretAccessKey: process.env.NEXT_PUBLIC_DIZIAQUA_SECRET_ACCESS_KEY || "",
  },
  requestChecksumCalculation: "WHEN_REQUIRED",
});

export async function POST() {
  try {
    const now = new Date();
    const year = String(now.getFullYear());
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    const hours = String(now.getHours()).padStart(2, "0");
    const minutes = String(now.getMinutes()).padStart(2, "0");
    const seconds = String(now.getSeconds()).padStart(2, "0");

    const timestamp = `${year}${month}${day}_${hours}${minutes}${seconds}`;
    const randomId = crypto.randomBytes(4).toString("hex");
    const key = `uploads/pl_capture_${timestamp}_${randomId}.png`;

    const command = new PutObjectCommand({
      Bucket: S3_BUCKET,
      Key: key,
      ContentType: "image/png",
    });

    const uploadUrl = await getSignedUrl(s3Client, command, {
      expiresIn: 300,
    });

    return NextResponse.json(
      {
        success: true,
        uploadUrl,
        key,
        bucket: S3_BUCKET,
      },
      {
        status: 200,
        headers: {
          "Cache-Control": "no-store",
        },
      }
    );
  } catch (error) {
    console.error("Error generating pre-signed URL:", error);

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
      }
    );
  }
}
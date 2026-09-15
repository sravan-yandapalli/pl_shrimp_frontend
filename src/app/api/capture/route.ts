import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface CaptureRequest {
  bucket?: string;
  key?: string;
}

export async function POST(request: Request) {
  try {
    const body =
      (await request.json()) as CaptureRequest;

    const bucket = body.bucket;
    const key = body.key;

    if (
      typeof bucket !== "string" ||
      bucket.length === 0
    ) {
      return NextResponse.json(
        {
          success: false,
          message:
            "S3 bucket was not provided.",
        },
        {
          status: 400,
        },
      );
    }

    if (
      typeof key !== "string" ||
      key.length === 0
    ) {
      return NextResponse.json(
        {
          success: false,
          message:
            "S3 object key was not provided.",
        },
        {
          status: 400,
        },
      );
    }

    console.log(
      "[DIZIAQUA] Capture request:",
      {
        bucket,
        key,
      },
    );

    /*
     * /api/count is the actual inference endpoint.
     *
     * The uploaded image is already in S3.
     * We only pass the S3 location to the counting API.
     */

    const host =
      request.headers.get("host");

    const protocol =
      request.headers.get(
        "x-forwarded-proto",
      ) || "http";

    if (!host) {
      return NextResponse.json(
        {
          success: false,
          message:
            "Could not determine application host.",
        },
        {
          status: 500,
        },
      );
    }

    const countUrl =
      `${protocol}://${host}/api/count`;

    console.log(
      "[DIZIAQUA] Forwarding to:",
      countUrl,
    );

    const countResponse =
      await fetch(
        countUrl,
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json",
          },

          cache: "no-store",

          body: JSON.stringify({
            bucket,
            key,
          }),
        },
      );

    const responseText =
      await countResponse.text();

    let result: unknown;

    try {
      result =
        responseText
          ? JSON.parse(
              responseText,
            )
          : null;
    } catch {
      result = {
        raw: responseText,
      };
    }

    console.log(
      "[DIZIAQUA] Count API status:",
      countResponse.status,
    );

    if (!countResponse.ok) {
      console.error(
        "[DIZIAQUA] Count API failed:",
        result,
      );

      return NextResponse.json(
        result &&
          typeof result ===
            "object"
          ? result
          : {
              success: false,
              message:
                "Image counting failed.",
              details: result,
            },
        {
          status:
            countResponse.status,
        },
      );
    }

    return NextResponse.json(
      result,
      {
        status: 200,
      },
    );
  } catch (error) {
    console.error(
      "[DIZIAQUA] Capture API error:",
      error,
    );

    return NextResponse.json(
      {
        success: false,
        message:
          error instanceof Error
            ? error.message
            : "Failed to process capture.",
      },
      {
        status: 500,
      },
    );
  }
}
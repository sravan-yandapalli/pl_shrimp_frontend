import { NextResponse } from "next/server";
import {
  LambdaClient,
  InvokeCommand,
} from "@aws-sdk/client-lambda";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// ============================================================
// AWS CONFIGURATION
// ============================================================

const REGION =
  process.env.AWS_REGION || "ap-south-1";

const LAMBDA_FUNCTION_NAME =
  process.env.DIZIAQUA_LAMBDA_FUNCTION_NAME ||
  "diziaqua-counter";

// ============================================================
// AWS CLIENTS
// ============================================================

const lambdaClient = new LambdaClient({
  region: REGION,
});

// ============================================================
// TYPES
// ============================================================

type LambdaResultFile = {
  bucket: string;
  key: string;
};

type LambdaInput = {
  bucket: string;
  key: string;
};

type LambdaResponse = {
  status: "success" | "error";
  count?: number;
  input?: LambdaInput;
  results?: Record<string, LambdaResultFile>;
  error?: string;
};

// ============================================================
// DEBUG LOGGER
// ============================================================

function logStep(
  step: string,
  data?: unknown
) {
  console.log(
    `[DIZIAQUA] ${new Date().toISOString()} - ${step}`,
    data ?? ""
  );
}

// ============================================================
// INVOKE LAMBDA
// ============================================================

async function invokeCounterLambda(
  bucket: string,
  key: string
): Promise<LambdaResponse> {
  const payload = {
    bucket,
    key,
    output_prefix: "results/",
  };

  logStep(
    "STARTING LAMBDA INVOCATION"
  );

  logStep(
    "Lambda function",
    LAMBDA_FUNCTION_NAME
  );

  logStep(
    "Lambda payload",
    payload
  );

  const startTime = Date.now();
  let response;

  try {
    const command = new InvokeCommand({
      FunctionName: LAMBDA_FUNCTION_NAME,
      InvocationType: "RequestResponse",
      Payload: Buffer.from(
        JSON.stringify(payload)
      ),
    });

    response = await lambdaClient.send(command);
  } catch (error) {
    logStep(
      "LAMBDA INVOCATION FAILED",
      error
    );

    throw new Error(
      `Could not invoke Lambda: ${
        error instanceof Error
          ? error.message
          : String(error)
      }`
    );
  }

  const elapsed = Date.now() - startTime;

  logStep(
    "LAMBDA INVOCATION FINISHED",
    `${elapsed} ms`
  );

  // ==========================================================
  // FUNCTION ERROR
  // ==========================================================

  if (response.FunctionError) {
    let errorPayload = "";

    if (response.Payload) {
      errorPayload = Buffer.from(
        response.Payload
      ).toString("utf-8");
    }

    logStep(
      "LAMBDA FUNCTION ERROR",
      errorPayload
    );

    throw new Error(
      `Lambda execution failed: ${errorPayload}`
    );
  }

  // ==========================================================
  // EMPTY PAYLOAD
  // ==========================================================

  if (!response.Payload) {
    logStep(
      "LAMBDA RETURNED EMPTY PAYLOAD"
    );

    throw new Error(
      "Lambda returned an empty response."
    );
  }

  // ==========================================================
  // CONVERT PAYLOAD TO TEXT
  // ==========================================================

  const responseText = Buffer.from(
    response.Payload
  ).toString("utf-8");

  logStep(
    "LAMBDA RAW RESPONSE",
    responseText
  );

  // ==========================================================
  // EMPTY TEXT
  // ==========================================================

  if (!responseText.trim()) {
    throw new Error(
      "Lambda returned an empty JSON body."
    );
  }

  // ==========================================================
  // PARSE JSON
  // ==========================================================

  let lambdaResponse: LambdaResponse;

  try {
    lambdaResponse = JSON.parse(
      responseText
    ) as LambdaResponse;
  } catch (error) {
    logStep(
      "LAMBDA JSON PARSE FAILED",
      {
        responseText,
        error:
          error instanceof Error
            ? error.message
            : String(error),
      }
    );

    throw new Error(
      `Could not parse Lambda response: ${responseText}`
    );
  }

  // ==========================================================
  // CHECK STATUS
  // ==========================================================

  if (lambdaResponse.status !== "success") {
    logStep(
      "LAMBDA RETURNED ERROR",
      lambdaResponse
    );

    throw new Error(
      lambdaResponse.error ||
        "Lambda processing failed."
    );
  }

  // ==========================================================
  // CHECK COUNT
  // ==========================================================

  if (typeof lambdaResponse.count !== "number") {
    logStep(
      "LAMBDA DID NOT RETURN VALID COUNT",
      lambdaResponse
    );

    throw new Error(
      "Lambda completed but did not return a valid count."
    );
  }

  logStep(
    "LAMBDA SUCCESS",
    { count: lambdaResponse.count }
  );

  return lambdaResponse;
}

// ============================================================
// POST /api/capture
// ============================================================

export async function POST(
  request: Request
) {
  const requestStart = Date.now();

  logStep(
    "========================================"
  );
  logStep("NEW PROCESSING REQUEST");

  try {
    // ========================================================
    // READ JSON PAYLOAD (No longer form-data)
    // ========================================================
    logStep("READING JSON BODY");

    const body = await request.json();
    const { bucket, key } = body;

    logStep(
      "PAYLOAD RECEIVED",
      { bucket, key }
    );

    // ========================================================
    // VALIDATE PAYLOAD
    // ========================================================
    if (!bucket || !key) {
      logStep("ERROR: MISSING BUCKET OR KEY");

      return NextResponse.json(
        {
          success: false,
          message: "Missing bucket or key in request.",
        },
        { status: 400 }
      );
    }

    // ========================================================
    // INVOKE LAMBDA
    // ========================================================
    const lambdaStart = Date.now();

    logStep("STARTING LAMBDA");

    const lambdaResult = await invokeCounterLambda(
      bucket,
      key
    );

    logStep(
      "LAMBDA COMPLETE",
      {
        elapsed: `${Date.now() - lambdaStart} ms`,
        count: lambdaResult.count,
      }
    );

    // ========================================================
    // FINAL RESULT
    // ========================================================
    const totalTime = Date.now() - requestStart;

    logStep(
      "REQUEST COMPLETE",
      {
        totalTime: `${totalTime} ms`,
        count: lambdaResult.count,
      }
    );
    logStep(
      "========================================"
    );

    // ========================================================
    // RETURN JSON
    // ========================================================
    return NextResponse.json(
      {
        success: true,
        count: lambdaResult.count,
        fileName: key,
        processingTimeMs: totalTime,
        input: {
          bucket,
          key,
        },
        results: lambdaResult.results || {},
      },
      {
        status: 200,
        headers: {
          "Cache-Control": "no-store",
          "Content-Type": "application/json",
        },
      }
    );
  } catch (error) {
    const totalTime = Date.now() - requestStart;

    const message =
      error instanceof Error
        ? error.message
        : String(error);

    logStep(
      "========================================"
    );
    logStep("REQUEST FAILED");
    logStep("ERROR", message);
    logStep("TOTAL TIME", `${totalTime} ms`);
    logStep(
      "========================================"
    );

    return NextResponse.json(
      {
        success: false,
        message,
        processingTimeMs: totalTime,
      },
      {
        status: 500,
        headers: {
          "Cache-Control": "no-store",
          "Content-Type": "application/json",
        },
      }
    );
  }
}
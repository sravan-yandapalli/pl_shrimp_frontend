"use client";

import {
  useEffect,
  useRef,
  useState,
} from "react";

export default function ShrimpCamera() {
  // ==========================================================
  // REFS
  // ==========================================================

  const videoRef =
    useRef<HTMLVideoElement | null>(null);

  const streamRef =
    useRef<MediaStream | null>(null);

  // ==========================================================
  // STATE
  // ==========================================================

  const [isCameraStarted, setIsCameraStarted] =
    useState(false);

  const [isCaptured, setIsCaptured] =
    useState(false);

  const [capturedImage, setCapturedImage] =
    useState<string | null>(null);

  const [error, setError] =
    useState<string | null>(null);

  // ==========================================================
  // START CAMERA
  // ==========================================================

  const startCamera = async () => {
    try {
      setError(null);

      // Stop old stream if one exists
      if (streamRef.current) {
        streamRef.current
          .getTracks()
          .forEach((track) => {
            track.stop();
          });

        streamRef.current = null;
      }

      const stream =
        await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: {
              ideal: "environment",
            },

            width: {
              ideal: 1920,
            },

            height: {
              ideal: 1080,
            },
          },

          audio: false,
        });

      streamRef.current = stream;

      const video =
        videoRef.current;

      if (!video) {
        throw new Error(
          "Video element is not available."
        );
      }

      video.srcObject = stream;

      await video.play();

      setIsCameraStarted(true);
      setIsCaptured(false);

    } catch (err) {
      console.error(
        "Camera error:",
        err
      );

      setError(
        err instanceof Error
          ? err.message
          : "Unable to access camera."
      );

      setIsCameraStarted(false);
    }
  };

  // ==========================================================
  // STOP CAMERA
  // ==========================================================

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current
        .getTracks()
        .forEach((track) => {
          track.stop();
        });

      streamRef.current = null;
    }

    const video =
      videoRef.current;

    if (video) {
      video.srcObject = null;
    }

    setIsCameraStarted(false);
  };

  // ==========================================================
  // CAPTURE IMAGE
  //
  // FINAL IMAGE = EXACTLY 300 × 300
  //
  // IMPORTANT:
  //
  // The camera may be 1920 × 1080.
  //
  // Maximum square available:
  //
  // 1080 × 1080
  //
  // We use the FULL 1080 × 1080 square.
  //
  // We do NOT use 0.90 because that would crop MORE.
  // ==========================================================

  const captureImage = (): string | null => {
    const video =
      videoRef.current;

    if (!video) {
      console.error(
        "Video element is not available."
      );

      return null;
    }

    // --------------------------------------------------------
    // Check camera frame
    // --------------------------------------------------------

    if (
      video.readyState <
        HTMLMediaElement.HAVE_CURRENT_DATA ||
      video.videoWidth === 0 ||
      video.videoHeight === 0
    ) {
      console.error(
        "Camera is not ready."
      );

      return null;
    }

    // --------------------------------------------------------
    // FINAL OUTPUT SIZE
    // --------------------------------------------------------

    const OUTPUT_SIZE = 300;

    // --------------------------------------------------------
    // ACTUAL CAMERA SIZE
    // --------------------------------------------------------

    const videoWidth =
      video.videoWidth;

    const videoHeight =
      video.videoHeight;

    console.log(
      "[CAMERA] Camera resolution:",
      `${videoWidth}x${videoHeight}`
    );

    // --------------------------------------------------------
    // MAXIMUM POSSIBLE SQUARE
    // --------------------------------------------------------
    //
    // For:
    //
    // 1920 × 1080
    //
    // squareSize = 1080
    //
    // --------------------------------------------------------

    const squareSize =
      Math.min(
        videoWidth,
        videoHeight
      );

    // --------------------------------------------------------
    // USE FULL SQUARE
    //
    // Do NOT reduce this.
    //
    // 1080 × 1080 is the maximum square.
    // --------------------------------------------------------

    const cropSize =
      squareSize;

    // --------------------------------------------------------
    // CENTER CROP
    // --------------------------------------------------------

    const sourceX =
      (videoWidth - cropSize) / 2;

    const sourceY =
      (videoHeight - cropSize) / 2;

    console.log(
      "[CAMERA] Center crop:",
      {
        x: sourceX,
        y: sourceY,
        width: cropSize,
        height: cropSize,
      }
    );

    // --------------------------------------------------------
    // CREATE EXACT 300 × 300 CANVAS
    // --------------------------------------------------------

    const canvas =
      document.createElement(
        "canvas"
      );

    canvas.width =
      OUTPUT_SIZE;

    canvas.height =
      OUTPUT_SIZE;

    const context =
      canvas.getContext("2d");

    if (!context) {
      console.error(
        "Could not create canvas context."
      );

      return null;
    }

    // --------------------------------------------------------
    // DRAW CAMERA CENTER SQUARE
    // --------------------------------------------------------

    context.drawImage(
      video,

      // SOURCE
      sourceX,
      sourceY,
      cropSize,
      cropSize,

      // DESTINATION
      0,
      0,
      OUTPUT_SIZE,
      OUTPUT_SIZE
    );

    // --------------------------------------------------------
    // CONVERT TO JPEG
    // --------------------------------------------------------

    const imageDataUrl =
      canvas.toDataURL(
        "image/jpeg",
        0.92
      );

    console.log(
      "[CAMERA] CAPTURED IMAGE",
      {
        camera:
          `${videoWidth}x${videoHeight}`,

        sourceCrop:
          `${Math.round(cropSize)}x${Math.round(cropSize)}`,

        output:
          "300x300",

        sizeKB:
          Math.round(
            imageDataUrl.length / 1024
          ),
      }
    );

    return imageDataUrl;
  };

  // ==========================================================
  // HANDLE CAPTURE
  // ==========================================================

  const handleCapture = () => {
    const image =
      captureImage();

    if (!image) {
      setError(
        "Unable to capture image."
      );

      return;
    }

    // Save actual 300 × 300 image
    setCapturedImage(image);

    // Show captured image
    setIsCaptured(true);

    // Stop camera
    stopCamera();

    // ========================================================
    // IMPORTANT:
    //
    // If you already have an upload/count function,
    // call it here:
    //
    // uploadAndCount(image);
    //
    // ========================================================
  };

  // ==========================================================
  // RETAKE
  // ==========================================================

  const handleRetake = async () => {
    setCapturedImage(null);

    setIsCaptured(false);

    setError(null);

    await startCamera();
  };

  // ==========================================================
  // CLEANUP CAMERA
  // ==========================================================

  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current
          .getTracks()
          .forEach((track) => {
            track.stop();
          });

        streamRef.current = null;
      }
    };
  }, []);

  // ==========================================================
  // UI
  // ==========================================================

  return (
    <div className="flex flex-col items-center gap-4">

      {/* ====================================================
          300 × 300 VIEWFINDER
          ==================================================== */}

      <div
        className="
          relative
          w-[300px]
          h-[300px]
          overflow-hidden
          rounded-full
          bg-black
          border
          border-primary/10
        "
      >

        {!isCaptured ? (
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="
              absolute
              inset-0
              w-full
              h-full
              object-cover
            "
          />
        ) : capturedImage ? (
          <img
            src={capturedImage}
            alt="Captured shrimp"
            className="
              absolute
              inset-0
              w-full
              h-full
              object-fill
            "
          />
        ) : null}

      </div>

      {/* ====================================================
          ERROR
          ==================================================== */}

      {error && (
        <p className="text-sm text-red-500">
          {error}
        </p>
      )}

      {/* ====================================================
          START CAMERA
          ==================================================== */}

      {!isCameraStarted &&
        !isCaptured && (
          <button
            type="button"
            onClick={startCamera}
            className="
              rounded-lg
              bg-primary
              px-6
              py-3
              text-white
            "
          >
            Start Camera
          </button>
        )}

      {/* ====================================================
          CAPTURE
          ==================================================== */}

      {isCameraStarted &&
        !isCaptured && (
          <button
            type="button"
            onClick={handleCapture}
            className="
              rounded-full
              bg-primary
              px-8
              py-3
              text-white
            "
          >
            Capture
          </button>
        )}

      {/* ====================================================
          RETAKE
          ==================================================== */}

      {isCaptured && (
        <button
          type="button"
          onClick={handleRetake}
          className="
            rounded-lg
            border
            px-6
            py-3
          "
        >
          Retake
        </button>
      )}

    </div>
  );
}
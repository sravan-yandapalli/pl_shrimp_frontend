"use client";

import { useRef, useState } from "react";

export default function CameraCapture() {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const [capturedImage, setCapturedImage] =
    useState<string | null>(null);

  const [isCaptured, setIsCaptured] =
    useState(false);

  const [cameraStarted, setCameraStarted] =
    useState(false);

  // ==========================================================
  // START CAMERA
  // ==========================================================

  const startCamera = async () => {
    try {
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

      const video = videoRef.current;

      if (!video) {
        console.error(
          "Video element not available"
        );
        return;
      }

      video.srcObject = stream;

      await video.play();

      setCameraStarted(true);
      setIsCaptured(false);

    } catch (error) {
      console.error(
        "Unable to access camera:",
        error
      );
    }
  };

  // ==========================================================
  // STOP CAMERA
  // ==========================================================

  const stopCamera = () => {
    const video = videoRef.current;

    if (!video) {
      return;
    }

    const stream =
      video.srcObject as MediaStream | null;

    if (stream) {
      stream
        .getTracks()
        .forEach((track) => {
          track.stop();
        });
    }

    video.srcObject = null;

    setCameraStarted(false);
  };

  // ==========================================================
  // CAPTURE 300 × 300 CENTER SQUARE
  // ==========================================================

  const captureImage = (): string | null => {
    const video = videoRef.current;

    if (!video) {
      console.error(
        "Video element not available"
      );
      return null;
    }

    // --------------------------------------------------------
    // Make sure camera has a valid frame
    // --------------------------------------------------------

    if (
      video.readyState <
        HTMLMediaElement.HAVE_CURRENT_DATA ||
      video.videoWidth === 0 ||
      video.videoHeight === 0
    ) {
      console.error(
        "Camera is not ready yet"
      );

      return null;
    }

    // --------------------------------------------------------
    // FINAL IMAGE SIZE
    // --------------------------------------------------------

    const OUTPUT_SIZE = 300;

    // --------------------------------------------------------
    // ACTUAL CAMERA FRAME SIZE
    // --------------------------------------------------------

    const videoWidth =
      video.videoWidth;

    const videoHeight =
      video.videoHeight;

    console.log(
      "Camera resolution:",
      videoWidth,
      "x",
      videoHeight
    );

    // --------------------------------------------------------
    // GET CENTER SQUARE
    // --------------------------------------------------------

    const cropSize =
      Math.min(
        videoWidth,
        videoHeight
      );

    const sourceX =
      (videoWidth - cropSize) / 2;

    const sourceY =
      (videoHeight - cropSize) / 2;

    console.log(
      "Crop:",
      {
        sourceX,
        sourceY,
        cropSize,
      }
    );

    // --------------------------------------------------------
    // CREATE 300 × 300 CANVAS
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
        "Could not create canvas context"
      );

      return null;
    }

    // --------------------------------------------------------
    // DRAW CENTER SQUARE
    //
    // Camera:
    //
    // 1920 × 1080
    //
    // Center crop:
    //
    // 1080 × 1080
    //
    // Output:
    //
    // 300 × 300
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

    const imageData =
      canvas.toDataURL(
        "image/jpeg",
        0.92
      );

    console.log(
      "Captured image:",
      {
        width: canvas.width,
        height: canvas.height,
        sizeKB: Math.round(
          imageData.length / 1024
        ),
      }
    );

    return imageData;
  };

  // ==========================================================
  // CAPTURE BUTTON
  // ==========================================================

  const handleCapture = () => {
    const image =
      captureImage();

    if (!image) {
      return;
    }

    // Save actual 300 × 300 image
    setCapturedImage(image);

    // Show captured image
    setIsCaptured(true);

    // Stop camera
    stopCamera();
  };

  // ==========================================================
  // RETAKE
  // ==========================================================

  const handleRetake = async () => {
    setCapturedImage(null);
    setIsCaptured(false);

    await startCamera();
  };

  // ==========================================================
  // RENDER
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
            alt="Captured image"
            className="
              absolute
              inset-0
              w-full
              h-full
              object-fill
            "
          />

        ) : (

          <div
            className="
              absolute
              inset-0
              flex
              items-center
              justify-center
              text-white
            "
          >
            No image
          </div>

        )}

      </div>

      {/* ====================================================
          BUTTONS
          ==================================================== */}

      {!cameraStarted &&
        !isCaptured && (
          <button
            type="button"
            onClick={startCamera}
            className="
              rounded-lg
              bg-primary
              px-5
              py-3
              text-white
            "
          >
            Start Camera
          </button>
        )}

      {cameraStarted &&
        !isCaptured && (
          <button
            type="button"
            onClick={handleCapture}
            className="
              rounded-full
              bg-primary
              px-6
              py-3
              text-white
            "
          >
            Capture
          </button>
        )}

      {isCaptured && (
        <button
          type="button"
          onClick={handleRetake}
          className="
            rounded-lg
            border
            px-5
            py-3
          "
        >
          Retake
        </button>
      )}

    </div>
  );
}
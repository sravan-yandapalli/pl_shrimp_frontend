"use client";

import {
  useEffect,
  useRef,
  useState,
} from "react";

interface CameraCaptureProps {
  onCapture?: (
    imageDataUrl: string
  ) => void;

  onRetake?: () => void;
}

export default function CameraCapture({
  onCapture,
  onRetake,
}: CameraCaptureProps) {
  const videoRef =
    useRef<HTMLVideoElement | null>(null);

  const streamRef =
    useRef<MediaStream | null>(null);

  const [cameraStarted, setCameraStarted] =
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

      // Stop any previous camera
      if (streamRef.current) {
        streamRef.current
          .getTracks()
          .forEach((track) => track.stop());

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

      setCameraStarted(true);
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

      setCameraStarted(false);
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

    setCameraStarted(false);
  };

  // ==========================================================
  // CAPTURE IMAGE
  //
  // IMPORTANT:
  //
  // The resulting image is ACTUALLY 300 × 300 pixels.
  //
  // Example camera:
  //
  // 1920 × 1080
  //
  // Center square:
  //
  // 1080 × 1080
  //
  // Final:
  //
  // 300 × 300
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
        HTMLMediaElement.HAVE_CURRENT_DATA
    ) {
      console.error(
        "Camera frame is not ready."
      );

      return null;
    }

    if (
      video.videoWidth === 0 ||
      video.videoHeight === 0
    ) {
      console.error(
        "Camera has no valid dimensions."
      );

      return null;
    }

    // --------------------------------------------------------
    // FINAL OUTPUT SIZE
    // --------------------------------------------------------

    const OUTPUT_SIZE = 300;

    // --------------------------------------------------------
    // ACTUAL CAMERA RESOLUTION
    // --------------------------------------------------------

    const videoWidth =
      video.videoWidth;

    const videoHeight =
      video.videoHeight;

    console.log(
      "[CAMERA] Resolution:",
      `${videoWidth}x${videoHeight}`
    );

    // --------------------------------------------------------
    // FIND LARGEST CENTER SQUARE
    // --------------------------------------------------------

    const cropSize =
      Math.min(
        videoWidth,
        videoHeight
      );

    // Center horizontally
    const sourceX =
      (videoWidth - cropSize) / 2;

    // Center vertically
    const sourceY =
      (videoHeight - cropSize) / 2;

    console.log(
      "[CAMERA] Crop:",
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
        "Unable to create canvas context."
      );

      return null;
    }

    // --------------------------------------------------------
    // DRAW CENTER SQUARE
    //
    // SOURCE:
    //
    //   sourceX
    //   sourceY
    //   cropSize
    //   cropSize
    //
    // DESTINATION:
    //
    //   0
    //   0
    //   300
    //   300
    // --------------------------------------------------------

    context.drawImage(
      video,

      // Source rectangle
      sourceX,
      sourceY,
      cropSize,
      cropSize,

      // Destination rectangle
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
      "[CAMERA] CAPTURE COMPLETE",
      {
        width: canvas.width,
        height: canvas.height,
        type: "image/jpeg",
        sizeKB: Math.round(
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
    const imageDataUrl =
      captureImage();

    if (!imageDataUrl) {
      setError(
        "Unable to capture image."
      );

      return;
    }

    // Save captured image
    setCapturedImage(
      imageDataUrl
    );

    // Switch from camera to captured image
    setIsCaptured(true);

    // Stop camera
    stopCamera();

    // Send image to parent component
    if (onCapture) {
      onCapture(
        imageDataUrl
      );
    }
  };

  // ==========================================================
  // RETAKE
  // ==========================================================

  const handleRetake = async () => {
    setCapturedImage(null);
    setIsCaptured(false);
    setError(null);

    if (onRetake) {
      onRetake();
    }

    await startCamera();
  };

  // ==========================================================
  // CLEANUP
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
          shrink-0
          overflow-hidden
          rounded-full
          bg-black
          border
          border-primary/10
        "
      >

        {/* ==================================================
            CAMERA
            ================================================== */}

        {!isCaptured && (
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
        )}

        {/* ==================================================
            CAPTURED 300 × 300 IMAGE
            ================================================== */}

        {isCaptured &&
          capturedImage && (
            <img
              src={capturedImage}
              alt="Captured shrimp sample"
              className="
                absolute
"use client";

import { useState, useEffect, useRef } from "react";
import Image from "next/image";
import { useCamera } from "@/hooks/useCamera";
import Viewfinder from "@/components/Viewfinder";
import StatusDisplay from "@/components/StatusDisplay";
import CaptureControls from "@/components/CaptureControls";

export default function Home() {
  const {
    videoRef,
    canvasRef,
    cameraReady,
    errorMessage,
    setErrorMessage,
    startCamera,
    stopCamera,
    captureFrame,
  } = useCamera();

  const [isCaptured, setIsCaptured] = useState(false);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [capturedBlob, setCapturedBlob] = useState<Blob | null>(null);

  const [isProcessing, setIsProcessing] = useState(false);
  const [count, setCount] = useState<number | null>(null);
  const [savedFileName, setSavedFileName] = useState<string | null>(null);

  const cameraClickRef = useRef<HTMLAudioElement | null>(null);

  // ============================================================
  // AUTO-START CAMERA
  // Starts the camera whenever the app is in camera mode.
  // ============================================================
  useEffect(() => {
    if (!isCaptured) {
      void startCamera();
    }
  }, [isCaptured, startCamera]);

  // ============================================================
  // MOBILE APP / BROWSER LIFECYCLE
  //
  // Leaving the app:
  //     stop camera
  //
  // Coming back:
  //     restart camera only if no image is currently captured
  //
  // This does NOT trigger:
  //     - torch
  //     - sound
  //     - capture
  //     - white flash
  // ============================================================
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        stopCamera();
        return;
      }

      if (
        document.visibilityState === "visible" &&
        !isCaptured
      ) {
        void startCamera();
      }
    };

    const handlePageShow = () => {
      if (
        document.visibilityState === "visible" &&
        !isCaptured
      ) {
        void startCamera();
      }
    };

    document.addEventListener(
      "visibilitychange",
      handleVisibilityChange
    );

    window.addEventListener(
      "pageshow",
      handlePageShow
    );

    return () => {
      document.removeEventListener(
        "visibilitychange",
        handleVisibilityChange
      );

      window.removeEventListener(
        "pageshow",
        handlePageShow
      );
    };
  }, [isCaptured, startCamera, stopCamera]);

  // ============================================================
  // CAMERA CLICK SOUND
  // ============================================================
  useEffect(() => {
    const audio = new Audio("/sounds/camera-click.mp3");
    audio.preload = "auto";
    cameraClickRef.current = audio;

    return () => {
      audio.pause();
      audio.currentTime = 0;
      cameraClickRef.current = null;
    };
  }, []);

  // ============================================================
  // CLEAN UP OBJECT URL
  // ============================================================
  useEffect(() => {
    return () => {
      if (capturedImage) {
        URL.revokeObjectURL(capturedImage);
      }
    };
  }, [capturedImage]);

  // ============================================================
  // CAPTURE
  // ============================================================
  const handleCapture = async () => {
    const result = await captureFrame();

    if (!result) {
      return;
    }

    // Play camera click after successful capture.
    const audio = cameraClickRef.current;

    if (audio) {
      try {
        audio.currentTime = 0;
        await audio.play();
      } catch {
        // Ignore sound errors.
        // Capture itself must continue normally.
      }
    }

    if (capturedImage) {
      URL.revokeObjectURL(capturedImage);
    }

    setCapturedImage(result.url);
    setCapturedBlob(result.blob);
    setCount(null);
    setSavedFileName(null);
    setErrorMessage(null);
    setIsCaptured(true);

    stopCamera();
  };

  // ============================================================
  // UPLOAD EXISTING IMAGE
  // ============================================================
  const handleUpload = (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    if (!file.type.startsWith("image/")) {
      setErrorMessage("Please select an image file.");
      event.target.value = "";
      return;
    }

    setErrorMessage(null);
    setCount(null);
    setSavedFileName(null);

    const image = new window.Image();
    const imageUrl = URL.createObjectURL(file);

    image.onload = () => {
      const canvas = canvasRef.current;

      if (!canvas) {
        URL.revokeObjectURL(imageUrl);
        event.target.value = "";
        return;
      }

      const sourceSize = Math.min(
        image.naturalWidth,
        image.naturalHeight
      );

      const sourceStartX =
        (image.naturalWidth - sourceSize) / 2;

      const sourceStartY =
        (image.naturalHeight - sourceSize) / 2;

      canvas.width = sourceSize;
      canvas.height = sourceSize;

      const ctx = canvas.getContext("2d");

      if (!ctx) {
        URL.revokeObjectURL(imageUrl);
        event.target.value = "";
        setErrorMessage("Could not process the selected image.");
        return;
      }

      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";

      ctx.clearRect(
        0,
        0,
        sourceSize,
        sourceSize
      );

      ctx.drawImage(
        image,
        sourceStartX,
        sourceStartY,
        sourceSize,
        sourceSize,
        0,
        0,
        sourceSize,
        sourceSize
      );

      canvas.toBlob(
        (blob) => {
          URL.revokeObjectURL(imageUrl);

          if (!blob) {
            setErrorMessage("Could not create PNG.");
            event.target.value = "";
            return;
          }

          if (capturedImage) {
            URL.revokeObjectURL(capturedImage);
          }

          setCapturedImage(
            URL.createObjectURL(blob)
          );

          setCapturedBlob(blob);
          setIsCaptured(true);
          setErrorMessage(null);

          stopCamera();
        },
        "image/png"
      );
    };

    image.onerror = () => {
      URL.revokeObjectURL(imageUrl);
      event.target.value = "";
      setErrorMessage("Could not load the selected image.");
    };

    image.src = imageUrl;
  };

  // ============================================================
  // RECAPTURE
  // ============================================================
  const handleRecapture = () => {
    if (capturedImage) {
      URL.revokeObjectURL(capturedImage);
    }

    setCapturedImage(null);
    setCapturedBlob(null);
    setCount(null);
    setSavedFileName(null);
    setErrorMessage(null);
    setIsCaptured(false);
  };

  // ============================================================
  // SUBMIT TO S3 + LAMBDA
  // ============================================================
  const handleSubmit = async () => {
    if (!capturedBlob) {
      setErrorMessage("No captured image available.");
      return;
    }

    try {
      setIsProcessing(true);
      setCount(null);
      setSavedFileName(null);
      setErrorMessage(null);

      // --------------------------------------------------------
      // STEP 1: Get secure S3 upload URL
      // --------------------------------------------------------
      const urlRes = await fetch(
        "/api/upload-url",
        {
          method: "POST",
        }
      );

      if (!urlRes.ok) {
        throw new Error(
          "Could not get secure upload link from server."
        );
      }

      const {
        uploadUrl,
        key,
        bucket,
      } = await urlRes.json();

      // --------------------------------------------------------
      // STEP 2: Upload original PNG directly to S3
      // --------------------------------------------------------
      const uploadRes = await fetch(
        uploadUrl,
        {
          method: "PUT",
          headers: {
            "Content-Type": "image/png",
          },
          body: capturedBlob,
        }
      );

      if (!uploadRes.ok) {
        throw new Error(
          `Failed to upload image. Status: ${uploadRes.status}`
        );
      }

      // --------------------------------------------------------
      // STEP 3: Tell Next.js which S3 object Lambda should process
      // --------------------------------------------------------
      const processRes = await fetch(
        "/api/capture",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            bucket,
            key,
          }),
        }
      );

      const result = await processRes.json();

      if (!processRes.ok) {
        throw new Error(
          result.message ||
            "Failed to process image."
        );
      }

      // --------------------------------------------------------
      // STEP 4: Display result
      // --------------------------------------------------------
      setSavedFileName(
        typeof result.fileName === "string"
          ? result.fileName
          : key.split("/").pop() || key
      );

      if (typeof result.count === "number") {
        setCount(result.count);
      }
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Failed to process image."
      );
    } finally {
      setIsProcessing(false);
    }
  };

  // ============================================================
  // UI
  // ============================================================
  return (
    <>
      <canvas
        ref={canvasRef}
        style={{ display: "none" }}
      />

      <div className="w-full h-[calc(100dvh-60px)] overflow-hidden flex flex-col items-center justify-between pt-6 pb-15 select-none bg-background">
        {/* Instructions */}
        <div>
          <Image
            src="/images/inst.png"
            alt="instructions"
            width={310}
            height={100}
            priority
          />
        </div>

        {/* Camera / Captured Image */}
        <Viewfinder
          isCaptured={isCaptured}
          capturedImage={capturedImage}
          videoRef={videoRef}
        />

        {/* Status */}
        <StatusDisplay
          isProcessing={isProcessing}
          count={count}
          savedFileName={savedFileName}
          errorMessage={errorMessage}
        />

        {/* Controls */}
        <CaptureControls
          isCaptured={isCaptured}
          cameraReady={cameraReady}
          isProcessing={isProcessing}
          onCapture={handleCapture}
          onUpload={handleUpload}
          onRecapture={handleRecapture}
          onSubmit={handleSubmit}
        />
      </div>
    </>
  );
}
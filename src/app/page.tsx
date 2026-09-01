"use client";

import { useState, useEffect, useRef } from "react";
import Image from "next/image";
import { useCamera } from "@/hooks/useCamera";
import Viewfinder from "@/components/Viewfinder";
import StatusDisplay from "@/components/StatusDisplay";
import CaptureControls from "@/components/CaptureControls";

export interface Prediction {
  class: number;
  confidence: number;
  bbox: [number, number, number, number];
}

export interface ImageSize {
  width: number;
  height: number;
}

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
    captureResolution,
  } = useCamera();

  const [isCaptured, setIsCaptured] = useState(false);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [capturedBlob, setCapturedBlob] = useState<Blob | null>(null);

  const [isProcessing, setIsProcessing] = useState(false);
  const [count, setCount] = useState<number | null>(null);
  const [savedFileName, setSavedFileName] = useState<string | null>(null);

  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [imageSize, setImageSize] = useState<ImageSize | null>(null);

  const cameraClickRef = useRef<HTMLAudioElement | null>(null);

  // ============================================================
  // WARM-UP SAGEMAKER ENDPOINT ON PAGE LOAD
  // ============================================================
  useEffect(() => {
    const warmUpEndpoint = async () => {
      try {
        await fetch("/api/warmup");
        console.log("[DIZIAQUA] SageMaker warm-up signal sent.");
      } catch (err) {
        console.warn("[DIZIAQUA] Warm-up ping failed:", err);
      }
    };

    void warmUpEndpoint();
  }, []);

  // ============================================================
  // AUTO-START CAMERA
  // Starts the camera whenever the app is in camera mode.
  // ============================================================
  useEffect(() => {
    if (!isCaptured) {
      void startCamera();
    }
  }, [isCaptured, startCamera]);


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


  useEffect(() => {
    return () => {
      if (capturedImage) {
        URL.revokeObjectURL(capturedImage);
      }
    };
  }, [capturedImage]);

  const handleCapture = async () => {
    const result = await captureFrame();

    if (!result) {
      return;
    }


    const audio = cameraClickRef.current;

    if (audio) {
      try {
        audio.currentTime = 0;
        await audio.play();
      } catch {
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
    
    setPredictions([]);
    setImageSize(null);
    
    setIsCaptured(true);

    stopCamera();
  };


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
    
    setPredictions([]);
    setImageSize(null);

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


  const handleRecapture = () => {
    if (capturedImage) {
      URL.revokeObjectURL(capturedImage);
    }

    setCapturedImage(null);
    setCapturedBlob(null);
    setCount(null);
    setSavedFileName(null);
    setErrorMessage(null);
    
    setPredictions([]);
    setImageSize(null);
    
    setIsCaptured(false);
  };

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
      
      setPredictions([]);
      setImageSize(null);

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

      const uploadRes = await fetch(
        uploadUrl,
        {
          method: "PUT",
          headers: {
            "Content-Type": "image/jpeg",
          },
          body: capturedBlob,
        }
      );

      if (!uploadRes.ok) {
        throw new Error(
          `Failed to upload image. Status: ${uploadRes.status}`
        );
      }

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


      setSavedFileName(
        typeof result.fileName === "string"
          ? result.fileName
          : key.split("/").pop() || key
      );

      if (typeof result.count === "number") {
        setCount(result.count);
      }
      
      if (result.predictions) {
        setPredictions(result.predictions);
      }
      
      if (result.image) {
        setImageSize(result.image);
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


  return (
    <>
      <canvas
        ref={canvasRef}
        style={{ display: "none" }}
      />

      <div className="w-full h-[calc(100dvh-60px)] overflow-hidden flex flex-col items-center justify-between pt-6 pb-15 select-none bg-background">

        <div>
          <Image
            src="/images/inst.png"
            alt="instructions"
            width={310}
            height={100}
            priority
          />
        </div>


        <Viewfinder
          isCaptured={isCaptured}
          capturedImage={capturedImage}
          videoRef={videoRef}
          predictions={predictions}
          imageSize={imageSize}
        />

        <StatusDisplay
          isProcessing={isProcessing}
          count={count}
          savedFileName={savedFileName}
          errorMessage={errorMessage}
          captureResolution={captureResolution}
        />


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
"use client";

import {
  useEffect,
  useRef,
  useState,
} from "react";

import type {
  ChangeEvent,
} from "react";

import Image from "next/image";

import {
  useCamera,
} from "@/hooks/useCamera";

import Viewfinder from "@/components/Viewfinder";

import StatusDisplay from "@/components/StatusDisplay";

import CaptureControls from "@/components/CaptureControls";

export default function Home() {
  // ============================================================
  // CAMERA
  // ============================================================

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

  // ============================================================
  // STATE
  // ============================================================

  const [
    isCaptured,
    setIsCaptured,
  ] = useState(false);

  const [
    capturedImage,
    setCapturedImage,
  ] = useState<string | null>(null);

  const [
    capturedBlob,
    setCapturedBlob,
  ] = useState<Blob | null>(null);

  const [
    isProcessing,
    setIsProcessing,
  ] = useState(false);

  const [
    count,
    setCount,
  ] = useState<number | null>(null);

  const [
    savedFileName,
    setSavedFileName,
  ] = useState<string | null>(null);

  const [
    annotatedImageUrl,
    setAnnotatedImageUrl,
  ] = useState<string | null>(null);

  const cameraClickRef =
    useRef<HTMLAudioElement | null>(
      null,
    );

  // ============================================================
  // WARM UP SAGEMAKER ONCE
  // ============================================================

  const warmUpStartedRef =
    useRef(false);

  useEffect(() => {
    // React Strict Mode can run effects twice in development.
    // This guard ensures only one warm-up request is started
    // for this page mount.
    if (warmUpStartedRef.current) {
      return;
    }

    warmUpStartedRef.current = true;

    const warmUpEndpoint =
      async () => {
        try {
          console.log(
            "[DIZIAQUA] Calling SageMaker warm-up...",
          );

          const response =
            await fetch(
              "/api/warmup",
              {
                method: "GET",
                cache: "no-store",
              },
            );

          console.log(
            "[DIZIAQUA] SageMaker warm-up returned:",
            response.status,
          );

          if (!response.ok) {
            console.warn(
              "[DIZIAQUA] SageMaker warm-up failed:",
              response.status,
            );

            return;
          }

          const data =
            await response.json();

          console.log(
            "[DIZIAQUA] SageMaker warm-up completed:",
            data,
          );
        } catch (error) {
          console.warn(
            "[DIZIAQUA] Warm-up request failed:",
            error,
          );
        }
      };

    void warmUpEndpoint();
  }, []);

  // ============================================================
  // AUTO START CAMERA
  // ============================================================

  useEffect(() => {
    if (!isCaptured) {
      void startCamera();
    }
  }, [
    isCaptured,
    startCamera,
  ]);

  // ============================================================
  // VISIBILITY HANDLING
  // ============================================================

  useEffect(() => {
    const handleVisibilityChange =
      () => {
        if (
          document.visibilityState ===
          "hidden"
        ) {
          stopCamera();
          return;
        }

        if (
          document.visibilityState ===
            "visible" &&
          !isCaptured
        ) {
          void startCamera();
        }
      };

    const handlePageShow =
      () => {
        if (
          document.visibilityState ===
            "visible" &&
          !isCaptured
        ) {
          void startCamera();
        }
      };

    document.addEventListener(
      "visibilitychange",
      handleVisibilityChange,
    );

    window.addEventListener(
      "pageshow",
      handlePageShow,
    );

    return () => {
      document.removeEventListener(
        "visibilitychange",
        handleVisibilityChange,
      );

      window.removeEventListener(
        "pageshow",
        handlePageShow,
      );
    };
  }, [
    isCaptured,
    startCamera,
    stopCamera,
  ]);

  // ============================================================
  // CAMERA CLICK SOUND
  // ============================================================

  useEffect(() => {
    const audio =
      new Audio(
        "/sounds/camera-click.mp3",
      );

    audio.preload = "auto";

    cameraClickRef.current =
      audio;

    return () => {
      audio.pause();
      audio.currentTime = 0;

      cameraClickRef.current =
        null;
    };
  }, []);

  // ============================================================
  // CLEANUP LOCAL BLOB URL
  // ============================================================

  useEffect(() => {
    return () => {
      if (
        capturedImage &&
        capturedImage.startsWith(
          "blob:",
        )
      ) {
        URL.revokeObjectURL(
          capturedImage,
        );
      }
    };
  }, [capturedImage]);

  // ============================================================
  // CAPTURE
  // ============================================================

  const handleCapture =
    async () => {
      const result =
        await captureFrame();

      if (!result) {
        return;
      }

      // ----------------------------------------------------------
      // CAMERA SOUND
      // ----------------------------------------------------------

      const audio =
        cameraClickRef.current;

      if (audio) {
        try {
          audio.currentTime = 0;
          await audio.play();
        } catch {
          // Ignore audio errors.
        }
      }

      // ----------------------------------------------------------
      // REMOVE OLD IMAGE
      // ----------------------------------------------------------

      if (
        capturedImage &&
        capturedImage.startsWith(
          "blob:",
        )
      ) {
        URL.revokeObjectURL(
          capturedImage,
        );
      }

      // ----------------------------------------------------------
      // SAVE CAPTURE
      // ----------------------------------------------------------

      setCapturedImage(
        result.url,
      );

      setCapturedBlob(
        result.blob,
      );

      // ----------------------------------------------------------
      // CLEAR PREVIOUS RESULT
      // ----------------------------------------------------------

      setAnnotatedImageUrl(
        null,
      );

      setCount(null);

      setSavedFileName(
        null,
      );

      setErrorMessage(
        null,
      );

      setIsCaptured(true);

      stopCamera();
    };

  // ============================================================
  // UPLOAD EXISTING IMAGE
  // ============================================================

  const handleUpload =
    (
      event: ChangeEvent<HTMLInputElement>,
    ) => {
      const file =
        event.target.files?.[0];

      if (!file) {
        return;
      }

      // ----------------------------------------------------------
      // VALIDATE FILE
      // ----------------------------------------------------------

      if (
        !file.type.startsWith(
          "image/",
        )
      ) {
        setErrorMessage(
          "Please select an image file.",
        );

        event.target.value = "";

        return;
      }

      setErrorMessage(null);
      setCount(null);
      setSavedFileName(null);
      setAnnotatedImageUrl(null);

      // ----------------------------------------------------------
      // LOAD IMAGE
      // ----------------------------------------------------------

      const image =
        new window.Image();

      const imageUrl =
        URL.createObjectURL(
          file,
        );

      image.onload = () => {
        const canvas =
          canvasRef.current;

        if (!canvas) {
          URL.revokeObjectURL(
            imageUrl,
          );

          event.target.value = "";

          setErrorMessage(
            "Could not process the selected image.",
          );

          return;
        }

        // --------------------------------------------------------
        // CENTER CROP TO SQUARE
        // --------------------------------------------------------

        const sourceSize =
          Math.min(
            image.naturalWidth,
            image.naturalHeight,
          );

        const sourceStartX =
          (
            image.naturalWidth -
            sourceSize
          ) / 2;

        const sourceStartY =
          (
            image.naturalHeight -
            sourceSize
          ) / 2;

        canvas.width =
          sourceSize;

        canvas.height =
          sourceSize;

        const ctx =
          canvas.getContext(
            "2d",
          );

        if (!ctx) {
          URL.revokeObjectURL(
            imageUrl,
          );

          event.target.value = "";

          setErrorMessage(
            "Could not process the selected image.",
          );

          return;
        }

        ctx.imageSmoothingEnabled =
          true;

        ctx.imageSmoothingQuality =
          "high";

        ctx.clearRect(
          0,
          0,
          sourceSize,
          sourceSize,
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
          sourceSize,
        );

        // --------------------------------------------------------
        // CONVERT UPLOADED IMAGE TO JPEG
        // --------------------------------------------------------
        //
        // This is intentional.
        //
        // Your S3 route signs image/jpeg for camera captures.
        // Converting uploaded images here means both camera and
        // gallery uploads use the same JPEG pipeline.
        //

        canvas.toBlob(
          (blob) => {
            URL.revokeObjectURL(
              imageUrl,
            );

            if (!blob) {
              setErrorMessage(
                "Could not create JPEG.",
              );

              event.target.value = "";

              return;
            }

            if (
              capturedImage &&
              capturedImage.startsWith(
                "blob:",
              )
            ) {
              URL.revokeObjectURL(
                capturedImage,
              );
            }

            const previewUrl =
              URL.createObjectURL(
                blob,
              );

            setCapturedImage(
              previewUrl,
            );

            setCapturedBlob(
              blob,
            );

            setAnnotatedImageUrl(
              null,
            );

            setCount(null);

            setSavedFileName(
              null,
            );

            setIsCaptured(
              true,
            );

            setErrorMessage(
              null,
            );

            stopCamera();

            event.target.value = "";
          },
          "image/jpeg",
          0.98,
        );
      };

      image.onerror =
        () => {
          URL.revokeObjectURL(
            imageUrl,
          );

          event.target.value = "";

          setErrorMessage(
            "Could not load the selected image.",
          );
        };

      image.src =
        imageUrl;
    };

  // ============================================================
  // RECAPTURE
  // ============================================================

  const handleRecapture =
    () => {
      if (
        capturedImage &&
        capturedImage.startsWith(
          "blob:",
        )
      ) {
        URL.revokeObjectURL(
          capturedImage,
        );
      }

      setCapturedImage(null);

      setCapturedBlob(null);

      setAnnotatedImageUrl(null);

      setCount(null);

      setSavedFileName(null);

      setErrorMessage(null);

      setIsCaptured(false);
    };

  // ============================================================
  // SUBMIT
  // ============================================================

  const handleSubmit =
    async () => {
      if (!capturedBlob) {
        setErrorMessage(
          "No captured image available.",
        );

        return;
      }

      try {
        // --------------------------------------------------------
        // START PROCESSING
        // --------------------------------------------------------

        setIsProcessing(true);

        setCount(null);

        setSavedFileName(null);

        setAnnotatedImageUrl(null);

        setErrorMessage(null);

        // ========================================================
        // STEP 1
        // GET PRESIGNED URL
        // ========================================================

        const contentType =
          capturedBlob.type ||
          "image/jpeg";

        console.log(
          "[DIZIAQUA] Requesting upload URL...",
          {
            contentType,
          },
        );

        const urlRes =
          await fetch(
            "/api/upload-url",
            {
              method: "POST",
              headers: {
                "Content-Type":
                  "application/json",
              },
              cache: "no-store",
              body: JSON.stringify({
                contentType,
              }),
            },
          );

        if (!urlRes.ok) {
          const text =
            await urlRes.text();

          throw new Error(
            "Could not get secure upload link from server. " +
              text,
          );
        }

        const uploadData =
          await urlRes.json();

        const uploadUrl =
          uploadData.uploadUrl;

        const key =
          uploadData.key;

        const bucket =
          uploadData.bucket;

        const signedContentType =
          uploadData.contentType ||
          contentType;

        if (
          !uploadUrl ||
          !key ||
          !bucket
        ) {
          throw new Error(
            "Invalid upload URL response.",
          );
        }

        console.log(
          "[DIZIAQUA] Upload key:",
          key,
        );

        console.log(
          "[DIZIAQUA] Upload content type:",
          signedContentType,
        );

        // ========================================================
        // STEP 2
        // UPLOAD TO S3
        // ========================================================

        const uploadRes =
          await fetch(
            uploadUrl,
            {
              method: "PUT",
              headers: {
                "Content-Type":
                  signedContentType,
              },
              body: capturedBlob,
            },
          );

        if (!uploadRes.ok) {
          const uploadError =
            await uploadRes.text();

          console.error(
            "[DIZIAQUA] S3 upload response:",
            uploadError,
          );

          throw new Error(
            `Failed to upload image. Status: ${uploadRes.status}. ${uploadError}`,
          );
        }

        console.log(
          "[DIZIAQUA] Image uploaded successfully.",
        );

        // ========================================================
        // STEP 3
        // SEND IMAGE TO COUNTING API
        // ========================================================

        const processRes =
          await fetch(
            "/api/capture",
            {
              method: "POST",
              headers: {
                "Content-Type":
                  "application/json",
              },
              body: JSON.stringify({
                bucket,
                key,
              }),
            },
          );

        // --------------------------------------------------------
        // READ RESPONSE
        // --------------------------------------------------------

        const result =
          await processRes.json();

        console.log(
          "[DIZIAQUA] COUNT RESULT:",
          result,
        );

        // --------------------------------------------------------
        // CHECK HTTP STATUS
        // --------------------------------------------------------

        if (!processRes.ok) {
          throw new Error(
            result.message ||
              result.error ||
              "Failed to process image.",
          );
        }

        // --------------------------------------------------------
        // CHECK SUCCESS
        // --------------------------------------------------------

        if (
          result.success !== true
        ) {
          throw new Error(
            result.message ||
              "Image processing failed.",
          );
        }

        // ========================================================
        // STEP 4
        // SAVE FILE NAME
        // ========================================================

        const fallbackFileName =
          typeof key === "string"
            ? key
                .split("/")
                .pop() || key
            : null;

        setSavedFileName(
          typeof result.fileName ===
            "string"
            ? result.fileName
            : fallbackFileName,
        );

        // ========================================================
        // STEP 5
        // SAVE COUNT
        // ========================================================

        const finalCount =
          result.count ??
          result.shrimp_count;

        if (
          typeof finalCount ===
          "number"
        ) {
          setCount(
            finalCount,
          );
        }

        // ========================================================
        // STEP 6
        // SAVE ANNOTATED IMAGE
        // ========================================================

        const finalAnnotatedUrl =
          result.annotatedImageUrl ||
          result.imageUrl ||
          null;

        if (
          typeof finalAnnotatedUrl !==
            "string" ||
          finalAnnotatedUrl.length ===
            0
        ) {
          console.error(
            "[DIZIAQUA] No annotated image URL received.",
            result,
          );

          throw new Error(
            "Count completed, but annotated image URL was not returned.",
          );
        }

        console.log(
          "[DIZIAQUA] Annotated image URL received:",
          finalAnnotatedUrl,
        );

        setAnnotatedImageUrl(
          finalAnnotatedUrl,
        );
      } catch (error) {
        console.error(
          "[DIZIAQUA] Processing error:",
          error,
        );

        setErrorMessage(
          error instanceof Error
            ? error.message
            : "Failed to process image.",
        );
      } finally {
        setIsProcessing(
          false,
        );
      }
    };

  // ============================================================
  // UI
  // ============================================================

  return (
    <>
      {/* HIDDEN CANVAS */}

      <canvas
        ref={canvasRef}
        style={{
          display: "none",
        }}
      />

      {/* MAIN PAGE */}

      <div className="w-full h-[calc(100dvh-60px)] overflow-hidden flex flex-col items-center justify-between pt-6 pb-15 select-none bg-background">
        {/* INSTRUCTIONS */}

        <div>
          <Image
            src="/images/inst.png"
            alt="instructions"
            width={310}
            height={100}
            style={{
              width: "310px",
              height: "auto",
            }}
            priority
          />
        </div>

        {/* VIEWFINDER */}

        <Viewfinder
          isCaptured={
            isCaptured
          }
          capturedImage={
            capturedImage
          }
          annotatedImageUrl={
            annotatedImageUrl
          }
          videoRef={
            videoRef
          }
        />

        {/* STATUS */}

        <StatusDisplay
          isProcessing={
            isProcessing
          }
          count={
            count
          }
          savedFileName={
            savedFileName
          }
          errorMessage={
            errorMessage
          }
          captureResolution={
            captureResolution
          }
        />

        {/* CONTROLS */}

        <CaptureControls
          isCaptured={
            isCaptured
          }
          cameraReady={
            cameraReady
          }
          isProcessing={
            isProcessing
          }
          onCapture={
            handleCapture
          }
          onUpload={
            handleUpload
          }
          onRecapture={
            handleRecapture
          }
          onSubmit={
            handleSubmit
          }
        />
      </div>
    </>
  );
}
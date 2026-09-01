"use client";

import {
  useState,
  useEffect,
  useRef,
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

  /**
   * Local captured/uploaded image.
   */
  const [
    capturedImage,
    setCapturedImage,
  ] = useState<string | null>(null);

  /**
   * Image blob which is uploaded to S3.
   */
  const [
    capturedBlob,
    setCapturedBlob,
  ] = useState<Blob | null>(null);

  /**
   * Processing indicator.
   */
  const [
    isProcessing,
    setIsProcessing,
  ] = useState(false);

  /**
   * Shrimp count.
   */
  const [
    count,
    setCount,
  ] = useState<number | null>(null);

  /**
   * Original uploaded file name.
   */
  const [
    savedFileName,
    setSavedFileName,
  ] = useState<string | null>(null);

  /**
   * ==========================================================
   * IMPORTANT
   *
   * Presigned URL for:
   *
   * annotated/counted_xxxxxxxx.jpg
   *
   * This is returned by /api/count.
   * ==========================================================
   */
  const [
    annotatedImageUrl,
    setAnnotatedImageUrl,
  ] = useState<string | null>(null);

  /**
   * Camera click audio.
   */
  const cameraClickRef =
    useRef<HTMLAudioElement | null>(
      null
    );

  // ============================================================
  // WARM UP SAGEMAKER
  // ============================================================

  useEffect(() => {
    const warmUpEndpoint =
      async () => {
        try {
          await fetch(
            "/api/warmup"
          );

          console.log(
            "[DIZIAQUA] SageMaker warm-up signal sent."
          );
        } catch (error) {
          console.warn(
            "[DIZIAQUA] Warm-up ping failed:",
            error
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
        "/sounds/camera-click.mp3"
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
        capturedImage.startsWith("blob:")
      ) {
        URL.revokeObjectURL(
          capturedImage
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

      // --------------------------------------------------------
      // CAMERA SOUND
      // --------------------------------------------------------

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

      // --------------------------------------------------------
      // REMOVE OLD LOCAL IMAGE
      // --------------------------------------------------------

      if (
        capturedImage &&
        capturedImage.startsWith("blob:")
      ) {
        URL.revokeObjectURL(
          capturedImage
        );
      }

      // --------------------------------------------------------
      // SAVE NEW CAPTURE
      // --------------------------------------------------------

      setCapturedImage(
        result.url
      );

      setCapturedBlob(
        result.blob
      );

      // --------------------------------------------------------
      // CLEAR PREVIOUS RESULT
      // --------------------------------------------------------

      setAnnotatedImageUrl(
        null
      );

      setCount(
        null
      );

      setSavedFileName(
        null
      );

      setErrorMessage(
        null
      );

      setIsCaptured(
        true
      );

      stopCamera();
    };

  // ============================================================
  // UPLOAD EXISTING IMAGE
  // ============================================================

  const handleUpload = (
    event: React.ChangeEvent<HTMLInputElement>
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
        "image/"
      )
    ) {
      setErrorMessage(
        "Please select an image file."
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
        file
      );

    image.onload =
      () => {
        const canvas =
          canvasRef.current;

        if (!canvas) {
          URL.revokeObjectURL(
            imageUrl
          );

          event.target.value =
            "";

          return;
        }

        // ------------------------------------------------------
        // CENTER CROP TO SQUARE
        // ------------------------------------------------------

        const sourceSize =
          Math.min(
            image.naturalWidth,
            image.naturalHeight
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
            "2d"
          );

        if (!ctx) {
          URL.revokeObjectURL(
            imageUrl
          );

          event.target.value =
            "";

          setErrorMessage(
            "Could not process the selected image."
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

        // ------------------------------------------------------
        // CREATE PNG BLOB
        // ------------------------------------------------------

        canvas.toBlob(
          (blob) => {
            URL.revokeObjectURL(
              imageUrl
            );

            if (!blob) {
              setErrorMessage(
                "Could not create PNG."
              );

              event.target.value =
                "";

              return;
            }

            if (
              capturedImage &&
              capturedImage.startsWith(
                "blob:"
              )
            ) {
              URL.revokeObjectURL(
                capturedImage
              );
            }

            const previewUrl =
              URL.createObjectURL(
                blob
              );

            setCapturedImage(
              previewUrl
            );

            setCapturedBlob(
              blob
            );

            setAnnotatedImageUrl(
              null
            );

            setIsCaptured(
              true
            );

            setErrorMessage(
              null
            );

            stopCamera();

            event.target.value =
              "";
          },

          "image/png"
        );
      };

    image.onerror =
      () => {
        URL.revokeObjectURL(
          imageUrl
        );

        event.target.value =
          "";

        setErrorMessage(
          "Could not load the selected image."
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
          "blob:"
        )
      ) {
        URL.revokeObjectURL(
          capturedImage
        );
      }

      setCapturedImage(
        null
      );

      setCapturedBlob(
        null
      );

      setAnnotatedImageUrl(
        null
      );

      setCount(
        null
      );

      setSavedFileName(
        null
      );

      setErrorMessage(
        null
      );

      setIsCaptured(
        false
      );
    };

  // ============================================================
  // SUBMIT
  // ============================================================

  const handleSubmit =
    async () => {
      if (!capturedBlob) {
        setErrorMessage(
          "No captured image available."
        );

        return;
      }

      try {
        // ------------------------------------------------------
        // START PROCESSING
        // ------------------------------------------------------

        setIsProcessing(
          true
        );

        setCount(
          null
        );

        setSavedFileName(
          null
        );

        setAnnotatedImageUrl(
          null
        );

        setErrorMessage(
          null
        );

        // ======================================================
        // STEP 1
        // GET PRESIGNED UPLOAD URL
        // ======================================================

        console.log(
          "[DIZIAQUA] Requesting upload URL..."
        );

        const urlRes =
          await fetch(
            "/api/upload-url",
            {
              method: "POST",
            }
          );

        if (!urlRes.ok) {
          const text =
            await urlRes.text();

          throw new Error(
            "Could not get secure upload link from server. " +
              text
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

        if (
          !uploadUrl ||
          !key ||
          !bucket
        ) {
          throw new Error(
            "Invalid upload URL response."
          );
        }

        console.log(
          "[DIZIAQUA] Upload key:",
          key
        );

        // ======================================================
        // STEP 2
        // UPLOAD TO S3
        // ======================================================

        const uploadRes =
          await fetch(
            uploadUrl,
            {
              method: "PUT",

              /**
               * Keep this consistent with your current
               * upload-url signing route.
               */
              headers: {
                "Content-Type":
                  "image/jpeg",
              },

              body:
                capturedBlob,
            }
          );

        if (!uploadRes.ok) {
          throw new Error(
            `Failed to upload image. Status: ${uploadRes.status}`
          );
        }

        console.log(
          "[DIZIAQUA] Image uploaded successfully."
        );

        // ======================================================
        // STEP 3
        // SEND IMAGE TO COUNTING API
        // ======================================================

        /**
         * We use /api/capture here for compatibility.
         *
         * /api/capture forwards to /api/count.
         */
        const processRes =
          await fetch(
            "/api/capture",
            {
              method: "POST",

              headers: {
                "Content-Type":
                  "application/json",
              },

              body:
                JSON.stringify({
                  bucket,
                  key,
                }),
            }
          );

        // ------------------------------------------------------
        // READ RESPONSE
        // ------------------------------------------------------

        const result =
          await processRes.json();

        console.log(
          "[DIZIAQUA] COUNT RESULT:",
          result
        );

        // ======================================================
        // CHECK HTTP STATUS
        // ======================================================

        if (!processRes.ok) {
          throw new Error(
            result.message ||
            result.error ||
            "Failed to process image."
          );
        }

        // ======================================================
        // CHECK SUCCESS
        // ======================================================

        if (
          result.success !==
          true
        ) {
          throw new Error(
            result.message ||
            "Image processing failed."
          );
        }

        // ======================================================
        // STEP 4
        // SAVE FILE NAME
        // ======================================================

        setSavedFileName(
          typeof result.fileName ===
            "string"
            ? result.fileName
            : key
              ?.split("/")
              .pop() ||
              key
        );

        // ======================================================
        // STEP 5
        // SAVE COUNT
        // ======================================================

        const finalCount =
          result.count ??
          result.shrimp_count;

        if (
          typeof finalCount ===
          "number"
        ) {
          setCount(
            finalCount
          );
        }

        // ======================================================
        // STEP 6
        // SAVE ANNOTATED IMAGE
        // ======================================================

        /**
         * Current API returns:
         *
         *     annotatedImageUrl
         *
         * and the alternate field:
         *
         *     imageUrl
         *
         * Support both.
         */

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
            result
          );

          throw new Error(
            "Count completed, but annotated image URL was not returned."
          );
        }

        console.log(
          "[DIZIAQUA] Annotated image URL received:"
        );

        console.log(
          finalAnnotatedUrl
        );

        /**
         * THIS IS THE KEY FIX.
         */
        setAnnotatedImageUrl(
          finalAnnotatedUrl
        );

      } catch (error) {
        console.error(
          "[DIZIAQUA] Processing error:",
          error
        );

        setErrorMessage(
          error instanceof Error
            ? error.message
            : "Failed to process image."
        );
      } finally {
        setIsProcessing(
          false
        );
      }
    };

  // ============================================================
  // UI
  // ============================================================

  return (
    <>
      {/* ========================================================
          HIDDEN CANVAS
      ======================================================== */}

      <canvas
        ref={canvasRef}
        style={{
          display: "none",
        }}
      />

      {/* ========================================================
          MAIN PAGE
      ======================================================== */}

      <div
        className="
          w-full
          h-[calc(100dvh-60px)]
          overflow-hidden
          flex
          flex-col
          items-center
          justify-between
          pt-6
          pb-15
          select-none
          bg-background
        "
      >

        {/* ======================================================
            INSTRUCTIONS
        ====================================================== */}

        <div>
          <Image
            src="/images/inst.png"
            alt="instructions"
            width={310}
            height={100}
            priority
          />
        </div>

        {/* ======================================================
            VIEWFINDER
        ====================================================== */}

        <Viewfinder
          isCaptured={
            isCaptured
          }

          capturedImage={
            capturedImage
          }

          /**
           * IMPORTANT:
           * This is the presigned S3 URL returned by the API.
           */
          annotatedImageUrl={
            annotatedImageUrl
          }

          videoRef={
            videoRef
          }
        />

        {/* ======================================================
            STATUS
        ====================================================== */}

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

        {/* ======================================================
            CONTROLS
        ====================================================== */}

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
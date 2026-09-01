"use client";

import {
<<<<<<< Updated upstream
  useEffect,
  useRef,
  useState,
} from "react";

export default function ShrimpCamera() {
=======
  useState,
  useRef,
  useCallback,
  useEffect,
} from "react";

// ============================================================
// CAPTURE RESOLUTION
// ============================================================

export interface CaptureResolution {
  width: number;
  height: number;
  megapixels: number;
  method: "ImageCapture" | "Video fallback";
  sourceWidth?: number;
  sourceHeight?: number;
}

// ============================================================
// IMAGE QUALITY
// ============================================================

const JPEG_QUALITY = 0.98;

// ============================================================
// CAMERA HOOK
// ============================================================

export function useCamera() {
  const [
    cameraReady,
    setCameraReady,
  ] = useState(false);

  const [
    errorMessage,
    setErrorMessage,
  ] = useState<string | null>(null);

  const [
    captureResolution,
    setCaptureResolution,
  ] =
    useState<CaptureResolution | null>(
      null
    );

>>>>>>> Stashed changes
  // ==========================================================
  // REFS
  // ==========================================================

  const videoRef =
<<<<<<< Updated upstream
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
=======
    useRef<HTMLVideoElement | null>(
      null
    );

  const canvasRef =
    useRef<HTMLCanvasElement | null>(
      null
    );

  const streamRef =
    useRef<MediaStream | null>(
      null
    );

  const startingRef =
    useRef(false);

  // ==========================================================
  // TORCH
  // ==========================================================

  const setCameraTorch =
    useCallback(
      async (
        enabled: boolean
      ) => {
        try {
          const stream =
            streamRef.current;

          if (!stream) {
            return;
          }

          const track =
            stream.getVideoTracks()[0];

          if (!track) {
            return;
          }

          type TorchCapabilities =
            MediaTrackCapabilities & {
              torch?: boolean;
            };

          type TorchConstraint =
            MediaTrackConstraintSet & {
              torch?: boolean;
            };

          const capabilities =
            track.getCapabilities() as TorchCapabilities;

          if (
            capabilities.torch !== true
          ) {
            return;
          }

          await track.applyConstraints({
            advanced: [
              {
                torch: enabled,
              } as TorchConstraint,
            ],
          });

        } catch (error) {
          console.warn(
            "[DIZIAQUA] Torch unavailable:",
            error
          );
        }
      },
      []
    );

  // ==========================================================
  // STOP CAMERA
  // ==========================================================

  const stopCamera =
    useCallback(() => {
      const stream =
        streamRef.current;

      if (stream) {
        stream
          .getTracks()
          .forEach((track) => {
            try {
              track.stop();
            } catch {
              // Ignore.
            }
          });
      }

      streamRef.current = null;

      const video =
        videoRef.current;

      if (video) {
        video.pause();
        video.srcObject = null;
        video.onloadedmetadata = null;
      }

      setCameraReady(false);
    }, []);

  // ==========================================================
  // START CAMERA
  // ==========================================================

  const startCamera =
    useCallback(
      async (): Promise<boolean> => {

        if (startingRef.current) {
          return false;
        }

        if (streamRef.current) {
          setCameraReady(true);
          return true;
        }

        startingRef.current =
          true;

        try {
          setErrorMessage(null);

          setCaptureResolution(
            null
          );

          // --------------------------------------------------
          // CHECK CAMERA SUPPORT
          // --------------------------------------------------

          if (
            !navigator.mediaDevices ||
            !navigator.mediaDevices
              .getUserMedia
          ) {
            setErrorMessage(
              "Camera is not available in this browser."
            );

            return false;
          }

          const video =
            videoRef.current;

          if (!video) {
            return false;
          }

          // --------------------------------------------------
          // CAMERA REQUEST
          //
          // No zoom constraints.
          // No crop constraints.
          // --------------------------------------------------

          const stream =
            await navigator.mediaDevices
              .getUserMedia({
                video: {
                  facingMode: {
                    ideal:
                      "environment",
                  },

                  width: {
                    ideal: 3840,
                  },

                  height: {
                    ideal: 2160,
                  },

                  frameRate: {
                    ideal: 30,
                  },

                  /**
                   * DO NOT set:
                   *
                   * zoom
                   *
                   * resizeMode
                   *
                   * aspectRatio
                   *
                   * advanced zoom
                   */
                },

                audio: false,
              });

          streamRef.current =
            stream;

          // --------------------------------------------------
          // LOG CAMERA SETTINGS
          // --------------------------------------------------

          const track =
            stream.getVideoTracks()[0];

          if (track) {

            console.log(
              "========================================"
            );

            console.log(
              "[DIZIAQUA] CAMERA:",
              track.label
            );

            console.log(
              "[DIZIAQUA] ACTUAL SETTINGS:",
              track.getSettings()
            );

            try {
              console.log(
                "[DIZIAQUA] CAPABILITIES:",
                track.getCapabilities()
              );
            } catch {
              console.warn(
                "[DIZIAQUA] Capabilities unavailable."
              );
            }

            console.log(
              "[DIZIAQUA] DIGITAL ZOOM:",
              "NONE"
            );

            console.log(
              "========================================"
            );
          }

          // --------------------------------------------------
          // ATTACH VIDEO
          // --------------------------------------------------

          video.srcObject =
            stream;

          video.playsInline =
            true;

          video.muted =
            true;

          // --------------------------------------------------
          // WAIT FOR CAMERA
          // --------------------------------------------------

          await new Promise<void>(
            (
              resolve,
              reject
            ) => {

              if (!video) {
                reject(
                  new Error(
                    "Video element unavailable."
                  )
                );

                return;
              }

              if (
                video.readyState >=
                HTMLMediaElement.HAVE_METADATA
              ) {
                resolve();
                return;
              }

              const loaded =
                () => {
                  video.onloadedmetadata =
                    null;

                  resolve();
                };

              video.onloadedmetadata =
                loaded;

              setTimeout(() => {

                if (
                  video.readyState >=
                  HTMLMediaElement.HAVE_METADATA
                ) {
                  video.onloadedmetadata =
                    null;

                  resolve();
                }

              }, 5000);
            }
          );

          await video.play();

          setCameraReady(
            true
          );

          return true;

        } catch (error) {

          console.error(
            "[DIZIAQUA] Camera start failed:",
            error
          );

          stopCamera();

          let message =
            "Unable to access the camera. Please allow camera permission.";

          if (
            error instanceof DOMException
          ) {

            if (
              error.name ===
              "NotAllowedError"
            ) {

              message =
                "Camera permission was denied.";

            } else if (
              error.name ===
              "NotFoundError"
            ) {

              message =
                "No camera was found.";

            } else if (
              error.name ===
              "NotReadableError"
            ) {

              message =
                "The camera is currently being used by another app.";

            } else if (
              error.name ===
              "SecurityError"
            ) {

              message =
                "Camera access is blocked. Use HTTPS.";

            } else if (
              error.name ===
              "OverconstrainedError"
            ) {

              message =
                "The camera does not support the requested settings.";
            }
          }

          setErrorMessage(
            message
          );

          return false;

        } finally {

          startingRef.current =
            false;
        }
      },
      [stopCamera]
    );

  // ==========================================================
  // PROCESS STILL PHOTO
  //
  // IMPORTANT:
  //
  // NO CROP
  // NO ZOOM
  // NO RESIZE
  //
  // The complete camera still is preserved.
  // ==========================================================

  const processStillPhoto =
    useCallback(
      async (
        photoBlob: Blob,
        method:
          | "ImageCapture"
          | "Video fallback"
      ): Promise<{
        blob: Blob;
        url: string;
        resolution: CaptureResolution;
      } | null> => {

        try {

          const bitmap =
            await createImageBitmap(
              photoBlob
            );

          const sourceWidth =
            bitmap.width;

          const sourceHeight =
            bitmap.height;

          if (
            sourceWidth <= 0 ||
            sourceHeight <= 0
          ) {

            bitmap.close();

            return null;
          }

          // ==================================================
          // NO CROP
          //
          // Keep the complete camera frame.
          // ==================================================

          const canvas =
            canvasRef.current;

          if (!canvas) {

            bitmap.close();

            return null;
          }

          canvas.width =
            sourceWidth;

          canvas.height =
            sourceHeight;

          const ctx =
            canvas.getContext(
              "2d"
            );

          if (!ctx) {

            bitmap.close();

            return null;
          }

          ctx.imageSmoothingEnabled =
            true;

          ctx.imageSmoothingQuality =
            "high";

          ctx.clearRect(
            0,
            0,
            sourceWidth,
            sourceHeight
          );

          // ==================================================
          // COPY COMPLETE IMAGE 1:1
          // ==================================================

          ctx.drawImage(
            bitmap,
            0,
            0,
            sourceWidth,
            sourceHeight
          );

          bitmap.close();

          // ==================================================
          // HIGH QUALITY JPEG
          // ==================================================

          const finalBlob =
            await new Promise<Blob | null>(
              (resolve) => {

                canvas.toBlob(
                  (blob) => {
                    resolve(blob);
                  },
                  "image/jpeg",
                  JPEG_QUALITY
                );

              }
            );

          if (!finalBlob) {
            return null;
          }

          // ==================================================
          // RESOLUTION
          // ==================================================

          const megapixels =
            (
              sourceWidth *
              sourceHeight
            ) /
            1_000_000;

          const resolution:
            CaptureResolution = {

            width:
              sourceWidth,

            height:
              sourceHeight,

            megapixels,

            method,

            sourceWidth,

            sourceHeight,
          };

          // ==================================================
          // LOG
          // ==================================================

          console.log(
            "========================================"
          );

          console.log(
            "[DIZIAQUA] CAPTURE METHOD:",
            method
          );

          console.log(
            "[DIZIAQUA] SOURCE:",
            `${sourceWidth} × ${sourceHeight}`
          );

          console.log(
            "[DIZIAQUA] FINAL:",
            `${sourceWidth} × ${sourceHeight}`
          );

          console.log(
            "[DIZIAQUA] CROP:",
            "NONE"
          );

          console.log(
            "[DIZIAQUA] DIGITAL ZOOM:",
            "NONE"
          );

          console.log(
            "[DIZIAQUA] JPEG QUALITY:",
            JPEG_QUALITY
          );

          console.log(
            "[DIZIAQUA] MEGAPIXELS:",
            megapixels.toFixed(2)
          );

          console.log(
            "========================================"
          );

          return {

            blob:
              finalBlob,

            url:
              URL.createObjectURL(
                finalBlob
              ),

            resolution,
          };

        } catch (error) {

          console.error(
            "[DIZIAQUA] Still photo processing failed:",
            error
          );

          return null;
        }
      },
      []
    );

  // ==========================================================
  // CAPTURE FRAME
  // ==========================================================

  const captureFrame =
    useCallback(
      async (): Promise<{
        blob: Blob;
        url: string;
      } | null> => {

        const stream =
          streamRef.current;

        if (
          !stream ||
          !cameraReady
        ) {
          return null;
        }

        const track =
          stream.getVideoTracks()[0];

        if (!track) {
          return null;
        }

        try {

          // ==================================================
          // TORCH
          // ==================================================

          await setCameraTorch(
            true
          );

          await new Promise(
            (resolve) => {
              setTimeout(
                resolve,
                150
              );
            }
          );

          // ==================================================
          // FULL-RESOLUTION IMAGECAPTURE
          // ==================================================

          if (
            "ImageCapture" in
            window
          ) {

            try {

              const ImageCaptureClass =
                window.ImageCapture;

              if (
                ImageCaptureClass
              ) {

                const imageCapture =
                  new ImageCaptureClass(
                    track
                  );

                const capabilities =
                  await imageCapture
                    .getPhotoCapabilities();

                const maxWidth =
                  capabilities
                    .imageWidth?.max;

                const maxHeight =
                  capabilities
                    .imageHeight?.max;

                console.log(
                  "[DIZIAQUA] MAX STILL RESOLUTION:",
                  `${maxWidth} × ${maxHeight}`
                );

                if (
                  maxWidth &&
                  maxHeight
                ) {

                  const photo =
                    await imageCapture
                      .takePhoto({
                        imageWidth:
                          maxWidth,

                        imageHeight:
                          maxHeight,
                      });

                  const processed =
                    await processStillPhoto(
                      photo,
                      "ImageCapture"
                    );

                  if (
                    processed
                  ) {

                    setCaptureResolution(
                      processed.resolution
                    );

                    return {
                      blob:
                        processed.blob,

                      url:
                        processed.url,
                    };
                  }
                }
              }

            } catch (error) {

              console.warn(
                "[DIZIAQUA] ImageCapture failed. Using video frame.",
                error
              );
            }
          }

          // ==================================================
          // VIDEO FALLBACK
          //
          // IMPORTANT:
          // No crop and no zoom.
          // We copy the actual video frame exactly.
          // ==================================================

          console.log(
            "[DIZIAQUA] USING VIDEO/CANVAS FALLBACK"
          );

          const video =
            videoRef.current;

          const canvas =
            canvasRef.current;

          if (
            !video ||
            !canvas ||
            video.readyState <
              HTMLMediaElement.HAVE_CURRENT_DATA ||
            video.videoWidth === 0 ||
            video.videoHeight === 0
          ) {
            return null;
          }

          const width =
            video.videoWidth;

          const height =
            video.videoHeight;

          canvas.width =
            width;

          canvas.height =
            height;

          const ctx =
            canvas.getContext(
              "2d"
            );

          if (!ctx) {
            return null;
          }

          ctx.imageSmoothingEnabled =
            true;

          ctx.imageSmoothingQuality =
            "high";

          ctx.clearRect(
            0,
            0,
            width,
            height
          );

          // ==================================================
          // EXACT VIDEO FRAME
          // ==================================================

          ctx.drawImage(
            video,
            0,
            0,
            width,
            height,
            0,
            0,
            width,
            height
          );

          const blob =
            await new Promise<Blob | null>(
              (resolve) => {

                canvas.toBlob(
                  (result) => {
                    resolve(result);
                  },
                  "image/jpeg",
                  JPEG_QUALITY
                );

              }
            );

          if (!blob) {
            return null;
          }

          const megapixels =
            (
              width *
              height
            ) /
            1_000_000;

          const resolution:
            CaptureResolution = {

            width,

            height,

            megapixels,

            method:
              "Video fallback",

            sourceWidth:
              width,

            sourceHeight:
              height,
          };

          setCaptureResolution(
            resolution
          );

          console.log(
            "[DIZIAQUA] VIDEO FRAME:",
            `${width} × ${height}`
          );

          console.log(
            "[DIZIAQUA] DIGITAL ZOOM:",
            "NONE"
          );

          return {
            blob,

            url:
              URL.createObjectURL(
                blob
              ),
          };

        } catch (error) {

          console.error(
            "[DIZIAQUA] Image capture failed:",
            error
          );

          return null;

        } finally {

          await setCameraTorch(
            false
          );
        }
      },
      [
        cameraReady,
        processStillPhoto,
        setCameraTorch,
      ]
    );

  // ==========================================================
  // CLEANUP
  // ==========================================================

  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, [stopCamera]);

  // ==========================================================
  // RETURN
  // ==========================================================

  return {
    videoRef,
    canvasRef,
    cameraReady,
    errorMessage,
    setErrorMessage,
    startCamera,
    stopCamera,
    captureFrame,
    captureResolution,
  };
>>>>>>> Stashed changes
}
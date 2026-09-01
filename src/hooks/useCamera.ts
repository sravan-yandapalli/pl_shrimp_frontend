"use client";

import {
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
// CAMERA / PREVIEW CONFIGURATION
// ============================================================

/**
 * Visual zoom used by the live preview.
 *
 * The exact same framing is applied to the captured image.
 *
 * 1.00 = no zoom
 * 1.05 = 5% zoom
 * 1.10 = 10% zoom
 * 1.15 = 15% zoom
 */
const PREVIEW_ZOOM = 1.10;

/**
 * JPEG quality.
 *
 * 0.98 gives very high quality while keeping the file
 * smaller than a lossless/near-lossless format.
 */
const JPEG_QUALITY = 0.98;

// ============================================================
// CAMERA HOOK
// ============================================================

export function useCamera() {
  // ==========================================================
  // STATE
  // ==========================================================

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
  ] = useState<CaptureResolution | null>(
    null
  );

  // ==========================================================
  // REFS
  // ==========================================================

  const videoRef =
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
              // Ignore stop errors.
            }
          });
      }

      streamRef.current =
        null;

      const video =
        videoRef.current;

      if (video) {
        video.pause();
        video.srcObject =
          null;
        video.onloadedmetadata =
          null;
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
          // CAMERA SUPPORT
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
          // REQUEST HIGH RESOLUTION CAMERA
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
                },

                audio: false,
              });

          streamRef.current =
            stream;

          // --------------------------------------------------
          // CAMERA DETAILS
          // --------------------------------------------------

          const track =
            stream.getVideoTracks()[0];

          if (track) {
            console.log(
              "========================================"
            );

            console.log(
              "[DIZIAQUA] CAMERA DEVICE:",
              track.label
            );

            console.log(
              "[DIZIAQUA] ACTUAL VIDEO SETTINGS:",
              track.getSettings()
            );

            try {
              console.log(
                "[DIZIAQUA] CAMERA CAPABILITIES:",
                track.getCapabilities()
              );
            } catch {
              console.warn(
                "[DIZIAQUA] Camera capabilities unavailable."
              );
            }

            console.log(
              "[DIZIAQUA] PREVIEW ZOOM:",
              `${PREVIEW_ZOOM}x`
            );

            console.log(
              "========================================"
            );
          }

          // --------------------------------------------------
          // CONNECT STREAM
          // --------------------------------------------------

          video.srcObject =
            stream;

          video.playsInline =
            true;

          video.muted =
            true;

          // --------------------------------------------------
          // WAIT FOR METADATA
          // --------------------------------------------------

          await new Promise<void>(
            (
              resolve,
              reject
            ) => {

              if (!video) {
                reject(
                  new Error(
                    "Camera video element unavailable."
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

              const handleLoadedMetadata =
                () => {
                  video.onloadedmetadata =
                    null;

                  resolve();
                };

              video.onloadedmetadata =
                handleLoadedMetadata;

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

          // --------------------------------------------------
          // START PLAYBACK
          // --------------------------------------------------

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
                "Camera permission was denied. Please allow camera access in your browser settings.";

            } else if (
              error.name ===
              "NotFoundError"
            ) {

              message =
                "No camera was found on this device.";

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
                "Camera access is blocked. Please use the website over HTTPS.";

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
  // Camera still photo:
  //   maximum resolution
  //   ↓
  // center square crop
  //   ↓
  // same 1.10x framing as preview
  //   ↓
  // JPEG quality 0.98
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
          // STEP 1
          // MATCH THE CIRCULAR VIEWFINDER
          //
          // Viewfinder is 300 x 300.
          // Therefore use a square crop.
          // ==================================================

          const squareSize =
            Math.min(
              sourceWidth,
              sourceHeight
            );

          // ==================================================
          // STEP 2
          // SAME 1.10x VISUAL ZOOM
          //
          // The live preview is displayed with scale-[1.10].
          //
          // To reproduce that framing in the real captured
          // photo, crop to:
          //
          // squareSize / 1.10
          // ==================================================

          const cropWidth =
            Math.round(
              squareSize /
              PREVIEW_ZOOM
            );

          const cropHeight =
            Math.round(
              squareSize /
              PREVIEW_ZOOM
            );

          // ==================================================
          // STEP 3
          // CENTER CROP
          // ==================================================

          const cropX =
            Math.round(
              (
                sourceWidth -
                cropWidth
              ) / 2
            );

          const cropY =
            Math.round(
              (
                sourceHeight -
                cropHeight
              ) / 2
            );

          // ==================================================
          // CANVAS
          // ==================================================

          const canvas =
            canvasRef.current;

          if (!canvas) {
            bitmap.close();
            return null;
          }

          canvas.width =
            cropWidth;

          canvas.height =
            cropHeight;

          const ctx =
            canvas.getContext(
              "2d"
            );

          if (!ctx) {
            bitmap.close();
            return null;
          }

          // ==================================================
          // HIGH QUALITY
          // ==================================================

          ctx.imageSmoothingEnabled =
            true;

          ctx.imageSmoothingQuality =
            "high";

          ctx.clearRect(
            0,
            0,
            cropWidth,
            cropHeight
          );

          // ==================================================
          // DRAW
          // ==================================================

          ctx.drawImage(
            bitmap,

            // Source
            cropX,
            cropY,
            cropWidth,
            cropHeight,

            // Destination
            0,
            0,
            cropWidth,
            cropHeight
          );

          bitmap.close();

          // ==================================================
          // JPEG 0.98
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
              cropWidth *
              cropHeight
            ) /
            1_000_000;

          const resolution:
            CaptureResolution = {
              width:
                cropWidth,

              height:
                cropHeight,

              megapixels,

              method,

              sourceWidth,

              sourceHeight,
            };

          // ==================================================
          // LOGGING
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
            "[DIZIAQUA] PREVIEW ZOOM:",
            `${PREVIEW_ZOOM.toFixed(2)}x`
          );

          console.log(
            "[DIZIAQUA] FINAL CAPTURE:",
            `${cropWidth} × ${cropHeight}`
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
            "[DIZIAQUA] CROP OFFSET:",
            `x=${cropX}, y=${cropY}`
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
          // TORCH ON
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
          // IMAGECAPTURE
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
                  "[DIZIAQUA] MAX STILL:",
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
                "[DIZIAQUA] ImageCapture failed. Falling back to video.",
                error
              );
            }
          }

          // ==================================================
          // VIDEO FALLBACK
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

          const sourceWidth =
            video.videoWidth;

          const sourceHeight =
            video.videoHeight;

          // ==================================================
          // SAME SQUARE VIEWFINDER
          // ==================================================

          const squareSize =
            Math.min(
              sourceWidth,
              sourceHeight
            );

          // ==================================================
          // SAME PREVIEW ZOOM
          // ==================================================

          const targetWidth =
            Math.round(
              squareSize /
              PREVIEW_ZOOM
            );

          const targetHeight =
            Math.round(
              squareSize /
              PREVIEW_ZOOM
            );

          const cropX =
            Math.round(
              (
                sourceWidth -
                targetWidth
              ) / 2
            );

          const cropY =
            Math.round(
              (
                sourceHeight -
                targetHeight
              ) / 2
            );

          // ==================================================
          // CANVAS
          // ==================================================

          canvas.width =
            targetWidth;

          canvas.height =
            targetHeight;

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
            targetWidth,
            targetHeight
          );

          // ==================================================
          // DRAW SAME FRAMING
          // ==================================================

          ctx.drawImage(
            video,

            cropX,
            cropY,
            targetWidth,
            targetHeight,

            0,
            0,
            targetWidth,
            targetHeight
          );

          // ==================================================
          // JPEG 0.98
          // ==================================================

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
              targetWidth *
              targetHeight
            ) /
            1_000_000;

          const resolution:
            CaptureResolution = {

            width:
              targetWidth,

            height:
              targetHeight,

            megapixels,

            method:
              "Video fallback",

            sourceWidth,

            sourceHeight,
          };

          setCaptureResolution(
            resolution
          );

          console.log(
            "========================================"
          );

          console.log(
            "[DIZIAQUA] FALLBACK SOURCE:",
            `${sourceWidth} × ${sourceHeight}`
          );

          console.log(
            "[DIZIAQUA] PREVIEW ZOOM:",
            `${PREVIEW_ZOOM.toFixed(2)}x`
          );

          console.log(
            "[DIZIAQUA] FINAL CAPTURE:",
            `${targetWidth} × ${targetHeight}`
          );

          console.log(
            "[DIZIAQUA] JPEG QUALITY:",
            JPEG_QUALITY
          );

          console.log(
            "========================================"
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
}
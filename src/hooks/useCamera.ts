"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

// ============================================================
// CAPTURE RESOLUTION
// ============================================================

export interface CaptureResolution {
  width: number;
  height: number;
  megapixels: number;
  method:
    | "ImageCapture"
    | "Video fallback";
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
              // Ignore.
            }
          });
      }

      streamRef.current =
        null;

      const video =
        videoRef.current;

      if (video) {
        video.pause();
        video.srcObject = null;
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
          setCaptureResolution(null);

          // --------------------------------------------------
          // CHECK BROWSER SUPPORT
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
          // No zoom.
          // No crop.
          // No 300x300 constraint.
          // --------------------------------------------------

          const stream =
            await navigator.mediaDevices
              .getUserMedia({
                video: {
                  facingMode: {
                    ideal: "environment",
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
          // CAMERA INFORMATION
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
              "[DIZIAQUA] DIGITAL ZOOM: NONE"
            );

            console.log(
              "[DIZIAQUA] CAPTURE CROP: ONLY PREVIEW AREA"
            );

            console.log(
              "========================================"
            );
          }

          // --------------------------------------------------
          // ATTACH STREAM
          // --------------------------------------------------

          video.srcObject =
            stream;

          video.playsInline =
            true;

          video.muted =
            true;

          // --------------------------------------------------
          // WAIT FOR VIDEO METADATA
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
          // PLAY
          // --------------------------------------------------

          await video.play();

          setCameraReady(true);

          console.log(
            "[DIZIAQUA] LIVE VIDEO FRAME:",
            `${video.videoWidth} × ${video.videoHeight}`
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
                "Camera permission was denied. Please allow camera access.";

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
                "The camera is currently being used by another application.";

            } else if (
              error.name ===
              "SecurityError"
            ) {
              message =
                "Camera access is blocked. Please use HTTPS.";

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
  // CROP EXACT PREVIEW AREA
  //
  // UI viewfinder = 300x300 square.
  //
  // object-cover therefore displays the largest CENTER square
  // from the camera frame.
  //
  // Example:
  //
  // Camera = 1920x1080
  //
  // Preview visible source area = 1080x1080
  //
  // This function returns EXACTLY that source area.
  // ==========================================================

  const getPreviewCrop =
    useCallback(
      (
        width: number,
        height: number
      ) => {

        const viewfinderAspect =
          1;

        const cameraAspect =
          width / height;

        let cropWidth =
          width;

        let cropHeight =
          height;

        if (
          cameraAspect >
          viewfinderAspect
        ) {
          // Wider than square.
          cropWidth =
            height;
        } else if (
          cameraAspect <
          viewfinderAspect
        ) {
          // Taller than square.
          cropHeight =
            width;
        }

        const sourceX =
          Math.round(
            (width -
              cropWidth) /
              2
          );

        const sourceY =
          Math.round(
            (height -
              cropHeight) /
              2
          );

        return {
          sourceX,
          sourceY,
          cropWidth,
          cropHeight,
        };
      },
      []
    );

  // ==========================================================
  // PROCESS IMAGECAPTURE PHOTO
  //
  // IMPORTANT:
  // Preserve the exact preview area at FULL resolution.
  // ==========================================================

  const processStillPhoto =
    useCallback(
      async (
        photoBlob: Blob
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

          // --------------------------------------------------
          // SAME CROP AS 300x300 PREVIEW
          // --------------------------------------------------

          const {
            sourceX,
            sourceY,
            cropWidth,
            cropHeight,
          } =
            getPreviewCrop(
              sourceWidth,
              sourceHeight
            );

          // --------------------------------------------------
          // CREATE CANVAS AT ORIGINAL CROP SIZE
          //
          // NOT 300x300.
          // --------------------------------------------------

          const canvas =
            document.createElement(
              "canvas"
            );

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

          // --------------------------------------------------
          // COPY EXACT PREVIEW AREA
          // --------------------------------------------------

          ctx.drawImage(
            bitmap,

            sourceX,
            sourceY,
            cropWidth,
            cropHeight,

            0,
            0,
            cropWidth,
            cropHeight
          );

          bitmap.close();

          // --------------------------------------------------
          // HIGH-QUALITY JPEG
          // --------------------------------------------------

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

            method:
              "ImageCapture",

            sourceWidth,
            sourceHeight,
          };

          console.log(
            "========================================"
          );

          console.log(
            "[DIZIAQUA] STILL PHOTO:",
            `${sourceWidth} × ${sourceHeight}`
          );

          console.log(
            "[DIZIAQUA] EXACT PREVIEW CROP:",
            `${cropWidth} × ${cropHeight}`
          );

          console.log(
            "[DIZIAQUA] CROP OFFSET:",
            `x=${sourceX}, y=${sourceY}`
          );

          console.log(
            "[DIZIAQUA] FINAL IMAGE:",
            `${cropWidth} × ${cropHeight}`
          );

          console.log(
            "[DIZIAQUA] DIGITAL ZOOM:",
            "NONE"
          );

          console.log(
            "[DIZIAQUA] RESIZE TO UI:",
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
      [getPreviewCrop]
    );

  // ==========================================================
  // CAPTURE
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
          console.error(
            "[DIZIAQUA] Camera is not ready."
          );

          return null;
        }

        const track =
          stream.getVideoTracks()[0];

        if (!track) {
          return null;
        }

        try {

          // --------------------------------------------------
          // TORCH
          // --------------------------------------------------

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
                      photo
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
                "[DIZIAQUA] ImageCapture failed. Using video fallback.",
                error
              );
            }
          }

          // ==================================================
          // VIDEO FALLBACK
          //
          // Capture EXACT preview area.
          // ==================================================

          const video =
            videoRef.current;

          if (!video) {
            return null;
          }

          if (
            video.videoWidth <= 0 ||
            video.videoHeight <= 0
          ) {
            return null;
          }

          const sourceWidth =
            video.videoWidth;

          const sourceHeight =
            video.videoHeight;

          const {
            sourceX,
            sourceY,
            cropWidth,
            cropHeight,
          } =
            getPreviewCrop(
              sourceWidth,
              sourceHeight
            );

          // --------------------------------------------------
          // FULL RESOLUTION CROP
          // --------------------------------------------------

          const canvas =
            document.createElement(
              "canvas"
            );

          canvas.width =
            cropWidth;

          canvas.height =
            cropHeight;

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

          ctx.drawImage(
            video,

            sourceX,
            sourceY,
            cropWidth,
            cropHeight,

            0,
            0,
            cropWidth,
            cropHeight
          );

          // --------------------------------------------------
          // JPEG
          // --------------------------------------------------

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
            "[DIZIAQUA] VIDEO SOURCE:",
            `${sourceWidth} × ${sourceHeight}`
          );

          console.log(
            "[DIZIAQUA] EXACT PREVIEW CROP:",
            `${cropWidth} × ${cropHeight}`
          );

          console.log(
            "[DIZIAQUA] CROP OFFSET:",
            `x=${sourceX}, y=${sourceY}`
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
            "[DIZIAQUA] Capture failed:",
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
        getPreviewCrop,
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
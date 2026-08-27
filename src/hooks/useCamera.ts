import {
  useState,
  useRef,
  useCallback,
  useEffect,
} from "react";

export interface CaptureResolution {
  width: number;
  height: number;
  megapixels: number;
  method: "ImageCapture" | "Video fallback";
  sourceWidth?: number;
  sourceHeight?: number;
}

export function useCamera() {
  const [cameraReady, setCameraReady] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [captureResolution, setCaptureResolution] =
    useState<CaptureResolution | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const startingRef = useRef(false);



  const setCameraTorch = useCallback(
    async (enabled: boolean) => {
      try {
        const stream = streamRef.current;

        if (!stream) {
          return;
        }

        const track = stream.getVideoTracks()[0];

        if (!track) {
          return;
        }

        type TorchCapabilities = MediaTrackCapabilities & {
          torch?: boolean;
        };

        type TorchConstraint = MediaTrackConstraintSet & {
          torch?: boolean;
        };

        const capabilities =
          track.getCapabilities() as TorchCapabilities;

        if (capabilities.torch !== true) {
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
        console.warn("Torch unavailable:", error);
      }
    },
    []
  );



  const stopCamera = useCallback(() => {
    const stream = streamRef.current;

    if (stream) {
      stream.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch {
     
        }
      });
    }

    streamRef.current = null;

    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.srcObject = null;
      videoRef.current.onloadedmetadata = null;
    }

    setCameraReady(false);
  }, []);



  const startCamera = useCallback(async (): Promise<boolean> => {
    if (startingRef.current) {
      return false;
    }

    if (streamRef.current) {
      setCameraReady(true);
      return true;
    }

    startingRef.current = true;

    try {
      setErrorMessage(null);
      setCaptureResolution(null);

      if (
        !navigator.mediaDevices ||
        !navigator.mediaDevices.getUserMedia
      ) {
        setErrorMessage(
          "Camera is not available in this browser."
        );

        return false;
      }

      const video = videoRef.current;

      if (!video) {
        return false;
      }



      const stream =
        await navigator.mediaDevices.getUserMedia({
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

      streamRef.current = stream;

      const track = stream.getVideoTracks()[0];

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
          "========================================"
        );
      }

      video.srcObject = stream;
      video.playsInline = true;
      video.muted = true;

      await new Promise<void>((resolve, reject) => {
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

        const handleLoadedMetadata = () => {
          video.onloadedmetadata = null;
          resolve();
        };

        video.onloadedmetadata =
          handleLoadedMetadata;

        setTimeout(() => {
          if (
            video.readyState >=
            HTMLMediaElement.HAVE_METADATA
          ) {
            video.onloadedmetadata = null;
            resolve();
          }
        }, 5000);
      });

      await video.play();

      setCameraReady(true);

      return true;
    } catch (error) {
      console.error(
        "Camera start failed:",
        error
      );

      stopCamera();

      let message =
        "Unable to access the camera. Please allow camera permission.";

      if (error instanceof DOMException) {
        if (error.name === "NotAllowedError") {
          message =
            "Camera permission was denied. Please allow camera access in your browser settings.";
        } else if (error.name === "NotFoundError") {
          message =
            "No camera was found on this device.";
        } else if (
          error.name === "NotReadableError"
        ) {
          message =
            "The camera is currently being used by another app.";
        } else if (error.name === "SecurityError") {
          message =
            "Camera access is blocked. Please use the website over HTTPS.";
        } else if (
          error.name === "OverconstrainedError"
        ) {
          message =
            "The camera does not support the requested settings.";
        }
      }

      setErrorMessage(message);

      return false;
    } finally {
      startingRef.current = false;
    }
  }, [stopCamera]);



  const processStillPhoto = useCallback(
    async (
      photoBlob: Blob,
      method: "ImageCapture" | "Video fallback"
    ): Promise<{
      blob: Blob;
      url: string;
      resolution: CaptureResolution;
    } | null> => {
      try {
        const bitmap =
          await createImageBitmap(photoBlob);

        const sourceWidth = bitmap.width;
        const sourceHeight = bitmap.height;

        if (
          sourceWidth === 0 ||
          sourceHeight === 0
        ) {
          bitmap.close();
          return null;
        }

        // Center square crop.
        const sourceSize = Math.min(
          sourceWidth,
          sourceHeight
        );

        const sourceStartX =
          (sourceWidth - sourceSize) / 2;

        const sourceStartY =
          (sourceHeight - sourceSize) / 2;

        const canvas = canvasRef.current;

        if (!canvas) {
          bitmap.close();
          return null;
        }


        canvas.width = sourceSize;
        canvas.height = sourceSize;

        const ctx = canvas.getContext("2d");

        if (!ctx) {
          bitmap.close();
          return null;
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
          bitmap,
          sourceStartX,
          sourceStartY,
          sourceSize,
          sourceSize,
          0,
          0,
          sourceSize,
          sourceSize
        );

        bitmap.close();

        // PNG is lossless.
        // This preserves the pixels after the crop.
        const finalBlob =
          await new Promise<Blob | null>(
            (resolve) => {
              canvas.toBlob(
                (blob) => {
                  resolve(blob);
                },
                "image/png"
              );
            }
          );

        if (!finalBlob) {
          return null;
        }

        const megapixels =
          (sourceSize * sourceSize) /
          1_000_000;

        const resolution: CaptureResolution = {
          width: sourceSize,
          height: sourceSize,
          megapixels,
          method,
          sourceWidth,
          sourceHeight,
        };

        console.log(
          "========================================"
        );

        console.log(
          "[DIZIAQUA] CAPTURE METHOD:",
          method
        );

        console.log(
          "[DIZIAQUA] ORIGINAL PHOTO:",
          `${sourceWidth} × ${sourceHeight}`
        );

        console.log(
          "[DIZIAQUA] FINAL MODEL IMAGE:",
          `${sourceSize} × ${sourceSize}`
        );

        console.log(
          "[DIZIAQUA] FINAL MEGAPIXELS:",
          megapixels.toFixed(2),
          "MP"
        );

        console.log(
          "========================================"
        );

        return {
          blob: finalBlob,
          url: URL.createObjectURL(
            finalBlob
          ),
          resolution,
        };
      } catch (error) {
        console.error(
          "Still photo processing failed:",
          error
        );

        return null;
      }
    },
    []
  );



  const captureFrame = useCallback(
    async (): Promise<{
      blob: Blob;
      url: string;
    } | null> => {
      const stream = streamRef.current;

      if (!stream || !cameraReady) {
        return null;
      }

      const track =
        stream.getVideoTracks()[0];

      if (!track) {
        return null;
      }

      try {


        await setCameraTorch(true);

        await new Promise((resolve) => {
          setTimeout(resolve, 150);
        });



        if (
          "ImageCapture" in window
        ) {
          try {
            const ImageCaptureClass =
              window.ImageCapture;

            if (ImageCaptureClass) {
              const imageCapture =
                new ImageCaptureClass(track);

              const capabilities =
                await imageCapture.getPhotoCapabilities();

              console.log(
                "[DIZIAQUA] PHOTO CAPABILITIES:",
                capabilities
              );

              const maxWidth =
                capabilities.imageWidth?.max;

              const maxHeight =
                capabilities.imageHeight?.max;

              console.log(
                "[DIZIAQUA] MAX PHOTO:",
                `${maxWidth} × ${maxHeight}`
              );

              if (
                maxWidth &&
                maxHeight
              ) {
                const photo =
                  await imageCapture.takePhoto({
                    imageWidth: maxWidth,
                    imageHeight: maxHeight,
                  });

                console.log(
                  "[DIZIAQUA] NATIVE PHOTO BLOB:",
                  photo.type,
                  photo.size,
                  "bytes"
                );

                const processed =
                  await processStillPhoto(
                    photo,
                    "ImageCapture"
                  );

                if (processed) {
                  setCaptureResolution(
                    processed.resolution
                  );

                  return {
                    blob: processed.blob,
                    url: processed.url,
                  };
                }
              }
            }
          } catch (error) {
            console.warn(
              "[DIZIAQUA] ImageCapture failed. Falling back to video frame.",
              error
            );
          }
        }


        console.log(
          "[DIZIAQUA] USING VIDEO/CANVAS FALLBACK"
        );

        const video = videoRef.current;
        const canvas = canvasRef.current;

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

        const sourceSize =
          Math.min(
            sourceWidth,
            sourceHeight
          );

        const sourceStartX =
          (sourceWidth - sourceSize) / 2;

        const sourceStartY =
          (sourceHeight - sourceSize) / 2;

        canvas.width = sourceSize;
        canvas.height = sourceSize;

        const ctx =
          canvas.getContext("2d");

        if (!ctx) {
          return null;
        }

        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality =
          "high";

        ctx.clearRect(
          0,
          0,
          sourceSize,
          sourceSize
        );

        ctx.drawImage(
          video,
          sourceStartX,
          sourceStartY,
          sourceSize,
          sourceSize,
          0,
          0,
          sourceSize,
          sourceSize
        );

        const blob =
          await new Promise<Blob | null>(
            (resolve) => {
              canvas.toBlob(
                (result) => {
                  resolve(result);
                },
                "image/png"
              );
            }
          );

        if (!blob) {
          return null;
        }

        const megapixels =
          (sourceSize * sourceSize) /
          1_000_000;

        const resolution: CaptureResolution =
          {
            width: sourceSize,
            height: sourceSize,
            megapixels,
            method: "Video fallback",
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
          "[DIZIAQUA] FALLBACK VIDEO:"
        );

        console.log(
          "[DIZIAQUA] VIDEO:",
          `${sourceWidth} × ${sourceHeight}`
        );

        console.log(
          "[DIZIAQUA] FINAL:",
          `${sourceSize} × ${sourceSize}`
        );

        console.log(
          "[DIZIAQUA] FINAL MP:",
          megapixels.toFixed(2)
        );

        console.log(
          "========================================"
        );

        return {
          blob,
          url: URL.createObjectURL(
            blob
          ),
        };
      } catch (error) {
        console.error(
          "Image capture failed:",
          error
        );

        return null;
      } finally {
        // Always turn torch off.
        await setCameraTorch(false);
      }
    },
    [
      cameraReady,
      processStillPhoto,
      setCameraTorch,
    ]
  );


  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, [stopCamera]);


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
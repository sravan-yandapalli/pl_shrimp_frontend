import {
  useState,
  useRef,
  useCallback,
  useEffect,
} from "react";

export function useCamera() {
  const [cameraReady, setCameraReady] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const startingRef = useRef(false);

  // ============================================================
  // CAMERA TORCH
  // ============================================================
  const setCameraTorch = useCallback(async (enabled: boolean) => {
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

      // Some phones/browsers do not expose torch control.
      // Capture should still work normally in that case.
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
      // Torch failure must never break image capture.
      console.warn("Torch unavailable:", error);
    }
  }, []);

  // ============================================================
  // STOP CAMERA
  // ============================================================
  const stopCamera = useCallback(() => {
    const stream = streamRef.current;

    if (stream) {
      stream.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch {
          // Ignore already-stopped tracks.
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

  // ============================================================
  // START CAMERA
  // ============================================================
  const startCamera = useCallback(async (): Promise<boolean> => {
    // Already starting.
    if (startingRef.current) {
      return false;
    }

    // Already running.
    if (streamRef.current) {
      setCameraReady(true);
      return true;
    }

    startingRef.current = true;

    try {
      setErrorMessage(null);

      // Browser support check.
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

      // Request rear camera with reasonable mobile constraints.
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
            frameRate: {
              ideal: 30,
              max: 30,
            },
          },
          audio: false,
        });

      streamRef.current = stream;

      video.srcObject = stream;
      video.playsInline = true;
      video.muted = true;

      // Wait until camera metadata is ready.
      await new Promise<void>((resolve, reject) => {
        if (!video) {
          reject(new Error("Camera video element unavailable."));
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

        video.onloadedmetadata = handleLoadedMetadata;

        // Safety timeout so the app does not wait forever.
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
      console.error("Camera start failed:", error);

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
        } else if (error.name === "NotReadableError") {
          message =
            "The camera is currently being used by another app.";
        } else if (error.name === "SecurityError") {
          message =
            "Camera access is blocked. Please use the website over HTTPS.";
        } else if (error.name === "OverconstrainedError") {
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

  // ============================================================
  // CAPTURE FRAME
  // ============================================================
  const captureFrame = async (): Promise<{
    blob: Blob;
    url: string;
  } | null> => {
    const video = videoRef.current;
    const canvas = canvasRef.current;

    if (!video || !canvas || !cameraReady) {
      return null;
    }

    if (
      video.readyState <
        HTMLMediaElement.HAVE_CURRENT_DATA ||
      video.videoWidth === 0 ||
      video.videoHeight === 0
    ) {
      return null;
    }

    try {
      // --------------------------------------------------------
      // TURN TORCH ON
      // --------------------------------------------------------
      await setCameraTorch(true);

      // Give the phone a moment to activate the torch.
      await new Promise((resolve) => {
        setTimeout(resolve, 150);
      });

      // --------------------------------------------------------
      // CREATE SQUARE CROP
      // --------------------------------------------------------
      const sourceSize = Math.min(
        video.videoWidth,
        video.videoHeight
      );

      const sourceStartX =
        (video.videoWidth - sourceSize) / 2;

      const sourceStartY =
        (video.videoHeight - sourceSize) / 2;

      canvas.width = sourceSize;
      canvas.height = sourceSize;

      const ctx = canvas.getContext("2d");

      if (!ctx) {
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

      // --------------------------------------------------------
      // CAPTURE IMAGE
      // --------------------------------------------------------
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

      // --------------------------------------------------------
      // TURN TORCH OFF
      // --------------------------------------------------------
      await setCameraTorch(false);

      // --------------------------------------------------------
      // CREATE PNG BLOB
      // --------------------------------------------------------
      return await new Promise((resolve) => {
        canvas.toBlob(
          (blob) => {
            if (!blob) {
              resolve(null);
              return;
            }

            resolve({
              blob,
              url: URL.createObjectURL(blob),
            });
          },
          "image/png"
        );
      });
    } catch (error) {
      console.error("Image capture failed:", error);
      return null;
    } finally {
      // Always make sure the torch is off after capture.
      await setCameraTorch(false);
    }
  };

  // ============================================================
  // CLEANUP WHEN COMPONENT IS DESTROYED
  // ============================================================
  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, [stopCamera]);

  // ============================================================
  // RETURN
  // ============================================================
  return {
    videoRef,
    canvasRef,
    cameraReady,
    errorMessage,
    setErrorMessage,
    startCamera,
    stopCamera,
    captureFrame,
  };
}
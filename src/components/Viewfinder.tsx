import { RefObject } from "react";

interface ViewfinderProps {
  isCaptured: boolean;
  capturedImage: string | null;
  annotatedImageUrl: string | null;
  videoRef: RefObject<HTMLVideoElement | null>;
}

export default function Viewfinder({
  isCaptured,
  capturedImage,
  annotatedImageUrl,
  videoRef,
}: ViewfinderProps) {
  return (
    <div
      className="
<<<<<<< Updated upstream
        relative
        w-[300px]
        h-[300px]
        shrink-0
        overflow-hidden
=======
        w-[300px]
        h-[300px]
        shrink-0
>>>>>>> Stashed changes
        rounded-full
        bg-surface
        border
        border-primary/10
<<<<<<< Updated upstream
=======
        box-border
        relative
        overflow-hidden
>>>>>>> Stashed changes
      "
    >
      {!isCaptured ? (

        // ======================================================
<<<<<<< Updated upstream
        // CAMERA
=======
        // EXACT LIVE CAMERA
>>>>>>> Stashed changes
        // ======================================================

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

      ) : annotatedImageUrl ? (

        // ======================================================
        // ANNOTATED IMAGE
        // NO ZOOM
        // ======================================================

        <img
          key={annotatedImageUrl}
          src={annotatedImageUrl}
          alt="Annotated shrimp result"
          className="
            absolute
            inset-0
            w-full
            h-full
<<<<<<< Updated upstream
            object-fill
=======
            object-contain
>>>>>>> Stashed changes
          "
        />

      ) : capturedImage ? (

        // ======================================================
<<<<<<< Updated upstream
        // 300 × 300 CAPTURE
=======
        // CAPTURED IMAGE
        // NO ZOOM
>>>>>>> Stashed changes
        // ======================================================

        <img
          src={capturedImage}
          alt="Captured shrimp sample"
          className="
            absolute
            inset-0
            w-full
            h-full
<<<<<<< Updated upstream
            object-fill
=======
            object-contain
>>>>>>> Stashed changes
          "
        />

      ) : null}
    </div>
  );
}
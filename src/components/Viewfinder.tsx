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
        relative
        w-[300px]
        h-[300px]
        shrink-0
        overflow-hidden
        rounded-full
        bg-surface
        border
        border-primary/10
      "
    >
      {!isCaptured ? (
        // ======================================================
        // CAMERA
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
        // ANNOTATED RESULT
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
            object-fill
          "
        />
      ) : capturedImage ? (
        // ======================================================
        // 300 × 300 CAPTURE
        // ======================================================
        <img
          src={capturedImage}
          alt="Captured shrimp sample"
          className="
            absolute
            inset-0
            w-full
            h-full
            object-fill
          "
        />
      ) : (
        // ======================================================
        // EMPTY
        // ======================================================
        <div
          className="
            absolute
            inset-0
            flex
            items-center
            justify-center
            text-white
            text-sm
          "
        >
          No image
        </div>
      )}
    </div>
  );
}
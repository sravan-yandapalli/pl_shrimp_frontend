import { RefObject } from "react";

interface ViewfinderProps {
  isCaptured: boolean;
  capturedImage: string | null;
  videoRef: RefObject<HTMLVideoElement | null>;
}

export default function Viewfinder({ 
  isCaptured, 
  capturedImage, 
  videoRef,
}: ViewfinderProps) {
  return (
    <div className="w-[300px] h-[300px] shrink-0 rounded-full bg-surface border-primary border-solid border-[2px] box-border relative overflow-hidden">
      {!isCaptured ? (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="absolute inset-0 w-full h-full object-cover"
        />
      ) : (
        <img
          src={capturedImage!}
          alt="Counted shrimp sample"
          className="absolute inset-0 w-full h-full object-cover"
        />
      )}
    </div>
  );
}
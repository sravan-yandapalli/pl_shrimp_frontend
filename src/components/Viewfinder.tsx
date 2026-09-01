import { RefObject } from "react";
import { Prediction, ImageSize } from "../app/page"; 

interface ViewfinderProps {
  isCaptured: boolean;
  capturedImage: string | null;
  videoRef: RefObject<HTMLVideoElement | null>;
  predictions?: Prediction[];
  imageSize?: ImageSize | null;
}

export default function Viewfinder({ 
  isCaptured, 
  capturedImage, 
  videoRef,
  predictions = [],
  imageSize = null,
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
        <>
          <img
            src={capturedImage!}
            alt="Captured shrimp sample"
            className="absolute inset-0 w-full h-full object-cover"
          />

          {/* BOUNDING BOX OVERLAY */}
          {imageSize &&
            predictions.map((pred, idx) => {
              const [x1, y1, x2, y2] = pred.bbox;

              const left = (x1 / imageSize.width) * 100;
              const top = (y1 / imageSize.height) * 100;
              const width = ((x2 - x1) / imageSize.width) * 100;
              const height = ((y2 - y1) / imageSize.height) * 100;

              return (
                <div
                  key={idx}
                  className="absolute border-[1.5px] border-[#00ff00] bg-[rgba(0,255,0,0.15)] pointer-events-none"
                  style={{
                    left: `${left}%`,
                    top: `${top}%`,
                    width: `${width}%`,
                    height: `${height}%`,
                  }}
                />
              );
            })}
        </>
      )}
    </div>
  );
}
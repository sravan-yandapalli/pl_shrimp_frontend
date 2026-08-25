import Image from "next/image";
import { ChangeEvent } from "react";

interface CaptureControlsProps {
  isCaptured: boolean;
  cameraReady: boolean;
  isProcessing: boolean;
  onCapture: () => void;
  onUpload: (event: ChangeEvent<HTMLInputElement>) => void;
  onRecapture: () => void;
  onSubmit: () => void;
}

export default function CaptureControls({
  isCaptured,
  cameraReady,
  isProcessing,
  onCapture,
  onUpload,
  onRecapture,
  onSubmit,
}: CaptureControlsProps) {
  return (
    <div className="h-[120px] flex items-center justify-center">
      {!isCaptured ? (
        <div className="flex flex-col items-center gap-4 transition-transform active:scale-95">
          <div>
            <span className="text-foreground text-[12px] font-normal">
              click capture button to start count
            </span>
          </div>

          <button
            type="button"
            onClick={onCapture}
            aria-label="Capture shrimp image"
            disabled={!cameraReady}
            className={`${
              cameraReady ? "cursor-pointer active:scale-95" : "cursor-not-allowed opacity-50"
            } transition-transform`}
          >
            <Image src="/images/cam.png" alt="camera" width={65} height={65} />
          </button>

          <input
            id="image-upload"
            type="file"
            accept="image/*"
            onChange={onUpload}
            className="hidden"
          />
          <label
            htmlFor="image-upload"
            className="flex items-center justify-center w-[72px] h-[28px] rounded-full bg-surface border border-border text-foreground text-[11px] font-medium cursor-pointer transition-transform active:scale-95"
          >
            Upload
          </label>
        </div>
      ) : (
        <div className="flex flex-row items-center justify-center gap-16">
          <button
            type="button"
            onClick={onRecapture}
            disabled={isProcessing}
            className="flex flex-col items-center gap-2 transition-transform active:scale-95"
          >
            <div className="w-[50px] h-[50px] rounded-full bg-surface border border-border flex items-center justify-center">
              <span className="text-foreground text-xl">↺</span>
            </div>
            <span className="text-foreground text-[12px] font-medium">Recapture</span>
          </button>

          <button
            type="button"
            onClick={onSubmit}
            disabled={isProcessing}
            className="flex flex-col items-center gap-2 transition-transform active:scale-95"
          >
            <div className="w-[50px] h-[50px] rounded-full bg-primary flex items-center justify-center">
              <span className="text-white text-xl">
                {isProcessing ? "..." : "✓"}
              </span>
            </div>
            <span className="text-foreground text-[12px] font-medium">
              {isProcessing ? "Processing..." : "Submit"}
            </span>
          </button>
        </div>
      )}
    </div>
  );
}
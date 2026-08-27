interface StatusDisplayProps {
  isProcessing: boolean;
  count: number | null;
  savedFileName: string | null;
  errorMessage: string | null;
  captureResolution: {
    width: number;
    height: number;
    megapixels: number;
    method: "ImageCapture" | "Video fallback";
    sourceWidth?: number;
    sourceHeight?: number;
  } | null;
}

export default function StatusDisplay({
  isProcessing,
  count,
  savedFileName,
  errorMessage,
  captureResolution,
}: StatusDisplayProps) {
  return (
    <div className="min-h-[80px] flex flex-col items-center justify-center">

      {isProcessing && (
        <span className="text-foreground text-[14px] font-medium">
          Processing...
        </span>
      )}

      {!isProcessing &&
        count !== null && (
          <>
            <span className="text-foreground text-[14px] font-normal">
              Count
            </span>

            <span className="text-foreground text-[36px] font-bold leading-none">
              {count}
            </span>
          </>
        )}

      {captureResolution && (
        <div className="flex flex-col items-center mt-2">
          <span className="text-foreground text-[10px] font-medium">
            Captured
          </span>

          <span className="text-foreground text-[11px]">
            {captureResolution.width} ×{" "}
            {captureResolution.height}
          </span>

          <span className="text-muted text-[10px]">
            {captureResolution.megapixels.toFixed(2)} MP ·{" "}
            {captureResolution.method}
          </span>

          {captureResolution.sourceWidth &&
            captureResolution.sourceHeight && (
              <span className="text-muted text-[9px]">
                Source:{" "}
                {captureResolution.sourceWidth} ×{" "}
                {captureResolution.sourceHeight}
              </span>
            )}
        </div>
      )}

      {!isProcessing &&
        savedFileName && (
          <span className="text-muted text-[9px] mt-2 max-w-[280px] truncate">
            {savedFileName}
          </span>
        )}

      {errorMessage && (
        <span className="text-error text-[11px] text-center max-w-[280px]">
          {errorMessage}
        </span>
      )}
    </div>
  );
}
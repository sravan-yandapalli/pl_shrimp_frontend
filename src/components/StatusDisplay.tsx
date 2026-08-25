interface StatusDisplayProps {
  isProcessing: boolean;
  count: number | null;
  savedFileName: string | null;
  errorMessage: string | null;
}

export default function StatusDisplay({ 
  isProcessing, 
  count, 
  savedFileName, 
  errorMessage 
}: StatusDisplayProps) {
  return (
    <div className="min-h-[80px] flex flex-col items-center justify-center">
      {isProcessing && (
        <span className="text-foreground text-[14px] font-medium">Processing...</span>
      )}

      {!isProcessing && count !== null && (
        <>
          <span className="text-foreground text-[14px] font-normal">Count</span>
          <span className="text-foreground text-[36px] font-bold leading-none">{count}</span>
        </>
      )}

      {!isProcessing && savedFileName && (
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
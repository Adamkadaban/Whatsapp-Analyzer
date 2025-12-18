import {
  PROCESSING_SLOW_THRESHOLD_SEC,
  PROCESSING_VERY_SLOW_THRESHOLD_SEC,
} from "../../lib/constants";

interface LoadingOverlayProps {
  processing: boolean;
  analyzing: boolean;
  isReady: boolean;
  fileName: string | null;
  fileCount: number;
  processingElapsed: number;
  onAnalyze: () => void;
}

/**
 * Loading overlay shown during file processing, analysis, and when ready to analyze.
 */
export default function LoadingOverlay({
  processing,
  analyzing,
  isReady,
  fileName,
  fileCount,
  processingElapsed,
  onAnalyze,
}: LoadingOverlayProps) {
  if (!processing && !isReady && !analyzing) return null;

  return (
    <div className="loading-overlay" role="status" aria-live="polite">
      <div className="loading-card">
        {processing && (
          <>
            <div className="spinner" aria-hidden="true" />
            <div className="font-bold text-xl mb-sm">
              {processingElapsed >= PROCESSING_VERY_SLOW_THRESHOLD_SEC
                ? "This is taking a while - you must text a lot!"
                : processingElapsed >= PROCESSING_SLOW_THRESHOLD_SEC
                  ? "Just a few more seconds…"
                  : fileCount > 1
                    ? "Loading files…"
                    : "Loading file…"}
            </div>
            <div className="text-muted">{fileName}</div>
          </>
        )}
        {analyzing && (
          <>
            <div className="spinner" aria-hidden="true" />
            <div className="font-bold text-xl mb-sm">Analyzing your chat…</div>
            <div className="text-muted">This will only take a moment.</div>
          </>
        )}
        {isReady && (
          <>
            <div className="text-3xl mb-md">📄</div>
            <div className="font-bold text-xl mb-sm">{fileName}</div>
            <div className="text-muted mb-lg">Ready to analyze</div>
            <button className="btn" onClick={onAnalyze}>
              Analyze
            </button>
          </>
        )}
      </div>
    </div>
  );
}

import { useState } from "react";

interface DashboardHeaderProps {
  hasData: boolean;
  hasSummary: boolean;
  filterStopwords: boolean;
  onFilterStopwordsChange: (value: boolean) => void;
  exporting: boolean;
  processing: boolean;
  onConfigureColors: () => void;
  onExportPdf: () => void;
  onReset: () => void;
}

/**
 * Dashboard title row. When data is loaded it also renders the export controls:
 * stop-word toggle, configure colours, export PDF and upload-another. The
 * stop-word explainer tooltip is local UI state.
 */
export default function DashboardHeader({
  hasData,
  hasSummary,
  filterStopwords,
  onFilterStopwordsChange,
  exporting,
  processing,
  onConfigureColors,
  onExportPdf,
  onReset,
}: DashboardHeaderProps) {
  const [showStopTooltip, setShowStopTooltip] = useState(false);

  return (
    <div className="dashboard-header">
      <div>
        <h2 className="dashboard-title">Dashboard</h2>
        {!hasData && (
          <p className="dashboard-subtitle">Drop your exported WhatsApp .txt.</p>
        )}
      </div>
      {hasData && (
        <div className="export-controls export-hide">
          <div className="switch-row">
            <div className="export-dropdown">
              <span
                onMouseEnter={() => setShowStopTooltip(true)}
                onMouseLeave={() => setShowStopTooltip(false)}
                onFocus={() => setShowStopTooltip(true)}
                onBlur={() => setShowStopTooltip(false)}
                className="inline-flex"
              >
                Filter stop-words
              </span>
              {showStopTooltip && (
                <div role="tooltip" className="stopword-tooltip">
                  Stop-words are common filler words ("the", "and", "is", "you") we drop so the
                  interesting terms pop in the word stats.
                </div>
              )}
            </div>
            <label className="switch">
              <input
                type="checkbox"
                checked={filterStopwords}
                onChange={(e) => onFilterStopwordsChange(e.target.checked)}
                aria-label="Filter out stopwords from word statistics"
              />
              <span className="slider" />
            </label>
          </div>
          <button
            className="btn ghost"
            onClick={onConfigureColors}
            disabled={!hasSummary}
          >
            Configure colors
          </button>
          <button
            className="btn ghost"
            onClick={onExportPdf}
            disabled={!hasSummary || exporting}
          >
            {exporting ? "Exporting…" : "Export PDF"}
          </button>
          <button className="btn ghost" onClick={onReset} disabled={processing}>
            Upload another chat
          </button>
        </div>
      )}
    </div>
  );
}

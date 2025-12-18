import type { PersonBuckets } from "../../lib/types";

interface ColorModalProps {
  bucketsByPerson: PersonBuckets[];
  onColorChange: (name: string, color: string) => void;
  onClose: () => void;
  getColor: (name: string, idx: number) => string;
}

/**
 * Modal for configuring user colors.
 */
export default function ColorModal({
  bucketsByPerson,
  onColorChange,
  onClose,
  getColor,
}: ColorModalProps) {
  return (
    <div
      className="loading-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="color-modal-title"
    >
      <div className="card color-modal grid-gap-md">
        <div className="color-modal-header">
          <div>
            <div className="tag">Colors</div>
            <h3 id="color-modal-title" className="color-modal-title">
              Configure user colors
            </h3>
          </div>
          <button
            className="btn ghost"
            onClick={onClose}
            aria-label="Close color configuration"
          >
            Close
          </button>
        </div>
        <div className="grid-gap-sm">
          {bucketsByPerson.map((p, idx) => (
            <div key={p.name} className="color-picker-row">
              <div className="color-picker-label">
                <span
                  className="color-swatch"
                  style={{
                    background: getColor(p.name, idx),
                    width: 18,
                    height: 18,
                    borderRadius: 6,
                  }}
                />
                <span className="font-semibold">{p.name}</span>
              </div>
              <input
                type="color"
                value={getColor(p.name, idx)}
                onChange={(e) => onColorChange(p.name, e.target.value)}
                aria-label={`Choose color for ${p.name}`}
                className="color-input"
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

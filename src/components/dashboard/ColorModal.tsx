import { useEffect, useRef } from "react";
import type { PersonBuckets } from "../../lib/types";

interface ColorModalProps {
  bucketsByPerson: PersonBuckets[];
  onColorChange: (name: string, color: string) => void;
  onClose: () => void;
  getColor: (name: string, idx: number) => string;
}

/**
 * Modal for configuring user colors.
 *
 * Accessibility: traps Tab focus inside the dialog, closes on Escape and on
 * backdrop click, focuses the close button on open, and restores focus to the
 * element that was focused before the dialog opened when it closes.
 */
export default function ColorModal({
  bucketsByPerson,
  onColorChange,
  onClose,
  getColor,
}: ColorModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    // Remember what was focused so we can restore it on close.
    const previouslyFocused = document.activeElement as HTMLElement | null;

    // Move initial focus to the close button.
    closeButtonRef.current?.focus();

    function getFocusable(): HTMLElement[] {
      const root = dialogRef.current;
      if (!root) return [];
      return Array.from(
        root.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        )
      ).filter((el) => !el.hasAttribute("disabled") && el.tabIndex !== -1);
    }

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key !== "Tab") return;

      const focusable = getFocusable();
      if (focusable.length === 0) {
        e.preventDefault();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement as HTMLElement | null;

      if (e.shiftKey) {
        if (active === first || !dialogRef.current?.contains(active)) {
          e.preventDefault();
          last.focus();
        }
      } else if (active === last || !dialogRef.current?.contains(active)) {
        e.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      // Restore focus to whatever was focused before the dialog opened.
      previouslyFocused?.focus?.();
    };
  }, [onClose]);

  function handleBackdropMouseDown(e: React.MouseEvent<HTMLDivElement>) {
    // Only close when the click starts on the backdrop itself, not on the card.
    if (e.target === e.currentTarget) {
      onClose();
    }
  }

  return (
    <div
      className="loading-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="color-modal-title"
      ref={dialogRef}
      onMouseDown={handleBackdropMouseDown}
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
            ref={closeButtonRef}
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

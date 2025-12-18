import type { ChangeEvent, DragEvent } from "react";
import { useState } from "react";

interface UploadSectionProps {
  error: string | null;
  onFileChange: (e: ChangeEvent<HTMLInputElement>) => void;
  onDrop: (e: DragEvent<HTMLDivElement>) => void;
}

/**
 * Upload section with drag & drop and file input.
 */
export default function UploadSection({ error, onFileChange, onDrop }: UploadSectionProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [showExportHelp, setShowExportHelp] = useState(false);

  function handleDragOver(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
  }

  function handleDragEnter(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setIsDragging(true);
  }

  function handleDragLeave(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    // Only set false if leaving the drop zone (not entering a child)
    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
    setIsDragging(false);
  }

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setIsDragging(false);
    onDrop(e);
  }

  return (
    <div id="upload" className="card upload-card">
      <h3 className="card-header">Upload your chat to see insights</h3>
      <p className="text-muted m-0">
        No uploads leave your device. Processing happens locally and privately.
      </p>
      <div className="upload-form">
        <div
          role="region"
          aria-label="File drop zone"
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
          className={`upload-dropzone ${isDragging ? "dragging" : ""}`}
        >
          <div className="file-picker">
            <label className="btn upload-btn">
              Upload .txt file or a zip file
              <input
                type="file"
                accept=".txt,.zip"
                multiple
                className="file-input"
                onChange={onFileChange}
                aria-label="Upload WhatsApp chat export file"
              />
            </label>
            <span className="file-info">or drag & drop</span>
          </div>
          {error && <span className="error-text">{error}</span>}
        </div>
        <details
          open={showExportHelp}
          onToggle={(e) => setShowExportHelp((e.target as HTMLDetailsElement).open)}
          className="instructions-toggle"
        >
          <summary className="text-muted text-md">How do I export my chats?</summary>
          <div className="instructions-content">
            <div>
              <strong className="mb-sm d-block">iPhone</strong>
              <ol className="instructions-list">
                <li>Open the chat, tap its name to enter Chat Info.</li>
                <li>
                  Scroll to the bottom, tap <strong className="text-white">Export Chat</strong>.
                </li>
                <li>
                  Choose <strong className="text-white">Without Media</strong> and save/share the
                  TXT.
                </li>
              </ol>
            </div>
            <div>
              <strong className="mb-sm d-block">Android</strong>
              <ol className="instructions-list">
                <li>Open the chat, tap ⋮ → More → Export chat.</li>
                <li>
                  Pick <strong className="text-white">Without Media</strong> to keep the file small.
                </li>
                <li>Save the TXT, then upload it here.</li>
              </ol>
            </div>
          </div>
        </details>
      </div>
    </div>
  );
}

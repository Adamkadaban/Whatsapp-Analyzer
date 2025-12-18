import { useCallback, useState } from "react";
import type { Summary } from "../types";

// Enable performance timing logs only in dev mode.
const DEBUG_TIMING = import.meta.env.DEV;

function logTiming(label: string, data: Record<string, unknown>) {
  if (DEBUG_TIMING) {
    console.info(label, data);
  }
}

interface FileProcessingState {
  processing: boolean;
  error: string | null;
  fileName: string | null;
  fileCount: number;
  pendingSummary: Summary | null;
}

interface FileProcessingResult {
  state: FileProcessingState;
  processFiles: (files: FileList | File[]) => Promise<void>;
  reset: () => void;
}

// Preserve ZWJ (\u200d) so compound emoji sequences stay intact. Strip other common invisibles.
function stripInvisibles(text: string): string {
  return text.replace(/[\u200b-\u200c\u200e-\u200f\u202a-\u202e\u2060-\u2063\ufeff]/g, "");
}

function hasMeaningfulText(text: string): boolean {
  if (!text) return false;
  const cleaned = stripInvisibles(text);
  if (cleaned.trim().length === 0) return false;
  // Accept if there's any non-control, non-whitespace rune after removing invisibles.
  return /[^\s\p{C}]/u.test(cleaned);
}

function decodeBufferWithFallback(buffer: ArrayBuffer): { text: string; encoding: string } | null {
  const candidates: string[] = ["utf-8", "utf-16le", "utf-16be"];
  for (const enc of candidates) {
    try {
      const decoder = new TextDecoder(enc, { fatal: false });
      const text = decoder.decode(new Uint8Array(buffer));
      if (hasMeaningfulText(text)) {
        return { text, encoding: enc };
      }
    } catch (err) {
      console.warn(`Failed to decode with ${enc}`, err);
    }
  }
  return null;
}

async function readTextWithFallback(file: File): Promise<{ text: string; encoding: string } | null> {
  const prefix = `readTextWithFallback(${file.name})`;
  const log = (...args: unknown[]) => { if (DEBUG_TIMING) console.info(prefix, ...args); };
  const errors: unknown[] = [];

  const readWithFileReader = async (): Promise<ArrayBuffer | null> => {
    log("FileReader: start");
    return await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result instanceof ArrayBuffer ? reader.result : null);
      reader.onerror = () => reject(reader.error ?? new Error("FileReader failed"));
      reader.readAsArrayBuffer(file);
    });
  };

  const readViaObjectUrl = async (mode: "text" | "arrayBuffer") => {
    const url = URL.createObjectURL(file);
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`objectURL fetch failed: ${res.status}`);
      const out = mode === "text" ? await res.text() : await res.arrayBuffer();
      log(`objectURL ${mode}: success`, mode === "text" ? { length: (out as string).length } : { bytes: (out as ArrayBuffer).byteLength });
      return out;
    } finally {
      URL.revokeObjectURL(url);
    }
  };

  const readFromClone = async (mode: "text" | "arrayBuffer") => {
    const clone = new Blob([file]);
    try {
      const res = mode === "text" ? await new Response(clone).text() : await new Response(clone).arrayBuffer();
      log(`clone ${mode}: success`, mode === "text" ? { length: (res as string).length } : { bytes: (res as ArrayBuffer).byteLength });
      return res;
    } catch (err) {
      log(`clone ${mode}: failed`, err);
      errors.push(err);
      return null;
    }
  };

  const safeText = async (): Promise<string | null> => {
    try {
      const res = await file.text();
      log("text(): success", { length: res.length });
      return res;
    } catch (err) {
      log("text(): failed", err);
      errors.push(err);
      try {
        const res = await new Response(file).text();
        log("Response.text(): success", { length: res.length });
        return res;
      } catch (err2) {
        log("Response.text(): failed", err2);
        errors.push(err2);
        try {
          const res = await readViaObjectUrl("text");
          return typeof res === "string" ? res : null;
        } catch (err3) {
          log("objectURL text(): failed", err3);
          errors.push(err3);
        }

        const cloneText = await readFromClone("text");
        if (typeof cloneText === "string") return cloneText;

        try {
          const buf = await readWithFileReader();
          if (!buf) return null;
          const decoded = new TextDecoder("utf-8", { fatal: false }).decode(new Uint8Array(buf));
          log("FileReader decoded utf-8", { length: decoded.length });
          return decoded;
        } catch (err4) {
          errors.push(err4);
          console.warn("Failed to read file via text()/Response/FileReader/objectURL", errors);
          return null;
        }
      }
    }
  };

  const safeArrayBuffer = async (): Promise<ArrayBuffer | null> => {
    try {
      const res = await file.arrayBuffer();
      log("arrayBuffer(): success", { bytes: res.byteLength });
      return res;
    } catch (err) {
      log("arrayBuffer(): failed", err);
      errors.push(err);
      try {
        const res = await new Response(file).arrayBuffer();
        log("Response.arrayBuffer(): success", { bytes: res.byteLength });
        return res;
      } catch (err2) {
        log("Response.arrayBuffer(): failed", err2);
        errors.push(err2);
        try {
          const res = await readViaObjectUrl("arrayBuffer");
          if (res instanceof ArrayBuffer) return res;
        } catch (err3) {
          log("objectURL arrayBuffer(): failed", err3);
          errors.push(err3);
        }

        const cloneBuf = await readFromClone("arrayBuffer");
        if (cloneBuf instanceof ArrayBuffer) return cloneBuf;

        try {
          const res = await readWithFileReader();
          if (res) log("FileReader arrayBuffer: success", { bytes: res.byteLength });
          return res;
        } catch (err4) {
          errors.push(err4);
          console.warn("Failed to read file via arrayBuffer()/Response/FileReader/objectURL", errors);
          return null;
        }
      }
    }
  };

  // First try the browser's default text decode (utf-8).
  const utf8 = await safeText();
  if (utf8 && hasMeaningfulText(utf8)) {
    log("hasMeaningfulText utf-8: yes");
    return { text: utf8, encoding: "utf-8" };
  }
  log("hasMeaningfulText utf-8: no or read failed");

  // Fall back to checking utf-16 encodings in case the export is UTF-16.
  const buffer = await safeArrayBuffer();
  if (!buffer) {
    log("arrayBuffer fallback: null (giving up)");
    return null;
  }
  const decoded = decodeBufferWithFallback(buffer);
  if (decoded) {
    log("decodeBufferWithFallback: success", { encoding: decoded.encoding, length: decoded.text.length });
  } else {
    log("decodeBufferWithFallback: failed for utf-16 attempts");
  }
  return decoded;
}

async function extractZipText(file: File): Promise<{ texts: string[]; names: string[] }> {
  const JSZip = (await import("jszip")).default;
  const buffer = await file.arrayBuffer();
  const zip = await JSZip.loadAsync(buffer);
  const entries = Object.values(zip.files).filter((entry) => {
    if (entry.dir) return false;
    const lower = entry.name.toLowerCase();
    return lower.endsWith(".txt");
  });
  if (!entries.length) {
    throw new Error(`No .txt files found in zip: ${file.name}`);
  }

  const decoded = await Promise.all(
    entries.map(async (entry) => {
      const buf = await entry.async("arraybuffer");
      const hit = decodeBufferWithFallback(buf);
      return { name: entry.name, text: hit?.text ?? "", encoding: hit?.encoding ?? "unknown" };
    })
  );
  return { texts: decoded.map((d) => d.text), names: decoded.map((d) => d.name) };
}

export function useFileProcessing(
  analyzeText: (raw: string) => Promise<Summary>
): FileProcessingResult {
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [fileCount, setFileCount] = useState(0);
  const [pendingSummary, setPendingSummary] = useState<Summary | null>(null);

  const reset = useCallback(() => {
    setProcessing(false);
    setError(null);
    setFileName(null);
    setFileCount(0);
    setPendingSummary(null);
  }, []);

  const processFiles = useCallback(async (fileList: FileList | File[]) => {
    const files = Array.from(fileList);
    if (!files.length) return;

    const processStart = performance.now();
    logTiming("[analysis] processFiles start", { fileCount: files.length, names: files.map((f) => f.name) });

    setError(null);
    setPendingSummary(null);
    setFileName(files.length === 1 ? files[0].name : `${files.length} files`);
    setFileCount(files.length);
    setProcessing(true);

    const texts: string[] = [];
    const labels: string[] = [];
    const skipped: string[] = [];

    try {
      const pushText = (name: string, text: string) => {
        const cleaned = stripInvisibles(text);
        if (hasMeaningfulText(cleaned)) {
          texts.push(cleaned);
          labels.push(name);
        } else {
          skipped.push(`${name} (no text found)`);
        }
      };

      for (const file of files) {
        const displayName = file.name;
        const lower = displayName.toLowerCase();
        const fileStart = performance.now();

        try {
          if (lower.endsWith(".zip")) {
            const zipStart = performance.now();
            const { texts: zipTexts, names } = await extractZipText(file);
            zipTexts.forEach((t, idx) => pushText(`${displayName}:${names[idx]}`, t));
            labels.push(`${displayName} (${names.length} txt)`);
            logTiming("[analysis] zip processed", { name: displayName, entries: names.length, ms: Number((performance.now() - zipStart).toFixed(1)) });
          } else if (lower.endsWith(".txt")) {
            const decodeStart = performance.now();
            const decoded = await readTextWithFallback(file);
            if (decoded) {
              pushText(displayName, decoded.text);
              logTiming("[analysis] txt processed", { name: displayName, encoding: decoded.encoding, chars: decoded.text.length, ms: Number((performance.now() - decodeStart).toFixed(1)) });
            } else {
              skipped.push(`${displayName} (unreadable text; tried utf-8/utf-16)`);
            }
          } else {
            skipped.push(`${displayName} (unsupported type)`);
          }
        } catch (err) {
          const reason = err instanceof Error ? err.name || err.message : "unknown error";
          skipped.push(`${displayName} (failed to read: ${reason})`);
          console.error("Failed to read file", displayName, err);
        } finally {
          logTiming("[analysis] file processed", { name: displayName, ms: Number((performance.now() - fileStart).toFixed(1)) });
        }
      }

      if (!texts.length) {
        const hasEncodingIssue = skipped.some((s) => s.includes("unreadable text"));
        if (hasEncodingIssue) {
          throw new Error("We're having trouble reading your file. Try renaming it to something simple like 'whatsapp.txt' and uploading again.");
        }
        const detail = skipped.length ? ` Skipped: ${skipped.join(", ")}` : "";
        throw new Error(`No text found. Upload one or more .txt files or a .zip containing .txt exports.${detail}`);
      }

      const combineStart = performance.now();
      const combinedText = texts.join("\n");
      logTiming("[analysis] combined text", { length: combinedText.length, sources: texts.length, ms: Number((performance.now() - combineStart).toFixed(1)) });

      const analyzeStart = performance.now();
      const res = await analyzeText(combinedText);
      logTiming("[analysis] analyzeText finished", { ms: Number((performance.now() - analyzeStart).toFixed(1)) });
      setPendingSummary(res);
      setFileName(labels.join(", "));

      if (skipped.length) {
        setError(`Some files were skipped: ${skipped.join(", ")}`);
      }
    } catch (err) {
      console.error(err);
      const message = err instanceof Error ? err.message : "Failed to analyze chat. Please try another file.";
      setError(message);
      setFileName(null);
      setFileCount(0);
    } finally {
      logTiming("[analysis] processFiles finished", { ms: Number((performance.now() - processStart).toFixed(1)), kept: texts.length, skipped: skipped.length });
      setProcessing(false);
    }
  }, [analyzeText]);

  return {
    state: { processing, error, fileName, fileCount, pendingSummary },
    processFiles,
    reset,
  };
}

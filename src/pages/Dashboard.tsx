import JSZip from "jszip";
import { useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent } from "react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, LabelList, Line, LineChart, Pie, PieChart, PolarAngleAxis, PolarGrid, Radar, RadarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import WordCloud from "../components/WordCloud";
import EmojiCloud from "../components/EmojiCloud";
import ChartCard from "../components/ChartCard";
import PieTooltip, { type SenderDatum } from "../components/PieTooltip";
import StatCard from "../components/StatCard";
import { analyzeText, type Summary } from "../lib/wasm";
import type { JourneyMessage } from "../lib/types";
import { calcLongestStreak, type DailyDatum } from "../lib/streak";
import { CHART_COLORS, SITE_URL } from "../lib/colors";
import {
  MAX_LEGEND_SENDERS,
  MONTH_LABELS,
  WEEKDAY_LABELS,
  PROCESSING_SLOW_THRESHOLD_SEC,
  PROCESSING_VERY_SLOW_THRESHOLD_SEC,
  PDF_MAX_DIMENSION_PX,
  PDF_MAX_SCALE,
  PDF_HEIGHT_BUFFER_PX,
} from "../lib/constants";

// Enable performance timing logs only in dev mode.
const DEBUG_TIMING = import.meta.env.DEV;
function logTiming(label: string, data: Record<string, unknown>) {
  if (DEBUG_TIMING) {
    console.info(label, data);
  }
}

const colors = CHART_COLORS;

type KpiDatum = { label: string; value: string; detail?: string };

/** Format ISO timestamp to readable time */
function formatMessageTime(timestamp: string): string {
  const date = new Date(timestamp);
  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

/** WhatsApp-style message bubble */
function MessageBubble({ message, senderColor }: { message: JourneyMessage; senderColor: string }) {
  const bubbleStyle = {
    maxWidth: "80%",
    padding: "8px 12px",
    borderRadius: message.is_you ? "16px 16px 4px 16px" : "16px 16px 16px 4px",
    background: message.is_you
      ? "linear-gradient(135deg, #005c4b, #004d40)"
      : "rgba(255,255,255,0.08)",
    border: "1px solid rgba(255,255,255,0.06)",
    position: "relative" as const,
  };

  return (
    <div className={`flex-center mb-sm ${message.is_you ? "justify-end" : ""}`}>
      <div style={bubbleStyle}>
        <div className="journey-message-sender" style={{ color: senderColor }}>
          {message.sender}
        </div>
        <div className="journey-message-text">{message.text}</div>
        <div className="journey-message-meta text-right">
          {formatMessageTime(message.timestamp)}
        </div>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [pendingSummary, setPendingSummary] = useState<Summary | null>(null);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filterStopwords, setFilterStopwords] = useState(true);
  const [colorMap, setColorMap] = useState<Record<string, string>>({});
  const [showColorModal, setShowColorModal] = useState(false);
  const [showStopTooltip, setShowStopTooltip] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [showExportHelp, setShowExportHelp] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const dashboardRef = useRef<HTMLElement | null>(null);

  const hasData = Boolean(summary);
  const senderCount = summary?.by_sender.length ?? 0;
  const showLegend = senderCount <= MAX_LEGEND_SENDERS;

  const senderData: SenderDatum[] = summary
    ? summary.by_sender.slice(0, 6).map((s) => ({ name: s.label, value: s.value }))
    : [];

  const dailyData: DailyDatum[] = useMemo(
    () => summary ? summary.daily.map((d) => ({ day: d.label, messages: d.value })) : [],
    [summary]
  );

  // Parse YYYY-MM-DD as local date for display purposes
  const parseLocalDate = (dateStr: string) => {
    const [year, month, day] = dateStr.split("-").map(Number);
    return new Date(year, month - 1, day);
  };

  // Compute busiest/quietest day and longest streak
  const busiestDay = useMemo(() => {
    if (!dailyData.length) return null;
    return dailyData.reduce((max, d) => (d.messages > max.messages ? d : max), dailyData[0]);
  }, [dailyData]);

  const quietestDay = useMemo(() => {
    if (!dailyData.length) return null;
    return dailyData.reduce((min, d) => (d.messages < min.messages ? d : min), dailyData[0]);
  }, [dailyData]);

  const longestStreakData = useMemo(() => calcLongestStreak(dailyData), [dailyData]);

  const formatDayLabel = (day: string) => {
    const date = parseLocalDate(day);
    return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  };

  const topStarter = summary?.conversation_starters[0];
  const topStarterShare = summary && topStarter && summary.conversation_count
    ? Math.round((topStarter.value / summary.conversation_count) * 100)
    : 0;
  const conversationStartersData = summary
    ? summary.conversation_starters.map((s) => ({ name: s.label, value: s.value }))
    : [];

  useEffect(() => {
    if (!summary) return;
    const names: string[] = summary.buckets_by_person.map((p) => p.name);
    const preferred = new Map<string, string>();
    summary.person_stats.forEach((p) => {
      if (p.dominant_color) {
        preferred.set(p.name, p.dominant_color);
      }
    });

    setColorMap((prev) => {
      const next: Record<string, string> = {};
      const used = new Set<string>();

      names.forEach((name, idx) => {
        // Keep existing manual overrides if they don't clash.
        const existing = prev[name];
        if (existing && !used.has(existing)) {
          next[name] = existing;
          used.add(existing);
          return;
        }

        const dom = preferred.get(name);
        if (dom && !used.has(dom)) {
          next[name] = dom;
          used.add(dom);
          return;
        }

        const fallback = colors.find((c) => !used.has(c)) ?? colors[idx % colors.length];
        next[name] = fallback;
        used.add(fallback);
      });

      return next;
    });
  }, [summary]);

  const getColor = (name: string, idx: number) => colorMap[name] ?? colors[idx % colors.length];

  const timelineData = summary
    ? summary.timeline.map((d) => ({ date: d.label, messages: d.value }))
    : [];

  const kpis: KpiDatum[] = summary
    ? [
        {
          label: "Total messages",
          value: summary.total_messages.toLocaleString(),
          detail: `Deleted you/others: ${summary.deleted_you}/${summary.deleted_others}`,
        },
        {
          label: "Active days",
          value: summary.timeline.length.toLocaleString(),
          detail: `Senders: ${summary.by_sender.length}`,
        },
        {
          label: "Busiest day",
          value: busiestDay ? formatDayLabel(busiestDay.day) : "-",
          detail: busiestDay ? `${busiestDay.messages.toLocaleString()} ${busiestDay.messages === 1 ? "message" : "messages"}` : "",
        },
        {
          label: "Quietest day",
          value: quietestDay ? formatDayLabel(quietestDay.day) : "-",
          detail: quietestDay ? `${quietestDay.messages.toLocaleString()} ${quietestDay.messages === 1 ? "message" : "messages"}` : "",
        },
        {
          label: "Longest streak",
          value: `${longestStreakData.days} ${longestStreakData.days === 1 ? "day" : "days"}`,
          detail: longestStreakData.start ? `${formatDayLabel(longestStreakData.start)} - ${formatDayLabel(longestStreakData.end)}` : "",
        },
        {
          label: "Conversation starts",
          value: topStarter?.label ?? "-",
          detail: `${topStarter?.label ?? "-"} started ${topStarterShare}% of conversations`,
        },
        {
          label: "Top emoji",
          value: summary.top_emojis[0]?.label ?? "-",
          detail: `${summary.top_emojis[0]?.value ?? 0} uses`,
        },
        {
          label: "Top word",
          value: (filterStopwords ? summary.top_words : summary.top_words_no_stop)[0]?.label ?? "-",
          detail: `${(filterStopwords ? summary.top_words : summary.top_words_no_stop)[0]?.value ?? 0} uses`,
        },
      ]
    : [];

  const hourlyStacked = useMemo(() => {
    if (!summary) return [];
    return Array.from({ length: 24 }).map((_, hour) => {
      const row: Record<string, number | string> = { hour };
      summary.buckets_by_person.forEach((p) => {
        row[p.name] = p.hourly[hour];
      });
      return row;
    });
  }, [summary]);

  const monthlyRadar = useMemo(() => {
    if (!summary) return [];
    return MONTH_LABELS.map((label, idx) => {
      const row: Record<string, number | string> = { label };
      summary.buckets_by_person.forEach((p) => {
        row[p.name] = p.monthly[idx];
      });
      return row;
    });
  }, [summary]);

  const weekdayRadar = useMemo(() => {
    if (!summary) return [];
    return WEEKDAY_LABELS.map((label, idx) => {
      const row: Record<string, number | string> = { label };
      summary.buckets_by_person.forEach((p) => {
        row[p.name] = p.daily[idx];
      });
      return row;
    });
  }, [summary]);

  const wordCloud = summary ? (filterStopwords ? summary.word_cloud : summary.word_cloud_no_stop) : [];
  const emojiCloud = summary?.emoji_cloud ?? [];
  const perPersonPhrases = summary
    ? (filterStopwords ? summary.per_person_phrases : summary.per_person_phrases_no_stop)
    : [];

  const sentimentByDay = useMemo(() => summary?.sentiment_by_day ?? [], [summary]);
  const sentimentOverall = useMemo(() => summary?.sentiment_overall ?? [], [summary]);

  const sentimentLaneData = useMemo(() => {
    if (!sentimentByDay.length) return [] as Record<string, number | string>[];
    const byDay = new Map<string, Record<string, number | string>>();
    sentimentByDay.forEach((row) => {
      const entry = byDay.get(row.day) ?? { day: row.day };
      entry[row.name] = Number(row.mean.toFixed(3));
      byDay.set(row.day, entry);
    });
    return Array.from(byDay.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([, value]) => value);
  }, [sentimentByDay]);

  const sentimentStacked = useMemo(() => {
    if (!sentimentOverall.length) return [] as Array<Record<string, number | string>>;
    return sentimentOverall.map((row) => {
      const total = Math.max(row.pos + row.neu + row.neg, 1);
      return {
        name: row.name,
        mean: Number(row.mean.toFixed(3)),
        pos: Number(((row.pos as number) / total * 100).toFixed(1)),
        neu: Number(((row.neu as number) / total * 100).toFixed(1)),
        neg: Number(((row.neg as number) / total * 100).toFixed(1)),
      };
    });
  }, [sentimentOverall]);

  const sentimentTimeline = useMemo(() => {
    if (!sentimentByDay.length) return [] as { day: string; mean: number }[];
    const grouped = new Map<string, { sum: number; count: number }>();
    sentimentByDay.forEach((row) => {
      const weight = Math.max(row.pos + row.neu + row.neg, 1);
      const entry = grouped.get(row.day) ?? { sum: 0, count: 0 };
      entry.sum += row.mean * weight;
      entry.count += weight;
      grouped.set(row.day, entry);
    });
    return Array.from(grouped.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([day, agg]) => ({ day, mean: agg.count == 0 ? 0 : Number((agg.sum / agg.count).toFixed(3)) }));
  }, [sentimentByDay]);

  const hasSentiment = sentimentByDay.length > 0;

  const [activeSentimentIndex, setActiveSentimentIndex] = useState<number | null>(null);
  const sentimentOpacity = (idx: number) => (activeSentimentIndex === null || activeSentimentIndex === idx ? 1 : 0.3);

  const [fileName, setFileName] = useState<string | null>(null);
  const [fileCount, setFileCount] = useState(0);
  const [analyzing, setAnalyzing] = useState(false);
  const [processingElapsed, setProcessingElapsed] = useState(0);

  // Track elapsed time during processing
  useEffect(() => {
    if (!processing) {
      setProcessingElapsed(0);
      return;
    }
    const interval = setInterval(() => {
      setProcessingElapsed((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [processing]);

  // Preserve ZWJ (\u200d) so compound emoji sequences stay intact. Strip other common invisibles.
  const stripInvisibles = (text: string) => text.replace(/[\u200b-\u200c\u200e-\u200f\u202a-\u202e\u2060-\u2063\ufeff]/g, "");

  const hasMeaningfulText = (text: string) => {
    if (!text) return false;
    const cleaned = stripInvisibles(text);
    if (cleaned.trim().length === 0) return false;
    // Accept if there's any non-control, non-whitespace rune after removing invisibles.
    return /[^\s\p{C}]/u.test(cleaned);
  };

  const decodeBufferWithFallback = (buffer: ArrayBuffer): { text: string; encoding: string } | null => {
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
  };

  const readTextWithFallback = async (file: File): Promise<{ text: string; encoding: string } | null> => {
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
  };

  async function extractZipText(file: File) {
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

  async function processFiles(fileList: FileList | File[]) {
    const files = Array.from(fileList);
    if (!files.length) return;

    const processStart = performance.now();
    logTiming("[analysis] processFiles start", { fileCount: files.length, names: files.map((f) => f.name) });

    setError(null);
    setPendingSummary(null);
    setSummary(null);
    setFileName(files.length === 1 ? files[0].name : `${files.length} files`);
    setFileCount(files.length);
    setProcessing(true);
    setAnalyzing(false);

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
  }

  function handleAnalyze() {
    if (pendingSummary) {
      // Fake a brief "analyzing" state for UX
      setAnalyzing(true);
      setTimeout(() => {
        try {
          setSummary(pendingSummary);
          setPendingSummary(null);
          setFileName(null);
        } finally {
          setAnalyzing(false);
        }
      }, 800);
    }
  }

  async function onFileChange(e: ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files?.length) return;
    await processFiles(files);
    e.target.value = "";
  }

  async function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setIsDragging(false);
    const files = e.dataTransfer.files;
    if (!files?.length) return;
    await processFiles(files);
  }

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

  function resetToUpload() {
    setSummary(null);
    setPendingSummary(null);
    setFileName(null);
    setFileCount(0);
    setError(null);
    setExportError(null);
  }

  const isReady = pendingSummary !== null && !processing && !analyzing;

  async function handleExportPdf() {
    if (!dashboardRef.current) return;
    setExportError(null);
    setExporting(true);

    try {
      const node = dashboardRef.current;
      const [{ toPng }, { jsPDF }] = await Promise.all([
        import("html-to-image"),
        import("jspdf"),
      ]);

      // Toggle export mode to show the export banner/logo and hide controls.
      node.classList.add("exporting");

      // Capture dimensions and scale safely within jsPDF limits (max 14,400 px)
      const width = Math.ceil(node.scrollWidth);
      const height = Math.ceil(node.scrollHeight + PDF_HEIGHT_BUFFER_PX);
      const scale = Math.min(PDF_MAX_SCALE, PDF_MAX_DIMENSION_PX / Math.max(width, height));
      const canvasWidth = Math.floor(width * scale);
      const canvasHeight = Math.floor(height * scale);

      const imgData = await toPng(node, {
        pixelRatio: 1,
        cacheBust: true,
        backgroundColor: getComputedStyle(document.body).backgroundColor || "#05060a",
        width,
        height,
        canvasWidth,
        canvasHeight,
        skipFonts: true,
        style: { width: `${width}px`, height: `${height}px` },
        filter: (n) => {
          const el = n as HTMLElement;
          if (el.classList?.contains("export-hide")) return false;
          return true;
        },
        // onClone is an undocumented but functional option in html-to-image
        onClone: (clonedDoc: Document) => {
          // Ensure export banner is visible in the clone
          const mainEl = clonedDoc.querySelector("main") as HTMLElement;
          if (mainEl) mainEl.classList.add("exporting");
          clonedDoc.querySelectorAll(".export-banner").forEach((el) => {
            (el as HTMLElement).style.display = "inline-flex";
          });
          // Remove remote font stylesheets to avoid CORS cssRules errors in html-to-image
          clonedDoc.querySelectorAll('link[href*="fonts.googleapis"]').forEach((el) => el.remove());
        },
      } as Parameters<typeof toPng>[1] & { onClone?: (doc: Document) => void });

      const orientation = width >= height ? "landscape" : "portrait";
      const pdf = new jsPDF({ orientation, unit: "px", format: [canvasWidth, canvasHeight], compress: true });
      pdf.addImage(imgData, "PNG", 0, 0, canvasWidth, canvasHeight, undefined, "FAST");

      // Add a clickable link over the top-left logo area
      const linkUrl = SITE_URL;

      // Measure the export banner in the source DOM to position the link accurately
      let linkX = 12;
      let linkY = 12;
      let linkWidth = Math.min(180, canvasWidth * 0.25);
      let linkHeight = 48;
      try {
        const banner = node.querySelector(".export-banner") as HTMLElement | null;
        const nodeRect = node.getBoundingClientRect();
        const bannerRect = banner?.getBoundingClientRect();
        if (bannerRect) {
          linkX = Math.max(4, (bannerRect.left - nodeRect.left) * scale);
          linkY = Math.max(4, (bannerRect.top - nodeRect.top) * scale);
          linkWidth = Math.max(40, bannerRect.width * scale);
          linkHeight = Math.max(20, bannerRect.height * scale);
        }
      } catch (e) {
        console.warn("Failed to measure export banner for PDF link", e);
      }

      pdf.link(linkX, linkY, linkWidth, linkHeight, { url: linkUrl });
      // Add a tiny invisible text link as a fallback for some readers
      pdf.setFontSize(1);
      pdf.textWithLink(" ", linkX + 1, linkY + linkHeight / 2, { url: linkUrl });
      pdf.save("whatsapp-dashboard.pdf");
    } catch (err) {
      console.error(err);
      setExportError("Failed to export PDF. Please try again.");
    } finally {
      setExporting(false);
      // Remove export class if it was added
      dashboardRef.current?.classList.remove("exporting");
    }
  }

  return (
    <main ref={dashboardRef} className="relative">
      {(processing || isReady || analyzing) && (
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
                <button className="btn" onClick={handleAnalyze}>
                  Analyze
                </button>
              </>
            )}
          </div>
        </div>
      )}
      {showColorModal && summary && (
        <div className="loading-overlay" role="dialog" aria-modal="true" aria-labelledby="color-modal-title">
          <div className="card color-modal grid-gap-md">
            <div className="color-modal-header">
              <div>
                <div className="tag">Colors</div>
                <h3 id="color-modal-title" className="color-modal-title">Configure user colors</h3>
              </div>
              <button className="btn ghost" onClick={() => setShowColorModal(false)} aria-label="Close color configuration">
                Close
              </button>
            </div>
            <div className="grid-gap-sm">
              {summary.buckets_by_person.map((p, idx) => (
                <div key={p.name} className="color-picker-row">
                  <div className="color-picker-label">
                    <span
                      className="color-swatch"
                      style={{ background: getColor(p.name, idx), width: 18, height: 18, borderRadius: 6 }}
                    />
                    <span className="font-semibold">{p.name}</span>
                  </div>
                  <input
                    type="color"
                    value={getColor(p.name, idx)}
                    onChange={(e) => setColorMap((prev) => ({ ...prev, [p.name]: e.target.value }))}
                    aria-label={`Choose color for ${p.name}`}
                    className="color-input"
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
      <section className="container grid-gap-2xl">
        <div className="dashboard-header">
          <div>
            <div className="export-banner" aria-hidden={!exporting}>
              <a href={SITE_URL} target="_blank" rel="noreferrer" className="export-banner-link">
                <span className="logo dashboard-logo">
                  <span className="text-whatsapp">WA</span> Analyzer
                </span>
                <span className="export-tagline">WhatsApp insights in seconds</span>
              </a>
            </div>
            <h2 className="dashboard-title">Dashboard</h2>
            {!hasData && (
              <p className="dashboard-subtitle">
                Drop your exported WhatsApp .txt.
              </p>
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
                      Stop-words are common filler words ("the", "and", "is", "you") we drop so the interesting terms pop in the word stats.
                    </div>
                  )}
                </div>
                <label className="switch">
                  <input 
                    type="checkbox" 
                    checked={filterStopwords} 
                    onChange={(e) => setFilterStopwords(e.target.checked)}
                    aria-label="Filter out stopwords from word statistics"
                  />
                  <span className="slider" />
                </label>
              </div>
              <button className="btn ghost" onClick={() => setShowColorModal(true)} disabled={!summary}>
                Configure colors
              </button>
              <button className="btn ghost" onClick={handleExportPdf} disabled={!summary || exporting}>
                {exporting ? "Exporting…" : "Export PDF"}
              </button>
              <button className="btn ghost" onClick={resetToUpload} disabled={processing}>
                Upload another chat
              </button>
            </div>
          )}
        </div>
        {hasData && (
          <>
            {exportError && <div className="error-text">{exportError}</div>}
            <div className="card grid-gap-md">
              <div className="tag">Timeline</div>
              <h3 className="card-header">Chat timeline</h3>
              <div className="chart-container-xl chart-full-width">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={timelineData} margin={{ left: -12, right: 8 }}>
                    <defs>
                      <linearGradient id="timelineGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#7cf9c0" stopOpacity={0.6} />
                        <stop offset="90%" stopColor="#7cf9c0" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                    <XAxis dataKey="date" tick={{ fill: "var(--muted)", fontSize: 12 }} axisLine={false} tickLine={false} minTickGap={20} />
                    <YAxis tick={{ fill: "var(--muted)", fontSize: 12 }} axisLine={false} tickLine={false} allowDecimals={false} />
                    <Tooltip contentStyle={{ background: "#0a0b0f", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12 }} cursor={{ stroke: "rgba(255,255,255,0.15)", strokeWidth: 1 }} />
                    <Area type="monotone" dataKey="messages" stroke="#7cf9c0" strokeWidth={2.5} fill="url(#timelineGradient)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
              <div className="text-muted text-xs">Message volume over time.</div>
            </div>

            <div className="card grid-gap-md">
              <div className="tag">People</div>
              <h3 className="card-header">Per-person stats</h3>
              <div className="stats-table-wrapper">
                <table className="stats-table">
                  <thead>
                    <tr>
                      <th>Person</th>
                      <th>Total words</th>
                      <th>Unique words</th>
                      <th>Avg words/msg</th>
                      <th>Longest msg (words)</th>
                      <th>Top emojis</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary?.person_stats.map((p) => (
                      <tr key={p.name}>
                        <td className="font-semibold">{p.name}</td>
                        <td>{p.total_words.toLocaleString()}</td>
                        <td>{p.unique_words.toLocaleString()}</td>
                        <td>{p.average_words_per_message.toFixed(1)}</td>
                        <td>{p.longest_message_words}</td>
                        <td>
                          <div className="emoji-list emoji-grid-5">
                            {p.top_emojis.slice(0, 10).map((e) => (
                              <span key={e.label} className="emoji-badge">
                                {e.label} <span className="text-muted">×{e.value}</span>
                              </span>
                            ))}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="grid stat-grid">
              {kpis.map((kpi) => (
                <StatCard key={kpi.label} {...kpi} />
              ))}
            </div>


            <div className="grid chart-grid">
              <ChartCard title="Hourly rhythm">
                <div className="chart-container-sm">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={hourlyStacked} barGap={-1}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                      <XAxis dataKey="hour" tickFormatter={(v) => `${v}:00`} tick={{ fill: "var(--muted)", fontSize: 12 }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fill: "var(--muted)", fontSize: 12 }} axisLine={false} tickLine={false} />
                      <Tooltip contentStyle={{ background: "#0a0b0f", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12 }} cursor={{ fill: "rgba(255,255,255,0.04)" }} />
                      {summary?.buckets_by_person.map((p, idx) => (
                        <Bar key={p.name} dataKey={p.name} radius={[6, 6, 0, 0]} fill={getColor(p.name, idx)} />
                      ))}
                      {showLegend && <Legend />}
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </ChartCard>

              <ChartCard title="Top senders" subtitle="Messages by person">
                <div className="chart-container-sm">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={senderData} dataKey="value" nameKey="name" innerRadius={60} outerRadius={90} paddingAngle={2}>
                        {senderData.map((entry, idx) => (
                          <Cell key={entry.name} fill={getColor(entry.name, idx)} />
                        ))}
                      </Pie>
                      <Tooltip content={<PieTooltip />} wrapperStyle={{ color: "#fff" }} />
                      {showLegend && <Legend />}
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </ChartCard>

              <ChartCard title="Conversation starters" subtitle="First message after inactivity">
                <div className="chart-container-md">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={conversationStartersData} margin={{ left: -10, right: 10 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                      <XAxis dataKey="name" hide axisLine={false} tickLine={false} />
                      <YAxis tick={{ fill: "var(--muted)", fontSize: 12 }} axisLine={false} tickLine={false} allowDecimals={false} />
                      <Tooltip contentStyle={{ background: "#0a0b0f", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12 }} cursor={{ fill: "rgba(255,255,255,0.04)" }} />
                      <Bar dataKey="value" name="Starts" radius={[6, 6, 0, 0]} fill="#7cf9c0">
                        <LabelList dataKey="name" position="top" fill="var(--muted)" fontSize={12} />
                        {conversationStartersData.map((entry, index) => (
                          <Cell key={entry.name} fill={getColor(entry.name, index)} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </ChartCard>

              <ChartCard title="Monthly footprint">
                <div className="chart-container-lg">
                  <ResponsiveContainer width="100%" height="100%">
                    <RadarChart data={monthlyRadar} outerRadius={showLegend ? 90 : 110}>
                      <PolarGrid stroke="rgba(255,255,255,0.08)" />
                      <PolarAngleAxis dataKey="label" tick={{ fill: "var(--muted)", fontSize: 12 }} />
                      <Tooltip contentStyle={{ background: "#0a0b0f", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12 }} />
                      {summary?.buckets_by_person.map((p, idx) => {
                        const c = getColor(p.name, idx);
                        return <Radar key={p.name} name={p.name} dataKey={p.name} stroke={c} fill={c} fillOpacity={0.35} />;
                      })}
                      {showLegend && <Legend wrapperStyle={{ fontSize: 11, maxHeight: 50, overflow: "hidden" }} />}
                    </RadarChart>
                  </ResponsiveContainer>
                </div>
              </ChartCard>

              <ChartCard title="Weekday footprint">
                <div className="chart-container-lg">
                  <ResponsiveContainer width="100%" height="100%">
                    <RadarChart data={weekdayRadar} outerRadius={showLegend ? 90 : 110}>
                      <PolarGrid stroke="rgba(255,255,255,0.08)" />
                      <PolarAngleAxis dataKey="label" tick={{ fill: "var(--muted)", fontSize: 12 }} />
                      <Tooltip contentStyle={{ background: "#0a0b0f", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12 }} />
                      {summary?.buckets_by_person.map((p, idx) => {
                        const c = getColor(p.name, idx);
                        return <Radar key={p.name} name={p.name} dataKey={p.name} stroke={c} fill={c} fillOpacity={0.35} />;
                      })}
                      {showLegend && <Legend wrapperStyle={{ fontSize: 11, maxHeight: 50, overflow: "hidden" }} />}
                    </RadarChart>
                  </ResponsiveContainer>
                </div>
              </ChartCard>
            </div>

            {hasSentiment && (
              <div className="grid chart-grid">
                <ChartCard title="Mood lanes by person" subtitle="Daily mean sentiment (−1 to 1)">
                  <div className="chart-container-md">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={sentimentLaneData} margin={{ left: -4, right: 8 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                        <XAxis dataKey="day" tick={{ fill: "var(--muted)", fontSize: 12 }} axisLine={false} tickLine={false} minTickGap={20} />
                        <YAxis domain={[-1, 1]} tick={{ fill: "var(--muted)", fontSize: 12 }} axisLine={false} tickLine={false} allowDecimals />
                        <Tooltip contentStyle={{ background: "#0a0b0f", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12 }} />
                        {sentimentOverall.map((p, idx) => (
                          <Line
                            key={p.name}
                            type="monotone"
                            dataKey={p.name}
                            stroke={getColor(p.name, idx)}
                            strokeWidth={2}
                            dot={false}
                            connectNulls
                          />
                        ))}
                        {showLegend && <Legend />}
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </ChartCard>

                <ChartCard title="Polarity mix per person" subtitle="Share of positive / neutral / negative messages">
                  <div className="chart-container-md">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={sentimentStacked}
                        margin={{ left: -10, right: 10 }}
                        onMouseMove={(state) => setActiveSentimentIndex(state?.activeTooltipIndex ?? null)}
                        onMouseLeave={() => setActiveSentimentIndex(null)}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                        <XAxis dataKey="name" tick={{ fill: "var(--muted)", fontSize: 12 }} axisLine={false} tickLine={false} />
                        <YAxis domain={[0, 100]} tickFormatter={(v) => `${v}%`} tick={{ fill: "var(--muted)", fontSize: 12 }} axisLine={false} tickLine={false} />
                        <Tooltip
                          contentStyle={{ background: "#0a0b0f", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12 }}
                          formatter={(v: number) => `${v}%`}
                          cursor={{ fill: "rgba(255,255,255,0.04)" }}
                        />
                        <Bar dataKey="pos" stackId="sent" name="Positive" radius={[4, 4, 0, 0]} fill="#7cf9c0">
                          {sentimentStacked.map((entry, idx) => (
                            <Cell key={`${entry.name}-pos`} opacity={sentimentOpacity(idx)} />
                          ))}
                        </Bar>
                        <Bar dataKey="neu" stackId="sent" name="Neutral" radius={[0, 0, 0, 0]} fill="#ffd166">
                          {sentimentStacked.map((entry, idx) => (
                            <Cell key={`${entry.name}-neu`} opacity={sentimentOpacity(idx)} />
                          ))}
                        </Bar>
                        <Bar dataKey="neg" stackId="sent" name="Negative" radius={[0, 0, 4, 4]} fill="#ff7edb">
                          {sentimentStacked.map((entry, idx) => (
                            <Cell key={`${entry.name}-neg`} opacity={sentimentOpacity(idx)} />
                          ))}
                        </Bar>
                        <Legend wrapperStyle={{ fontSize: 12 }} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </ChartCard>

                <ChartCard title="Overall mood drift" subtitle="Weighted by message volume">
                  <div className="chart-container-sm">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={sentimentTimeline} margin={{ left: -8, right: 8 }}>
                        <defs>
                          <linearGradient id="sentimentGradient" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#64d8ff" stopOpacity={0.55} />
                            <stop offset="100%" stopColor="#64d8ff" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                        <XAxis dataKey="day" tick={{ fill: "var(--muted)", fontSize: 12 }} axisLine={false} tickLine={false} minTickGap={16} />
                        <YAxis domain={[-1, 1]} tick={{ fill: "var(--muted)", fontSize: 12 }} axisLine={false} tickLine={false} />
                        <Tooltip contentStyle={{ background: "#0a0b0f", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12 }} />
                        <Area type="monotone" dataKey="mean" stroke="#64d8ff" strokeWidth={2.5} fill="url(#sentimentGradient)" />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </ChartCard>
              </div>
            )}

            <div className="grid-gap-lg">
              <div className="card grid-gap-sm">
                <div className="tag">By person</div>
                <h3 className="card-header">Top phrases per sender</h3>
                {perPersonPhrases.length === 0 ? (
                  <div className="text-muted">No phrases yet.</div>
                ) : (
                  <div className="phrases-grid">
                    {perPersonPhrases.map((person) => (
                      <div key={person.name} className="phrase-person-card">
                        <div className="phrase-person-header">
                          <span className="font-bold">{person.name}</span>
                          <span className="text-muted text-xs">Top {Math.min(person.phrases.length, 5)}</span>
                        </div>
                        {person.phrases.length === 0 ? (
                          <span className="text-muted text-sm">No phrases</span>
                        ) : (
                          <div className="phrase-list">
                            {person.phrases.slice(0, 5).map((p, idx) => (
                              <div key={p.label + idx} className="phrase-item">
                                <span className="text-muted font-semibold">#{idx + 1}</span>
                                <span className="font-semibold">{p.label}</span>
                                <span className="text-right text-muted">{p.value.toLocaleString()}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="card grid-gap-sm min-h-card">
                <div className="tag">Word cloud</div>
                <h3 className="card-header">Most common words</h3>
                <WordCloud words={wordCloud} colors={colors} height={320} />
              </div>
              <div className="card grid-gap-sm min-h-card">
                <div className="tag">Emoji cloud</div>
                <h3 className="card-header">Most used emojis</h3>
                <EmojiCloud words={emojiCloud} height={320} />
              </div>
            </div>

            {/* Journey Through Your Messages */}
            {summary?.journey && (
              <div className="card journey-section">
                <h2 className="journey-title">
                  Journey Through Your Messages
                </h2>

                {/* Overview stats */}
                <div className="journey-highlights">
                  <div className="flex-col-end">
                    <div className="journey-highlight-value text-primary">
                      {summary.journey.total_messages.toLocaleString()}
                    </div>
                    <div className="journey-highlight-label">messages</div>
                  </div>
                  <div className="flex-col-end">
                    <div className="journey-highlight-value text-accent">
                      {summary.journey.total_days.toLocaleString()}
                    </div>
                    <div className="journey-highlight-label">days</div>
                  </div>
                  <div className="flex-col-end">
                    <div className="journey-highlight-value nowrap">
                      {summary.journey.first_day}
                    </div>
                    <div className="journey-highlight-label">first message</div>
                  </div>
                  <div className="flex-col-end">
                    <div className="journey-highlight-value nowrap">
                      {summary.journey.last_day}
                    </div>
                    <div className="journey-highlight-label">last message</div>
                  </div>
                </div>

                {/* First message */}
                <div className="journey-subsection">
                  <h3 className="journey-subsection-title">
                    Where it all began
                  </h3>
                  <p className="journey-subsection-desc">
                    Your conversation started with:
                  </p>
                  <div className="journey-moment-card">
                    <div>
                      {summary.journey.first_messages.map((msg, idx) => (
                        <MessageBubble
                          key={idx}
                          message={msg}
                          senderColor={colorMap[msg.sender] || colors[idx % colors.length]}
                        />
                      ))}
                    </div>
                  </div>
                </div>

                {/* Interesting moments */}
                {summary.journey.interesting_moments.length > 0 && (
                  <div className="journey-subsection">
                    <h3 className="journey-moments-title">
                      Memorable moments
                    </h3>
                    <div className="grid-gap-xl">
                      {summary.journey.interesting_moments.map((moment, idx) => (
                        <div key={idx} className="journey-moment-card">
                          <div className="journey-moment-header">
                            <div className="journey-moment-title">{moment.title}</div>
                            <div className="journey-moment-desc">{moment.description}</div>
                          </div>
                          <div>
                            {moment.messages.map((msg, msgIdx) => (
                              <MessageBubble
                                key={msgIdx}
                                message={msg}
                                senderColor={colorMap[msg.sender] || colors[msgIdx % colors.length]}
                              />
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Last message */}
                <div className="journey-subsection">
                  <h3 className="journey-subsection-title">
                    The latest chapter
                  </h3>
                  <p className="journey-subsection-desc">
                    Your most recent messages:
                  </p>
                  <div className="journey-moment-card">
                    <div>
                      {summary.journey.last_messages.map((msg, idx) => (
                        <MessageBubble
                          key={idx}
                          message={msg}
                          senderColor={colorMap[msg.sender] || colors[idx % colors.length]}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        {!hasData && (
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
                  <span className="file-info">
                    or drag & drop
                  </span>
                </div>
                {error && <span className="error-text">{error}</span>}
              </div>
              <details
                open={showExportHelp}
                onToggle={(e) => setShowExportHelp((e.target as HTMLDetailsElement).open)}
                className="instructions-toggle"
              >
                <summary className="text-muted text-md">
                  How do I export my chats?
                </summary>
                <div className="instructions-content">
                  <div>
                    <strong className="mb-sm d-block">iPhone</strong>
                    <ol className="instructions-list">
                      <li>Open the chat, tap its name to enter Chat Info.</li>
                      <li>Scroll to the bottom, tap <strong className="text-white">Export Chat</strong>.</li>
                      <li>Choose <strong className="text-white">Without Media</strong> and save/share the TXT.</li>
                    </ol>
                  </div>
                  <div>
                    <strong className="mb-sm d-block">Android</strong>
                    <ol className="instructions-list">
                      <li>Open the chat, tap ⋮ → More → Export chat.</li>
                      <li>Pick <strong className="text-white">Without Media</strong> to keep the file small.</li>
                      <li>Save the TXT, then upload it here.</li>
                    </ol>
                  </div>
                </div>
              </details>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}

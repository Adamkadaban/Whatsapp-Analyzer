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

// Enable performance timing logs only in dev mode.
const DEBUG_TIMING = import.meta.env.DEV;
function logTiming(label: string, data: Record<string, unknown>) {
  if (DEBUG_TIMING) {
    console.info(label, data);
  }
}

const colors = ["#64d8ff", "#ff7edb", "#8c7bff", "#7cf9c0", "#ffb347", "#ff6b6b", "#ffd166", "#06d6a0", "#118ab2", "#ef476f"];
const MAX_LEGEND_SENDERS = 6;
const monthLabels = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const weekdayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

type DailyDatum = { day: string; messages: number };
type KpiDatum = { label: string; value: string; detail?: string };

/** Format ISO timestamp to readable time */
function formatMessageTime(timestamp: string): string {
  const date = new Date(timestamp);
  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

/** WhatsApp-style message bubble */
function MessageBubble({ message, senderColor }: { message: JourneyMessage; senderColor: string }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: message.is_you ? "flex-end" : "flex-start",
        marginBottom: 8,
      }}
    >
      <div
        style={{
          maxWidth: "80%",
          padding: "8px 12px",
          borderRadius: message.is_you ? "16px 16px 4px 16px" : "16px 16px 16px 4px",
          background: message.is_you
            ? "linear-gradient(135deg, #005c4b, #004d40)"
            : "rgba(255,255,255,0.08)",
          border: "1px solid rgba(255,255,255,0.06)",
          position: "relative",
        }}
      >
        <div style={{ fontWeight: 600, fontSize: 13, color: senderColor, marginBottom: 2 }}>
          {message.sender}
        </div>
        <div style={{ fontSize: 14, lineHeight: 1.4, wordBreak: "break-word" }}>{message.text}</div>
        <div
          style={{
            fontSize: 11,
            color: "rgba(255,255,255,0.5)",
            marginTop: 4,
            textAlign: "right",
          }}
        >
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

  // Parse YYYY-MM-DD as local date (not UTC) to avoid timezone shifts
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

  const longestStreakData = useMemo(() => {
    if (!dailyData.length) return { days: 0, start: "", end: "" };
    const sorted = [...dailyData].sort((a, b) => parseLocalDate(a.day).getTime() - parseLocalDate(b.day).getTime());
    let maxStreak = 1;
    let currentStreak = 1;
    let maxStart = 0;
    let maxEnd = 0;
    let currentStart = 0;
    const oneDay = 24 * 60 * 60 * 1000;
    for (let i = 1; i < sorted.length; i++) {
      const prev = parseLocalDate(sorted[i - 1].day).getTime();
      const curr = parseLocalDate(sorted[i].day).getTime();
      if (curr - prev === oneDay) {
        currentStreak++;
        if (currentStreak > maxStreak) {
          maxStreak = currentStreak;
          maxStart = currentStart;
          maxEnd = i;
        }
      } else {
        currentStreak = 1;
        currentStart = i;
      }
    }
    return {
      days: maxStreak,
      start: sorted[maxStart]?.day ?? "",
      end: sorted[maxEnd]?.day ?? sorted[maxStart]?.day ?? "",
    };
  }, [dailyData]);

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
          value: busiestDay ? formatDayLabel(busiestDay.day) : "–",
          detail: busiestDay ? `${busiestDay.messages.toLocaleString()} ${busiestDay.messages === 1 ? "message" : "messages"}` : "",
        },
        {
          label: "Quietest day",
          value: quietestDay ? formatDayLabel(quietestDay.day) : "–",
          detail: quietestDay ? `${quietestDay.messages.toLocaleString()} ${quietestDay.messages === 1 ? "message" : "messages"}` : "",
        },
        {
          label: "Longest streak",
          value: `${longestStreakData.days} ${longestStreakData.days === 1 ? "day" : "days"}`,
          detail: longestStreakData.start ? `${formatDayLabel(longestStreakData.start)} – ${formatDayLabel(longestStreakData.end)}` : "",
        },
        {
          label: "Conversation starts",
          value: topStarter?.label ?? "–",
          detail: `${topStarter?.label ?? "–"} started ${topStarterShare}% of conversations`,
        },
        {
          label: "Top emoji",
          value: summary.top_emojis[0]?.label ?? "–",
          detail: `${summary.top_emojis[0]?.value ?? 0} uses`,
        },
        {
          label: "Top word",
          value: (filterStopwords ? summary.top_words : summary.top_words_no_stop)[0]?.label ?? "–",
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
    return monthLabels.map((label, idx) => {
      const row: Record<string, number | string> = { label };
      summary.buckets_by_person.forEach((p) => {
        row[p.name] = p.monthly[idx];
      });
      return row;
    });
  }, [summary]);

  const weekdayRadar = useMemo(() => {
    if (!summary) return [];
    return weekdayLabels.map((label, idx) => {
      const row: Record<string, number | string> = { label };
      summary.buckets_by_person.forEach((p) => {
        row[p.name] = p.daily[idx];
      });
      return row;
    });
  }, [summary]);

  const wordCloud = summary ? (filterStopwords ? summary.word_cloud : summary.word_cloud_no_stop) : [];
  const emojiCloud = summary?.emoji_cloud ?? [];
  const _topPhrases = summary
    ? (filterStopwords ? summary.top_phrases : summary.top_phrases_no_stop).slice(0, 15)
    : [];
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
    const log = (...args: unknown[]) => console.info(prefix, ...args);
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

      const imgData = await toPng(node, {
        pixelRatio: 2,
        cacheBust: true,
        backgroundColor: getComputedStyle(document.body).backgroundColor || "#05060a",
        filter: (n) => {
          const el = n as HTMLElement;
          if (el.classList?.contains("export-hide")) return false;
          return true;
        },
        // onClone is an undocumented but functional option in html-to-image
        onClone: (clonedDoc: Document) => {
          clonedDoc.querySelectorAll(".export-banner").forEach((el) => {
            (el as HTMLElement).style.display = "inline-flex";
          });
        },
      } as Parameters<typeof toPng>[1] & { onClone?: (doc: Document) => void });

      const { width, height } = node.getBoundingClientRect();
      const orientation = width >= height ? "landscape" : "portrait";
      const pdf = new jsPDF({ orientation, unit: "px", format: [width, height], compress: true });
      pdf.addImage(imgData, "PNG", 0, 0, width, height, undefined, "FAST");
      pdf.save("whatsapp-dashboard.pdf");
    } catch (err) {
      console.error(err);
      setExportError("Failed to export PDF. Please try again.");
    } finally {
      setExporting(false);
    }
  }

  return (
    <main ref={dashboardRef}>
      {(processing || isReady || analyzing) && (
        <div className="loading-overlay" role="status" aria-live="polite">
          <div className="loading-card">
            {processing && (
              <>
                <div className="spinner" aria-hidden="true" />
                <div style={{ fontWeight: 700, fontSize: 18, marginBottom: 6 }}>
                  {processingElapsed >= 30
                    ? "This is taking a while - you must text a lot!"
                    : processingElapsed >= 10
                      ? "Just a few more seconds…"
                      : fileCount > 1
                        ? "Loading files…"
                        : "Loading file…"}
                </div>
                <div style={{ color: "var(--muted)" }}>{fileName}</div>
              </>
            )}
            {analyzing && (
              <>
                <div className="spinner" aria-hidden="true" />
                <div style={{ fontWeight: 700, fontSize: 18, marginBottom: 6 }}>Analyzing your chat…</div>
                <div style={{ color: "var(--muted)" }}>This will only take a moment.</div>
              </>
            )}
            {isReady && (
              <>
                <div style={{ fontSize: 32, marginBottom: 12 }}>📄</div>
                <div style={{ fontWeight: 700, fontSize: 18, marginBottom: 6 }}>{fileName}</div>
                <div style={{ color: "var(--muted)", marginBottom: 16 }}>Ready to analyze</div>
                <button className="btn" onClick={handleAnalyze}>
                  Analyze
                </button>
              </>
            )}
          </div>
        </div>
      )}
      {showColorModal && summary && (
        <div className="loading-overlay" role="dialog" aria-modal="true">
          <div className="card" style={{ maxWidth: 520, width: "90%", padding: 20, display: "grid", gap: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div className="tag">Colors</div>
                <h3 style={{ margin: "4px 0" }}>Configure user colors</h3>
              </div>
              <button className="btn ghost" onClick={() => setShowColorModal(false)}>
                Close
              </button>
            </div>
            <div style={{ display: "grid", gap: 10 }}>
              {summary.buckets_by_person.map((p, idx) => (
                <div key={p.name} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span
                      style={{
                        width: 18,
                        height: 18,
                        borderRadius: 6,
                        background: getColor(p.name, idx),
                        border: "1px solid rgba(255,255,255,0.15)",
                        display: "inline-block",
                      }}
                    />
                    <span style={{ fontWeight: 600 }}>{p.name}</span>
                  </div>
                  <input
                    type="color"
                    value={getColor(p.name, idx)}
                    onChange={(e) => setColorMap((prev) => ({ ...prev, [p.name]: e.target.value }))}
                    style={{ width: 70, height: 32, border: "1px solid rgba(255,255,255,0.15)", borderRadius: 8, background: "transparent" }}
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
      <section className="container" style={{ display: "grid", gap: "24px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: "16px", alignItems: "center", flexWrap: "wrap" }}>
          <div>
            <div className="export-banner" aria-hidden={!exporting}>
              <a href="https://wa.hackback.zip" target="_blank" rel="noreferrer" className="export-banner-link">
                <span className="logo" style={{ fontSize: 18 }}>
                  <span style={{ color: "#25d366" }}>WA</span> Analyzer
                </span>
                <span className="export-tagline">WhatsApp insights in seconds</span>
              </a>
            </div>
            <h2 style={{ margin: "8px 0" }}>Dashboard</h2>
            {!hasData && (
              <p style={{ color: "var(--muted)", margin: 0 }}>
                Drop your exported WhatsApp .txt.
              </p>
            )}
          </div>
          {hasData && (
            <div style={{ display: "flex", gap: 12, alignItems: "center" }} className="export-hide">
              <div className="switch-row">
                <div style={{ position: "relative", display: "flex", alignItems: "center", gap: 6 }}>
                  <span
                    onMouseEnter={() => setShowStopTooltip(true)}
                    onMouseLeave={() => setShowStopTooltip(false)}
                    onFocus={() => setShowStopTooltip(true)}
                    onBlur={() => setShowStopTooltip(false)}
                    style={{ display: "inline-flex", alignItems: "center" }}
                  >
                    Filter stop-words
                  </span>
                  {showStopTooltip && (
                    <div
                      role="tooltip"
                      style={{
                        position: "absolute",
                        top: "calc(100% + 6px)",
                        left: 0,
                        minWidth: 260,
                        maxWidth: 320,
                        padding: "10px 12px",
                        borderRadius: 12,
                        background: "linear-gradient(135deg, #0d1117, #131a24)",
                        border: "1px solid rgba(255,255,255,0.12)",
                        boxShadow: "0 12px 32px rgba(0,0,0,0.35)",
                        color: "#fff",
                        fontSize: 13,
                        lineHeight: 1.4,
                        zIndex: 10,
                      }}
                    >
                      Stop-words are common filler words ("the", "and", "is", "you") we drop so the interesting terms pop in the word stats.
                    </div>
                  )}
                </div>
                <label className="switch">
                  <input type="checkbox" checked={filterStopwords} onChange={(e) => setFilterStopwords(e.target.checked)} />
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
            {exportError && <div style={{ color: "#ff7edb" }}>{exportError}</div>}
            <div className="card" style={{ display: "grid", gap: 12 }}>
              <div className="tag">Timeline</div>
              <h3 style={{ margin: 0 }}>Chat timeline</h3>
              <div style={{ height: 360, width: "100%" }}>
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
              <div style={{ color: "var(--muted)", fontSize: 12 }}>Message volume over time.</div>
            </div>

            <div className="card" style={{ display: "grid", gap: 12 }}>
              <div className="tag">People</div>
              <h3 style={{ margin: 0 }}>Per-person stats</h3>
              <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 600 }}>
                  <thead>
                    <tr style={{ color: "var(--muted)", textAlign: "left" }}>
                      <th style={{ padding: "8px 6px" }}>Person</th>
                      <th style={{ padding: "8px 6px" }}>Total words</th>
                      <th style={{ padding: "8px 6px" }}>Unique words</th>
                      <th style={{ padding: "8px 6px" }}>Avg words/msg</th>
                      <th style={{ padding: "8px 6px" }}>Longest msg (words)</th>
                      <th style={{ padding: "8px 6px" }}>Top emojis</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary?.person_stats.map((p, idx) => (
                      <tr key={p.name} style={{ background: idx % 2 === 0 ? "rgba(255,255,255,0.02)" : "transparent" }}>
                        <td style={{ padding: "8px 6px", fontWeight: 600 }}>{p.name}</td>
                        <td style={{ padding: "8px 6px" }}>{p.total_words.toLocaleString()}</td>
                        <td style={{ padding: "8px 6px" }}>{p.unique_words.toLocaleString()}</td>
                        <td style={{ padding: "8px 6px" }}>{p.average_words_per_message.toFixed(1)}</td>
                        <td style={{ padding: "8px 6px" }}>{p.longest_message_words}</td>
                        <td style={{ padding: "8px 6px" }}>
                          <div style={{ 
                            display: "grid", 
                            gridTemplateColumns: "repeat(5, auto)", 
                            gap: 6, 
                            justifyContent: "start",
                            width: "fit-content"
                          }}>
                            {p.top_emojis.slice(0, 10).map((e) => (
                              <span key={e.label} style={{ 
                                padding: "4px 8px", 
                                borderRadius: 8, 
                                background: "rgba(255,255,255,0.05)",
                                fontSize: 14,
                                whiteSpace: "nowrap"
                              }}>
                                {e.label} <span style={{ color: "var(--muted)" }}>×{e.value}</span>
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
                <div style={{ height: 240 }}>
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
                <div style={{ height: 240 }}>
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
                <div style={{ height: 260 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={conversationStartersData} margin={{ left: -10, right: 10 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                      <XAxis dataKey="name" hide axisLine={false} tickLine={false} />
                      <YAxis tick={{ fill: "var(--muted)", fontSize: 12 }} axisLine={false} tickLine={false} allowDecimals={false} />
                      <Tooltip contentStyle={{ background: "#0a0b0f", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12 }} cursor={{ fill: "rgba(255,255,255,0.04)" }} />
                      <Bar dataKey="value" name="Starts" radius={[6, 6, 0, 0]} fill="#7cf9c0">
                        <LabelList dataKey="name" position="top" fill="var(--muted)" style={{ fontSize: 12 }} />
                        {conversationStartersData.map((entry, index) => (
                          <Cell key={entry.name} fill={getColor(entry.name, index)} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </ChartCard>

              <ChartCard title="Monthly footprint">
                <div style={{ height: 280 }}>
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
                <div style={{ height: 280 }}>
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
                  <div style={{ height: 260 }}>
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
                  <div style={{ height: 260 }}>
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
                  <div style={{ height: 240 }}>
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

            <div style={{ display: "grid", gap: 16 }}>
              <div className="card" style={{ display: "grid", gap: 10 }}>
                <div className="tag">By person</div>
                <h3 style={{ margin: 0 }}>Top phrases per sender</h3>
                {perPersonPhrases.length === 0 ? (
                  <div style={{ color: "var(--muted)" }}>No phrases yet.</div>
                ) : (
                  <div style={{ display: "grid", gap: 10 }}>
                    {perPersonPhrases.map((person) => (
                      <div
                        key={person.name}
                        style={{
                          display: "grid",
                          gap: 6,
                          padding: "10px 12px",
                          borderRadius: 12,
                          background: "rgba(255,255,255,0.02)",
                          border: "1px solid rgba(255,255,255,0.05)",
                        }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                          <span style={{ fontWeight: 700 }}>{person.name}</span>
                          <span style={{ color: "var(--muted)", fontSize: 12 }}>Top {Math.min(person.phrases.length, 5)}</span>
                        </div>
                        {person.phrases.length === 0 ? (
                          <span style={{ color: "var(--muted)", fontSize: 13 }}>No phrases</span>
                        ) : (
                          <div style={{ display: "grid", gap: 6 }}>
                            {person.phrases.slice(0, 5).map((p, idx) => (
                              <div
                                key={p.label + idx}
                                style={{
                                  display: "grid",
                                  gridTemplateColumns: "auto 1fr auto",
                                  gap: 8,
                                  padding: "6px 8px",
                                  borderRadius: 10,
                                  background: "rgba(255,255,255,0.02)",
                                  border: "1px solid rgba(255,255,255,0.04)",
                                }}
                              >
                                <span style={{ color: "var(--muted)", fontWeight: 600 }}>#{idx + 1}</span>
                                <span style={{ fontWeight: 600 }}>{p.label}</span>
                                <span style={{ textAlign: "right", color: "var(--muted)" }}>{p.value.toLocaleString()}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="card" style={{ display: "grid", gap: 10, minHeight: 320 }}>
                <div className="tag">Word cloud</div>
                <h3 style={{ margin: 0 }}>Most common words</h3>
                <WordCloud words={wordCloud} colors={colors} height={320} />
              </div>
              <div className="card" style={{ display: "grid", gap: 10, minHeight: 320 }}>
                <div className="tag">Emoji cloud</div>
                <h3 style={{ margin: 0 }}>Most used emojis</h3>
                <EmojiCloud words={emojiCloud} height={320} />
              </div>
            </div>

            {/* Journey Through Your Messages */}
            {summary?.journey && (
              <div className="card" style={{ marginTop: 24 }}>
                <h2 style={{ margin: "0 0 24px 0", fontSize: 28, fontWeight: 700 }}>
                  Journey Through Your Messages
                </h2>

                {/* Overview stats */}
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 32,
                    marginBottom: 32,
                    padding: "20px 32px",
                    background: "rgba(255,255,255,0.03)",
                    borderRadius: 16,
                    border: "1px solid rgba(255,255,255,0.06)",
                  }}
                >
                  <div style={{ textAlign: "center", display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
                    <div style={{ fontSize: 32, fontWeight: 700, color: "#64d8ff" }}>
                      {summary.journey.total_messages.toLocaleString()}
                    </div>
                    <div style={{ color: "var(--muted)", fontSize: 13 }}>messages</div>
                  </div>
                  <div style={{ textAlign: "center", display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
                    <div style={{ fontSize: 32, fontWeight: 700, color: "#ff7edb" }}>
                      {summary.journey.total_days.toLocaleString()}
                    </div>
                    <div style={{ color: "var(--muted)", fontSize: 13 }}>days</div>
                  </div>
                  <div style={{ textAlign: "center", display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
                    <div style={{ fontSize: 32, fontWeight: 700, color: "var(--text)", whiteSpace: "nowrap" }}>
                      {summary.journey.first_day}
                    </div>
                    <div style={{ color: "var(--muted)", fontSize: 13 }}>first message</div>
                  </div>
                  <div style={{ textAlign: "center", display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
                    <div style={{ fontSize: 32, fontWeight: 700, color: "var(--text)", whiteSpace: "nowrap" }}>
                      {summary.journey.last_day}
                    </div>
                    <div style={{ color: "var(--muted)", fontSize: 13 }}>last message</div>
                  </div>
                </div>

                {/* First message */}
                <div style={{ marginBottom: 32 }}>
                  <h3 style={{ margin: "0 0 12px 0", fontSize: 18 }}>
                    Where it all began
                  </h3>
                  <p style={{ color: "var(--muted)", margin: "0 0 12px 0", fontSize: 14 }}>
                    Your conversation started with:
                  </p>
                  <div
                    style={{
                      background: "rgba(255,255,255,0.02)",
                      borderRadius: 16,
                      padding: 16,
                      border: "1px solid rgba(255,255,255,0.06)",
                    }}
                  >
                    {summary.journey.first_messages.map((msg, idx) => (
                      <MessageBubble
                        key={idx}
                        message={msg}
                        senderColor={colorMap[msg.sender] || colors[idx % colors.length]}
                      />
                    ))}
                  </div>
                </div>

                {/* Interesting moments */}
                {summary.journey.interesting_moments.length > 0 && (
                  <div style={{ marginBottom: 32 }}>
                    <h3 style={{ margin: "0 0 16px 0", fontSize: 18 }}>
                      Memorable moments
                    </h3>
                    <div style={{ display: "grid", gap: 20 }}>
                      {summary.journey.interesting_moments.map((moment, idx) => (
                        <div
                          key={idx}
                          style={{
                            background: "rgba(255,255,255,0.02)",
                            borderRadius: 16,
                            padding: 16,
                            border: "1px solid rgba(255,255,255,0.06)",
                          }}
                        >
                          <div style={{ marginBottom: 12 }}>
                            <div style={{ fontWeight: 700, fontSize: 16 }}>{moment.title}</div>
                            <div style={{ color: "var(--muted)", fontSize: 13 }}>{moment.description}</div>
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
                <div>
                  <h3 style={{ margin: "0 0 12px 0", fontSize: 18 }}>
                    The latest chapter
                  </h3>
                  <p style={{ color: "var(--muted)", margin: "0 0 12px 0", fontSize: 14 }}>
                    Your most recent messages:
                  </p>
                  <div
                    style={{
                      background: "rgba(255,255,255,0.02)",
                      borderRadius: 16,
                      padding: 16,
                      border: "1px solid rgba(255,255,255,0.06)",
                    }}
                  >
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
            )}
          </>
        )}

        {!hasData && (
          <div id="upload" className="card" style={{ display: "grid", gap: "10px" }}>
            <h3 style={{ margin: 0 }}>Upload your chat to see insights</h3>
            <p style={{ color: "var(--muted)", margin: 0 }}>
              No uploads leave your device. Processing happens locally and privately.
            </p>
            <div style={{ display: "grid", gap: 12 }}>
              <div
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onDragEnter={handleDragEnter}
                onDragLeave={handleDragLeave}
                style={{
                  border: isDragging ? "1px dashed rgba(255,255,255,0.5)" : "1px dashed rgba(255,255,255,0.2)",
                  borderRadius: 12,
                  padding: 16,
                  display: "flex",
                  flexDirection: "column",
                  gap: 8,
                  background: isDragging ? "rgba(255,255,255,0.06)" : "rgba(255,255,255,0.02)",
                  boxShadow: isDragging ? "inset 0 0 0 1px rgba(255,255,255,0.08)" : "none",
                  transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
                }}
              >
                <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
                  <label
                    className="btn"
                    style={{
                      cursor: "pointer",
                      background: "rgba(100, 216, 255, 0.18)",
                      color: "white",
                      boxShadow: "0 8px 24px rgba(100, 216, 255, 0.25)",
                      border: "1px solid rgba(100, 216, 255, 0.35)",
                      fontWeight: 700,
                    }}
                  >
                    Upload .txt file or a zip file
                    <input
                      type="file"
                      accept=".txt,.zip"
                      multiple
                      style={{ display: "none" }}
                      onChange={onFileChange}
                    />
                  </label>
                  <span style={{ color: "var(--muted)", fontSize: 14 }}>
                    or drag & drop
                  </span>
                </div>
                {error && <span style={{ color: "#ff7edb" }}>{error}</span>}
              </div>
              <details
                open={showExportHelp}
                onToggle={(e) => setShowExportHelp((e.target as HTMLDetailsElement).open)}
                style={{ marginTop: 8 }}
              >
                <summary
                  style={{
                    cursor: "pointer",
                    color: "var(--muted)",
                    fontSize: 14,
                    userSelect: "none",
                  }}
                >
                  How do I export my chats?
                </summary>
                <div
                  style={{
                    marginTop: 12,
                    display: "grid",
                    gap: 16,
                    gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
                  }}
                >
                  <div>
                    <strong style={{ display: "block", marginBottom: 6 }}>iPhone</strong>
                    <ol style={{ lineHeight: 1.6, paddingLeft: 20, margin: 0, color: "var(--muted)" }}>
                      <li>Open the chat, tap its name to enter Chat Info.</li>
                      <li>Scroll to the bottom, tap <strong style={{ color: "#fff" }}>Export Chat</strong>.</li>
                      <li>Choose <strong style={{ color: "#fff" }}>Without Media</strong> and save/share the TXT.</li>
                    </ol>
                  </div>
                  <div>
                    <strong style={{ display: "block", marginBottom: 6 }}>Android</strong>
                    <ol style={{ lineHeight: 1.6, paddingLeft: 20, margin: 0, color: "var(--muted)" }}>
                      <li>Open the chat, tap ⋮ → More → Export chat.</li>
                      <li>Pick <strong style={{ color: "#fff" }}>Without Media</strong> to keep the file small.</li>
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

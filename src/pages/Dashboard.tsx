import { useEffect, useMemo, useState, type ChangeEvent, type DragEvent } from "react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, LabelList, Line, LineChart, Pie, PieChart, PolarAngleAxis, PolarGrid, Radar, RadarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import WordCloud from "../components/WordCloud";
import EmojiCloud from "../components/EmojiCloud";
import ChartCard from "../components/ChartCard";
import PieTooltip, { type SenderDatum } from "../components/PieTooltip";
import StatCard from "../components/StatCard";
import { analyzeText, type Summary } from "../lib/wasm";

type DailyStackDatum = Record<string, number | string>;

const colors = ["#64d8ff", "#ff7edb", "#8c7bff", "#7cf9c0", "#ffb347", "#ff6b6b", "#ffd166", "#06d6a0", "#118ab2", "#ef476f"];
const monthLabels = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const weekdayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

type DailyDatum = { day: string; messages: number };
type KpiDatum = { label: string; value: string; detail?: string };


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

  const hasData = Boolean(summary);

  const senderData: SenderDatum[] = summary
    ? summary.by_sender.slice(0, 6).map((s) => ({ name: s.label, value: s.value }))
    : [];

  const dailyData: DailyDatum[] = summary
    ? summary.daily.map((d) => ({ day: d.label, messages: d.value }))
    : [];

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

  const sentimentByDay = summary?.sentiment_by_day ?? [];
  const sentimentOverall = summary?.sentiment_overall ?? [];

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
  const [analyzing, setAnalyzing] = useState(false);

  async function processFile(file: File) {
    setError(null);
    setPendingSummary(null);
    setSummary(null);
    setFileName(file.name);
    setProcessing(true);
    setAnalyzing(false);

    try {
      if (file.size === 0) {
        throw new Error("This file is empty. Export again and try.");
      }

      const text = await file.text();
      if (!text.trim()) {
        throw new Error("No text found in this export.");
      }

      const res = await analyzeText(text);
      setPendingSummary(res);
    } catch (err) {
      console.error(err);
      const message = err instanceof Error ? err.message : "Failed to analyze chat. Please try another file.";
      setError(message);
      setFileName(null);
    } finally {
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
    const file = e.target.files?.[0];
    if (!file) return;
    await processFile(file);
  }

  async function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    await processFile(file);
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
    setError(null);
  }

  const isReady = pendingSummary !== null && !processing && !analyzing;

  return (
    <main>
      {(processing || isReady || analyzing) && (
        <div className="loading-overlay" role="status" aria-live="polite">
          <div className="loading-card">
            {processing && (
              <>
                <div className="spinner" aria-hidden="true" />
                <div style={{ fontWeight: 700, fontSize: 18, marginBottom: 6 }}>Loading file…</div>
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
            <h2 style={{ margin: "8px 0" }}>Dashboard</h2>
            {!hasData && (
              <p style={{ color: "var(--muted)", margin: 0 }}>
                Drop your exported WhatsApp .txt.
              </p>
            )}
          </div>
          {hasData && (
            <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
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
              <button className="btn ghost" onClick={resetToUpload} disabled={processing}>
                Upload another chat
              </button>
            </div>
          )}
        </div>
        {hasData && (
          <>
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
              <div>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
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
                    {summary.person_stats.map((p, idx) => (
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
                      {summary.buckets_by_person.map((p, idx) => (
                        <Bar key={p.name} dataKey={p.name} radius={[6, 6, 0, 0]} fill={getColor(p.name, idx)} />
                      ))}
                      <Legend />
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
                      <Legend />
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
                    <RadarChart data={monthlyRadar} outerRadius={90}>
                      <PolarGrid stroke="rgba(255,255,255,0.08)" />
                      <PolarAngleAxis dataKey="label" tick={{ fill: "var(--muted)", fontSize: 12 }} />
                      <Tooltip contentStyle={{ background: "#0a0b0f", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12 }} />
                      {summary.buckets_by_person.map((p, idx) => {
                        const c = getColor(p.name, idx);
                        return <Radar key={p.name} name={p.name} dataKey={p.name} stroke={c} fill={c} fillOpacity={0.35} />;
                      })}
                      <Legend />
                    </RadarChart>
                  </ResponsiveContainer>
                </div>
              </ChartCard>

              <ChartCard title="Weekday footprint">
                <div style={{ height: 280 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <RadarChart data={weekdayRadar} outerRadius={90}>
                      <PolarGrid stroke="rgba(255,255,255,0.08)" />
                      <PolarAngleAxis dataKey="label" tick={{ fill: "var(--muted)", fontSize: 12 }} />
                      <Tooltip contentStyle={{ background: "#0a0b0f", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12 }} />
                      {summary.buckets_by_person.map((p, idx) => {
                        const c = getColor(p.name, idx);
                        return <Radar key={p.name} name={p.name} dataKey={p.name} stroke={c} fill={c} fillOpacity={0.35} />;
                      })}
                      <Legend />
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
                        <Legend />
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
                        <Legend />
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
          </>
        )}

        {!hasData && (
          <div id="upload" className="card" style={{ display: "grid", gap: "10px" }}>
            <div className="tag">Upload</div>
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
                    Choose .txt export
                    <input type="file" accept="text/plain,.txt" style={{ display: "none" }} onChange={onFileChange} />
                  </label>
                  <span style={{ color: "var(--muted)", fontSize: 14 }}>
                    ...or drag & drop your WhatsApp export here
                  </span>
                </div>
                {error && <span style={{ color: "#ff7edb" }}>{error}</span>}
              </div>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}

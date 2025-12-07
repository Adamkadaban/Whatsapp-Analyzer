import { useMemo, useState, type ChangeEvent, type DragEvent } from "react";
import { Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, PolarAngleAxis, PolarGrid, Radar, RadarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
type DailyStackDatum = Record<string, number | string>;
import ChartCard from "../components/ChartCard";
import PieTooltip, { type SenderDatum } from "../components/PieTooltip";
import StatCard from "../components/StatCard";
import { analyzeText, type Summary } from "../lib/wasm";

const colors = ["#64d8ff", "#ff7edb", "#8c7bff", "#7cf9c0", "#ffb347", "#ff6b6b", "#ffd166", "#06d6a0", "#118ab2", "#ef476f"];
const monthLabels = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const weekdayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

type DailyDatum = { day: string; messages: number };
type KpiDatum = { label: string; value: string; detail?: string };

export default function Dashboard() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filterStopwords, setFilterStopwords] = useState(true);

  const hasData = Boolean(summary);

  const senderData: SenderDatum[] = summary
    ? summary.by_sender.slice(0, 6).map((s) => ({ name: s.label, value: s.value }))
    : [];

  const dailyData: DailyDatum[] = summary
    ? summary.daily.map((d) => ({ day: d.label, messages: d.value }))
    : [];

  const kpis: KpiDatum[] = summary
    ? [
        {
          label: "Total messages",
          value: summary.total_messages.toLocaleString(),
          detail: `Senders: ${summary.by_sender.length}`,
        },
        {
          label: "Active days",
          value: summary.timeline.length.toLocaleString(),
          detail: `Deleted you/others: ${summary.deleted_you}/${summary.deleted_others}`,
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

  const dailyStacked: DailyStackDatum[] = useMemo(() => {
    if (!summary) return [];
    const rows: Record<string, DailyStackDatum> = {};
    summary.per_person_daily.forEach((person) => {
      person.daily.forEach((d) => {
        const key = d.label;
        if (!rows[key]) rows[key] = { day: key };
        rows[key][person.name] = d.value;
      });
    });
    return Object.values(rows).sort((a, b) => String(a.day).localeCompare(String(b.day)));
  }, [summary]);

  async function loadRaw(raw: string) {
    try {
      setLoading(true);
      setError(null);
      const res = await analyzeText(raw);
      setSummary(res);
    } catch (err) {
      console.error(err);
      setError("Failed to analyze chat. Please try another file.");
    } finally {
      setLoading(false);
    }
  }

  async function onFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    await loadRaw(text);
  }

  async function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    const text = await file.text();
    await loadRaw(text);
  }

  function handleDragOver(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
  }

  function resetToUpload() {
    setSummary(null);
    setError(null);
  }

  return (
    <main>
      <section className="container" style={{ display: "grid", gap: "24px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: "16px", alignItems: "center", flexWrap: "wrap" }}>
          <div>
            <div className="tag">Local-only</div>
            <h2 style={{ margin: "8px 0" }}>Dashboard</h2>
            <p style={{ color: "var(--muted)", margin: 0 }}>
              Drop your exported WhatsApp .txt — parsing and stats run fully in-browser via Rust+Polars WASM.
            </p>
          </div>
          {!hasData && <a className="btn" href="#upload">Upload chat</a>}
          {hasData && (
            <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
              <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 14 }}>
                <span style={{ color: "var(--muted)" }}>Filter stop-words</span>
                <input
                  type="checkbox"
                  checked={filterStopwords}
                  onChange={(e) => setFilterStopwords(e.target.checked)}
                  style={{ transform: "scale(1.2)" }}
                />
              </label>
              <button className="btn ghost" onClick={resetToUpload} disabled={loading}>
                Upload another chat
              </button>
            </div>
          )}
        </div>
        {hasData && (
          <>
            <div className="grid stat-grid">
              {kpis.map((kpi) => (
                <StatCard key={kpi.label} {...kpi} />
              ))}
            </div>

            <div className="card" style={{ display: "grid", gap: 12 }}>
              <div className="tag">People</div>
              <h3 style={{ margin: 0 }}>Per-person stats</h3>
              <div style={{ overflowX: "auto" }}>
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
                        <td style={{ padding: "8px 6px", display: "flex", gap: 6, flexWrap: "wrap" }}>
                          {p.top_emojis.slice(0, 5).map((e) => (
                            <span key={e.label} style={{ padding: "4px 8px", borderRadius: 8, background: "rgba(255,255,255,0.05)" }}>
                              {e.label} <span style={{ color: "var(--muted)" }}>×{e.value}</span>
                            </span>
                          ))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="grid chart-grid">
              <ChartCard title="Daily volume">
                <div style={{ height: 260 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={dailyStacked} margin={{ left: -20 }} barGap={2}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                      <XAxis dataKey="day" tick={{ fill: "var(--muted)", fontSize: 12 }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fill: "var(--muted)", fontSize: 12 }} axisLine={false} tickLine={false} />
                      <Tooltip contentStyle={{ background: "#0a0b0f", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12 }} />
                      {summary?.buckets_by_person.map((p, idx) => (
                        <Bar key={p.name} dataKey={p.name} stackId="day" fill={colors[idx % colors.length]} radius={[6, 6, 0, 0]} />
                      ))}
                      <Legend />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </ChartCard>

              <ChartCard title="Hourly rhythm">
                <div style={{ height: 240 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={hourlyStacked}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                      <XAxis dataKey="hour" tickFormatter={(v) => `${v}:00`} tick={{ fill: "var(--muted)", fontSize: 12 }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fill: "var(--muted)", fontSize: 12 }} axisLine={false} tickLine={false} />
                      <Tooltip contentStyle={{ background: "#0a0b0f", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12 }} />
                      {summary.buckets_by_person.map((p, idx) => (
                        <Bar key={p.name} dataKey={p.name} stackId="time" radius={[6, 6, 0, 0]} fill={colors[idx % colors.length]} />
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
                        {senderData.map((_, idx) => (
                          <Cell key={idx} fill={colors[idx % colors.length]} />
                        ))}
                      </Pie>
                      <Tooltip content={<PieTooltip />} wrapperStyle={{ color: "#fff" }} />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </ChartCard>

              <ChartCard title="Monthly footprint (radar)">
                <div style={{ height: 280 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <RadarChart data={monthlyRadar} outerRadius={90}>
                      <PolarGrid stroke="rgba(255,255,255,0.08)" />
                      <PolarAngleAxis dataKey="label" tick={{ fill: "var(--muted)", fontSize: 12 }} />
                      <Tooltip contentStyle={{ background: "#0a0b0f", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12 }} />
                      {summary.buckets_by_person.map((p, idx) => (
                        <Radar key={p.name} name={p.name} dataKey={p.name} stroke={colors[idx % colors.length]} fill={colors[idx % colors.length]} fillOpacity={0.35} />
                      ))}
                      <Legend />
                    </RadarChart>
                  </ResponsiveContainer>
                </div>
              </ChartCard>

              <ChartCard title="Weekday footprint (radar)">
                <div style={{ height: 280 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <RadarChart data={weekdayRadar} outerRadius={90}>
                      <PolarGrid stroke="rgba(255,255,255,0.08)" />
                      <PolarAngleAxis dataKey="label" tick={{ fill: "var(--muted)", fontSize: 12 }} />
                      <Tooltip contentStyle={{ background: "#0a0b0f", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12 }} />
                      {summary.buckets_by_person.map((p, idx) => (
                        <Radar key={p.name} name={p.name} dataKey={p.name} stroke={colors[idx % colors.length]} fill={colors[idx % colors.length]} fillOpacity={0.35} />
                      ))}
                      <Legend />
                    </RadarChart>
                  </ResponsiveContainer>
                </div>
              </ChartCard>
            </div>

            <div className="card" style={{ display: "grid", gap: 10 }}>
              <div className="tag">Word cloud</div>
              <h3 style={{ margin: 0 }}>Most common words</h3>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "flex-end" }}>
                {wordCloud.map((w) => {
                  const max = wordCloud[0]?.value ?? 1;
                  const size = 14 + (w.value / max) * 26;
                  return (
                    <span key={w.label} style={{ fontSize: `${size}px`, fontWeight: 600, color: "#f0f2ff" }}>
                      {w.label}
                    </span>
                  );
                })}
              </div>
            </div>
          </>
        )}

        {!hasData && (
          <div id="upload" className="card" style={{ display: "grid", gap: "10px" }}>
            <div className="tag">Upload</div>
            <h3 style={{ margin: 0 }}>Drive these charts with your chat</h3>
            <p style={{ color: "var(--muted)", margin: 0 }}>
              No uploads leave your device. We parse locally in a WebAssembly module backed by Polars.
            </p>
            <div style={{ display: "grid", gap: 12 }}>
              <div
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                style={{
                  border: "1px dashed rgba(255,255,255,0.2)",
                  borderRadius: 12,
                  padding: 16,
                  display: "flex",
                  flexDirection: "column",
                  gap: 8,
                  background: "rgba(255,255,255,0.02)",
                }}
              >
                <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
                  <label className="btn" style={{ cursor: "pointer" }}>
                    {loading ? "Analyzing..." : "Choose .txt export"}
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

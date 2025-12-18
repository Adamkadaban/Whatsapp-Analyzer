import { useEffect, useRef, useState, type ChangeEvent, type DragEvent } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  LabelList,
  Line,
  LineChart,
  Pie,
  PieChart,
  PolarAngleAxis,
  PolarGrid,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import WordCloud from "../components/WordCloud";
import EmojiCloud from "../components/EmojiCloud";
import ChartCard from "../components/ChartCard";
import PieTooltip from "../components/PieTooltip";
import StatCard from "../components/StatCard";
import {
  ColorModal,
  JourneySection,
  LoadingOverlay,
  PhrasesSection,
  StatsTable,
  UploadSection,
} from "../components/dashboard";
import { analyzeText, type Summary } from "../lib/wasm";
import { useFileProcessing, useColorMap, useDashboardStats } from "../lib/hooks";
import { CHART_COLORS, SITE_URL } from "../lib/colors";
import {
  MAX_LEGEND_SENDERS,
  PDF_MAX_DIMENSION_PX,
  PDF_MAX_SCALE,
  PDF_HEIGHT_BUFFER_PX,
} from "../lib/constants";

const colors = CHART_COLORS;

export default function Dashboard() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [filterStopwords, setFilterStopwords] = useState(true);
  const [showColorModal, setShowColorModal] = useState(false);
  const [showStopTooltip, setShowStopTooltip] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [processingElapsed, setProcessingElapsed] = useState(0);
  const dashboardRef = useRef<HTMLElement | null>(null);

  // Use extracted hooks
  const { state: fileState, processFiles, reset: resetFiles } = useFileProcessing(analyzeText);
  const { processing, error, fileName, fileCount, pendingSummary } = fileState;
  const { colorMap, setColorMap, getColor } = useColorMap(summary);
  const stats = useDashboardStats(summary, filterStopwords);

  const hasData = Boolean(summary);
  const senderCount = summary?.by_sender.length ?? 0;
  const showLegend = senderCount <= MAX_LEGEND_SENDERS;

  const isReady = pendingSummary !== null && !processing && !analyzing;

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

  const [activeSentimentIndex, setActiveSentimentIndex] = useState<number | null>(null);
  const sentimentOpacity = (idx: number) =>
    activeSentimentIndex === null || activeSentimentIndex === idx ? 1 : 0.3;

  function handleAnalyze() {
    if (pendingSummary) {
      setAnalyzing(true);
      setTimeout(() => {
        try {
          setSummary(pendingSummary);
          resetFiles();
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
    const files = e.dataTransfer.files;
    if (!files?.length) return;
    await processFiles(files);
  }

  function resetToUpload() {
    setSummary(null);
    resetFiles();
    setExportError(null);
  }

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

      node.classList.add("exporting");

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
        onClone: (clonedDoc: Document) => {
          const mainEl = clonedDoc.querySelector("main") as HTMLElement;
          if (mainEl) mainEl.classList.add("exporting");
          clonedDoc.querySelectorAll(".export-banner").forEach((el) => {
            (el as HTMLElement).style.display = "inline-flex";
          });
          clonedDoc.querySelectorAll('link[href*="fonts.googleapis"]').forEach((el) => el.remove());
        },
      } as Parameters<typeof toPng>[1] & { onClone?: (doc: Document) => void });

      const orientation = width >= height ? "landscape" : "portrait";
      const pdf = new jsPDF({
        orientation,
        unit: "px",
        format: [canvasWidth, canvasHeight],
        compress: true,
      });
      pdf.addImage(imgData, "PNG", 0, 0, canvasWidth, canvasHeight, undefined, "FAST");

      const linkUrl = SITE_URL;
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
      pdf.setFontSize(1);
      pdf.textWithLink(" ", linkX + 1, linkY + linkHeight / 2, { url: linkUrl });
      pdf.save("whatsapp-dashboard.pdf");
    } catch (err) {
      console.error(err);
      setExportError("Failed to export PDF. Please try again.");
    } finally {
      setExporting(false);
      dashboardRef.current?.classList.remove("exporting");
    }
  }

  return (
    <main ref={dashboardRef} className="relative">
      <LoadingOverlay
        processing={processing}
        analyzing={analyzing}
        isReady={isReady}
        fileName={fileName}
        fileCount={fileCount}
        processingElapsed={processingElapsed}
        onAnalyze={handleAnalyze}
      />

      {showColorModal && summary && (
        <ColorModal
          bucketsByPerson={summary.buckets_by_person}
          onColorChange={(name, color) => setColorMap((prev) => ({ ...prev, [name]: color }))}
          onClose={() => setShowColorModal(false)}
          getColor={getColor}
        />
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
                    onChange={(e) => setFilterStopwords(e.target.checked)}
                    aria-label="Filter out stopwords from word statistics"
                  />
                  <span className="slider" />
                </label>
              </div>
              <button
                className="btn ghost"
                onClick={() => setShowColorModal(true)}
                disabled={!summary}
              >
                Configure colors
              </button>
              <button
                className="btn ghost"
                onClick={handleExportPdf}
                disabled={!summary || exporting}
              >
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

            {/* Timeline Chart */}
            <div className="card grid-gap-md">
              <div className="tag">Timeline</div>
              <h3 className="card-header">Chat timeline</h3>
              <div className="chart-container-xl chart-full-width">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={stats.timelineData} margin={{ left: -12, right: 8 }}>
                    <defs>
                      <linearGradient id="timelineGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#7cf9c0" stopOpacity={0.6} />
                        <stop offset="90%" stopColor="#7cf9c0" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                    <XAxis
                      dataKey="date"
                      tick={{ fill: "var(--muted)", fontSize: 12 }}
                      axisLine={false}
                      tickLine={false}
                      minTickGap={20}
                    />
                    <YAxis
                      tick={{ fill: "var(--muted)", fontSize: 12 }}
                      axisLine={false}
                      tickLine={false}
                      allowDecimals={false}
                    />
                    <Tooltip
                      contentStyle={{
                        background: "#0a0b0f",
                        border: "1px solid rgba(255,255,255,0.08)",
                        borderRadius: 12,
                      }}
                      cursor={{ stroke: "rgba(255,255,255,0.15)", strokeWidth: 1 }}
                    />
                    <Area
                      type="monotone"
                      dataKey="messages"
                      stroke="#7cf9c0"
                      strokeWidth={2.5}
                      fill="url(#timelineGradient)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
              <div className="text-muted text-xs">Message volume over time.</div>
            </div>

            <StatsTable personStats={summary?.person_stats ?? []} />

            <div className="grid stat-grid">
              {stats.kpis.map((kpi) => (
                <StatCard key={kpi.label} {...kpi} />
              ))}
            </div>

            <div className="grid chart-grid">
              <ChartCard title="Hourly rhythm">
                <div className="chart-container-sm">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={stats.hourlyStacked} barGap={-1}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                      <XAxis
                        dataKey="hour"
                        tickFormatter={(v) => `${v}:00`}
                        tick={{ fill: "var(--muted)", fontSize: 12 }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <YAxis
                        tick={{ fill: "var(--muted)", fontSize: 12 }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <Tooltip
                        contentStyle={{
                          background: "#0a0b0f",
                          border: "1px solid rgba(255,255,255,0.08)",
                          borderRadius: 12,
                        }}
                        cursor={{ fill: "rgba(255,255,255,0.04)" }}
                      />
                      {summary?.buckets_by_person.map((p, idx) => (
                        <Bar
                          key={p.name}
                          dataKey={p.name}
                          radius={[6, 6, 0, 0]}
                          fill={getColor(p.name, idx)}
                        />
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
                      <Pie
                        data={stats.senderData}
                        dataKey="value"
                        nameKey="name"
                        innerRadius={60}
                        outerRadius={90}
                        paddingAngle={2}
                      >
                        {stats.senderData.map((entry, idx) => (
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
                    <BarChart data={stats.conversationStartersData} margin={{ left: -10, right: 10 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                      <XAxis dataKey="name" hide axisLine={false} tickLine={false} />
                      <YAxis
                        tick={{ fill: "var(--muted)", fontSize: 12 }}
                        axisLine={false}
                        tickLine={false}
                        allowDecimals={false}
                      />
                      <Tooltip
                        contentStyle={{
                          background: "#0a0b0f",
                          border: "1px solid rgba(255,255,255,0.08)",
                          borderRadius: 12,
                        }}
                        cursor={{ fill: "rgba(255,255,255,0.04)" }}
                      />
                      <Bar dataKey="value" name="Starts" radius={[6, 6, 0, 0]} fill="#7cf9c0">
                        <LabelList dataKey="name" position="top" fill="var(--muted)" fontSize={12} />
                        {stats.conversationStartersData.map((entry, index) => (
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
                    <RadarChart data={stats.monthlyRadar} outerRadius={showLegend ? 90 : 110}>
                      <PolarGrid stroke="rgba(255,255,255,0.08)" />
                      <PolarAngleAxis
                        dataKey="label"
                        tick={{ fill: "var(--muted)", fontSize: 12 }}
                      />
                      <Tooltip
                        contentStyle={{
                          background: "#0a0b0f",
                          border: "1px solid rgba(255,255,255,0.08)",
                          borderRadius: 12,
                        }}
                      />
                      {summary?.buckets_by_person.map((p, idx) => {
                        const c = getColor(p.name, idx);
                        return (
                          <Radar
                            key={p.name}
                            name={p.name}
                            dataKey={p.name}
                            stroke={c}
                            fill={c}
                            fillOpacity={0.35}
                          />
                        );
                      })}
                      {showLegend && (
                        <Legend wrapperStyle={{ fontSize: 11, maxHeight: 50, overflow: "hidden" }} />
                      )}
                    </RadarChart>
                  </ResponsiveContainer>
                </div>
              </ChartCard>

              <ChartCard title="Weekday footprint">
                <div className="chart-container-lg">
                  <ResponsiveContainer width="100%" height="100%">
                    <RadarChart data={stats.weekdayRadar} outerRadius={showLegend ? 90 : 110}>
                      <PolarGrid stroke="rgba(255,255,255,0.08)" />
                      <PolarAngleAxis
                        dataKey="label"
                        tick={{ fill: "var(--muted)", fontSize: 12 }}
                      />
                      <Tooltip
                        contentStyle={{
                          background: "#0a0b0f",
                          border: "1px solid rgba(255,255,255,0.08)",
                          borderRadius: 12,
                        }}
                      />
                      {summary?.buckets_by_person.map((p, idx) => {
                        const c = getColor(p.name, idx);
                        return (
                          <Radar
                            key={p.name}
                            name={p.name}
                            dataKey={p.name}
                            stroke={c}
                            fill={c}
                            fillOpacity={0.35}
                          />
                        );
                      })}
                      {showLegend && (
                        <Legend wrapperStyle={{ fontSize: 11, maxHeight: 50, overflow: "hidden" }} />
                      )}
                    </RadarChart>
                  </ResponsiveContainer>
                </div>
              </ChartCard>
            </div>

            {stats.hasSentiment && (
              <div className="grid chart-grid">
                <ChartCard title="Mood lanes by person" subtitle="Daily mean sentiment (−1 to 1)">
                  <div className="chart-container-md">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={stats.sentimentLaneData} margin={{ left: -4, right: 8 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                        <XAxis
                          dataKey="day"
                          tick={{ fill: "var(--muted)", fontSize: 12 }}
                          axisLine={false}
                          tickLine={false}
                          minTickGap={20}
                        />
                        <YAxis
                          domain={[-1, 1]}
                          tick={{ fill: "var(--muted)", fontSize: 12 }}
                          axisLine={false}
                          tickLine={false}
                          allowDecimals
                        />
                        <Tooltip
                          contentStyle={{
                            background: "#0a0b0f",
                            border: "1px solid rgba(255,255,255,0.08)",
                            borderRadius: 12,
                          }}
                        />
                        {stats.sentimentOverall.map((p, idx) => (
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

                <ChartCard
                  title="Polarity mix per person"
                  subtitle="Share of positive / neutral / negative messages"
                >
                  <div className="chart-container-md">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={stats.sentimentStacked}
                        margin={{ left: -10, right: 10 }}
                        onMouseMove={(state) =>
                          setActiveSentimentIndex(state?.activeTooltipIndex ?? null)
                        }
                        onMouseLeave={() => setActiveSentimentIndex(null)}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                        <XAxis
                          dataKey="name"
                          tick={{ fill: "var(--muted)", fontSize: 12 }}
                          axisLine={false}
                          tickLine={false}
                        />
                        <YAxis
                          domain={[0, 100]}
                          tickFormatter={(v) => `${v}%`}
                          tick={{ fill: "var(--muted)", fontSize: 12 }}
                          axisLine={false}
                          tickLine={false}
                        />
                        <Tooltip
                          contentStyle={{
                            background: "#0a0b0f",
                            border: "1px solid rgba(255,255,255,0.08)",
                            borderRadius: 12,
                          }}
                          formatter={(v: number) => `${v}%`}
                          cursor={{ fill: "rgba(255,255,255,0.04)" }}
                        />
                        <Bar dataKey="pos" stackId="sent" name="Positive" radius={[4, 4, 0, 0]} fill="#7cf9c0">
                          {stats.sentimentStacked.map((entry, idx) => (
                            <Cell key={`${entry.name}-pos`} opacity={sentimentOpacity(idx)} />
                          ))}
                        </Bar>
                        <Bar dataKey="neu" stackId="sent" name="Neutral" radius={[0, 0, 0, 0]} fill="#ffd166">
                          {stats.sentimentStacked.map((entry, idx) => (
                            <Cell key={`${entry.name}-neu`} opacity={sentimentOpacity(idx)} />
                          ))}
                        </Bar>
                        <Bar dataKey="neg" stackId="sent" name="Negative" radius={[0, 0, 4, 4]} fill="#ff7edb">
                          {stats.sentimentStacked.map((entry, idx) => (
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
                      <AreaChart data={stats.sentimentTimeline} margin={{ left: -8, right: 8 }}>
                        <defs>
                          <linearGradient id="sentimentGradient" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#64d8ff" stopOpacity={0.55} />
                            <stop offset="100%" stopColor="#64d8ff" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                        <XAxis
                          dataKey="day"
                          tick={{ fill: "var(--muted)", fontSize: 12 }}
                          axisLine={false}
                          tickLine={false}
                          minTickGap={16}
                        />
                        <YAxis
                          domain={[-1, 1]}
                          tick={{ fill: "var(--muted)", fontSize: 12 }}
                          axisLine={false}
                          tickLine={false}
                        />
                        <Tooltip
                          contentStyle={{
                            background: "#0a0b0f",
                            border: "1px solid rgba(255,255,255,0.08)",
                            borderRadius: 12,
                          }}
                        />
                        <Area
                          type="monotone"
                          dataKey="mean"
                          stroke="#64d8ff"
                          strokeWidth={2.5}
                          fill="url(#sentimentGradient)"
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </ChartCard>
              </div>
            )}

            <div className="grid-gap-lg">
              <PhrasesSection perPersonPhrases={stats.perPersonPhrases} />

              <div className="card grid-gap-sm min-h-card">
                <div className="tag">Word cloud</div>
                <h3 className="card-header">Most common words</h3>
                <WordCloud words={stats.wordCloud} colors={colors} height={320} />
              </div>

              <div className="card grid-gap-sm min-h-card">
                <div className="tag">Emoji cloud</div>
                <h3 className="card-header">Most used emojis</h3>
                <EmojiCloud words={stats.emojiCloud} height={320} />
              </div>
            </div>

            {summary?.journey && (
              <JourneySection journey={summary.journey} colorMap={colorMap} />
            )}
          </>
        )}

        {!hasData && <UploadSection error={error} onFileChange={onFileChange} onDrop={handleDrop} />}
      </section>
    </main>
  );
}

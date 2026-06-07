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

  const isReady = pendingSummary !== null && !processing;

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
      setSummary(pendingSummary);
      resetFiles();
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

    // html-to-image mis-renders `backdrop-filter: blur()` (used on the cards and
    // the sticky header) as blurry smears over the content — the real cause of
    // the "blurry export". Neutralize it for the duration of the capture only.
    // On the dark, translucent cards this has no visible effect on the live
    // page, so unlike a DOM banner it does not cause any flash.
    const deblur = document.createElement("style");
    deblur.textContent =
      "*{backdrop-filter:none !important;-webkit-backdrop-filter:none !important;}";

    try {
      const node = dashboardRef.current;
      const [{ toPng }, { jsPDF }] = await Promise.all([import("html-to-image"), import("jspdf")]);

      document.head.appendChild(deblur);

      const width = Math.ceil(node.scrollWidth);
      const height = Math.ceil(node.scrollHeight + PDF_HEIGHT_BUFFER_PX);
      const scale = Math.min(PDF_MAX_SCALE, PDF_MAX_DIMENSION_PX / Math.max(width, height));
      const canvasWidth = Math.floor(width * scale);
      const canvasHeight = Math.floor(height * scale);

      // Render the clone at the final (super-sampled) resolution and scale its
      // content up with a CSS transform so text rasterizes crisply at that size
      // (drawImage is then effectively 1:1, instead of upscaling a 1x bitmap).
      const imgData = await toPng(node, {
        pixelRatio: 1,
        cacheBust: true,
        backgroundColor: getComputedStyle(document.body).backgroundColor || "#05060a",
        width: canvasWidth,
        height: canvasHeight,
        skipFonts: true,
        style: {
          width: `${width}px`,
          height: `${height}px`,
          transform: `scale(${scale})`,
          transformOrigin: "top left",
        },
        filter: (n) => {
          const el = n as HTMLElement;
          if (el.classList?.contains("export-hide")) return false;
          return true;
        },
      });

      // Reserve a band at the top of the page for the branding banner, drawn
      // with jsPDF vector text. Drawing it here (rather than capturing a DOM
      // banner) keeps the logo off the live page entirely — no flash — while it
      // still appears, crisply, in the exported PDF.
      const band = Math.round(64 * scale);
      const pageWidth = canvasWidth;
      const pageHeight = canvasHeight + band;

      const bgColor = getComputedStyle(document.body).backgroundColor;
      const rgb = bgColor.match(/(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
      const [bgR, bgG, bgB] = rgb ? [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])] : [5, 6, 10];

      const pdf = new jsPDF({
        orientation: pageWidth >= pageHeight ? "landscape" : "portrait",
        unit: "px",
        format: [pageWidth, pageHeight],
        compress: true,
        // Without "px_scaling", jsPDF converts px → pt with a 96/72 (≈1.333)
        // factor, so the MediaBox is silently clamped at 14400 userUnits and the
        // bottom of tall dashboards is cut off. The hotfix uses the correct CSS
        // 72/96 (0.75) factor, keeping our PDF_MAX_DIMENSION_PX page within limits.
        hotfixes: ["px_scaling"],
      });

      pdf.setFillColor(bgR, bgG, bgB);
      pdf.rect(0, 0, pageWidth, pageHeight, "F");
      pdf.addImage(imgData, "PNG", 0, band, canvasWidth, canvasHeight, undefined, "FAST");

      // Branding banner: "WA Analyzer" + tagline, as crisp vector text.
      const padX = Math.round(20 * scale);
      const baseline = Math.round(band * 0.6);
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(Math.round(20 * scale));
      pdf.setTextColor(0x25, 0xd3, 0x66);
      pdf.text("WA", padX, baseline);
      const waWidth = pdf.getTextWidth("WA");
      pdf.setTextColor(0xe9, 0xee, 0xf7);
      pdf.text(" Analyzer", padX + waWidth, baseline);
      const titleWidth = waWidth + pdf.getTextWidth(" Analyzer");

      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(Math.round(11 * scale));
      pdf.setTextColor(0x9f, 0xb2, 0xc8);
      pdf.text(
        "WhatsApp insights in seconds",
        padX + titleWidth + Math.round(14 * scale),
        baseline,
      );

      // Make the whole banner a clickable backlink.
      pdf.link(0, 0, pageWidth, band, { url: SITE_URL });

      pdf.save("whatsapp-dashboard.pdf");
    } catch (err) {
      console.error(err);
      setExportError("Failed to export PDF. Please try again.");
    } finally {
      deblur.remove();
      setExporting(false);
    }
  }

  return (
    <main ref={dashboardRef} className="relative">
      <LoadingOverlay
        processing={processing}
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
            <h2 className="dashboard-title">Dashboard</h2>
            {!hasData && <p className="dashboard-subtitle">Drop your exported WhatsApp .txt.</p>}
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
                    tabIndex={0}
                    role="button"
                    aria-describedby={showStopTooltip ? "stopword-help" : undefined}
                  >
                    Filter stop-words
                  </span>
                  {showStopTooltip && (
                    <div id="stopword-help" role="tooltip" className="stopword-tooltip">
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
              <div
                className="chart-container-xl chart-full-width"
                role="img"
                aria-label="Area chart: message volume over time."
              >
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
                <div
                  className="chart-container-sm"
                  role="img"
                  aria-label="Bar chart: messages per hour of the day, by person."
                >
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
                <div
                  className="chart-container-sm"
                  role="img"
                  aria-label="Pie chart: share of messages sent by each person."
                >
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
                <div
                  className="chart-container-md"
                  role="img"
                  aria-label="Bar chart: number of conversations each person started after a period of inactivity."
                >
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={stats.conversationStartersData}
                      margin={{ left: -10, right: 10 }}
                    >
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
                        <LabelList
                          dataKey="name"
                          position="top"
                          fill="var(--muted)"
                          fontSize={12}
                        />
                        {stats.conversationStartersData.map((entry, index) => (
                          <Cell key={entry.name} fill={getColor(entry.name, index)} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </ChartCard>

              <ChartCard title="Monthly footprint">
                <div
                  className="chart-container-lg"
                  role="img"
                  aria-label="Radar chart: message activity by month of the year, per person."
                >
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
                        <Legend
                          wrapperStyle={{ fontSize: 11, maxHeight: 50, overflow: "hidden" }}
                        />
                      )}
                    </RadarChart>
                  </ResponsiveContainer>
                </div>
              </ChartCard>

              <ChartCard title="Weekday footprint">
                <div
                  className="chart-container-lg"
                  role="img"
                  aria-label="Radar chart: message activity by day of the week, per person."
                >
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
                        <Legend
                          wrapperStyle={{ fontSize: 11, maxHeight: 50, overflow: "hidden" }}
                        />
                      )}
                    </RadarChart>
                  </ResponsiveContainer>
                </div>
              </ChartCard>
            </div>

            {stats.hasSentiment && (
              <div className="grid chart-grid">
                <ChartCard title="Mood lanes by person" subtitle="Daily mean sentiment (−1 to 1)">
                  <div
                    className="chart-container-md"
                    role="img"
                    aria-label="Line chart: daily mean sentiment per person, ranging from −1 (negative) to 1 (positive)."
                  >
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
                  <div
                    className="chart-container-md"
                    role="img"
                    aria-label="Stacked bar chart: share of positive, neutral, and negative messages per person."
                  >
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
                        <Bar
                          dataKey="pos"
                          stackId="sent"
                          name="Positive"
                          radius={[4, 4, 0, 0]}
                          fill="#7cf9c0"
                        >
                          {stats.sentimentStacked.map((entry, idx) => (
                            <Cell key={`${entry.name}-pos`} opacity={sentimentOpacity(idx)} />
                          ))}
                        </Bar>
                        <Bar
                          dataKey="neu"
                          stackId="sent"
                          name="Neutral"
                          radius={[0, 0, 0, 0]}
                          fill="#ffd166"
                        >
                          {stats.sentimentStacked.map((entry, idx) => (
                            <Cell key={`${entry.name}-neu`} opacity={sentimentOpacity(idx)} />
                          ))}
                        </Bar>
                        <Bar
                          dataKey="neg"
                          stackId="sent"
                          name="Negative"
                          radius={[0, 0, 4, 4]}
                          fill="#ff7edb"
                        >
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
                  <div
                    className="chart-container-sm"
                    role="img"
                    aria-label="Area chart: overall conversation sentiment over time, weighted by message volume."
                  >
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

            {summary?.journey && <JourneySection journey={summary.journey} colorMap={colorMap} />}
          </>
        )}

        {!hasData && (
          <UploadSection error={error} onFileChange={onFileChange} onDrop={handleDrop} />
        )}
      </section>
    </main>
  );
}

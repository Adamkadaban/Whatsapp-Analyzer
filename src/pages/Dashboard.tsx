import { useEffect, useRef, useState, type ChangeEvent, type DragEvent } from "react";
import StatCard from "../components/StatCard";
import {
  ActivityRadar,
  ColorModal,
  ConversationStarters,
  DashboardHeader,
  EmojiCloudCard,
  HourlyChart,
  JourneySection,
  LoadingOverlay,
  PhrasesSection,
  SentimentSection,
  StatsTable,
  TimelineChart,
  TopSendersPie,
  UploadSection,
  WordCloudCard,
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
      const [{ toPng }, { jsPDF }] = await Promise.all([
        import("html-to-image"),
        import("jspdf"),
      ]);

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
      const [bgR, bgG, bgB] = rgb
        ? [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])]
        : [5, 6, 10];

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
      pdf.text("WhatsApp insights in seconds", padX + titleWidth + Math.round(14 * scale), baseline);

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
        <DashboardHeader
          hasData={hasData}
          hasSummary={Boolean(summary)}
          filterStopwords={filterStopwords}
          onFilterStopwordsChange={setFilterStopwords}
          exporting={exporting}
          processing={processing}
          onConfigureColors={() => setShowColorModal(true)}
          onExportPdf={handleExportPdf}
          onReset={resetToUpload}
        />

        {hasData && (
          <>
            {exportError && <div className="error-text">{exportError}</div>}

            <TimelineChart data={stats.timelineData} />

            <StatsTable personStats={summary?.person_stats ?? []} />

            <div className="grid stat-grid">
              {stats.kpis.map((kpi) => (
                <StatCard key={kpi.label} {...kpi} />
              ))}
            </div>

            <div className="grid chart-grid">
              <HourlyChart
                data={stats.hourlyStacked}
                buckets={summary?.buckets_by_person ?? []}
                getColor={getColor}
                showLegend={showLegend}
              />

              <TopSendersPie
                data={stats.senderData}
                getColor={getColor}
                showLegend={showLegend}
              />

              <ConversationStarters
                data={stats.conversationStartersData}
                getColor={getColor}
              />

              <ActivityRadar
                title="Monthly footprint"
                data={stats.monthlyRadar}
                buckets={summary?.buckets_by_person ?? []}
                getColor={getColor}
                showLegend={showLegend}
              />

              <ActivityRadar
                title="Weekday footprint"
                data={stats.weekdayRadar}
                buckets={summary?.buckets_by_person ?? []}
                getColor={getColor}
                showLegend={showLegend}
              />
            </div>

            {stats.hasSentiment && (
              <SentimentSection
                laneData={stats.sentimentLaneData}
                overall={stats.sentimentOverall}
                stacked={stats.sentimentStacked}
                timeline={stats.sentimentTimeline}
                getColor={getColor}
                showLegend={showLegend}
              />
            )}

            <div className="grid-gap-lg">
              <PhrasesSection perPersonPhrases={stats.perPersonPhrases} />

              <WordCloudCard words={stats.wordCloud} colors={colors} />

              <EmojiCloudCard words={stats.emojiCloud} />
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

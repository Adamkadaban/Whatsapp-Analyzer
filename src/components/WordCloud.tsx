import { useEffect, useMemo, useRef, useState } from "react";
import cloud from "d3-cloud";
import { CHART_COLORS, WORD_CLOUD_FONT } from "../lib/colors";

export type CloudWord = {
  label: string;
  value: number;
};

const COLORS = CHART_COLORS;
const FONT_FAMILY = WORD_CLOUD_FONT;

// Debounce window for resize-driven relayout. Coalesces the burst of
// ResizeObserver ticks emitted while a window is being dragged/resized so the
// d3-cloud layout runs at most once per settled size instead of every frame.
const RESIZE_DEBOUNCE_MS = 120;

export default function WordCloud({
  words,
  colors = COLORS,
  height = 320,
}: {
  words: CloudWord[];
  colors?: string[];
  height?: number;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [layoutWords, setLayoutWords] = useState<cloud.Word[]>([]);
  const [width, setWidth] = useState(0);

  const filtered = useMemo(() => words.filter((w) => w.value > 0).slice(0, 150), [words]);

  // Non-visual alternative: SVG <text> nodes are unreliable for screen readers,
  // so summarize the cloud as an accessible name on the image as a whole.
  const ariaLabel = useMemo(() => {
    if (filtered.length === 0) return "Word cloud (no words to display)";
    const top = filtered
      .slice()
      .sort((a, b) => b.value - a.value)
      .slice(0, 5)
      .map((w) => w.label)
      .join(", ");
    return `Word cloud of the ${filtered.length} most frequent words; top words: ${top}.`;
  }, [filtered]);

  // Measure container width on mount and on resize. The initial measurement is
  // synchronous so the first layout is not delayed, but subsequent resize ticks
  // are debounced so dragging/resizing the window doesn't thrash the expensive
  // d3-cloud relayout on every observer callback.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const measure = () => setWidth(el.clientWidth || 0);
    measure();

    let timer: ReturnType<typeof setTimeout> | null = null;
    const ro = new ResizeObserver(() => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        measure();
      }, RESIZE_DEBOUNCE_MS);
    });
    ro.observe(el);
    return () => {
      if (timer) clearTimeout(timer);
      ro.disconnect();
    };
  }, []);

  // Run d3-cloud layout when data or size changes
  useEffect(() => {
    if (!width || !height || filtered.length === 0) {
      setLayoutWords([]);
      return;
    }

    const max = Math.max(...filtered.map((w) => w.value));
    const min = Math.min(...filtered.map((w) => w.value));
    const scale = (v: number) => {
      if (max === min) return 28;
      const t = (v - min) / (max - min);
      return 14 + t * 48;
    };

    const wordsForLayout = filtered.map((w, idx) => ({
      text: w.label,
      size: scale(w.value),
      rotate: idx % 3 === 0 ? -15 : idx % 3 === 1 ? 0 : 15,
      value: w.value,
      index: idx,
    }));

    const layout = cloud<cloud.Word & { index: number }>()
      .size([width, height])
      .words(wordsForLayout)
      .padding(4)
      .spiral("archimedean")
      .font(FONT_FAMILY)
      .fontSize((d) => d.size as number)
      .rotate((d) => d.rotate as number)
      .on("end", (output) => setLayoutWords(output));

    layout.start();
  }, [filtered, width, height]);

  return (
    <div ref={containerRef} style={{ width: "100%", height }}>
      <svg
        width="100%"
        height="100%"
        viewBox={`0 0 ${width || 1} ${height}`}
        role="img"
        aria-label={ariaLabel}
      >
        <g transform={`translate(${width / 2}, ${height / 2})`}>
          {layoutWords.map((w, idx) => (
            <text
              key={`${w.text}-${idx}`}
              textAnchor="middle"
              transform={`translate(${w.x}, ${w.y}) rotate(${w.rotate ?? 0})`}
              fontFamily={FONT_FAMILY}
              fontSize={w.size}
              fill={colors[((w as cloud.Word & { index?: number }).index ?? idx) % colors.length]}
              style={{ cursor: "default" }}
            >
              {w.text}
            </text>
          ))}
        </g>
      </svg>
    </div>
  );
}

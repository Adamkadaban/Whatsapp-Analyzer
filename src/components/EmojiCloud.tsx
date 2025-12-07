import { useEffect, useMemo, useRef, useState } from "react";
import cloud from "d3-cloud";

export type CloudWord = {
  label: string;
  value: number;
};

const COLORS = ["#64d8ff", "#ff7edb", "#8c7bff", "#7cf9c0", "#ffb347", "#ff6b6b", "#ffd166", "#06d6a0", "#118ab2", "#ef476f"];
// Use emoji-friendly font stack
const FONT_FAMILY = "'Segoe UI Emoji', 'Apple Color Emoji', 'Noto Color Emoji', sans-serif";

export default function EmojiCloud({
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

  const filtered = useMemo(
    () => words.filter((w) => w.value > 0).slice(0, 100),
    [words]
  );

  // Measure container width once on mount and on resize
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const measure = () => setWidth(el.clientWidth || 0);
    measure();

    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
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
      if (max === min) return 36;
      const t = (v - min) / (max - min);
      return 24 + t * 56; // Larger range: 24-80px
    };

    const wordsForLayout = filtered.map((w, idx) => ({
      text: w.label,
      size: scale(w.value),
      // Add slight rotation variety for more organic cloud shape
      rotate: idx % 5 === 0 ? -10 : idx % 5 === 2 ? 10 : 0,
      value: w.value,
      index: idx,
    }));

    const layout = cloud<cloud.Word & { index: number }>()
      .size([width, height])
      .words(wordsForLayout)
      .padding(6) // More padding for emoji glyphs
      .spiral("rectangular") // Rectangular spiral fills space better for emojis
      .font(FONT_FAMILY)
      .fontSize((d) => d.size as number)
      .rotate((d) => d.rotate as number)
      .on("end", (output) => setLayoutWords(output));

    layout.start();
  }, [filtered, width, height]);

  return (
    <div ref={containerRef} style={{ width: "100%", height }}>
      <svg width="100%" height="100%" viewBox={`0 0 ${width || 1} ${height}`}>
        <g transform={`translate(${width / 2}, ${height / 2})`}>
          {layoutWords.map((w, idx) => (
            <text
              key={`${w.text}-${idx}`}
              textAnchor="middle"
              transform={`translate(${w.x}, ${w.y})`}
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

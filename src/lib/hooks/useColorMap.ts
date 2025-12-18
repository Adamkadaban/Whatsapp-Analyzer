import { useCallback, useEffect, useState } from "react";
import type { Summary } from "../types";
import { CHART_COLORS } from "../colors";

const colors = CHART_COLORS;

export interface ColorMapResult {
  colorMap: Record<string, string>;
  setColorMap: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  getColor: (name: string, idx: number) => string;
}

/**
 * Hook for managing user color assignments based on chat summary data.
 * Assigns colors from dominant color preferences when available,
 * otherwise falls back to chart color palette.
 */
export function useColorMap(summary: Summary | null): ColorMapResult {
  const [colorMap, setColorMap] = useState<Record<string, string>>({});

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

  const getColor = useCallback(
    (name: string, idx: number) => colorMap[name] ?? colors[idx % colors.length],
    [colorMap]
  );

  return { colorMap, setColorMap, getColor };
}

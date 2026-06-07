import type { CSSProperties } from "react";

/**
 * Shared recharts `<Tooltip contentStyle>` used across every dashboard chart.
 *
 * Previously this exact object literal was inlined ~8 times in Dashboard.tsx,
 * which meant a new style object was allocated on every render for every chart.
 * Hoisting it to a single frozen module-level constant removes the duplication
 * and the per-render reallocation while keeping the rendered output identical.
 */
export const CHART_TOOLTIP_STYLE: CSSProperties = {
  background: "#0a0b0f",
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: 12,
};

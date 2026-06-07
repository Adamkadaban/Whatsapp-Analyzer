import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { DashboardStatsResult } from "../../lib/hooks";
import { CHART_TOOLTIP_STYLE } from "./chartTheme";

interface TimelineChartProps {
  data: DashboardStatsResult["timelineData"];
}

/**
 * Full-width chat timeline area chart (message volume over time).
 */
export default function TimelineChart({ data }: TimelineChartProps) {
  return (
    <div className="card grid-gap-md">
      <div className="tag">Timeline</div>
      <h3 className="card-header">Chat timeline</h3>
      <div
        className="chart-container-xl chart-full-width"
        role="img"
        aria-label="Area chart: message volume over time."
      >
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ left: -12, right: 8 }}>
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
              contentStyle={CHART_TOOLTIP_STYLE}
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
  );
}

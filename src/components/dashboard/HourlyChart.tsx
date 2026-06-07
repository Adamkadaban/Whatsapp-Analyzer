import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import ChartCard from "../ChartCard";
import type { PersonBuckets } from "../../lib/types";
import type { DashboardStatsResult } from "../../lib/hooks";
import { CHART_TOOLTIP_STYLE } from "./chartTheme";

interface HourlyChartProps {
  data: DashboardStatsResult["hourlyStacked"];
  buckets: PersonBuckets[];
  getColor: (name: string, idx: number) => string;
  showLegend: boolean;
}

/**
 * Stacked hourly-rhythm bar chart (one stacked bar series per person).
 */
export default function HourlyChart({ data, buckets, getColor, showLegend }: HourlyChartProps) {
  return (
    <ChartCard title="Hourly rhythm">
      <div className="chart-container-sm">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} barGap={-1}>
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
              contentStyle={CHART_TOOLTIP_STYLE}
              cursor={{ fill: "rgba(255,255,255,0.04)" }}
            />
            {buckets.map((p, idx) => (
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
  );
}

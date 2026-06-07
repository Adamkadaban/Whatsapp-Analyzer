import {
  Legend,
  PolarAngleAxis,
  PolarGrid,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import ChartCard from "../ChartCard";
import type { PersonBuckets } from "../../lib/types";
import { CHART_TOOLTIP_STYLE } from "./chartTheme";

interface ActivityRadarProps {
  title: string;
  data: Record<string, number | string>[];
  buckets: PersonBuckets[];
  getColor: (name: string, idx: number) => string;
  showLegend: boolean;
}

/**
 * Per-person activity radar chart. Used for both the "Monthly footprint" and
 * "Weekday footprint" cards, which were previously two near-identical inline
 * blocks differing only by title and data.
 */
export default function ActivityRadar({
  title,
  data,
  buckets,
  getColor,
  showLegend,
}: ActivityRadarProps) {
  return (
    <ChartCard title={title}>
      <div className="chart-container-lg">
        <ResponsiveContainer width="100%" height="100%">
          <RadarChart data={data} outerRadius={showLegend ? 90 : 110}>
            <PolarGrid stroke="rgba(255,255,255,0.08)" />
            <PolarAngleAxis dataKey="label" tick={{ fill: "var(--muted)", fontSize: 12 }} />
            <Tooltip contentStyle={CHART_TOOLTIP_STYLE} />
            {buckets.map((p, idx) => {
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
  );
}

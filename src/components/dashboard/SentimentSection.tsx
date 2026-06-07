import { useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import ChartCard from "../ChartCard";
import type { DashboardStatsResult } from "../../lib/hooks";
import { CHART_TOOLTIP_STYLE } from "./chartTheme";

interface SentimentSectionProps {
  laneData: DashboardStatsResult["sentimentLaneData"];
  overall: DashboardStatsResult["sentimentOverall"];
  stacked: DashboardStatsResult["sentimentStacked"];
  timeline: DashboardStatsResult["sentimentTimeline"];
  getColor: (name: string, idx: number) => string;
  showLegend: boolean;
}

/**
 * The three-card sentiment analysis section: per-person mood lanes, polarity
 * mix, and overall mood drift. The hover-highlight state for the polarity bars
 * is local UI state and lives here.
 */
export default function SentimentSection({
  laneData,
  overall,
  stacked,
  timeline,
  getColor,
  showLegend,
}: SentimentSectionProps) {
  const [activeSentimentIndex, setActiveSentimentIndex] = useState<number | null>(null);
  const sentimentOpacity = (idx: number) =>
    activeSentimentIndex === null || activeSentimentIndex === idx ? 1 : 0.3;

  return (
    <div className="grid chart-grid">
      <ChartCard title="Mood lanes by person" subtitle="Daily mean sentiment (−1 to 1)">
        <div className="chart-container-md">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={laneData} margin={{ left: -4, right: 8 }}>
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
              <Tooltip contentStyle={CHART_TOOLTIP_STYLE} />
              {overall.map((p, idx) => (
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
              data={stacked}
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
                contentStyle={CHART_TOOLTIP_STYLE}
                formatter={(v: number) => `${v}%`}
                cursor={{ fill: "rgba(255,255,255,0.04)" }}
              />
              <Bar dataKey="pos" stackId="sent" name="Positive" radius={[4, 4, 0, 0]} fill="#7cf9c0">
                {stacked.map((entry, idx) => (
                  <Cell key={`${entry.name}-pos`} opacity={sentimentOpacity(idx)} />
                ))}
              </Bar>
              <Bar dataKey="neu" stackId="sent" name="Neutral" radius={[0, 0, 0, 0]} fill="#ffd166">
                {stacked.map((entry, idx) => (
                  <Cell key={`${entry.name}-neu`} opacity={sentimentOpacity(idx)} />
                ))}
              </Bar>
              <Bar dataKey="neg" stackId="sent" name="Negative" radius={[0, 0, 4, 4]} fill="#ff7edb">
                {stacked.map((entry, idx) => (
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
            <AreaChart data={timeline} margin={{ left: -8, right: 8 }}>
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
              <Tooltip contentStyle={CHART_TOOLTIP_STYLE} />
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
  );
}

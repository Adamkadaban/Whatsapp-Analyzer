import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import ChartCard from "../ChartCard";
import type { DashboardStatsResult } from "../../lib/hooks";
import { CHART_TOOLTIP_STYLE } from "./chartTheme";

interface ConversationStartersProps {
  data: DashboardStatsResult["conversationStartersData"];
  getColor: (name: string, idx: number) => string;
}

/**
 * Bar chart of who starts conversations (first message after inactivity).
 */
export default function ConversationStarters({ data, getColor }: ConversationStartersProps) {
  return (
    <ChartCard title="Conversation starters" subtitle="First message after inactivity">
      <div className="chart-container-md">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ left: -10, right: 10 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
            <XAxis dataKey="name" hide axisLine={false} tickLine={false} />
            <YAxis
              tick={{ fill: "var(--muted)", fontSize: 12 }}
              axisLine={false}
              tickLine={false}
              allowDecimals={false}
            />
            <Tooltip
              contentStyle={CHART_TOOLTIP_STYLE}
              cursor={{ fill: "rgba(255,255,255,0.04)" }}
            />
            <Bar dataKey="value" name="Starts" radius={[6, 6, 0, 0]} fill="#7cf9c0">
              <LabelList dataKey="name" position="top" fill="var(--muted)" fontSize={12} />
              {data.map((entry, index) => (
                <Cell key={entry.name} fill={getColor(entry.name, index)} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </ChartCard>
  );
}

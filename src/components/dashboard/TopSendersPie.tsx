import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import ChartCard from "../ChartCard";
import PieTooltip from "../PieTooltip";
import type { DashboardStatsResult } from "../../lib/hooks";

interface TopSendersPieProps {
  data: DashboardStatsResult["senderData"];
  getColor: (name: string, idx: number) => string;
  showLegend: boolean;
}

/**
 * Donut chart of message counts by person.
 */
export default function TopSendersPie({ data, getColor, showLegend }: TopSendersPieProps) {
  return (
    <ChartCard title="Top senders" subtitle="Messages by person">
      <div
        className="chart-container-sm"
        role="img"
        aria-label="Pie chart: share of messages sent by each person."
      >
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="name"
              innerRadius={60}
              outerRadius={90}
              paddingAngle={2}
            >
              {data.map((entry, idx) => (
                <Cell key={entry.name} fill={getColor(entry.name, idx)} />
              ))}
            </Pie>
            <Tooltip content={<PieTooltip />} wrapperStyle={{ color: "#fff" }} />
            {showLegend && <Legend />}
          </PieChart>
        </ResponsiveContainer>
      </div>
    </ChartCard>
  );
}

import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import ChartCard from "../components/ChartCard";
import StatCard from "../components/StatCard";
import { daily, hourly, kpis, topSenders } from "../data/mock";

const colors = ["#64d8ff", "#ff7edb", "#8c7bff", "#7cf9c0", "#ffb347"];

export default function Dashboard() {
  return (
    <main>
      <section className="container" style={{ display: "grid", gap: "24px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: "16px", alignItems: "center", flexWrap: "wrap" }}>
          <div>
            <div className="tag">Sample data preview</div>
            <h2 style={{ margin: "8px 0" }}>Dashboard</h2>
            <p style={{ color: "var(--muted)", margin: 0 }}>Drop your own export to see everything recompute instantly. Charts run fully on the client.</p>
          </div>
          <a className="btn" href="#upload">Upload chat</a>
        </div>

        <div className="grid stat-grid">
          {kpis.map((kpi) => (
            <StatCard key={kpi.label} {...kpi} />
          ))}
        </div>

        <div className="grid chart-grid">
          <ChartCard title="Daily volume">
            <div style={{ height: 240 }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={daily} margin={{ left: -20 }}>
                  <defs>
                    <linearGradient id="grad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.6} />
                      <stop offset="100%" stopColor="var(--primary)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                  <XAxis dataKey="day" tick={{ fill: "var(--muted)", fontSize: 12 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: "var(--muted)", fontSize: 12 }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ background: "#0a0b0f", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12 }} />
                  <Area dataKey="messages" stroke="var(--primary)" fill="url(#grad)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </ChartCard>

          <ChartCard title="Hourly rhythm">
            <div style={{ height: 240 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={hourly}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                  <XAxis dataKey="hour" tickFormatter={(v) => `${v}:00`} tick={{ fill: "var(--muted)", fontSize: 12 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: "var(--muted)", fontSize: 12 }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ background: "#0a0b0f", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12 }} />
                  <Bar dataKey="messages" radius={[10, 10, 0, 0]}>
                    {hourly.map((_, idx) => (
                      <Cell key={idx} fill={colors[idx % colors.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </ChartCard>

          <ChartCard title="Top senders">
            <div style={{ height: 240 }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={topSenders} dataKey="value" nameKey="name" innerRadius={60} outerRadius={90} paddingAngle={2}>
                    {topSenders.map((_, idx) => (
                      <Cell key={idx} fill={colors[idx % colors.length]} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ background: "#0a0b0f", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </ChartCard>
        </div>

        <div id="upload" className="card" style={{ display: "grid", gap: "10px" }}>
          <div className="tag">Coming next</div>
          <h3 style={{ margin: 0 }}>Upload your chat to drive these charts</h3>
          <p style={{ color: "var(--muted)", margin: 0 }}>
            The next step is wiring the Rust WASM core to parse and aggregate client-side, then hydrate these visualizations with your data. Drag-and-drop, live filters, and CSV/PDF exports will land here.
          </p>
          <div className="chip-list">
            <span className="badge">Web Worker offload</span>
            <span className="badge">Arrow buffers</span>
            <span className="badge">Filter pills</span>
          </div>
        </div>
      </section>
    </main>
  );
}

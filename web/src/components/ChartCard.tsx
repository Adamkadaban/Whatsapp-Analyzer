import { ReactNode } from "react";

export default function ChartCard({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <div className="card" style={{ display: "grid", gap: "12px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px" }}>
        <div style={{ fontWeight: 700 }}>{title}</div>
        {action}
      </div>
      {children}
    </div>
  );
}

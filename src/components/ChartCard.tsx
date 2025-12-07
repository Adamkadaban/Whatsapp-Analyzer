import { ReactNode } from "react";

export default function ChartCard({ title, subtitle, action, children }: { title: string; subtitle?: ReactNode; action?: ReactNode; children: ReactNode }) {
  return (
    <div className="card" style={{ display: "grid", gap: "12px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px" }}>
        <div>
          <div style={{ fontWeight: 700 }}>{title}</div>
          {subtitle && <div style={{ color: "var(--muted)", fontSize: 13 }}>{subtitle}</div>}
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}

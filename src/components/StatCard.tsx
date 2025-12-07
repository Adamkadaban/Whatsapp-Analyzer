type Props = { label: string; value: string; detail?: string };

export default function StatCard({ label, value, detail }: Props) {
  return (
    <div className="card glow-ring" style={{ display: "grid", gap: "8px" }}>
      <span className="badge">{label}</span>
      <div style={{ fontSize: "28px", fontWeight: 700 }}>{value}</div>
      {detail && <div style={{ color: "var(--muted)", fontSize: "14px" }}>{detail}</div>}
    </div>
  );
}

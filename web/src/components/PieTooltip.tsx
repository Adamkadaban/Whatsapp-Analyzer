import type { TooltipProps } from "recharts";

export type SenderDatum = { name: string; value: number };

export default function PieTooltip({ active, payload }: TooltipProps<number, string>) {
  if (!active || !payload?.length) return null;
  const item = payload[0];
  const displayName = (item.payload as SenderDatum | undefined)?.name ?? item.name ?? "";
  const count = item.value ?? 0;
  const percent = typeof item.percent === "number" ? Math.round(item.percent * 1000) / 10 : null;

  return (
    <div
      style={{
        background: "#0a0b0f",
        border: "1px solid rgba(255,255,255,0.08)",
        borderRadius: 12,
        padding: "10px 12px",
        color: "#fff",
        minWidth: 160,
      }}
    >
      <div style={{ fontWeight: 700, marginBottom: 4, color: "#fff" }}>{displayName}</div>
      <div style={{ color: "rgba(255,255,255,0.75)", fontSize: 12 }}>
        {count.toLocaleString()} messages{percent !== null ? ` · ${percent}%` : ""}
      </div>
    </div>
  );
}

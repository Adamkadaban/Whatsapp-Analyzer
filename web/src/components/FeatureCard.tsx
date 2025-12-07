type Props = { title: string; body: string; icon: string };

export default function FeatureCard({ title, body, icon }: Props) {
  return (
    <div className="card" style={{ display: "grid", gap: "10px" }}>
      <div className="tag" style={{ width: "fit-content" }}>
        <span>{icon}</span>
        <span>{title}</span>
      </div>
      <p style={{ color: "var(--muted)", margin: 0, lineHeight: 1.6 }}>{body}</p>
    </div>
  );
}

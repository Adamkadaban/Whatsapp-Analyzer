import FeatureCard from "../components/FeatureCard";
import { Link } from "react-router-dom";

const features = [
  {
    title: "Private by default",
    body: "Everything runs in your browser with WASM + Polars. No uploads, no tracking, just insights.",
    icon: "🔒",
  },
  {
    title: "Charts you can feel",
    body: "Responsive visuals, radial hours, streak calendars, and exportable PNGs ready for sharing.",
    icon: "📊",
  },
  {
    title: "Fast at scale",
    body: "Rust pipelines + Web Workers keep the UI smooth even on 300k+ message histories.",
    icon: "⚡",
  },
  {
    title: "PDF & CSV",
    body: "Download a polished PDF summary or the raw aggregates as CSV/JSON with one click.",
    icon: "📝",
  },
];

export default function Landing() {
  return (
    <main>
      <section className="container hero">
        <div>
          <div className="tag">Client-only WhatsApp analytics</div>
          <h1>Insightful, beautiful, and private.</h1>
          <p>
            Drop in your export and watch Polars-in-WASM crunch it instantly. We go beyond message counts with streaks, response times, media breakdowns, and gorgeous visuals.
          </p>
          <div className="pill-row">
            <span className="tag">Polars WASM</span>
            <span className="tag">Web Workers</span>
            <span className="tag">No uploads</span>
            <span className="tag">PDF export</span>
          </div>
          <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
            <Link className="btn" to="/dashboard">
              View sample dashboard
            </Link>
            <a className="btn" href="https://github.com/Adamkadaban/WhatsappAnalyzerV2" target="_blank" rel="noreferrer" style={{ background: "rgba(255,255,255,0.06)", color: "var(--text)", boxShadow: "none" }}>
              Star on GitHub
            </a>
          </div>
        </div>
        <div className="card glow-ring" style={{ display: "grid", gap: "14px" }}>
          <div className="tag">Live preview</div>
          <div style={{ fontWeight: 700, fontSize: "22px" }}>Drop your chat file.</div>
          <p style={{ color: "var(--muted)", margin: 0 }}>We parse on-device, summarize, and render charts immediately. Nothing leaves your browser.</p>
          <div className="card" style={{ background: "var(--panel-strong)", display: "grid", gap: "6px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span>Messages</span>
              <span style={{ color: "var(--primary)", fontWeight: 700 }}>128,443</span>
            </div>
            <div style={{ height: "8px", width: "100%", background: "rgba(255,255,255,0.08)", borderRadius: "999px", overflow: "hidden" }}>
              <div style={{ width: "76%", height: "100%", background: "linear-gradient(90deg, var(--primary), var(--accent))" }}></div>
            </div>
            <div className="chip-list">
              <span className="badge">Streaks: 12</span>
              <span className="badge">Avg response: 4m</span>
              <span className="badge">Top emoji: 😂</span>
            </div>
          </div>
        </div>
      </section>

      <section className="container">
        <div className="grid feature-grid">
          {features.map((f) => (
            <FeatureCard key={f.title} {...f} />
          ))}
        </div>
      </section>

      <section className="container">
        <div className="card glow-ring" style={{ display: "grid", gap: "12px", textAlign: "center" }}>
          <div className="tag" style={{ margin: "0 auto" }}>Two screens, zero servers</div>
          <h2 style={{ margin: 0 }}>Landing to insights in seconds</h2>
          <p style={{ color: "var(--muted)", margin: "0 0 12px" }}>
            Upload on the landing page, then jump to the dashboard for charts, filters, and exports. Everything stays local.
          </p>
          <Link className="btn" to="/dashboard" style={{ margin: "0 auto" }}>
            Open sample dashboard
          </Link>
        </div>
      </section>
    </main>
  );
}

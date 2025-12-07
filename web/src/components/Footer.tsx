export default function Footer() {
  return (
    <footer className="footer">
      <div className="container" style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: "8px", alignItems: "center" }}>
        <div style={{ color: "var(--muted)", fontSize: 12 }}>Not affiliated with WhatsApp or Meta.</div>
        <div className="chip-list">
          <span className="badge">Client-only</span>
          <span className="badge">Open source</span>
          <a
            className="badge"
            href="https://github.com/Adamkadaban/WhatsappAnalyzerV2"
            target="_blank"
            rel="noreferrer"
            style={{ color: "white", borderBottom: "1px solid rgba(255,255,255,0.2)" }}
          >
            View code
          </a>
        </div>
      </div>
    </footer>
  );
}

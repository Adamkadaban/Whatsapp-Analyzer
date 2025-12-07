export default function Footer() {
  return (
    <footer className="footer">
      <div className="container" style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: "12px" }}>
        <div>Built for private, on-device chat insights.</div>
        <div className="chip-list">
          <span className="badge">Client-only</span>
          <span className="badge">Rust + Polars WASM (coming)</span>
          <span className="badge">Open source</span>
        </div>
      </div>
    </footer>
  );
}

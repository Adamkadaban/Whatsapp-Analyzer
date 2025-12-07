import { Link } from "react-router-dom";

export default function Landing() {
  return (
    <main>
      <section className="container hero">
        <div>
          <div className="tag">Fast, Free, and Safe</div>
          <h1>WhatsApp insights in seconds.</h1>
          <p>
            Drop your chat export and see your trends right away.
            <span style={{ fontWeight: 700, textDecoration: "underline", textDecorationStyle: "dotted", textDecorationColor: "rgba(255,255,255,0.5)", marginLeft: 6 }}>
              Nothing leaves your computer
            </span>
            , and you can review the source anytime.
          </p>
          <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
              <Link
                className="btn"
                to="/dashboard"
                style={{
                  background: "rgba(100, 216, 255, 0.18)",
                  color: "white",
                  boxShadow: "0 10px 30px rgba(100, 216, 255, 0.25)",
                  border: "1px solid rgba(100, 216, 255, 0.35)",
                  fontWeight: 700,
                }}
              >
                Analyze your chat
              </Link>
              <a
                className="btn ghost"
                href="https://github.com/Adamkadaban/Whatsapp-Analyzer"
                target="_blank"
                rel="noreferrer"
                style={{ borderColor: "rgba(255,255,255,0.28)", color: "rgba(255,255,255,0.88)", boxShadow: "none" }}
              >
                View source
              </a>
          </div>
        </div>
      </section>
    </main>
  );
}

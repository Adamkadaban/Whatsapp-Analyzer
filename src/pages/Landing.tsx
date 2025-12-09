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
      <section
        className="container"
        style={{
          padding: "32px 16px",
          gap: "16px",
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
        }}
      >
        <div>
          <h2 style={{ marginBottom: 8 }}>Export on iPhone</h2>
          <ol style={{ lineHeight: 1.6, paddingLeft: 20 }}>
            <li>Open the chat, tap its name to enter Chat Info.</li>
            <li>Scroll to the bottom, tap <strong>Export Chat</strong>.</li>
            <li>Choose <strong>Without Media</strong> and save/share the TXT.</li>
          </ol>
        </div>
        <div>
          <h2 style={{ marginBottom: 8 }}>Export on Android</h2>
          <ol style={{ lineHeight: 1.6, paddingLeft: 20 }}>
            <li>Open the chat, tap &middot;&middot;&middot; &rarr; More &rarr; Export chat.</li>
            <li>Pick <strong>Without Media</strong> to keep the file small.</li>
            <li>
              Share or save the TXT, then drop it <Link to="/dashboard">here</Link> to analyze.
            </li>
          </ol>
        </div>
      </section>
    </main>
  );
}

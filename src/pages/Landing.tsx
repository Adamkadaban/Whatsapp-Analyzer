import { useState } from "react";
import { Link } from "react-router-dom";

export default function Landing() {
  const [showPrivacyTooltip, setShowPrivacyTooltip] = useState(false);

  return (
    <main>
      <section className="container hero">
        <div>
          <div className="tag">Fast, Free, and Safe</div>
          <h1>WhatsApp insights in seconds.</h1>
          <p>
            Drop your chat export and see your trends right away.
            <span 
              style={{ position: "relative", display: "inline-block", fontWeight: 700, textDecoration: "underline", textDecorationStyle: "dotted", textDecorationColor: "rgba(255,255,255,0.5)", marginLeft: 6 }}
              onMouseEnter={() => setShowPrivacyTooltip(true)}
              onMouseLeave={() => setShowPrivacyTooltip(false)}
              onFocus={() => setShowPrivacyTooltip(true)}
              onBlur={() => setShowPrivacyTooltip(false)}
              tabIndex={0}
            >
              Nothing leaves your computer
              {showPrivacyTooltip && (
                <span
                  style={{
                    position: "absolute",
                    top: "calc(100% + 6px)",
                    left: "50%",
                    transform: "translateX(-50%)",
                    minWidth: 260,
                    maxWidth: 320,
                    padding: "10px 12px",
                    borderRadius: 12,
                    background: "linear-gradient(135deg, #0d1117, #131a24)",
                    border: "1px solid rgba(255,255,255,0.12)",
                    boxShadow: "0 12px 32px rgba(0,0,0,0.35)",
                    color: "#fff",
                    fontSize: 13,
                    lineHeight: 1.4,
                    zIndex: 10,
                    textDecoration: "none",
                    fontWeight: 400,
                    textAlign: "left",
                    whiteSpace: "normal",
                  }}
                >
                  Your chats are never sent anywhere. Everything runs 100% locally in your browser.
                </span>
              )}
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

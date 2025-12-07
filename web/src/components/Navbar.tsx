import { Link, useLocation } from "react-router-dom";

const links = [
  { to: "/", label: "Home" },
  { to: "/dashboard", label: "Insights" },
];

export default function Navbar() {
  const location = useLocation();
  return (
    <header className="navbar">
      <Link to="/" className="logo">
        <span style={{ color: "var(--primary)" }}>WA</span> Analyzer
      </Link>
      <nav style={{ display: "flex", gap: "14px", alignItems: "center" }}>
        {links.map((link) => {
          const active = location.pathname === link.to;
          return (
            <Link
              key={link.to}
              to={link.to}
              style={{
                padding: "10px 14px",
                borderRadius: "999px",
                background: active ? "rgba(255,255,255,0.08)" : "transparent",
                color: active ? "white" : "var(--muted)",
                border: "1px solid rgba(255,255,255,0.08)",
                fontWeight: 600,
              }}
            >
              {link.label}
            </Link>
          );
        })}
        <a
          className="btn"
          href="https://github.com/Adamkadaban/WhatsappAnalyzerV2"
          target="_blank"
          rel="noreferrer"
        >
          View Source
        </a>
      </nav>
    </header>
  );
}

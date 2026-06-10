import React from "react";
import ReactDOM from "react-dom/client";
import { HashRouter } from "react-router-dom";
import App from "./App";
import "./styles.css";

// When a new version is deployed, the content-hashed JS chunks on the server
// change. A tab still running the previous build (or holding a stale cached
// index.html) then 404s the moment it lazily imports a chunk — e.g. jsPDF /
// html-to-image during PDF export — which surfaces as "Failed to fetch
// dynamically imported module". Vite raises `vite:preloadError` for exactly
// this; reload once to pick up the fresh build instead of showing a confusing
// failure. A short time-guard prevents reload loops if a chunk is genuinely
// unavailable.
window.addEventListener("vite:preloadError", (event) => {
  event.preventDefault();
  const KEY = "preloadErrorReloadAt";
  const last = Number(sessionStorage.getItem(KEY) ?? "0");
  if (Date.now() - last < 10_000) return;
  sessionStorage.setItem(KEY, String(Date.now()));
  window.location.reload();
});

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <HashRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <App />
    </HashRouter>
  </React.StrictMode>,
);

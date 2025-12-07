# Whatsapp-Analyzer

Client-side WhatsApp chat analytics with a React/Vite UI. Everything runs locally in the browser—no uploads.

## Features
- Local-only parsing and analytics (stays on your device)
- Responsive UI on large exports
- Rich visuals: timeline, hourly rhythm, per-person stats, emoji/word clouds, radar footprints
- Export options: CSV/JSON aggregates, PDF snapshot (client-side)
- GitHub Pages deployment with custom domain `wa.hackback.zip`

## Prerequisites
- Node.js 20+
- pnpm 9+
- Rust toolchain with `wasm-pack` (`cargo install wasm-pack` if missing)

## Setup
```bash
pnpm install

# Build WASM package
cd web/chat-core-wasm
wasm-pack build --target web --out-dir ../pkg --out-name chat_core_wasm

# Start dev server
cd ../
pnpm dev
```

## Tests and Coverage
- Frontend: `pnpm vitest run --coverage`
- Rust (CLI core): `cargo test`

## Build
```bash
# From web/
pnpm build
```
Outputs go to `web/dist`. The GitHub Actions workflow (`.github/workflows/deploy.yml`) builds WASM, runs the web build, writes the CNAME (`wa.hackback.zip`), and deploys to GitHub Pages.

## Exporting a PDF snapshot
- Load a chat on the Dashboard, then click **Export PDF** in the header controls.
- The PDF mirrors the current dashboard layout and styling; your data stays on-device.

## Notes
- Data never leaves the browser. Drag-drop or file-pick your exported `.txt` chat and view insights instantly.
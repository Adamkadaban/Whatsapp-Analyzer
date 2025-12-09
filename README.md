# Whatsapp-Analyzer

<div align="center">
  <h3>
    <span style="color: #25d366;">WA</span> Analyzer
  </h3>
  <p><strong>WhatsApp insights in seconds</strong></p>
  <p>100% Private • Runs Locally • Free</p>
  <br />
  <a href="https://wa.hackback.zip">
    <img src="https://img.shields.io/badge/Try%20It-wa.hackback.zip-25d366?style=for-the-badge" alt="Try it" />
  </a>
</div>

<br />

Client-side WhatsApp chat analytics with a React/Vite UI. Everything runs locally in the browser—no uploads.

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
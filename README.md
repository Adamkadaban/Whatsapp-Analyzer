<p align="center">
  <img src="public/logo.png" alt="WA Analyzer" height="50" />
</p>
<p align="center">
  <strong>WhatsApp insights in seconds</strong>
</p>
<p align="center">
  100% Private • Runs Locally • Free
</p>
<p align="center">
  <a href="https://wa.hackback.zip">
    <img src="https://img.shields.io/badge/Try%20It-wa.hackback.zip-25d366?style=for-the-badge" alt="Try it" />
  </a>
</p>

<br />

Client-side WhatsApp chat analytics with a React/Vite UI using Rust, Polars, and WASM. Everything runs locally in the browser.

## Prerequisites
- Node.js 20+
- pnpm 9+
- Rust toolchain with `wasm-pack` (`cargo install wasm-pack` if missing)

## Setup
```bash
pnpm install

# Build WASM package
cd chat-core-wasm
wasm-pack build --target web --out-dir ../pkg --out-name chat_core_wasm

# Start dev server
cd ../
pnpm dev
```

## Development

### Linting
```bash
# Frontend (ESLint)
pnpm lint

# Rust (fmt + clippy)
cd chat-core-wasm
cargo fmt --check
cargo clippy -- -D warnings
```

### Testing
```bash
# Frontend (75 tests)
pnpm test

# Rust WASM (28 tests)
cd chat-core-wasm
cargo test
```

## Build
```bash
# From web/
pnpm build
```

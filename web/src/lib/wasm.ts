import type { Summary } from "../../pkg/chat_core_wasm";

type WasmMod = typeof import("../../pkg/chat_core_wasm");

let wasmPromise: Promise<WasmMod> | null = null;

async function getWasm(): Promise<WasmMod> {
  if (!wasmPromise) {
    wasmPromise = import("../../pkg/chat_core_wasm").then((mod) => {
      // Initialize wasm-bindgen module and set panic hook if present.
      const init = (mod.default as unknown as () => Promise<void>) ?? mod.default;
      return Promise.resolve(init()).then(() => {
        try {
          mod.init_panic_hook();
        } catch (_) {
          /* optional */
        }
        return mod;
      });
    });
  }
  return wasmPromise;
}

export async function analyzeText(raw: string): Promise<Summary> {
  const mod = await getWasm();
  return mod.analyze_chat(raw, 150, 150) as unknown as Summary;
}

export type { Summary };

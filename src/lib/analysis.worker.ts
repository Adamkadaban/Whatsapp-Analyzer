/**
 * Web Worker for running WASM analysis off the main thread.
 * This prevents Chrome's "page unresponsive" dialog during long computations.
 */

import init, { analyze_chat, init_panic_hook } from "../../pkg/chat_core_wasm.js";

let initialized = false;

async function ensureWasm() {
  if (initialized) return;
  await init();
  init_panic_hook();
  initialized = true;
}

export type WorkerRequest = {
  id: number;
  type: "analyze";
  raw: string;
  topWords: number;
  topEmojis: number;
};

export type WorkerResponse =
  | { id: number; type: "success"; result: unknown }
  | { id: number; type: "error"; error: string };

self.onmessage = async (e: MessageEvent<WorkerRequest>) => {
  const { id, type, raw, topWords, topEmojis } = e.data;

  if (type === "analyze") {
    try {
      await ensureWasm();
      const result = analyze_chat(raw, topWords, topEmojis);
      self.postMessage({ id, type: "success", result } satisfies WorkerResponse);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      self.postMessage({ id, type: "error", error: message } satisfies WorkerResponse);
    }
  }
};

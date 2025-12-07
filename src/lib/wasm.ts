import init, { analyze_chat, init_panic_hook, type Summary } from "../../pkg/chat_core_wasm.js";

let initialized = false;

async function ensureWasm() {
	if (initialized) return;
	await init();
	init_panic_hook();
	initialized = true;
}

export async function analyzeText(raw: string): Promise<Summary> {
	await ensureWasm();
	// Yield to allow React to render loading state before blocking WASM call
	await new Promise((resolve) => setTimeout(resolve, 0));
	return analyze_chat(raw, 50, 50);
}

export type { Summary };

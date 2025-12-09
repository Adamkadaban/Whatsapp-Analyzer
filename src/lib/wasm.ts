import init, { analyze_chat, init_panic_hook, type Summary } from "../../pkg/chat_core_wasm.js";

let initialized = false;

// Set to true to enable performance timing logs in the console.
const DEBUG_TIMING = import.meta.env.DEV;

function logTiming(label: string, data: Record<string, unknown>) {
	if (DEBUG_TIMING) {
		console.info(label, data);
	}
}

async function ensureWasm() {
	if (initialized) return;
	const start = performance.now();
	await init();
	init_panic_hook();
	initialized = true;
	logTiming("[analysis] wasm initialized", { ms: Number((performance.now() - start).toFixed(1)) });
}

export async function analyzeText(raw: string): Promise<Summary> {
	const totalStart = performance.now();
	await ensureWasm();
	const afterInit = performance.now();
	// Yield to allow React to render loading state before blocking WASM call
	await new Promise((resolve) => setTimeout(resolve, 0));
	const analyzeStart = performance.now();
	const result = analyze_chat(raw, 50, 50);
	const analyzeMs = Number((performance.now() - analyzeStart).toFixed(1));
	const totalMs = Number((performance.now() - totalStart).toFixed(1));
	logTiming("[analysis] analyze_chat completed", { ms: analyzeMs, chars: raw.length });
	logTiming("[analysis] analyzeText total", { ms: totalMs, wasmReadyMs: Number((afterInit - totalStart).toFixed(1)) });
	return result;
}

export type { Summary };

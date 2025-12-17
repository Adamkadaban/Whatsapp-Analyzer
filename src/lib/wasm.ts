import type { Summary } from "./types";
import type { WorkerRequest, WorkerResponse } from "./analysis.worker";
import { ANALYSIS_TOP_WORDS, ANALYSIS_TOP_EMOJIS } from "./constants";

// Set to true to enable performance timing logs in the console.
const DEBUG_TIMING = import.meta.env.DEV;

function logTiming(label: string, data: Record<string, unknown>) {
	if (DEBUG_TIMING) {
		console.info(label, data);
	}
}

// Lazy-loaded worker instance
let worker: Worker | null = null;
let requestId = 0;
const pending = new Map<number, { resolve: (v: Summary) => void; reject: (e: Error) => void }>();

function getWorker(): Worker {
	if (!worker) {
		worker = new Worker(new URL("./analysis.worker.ts", import.meta.url), { type: "module" });
		worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
			const { id, type } = e.data;
			const callbacks = pending.get(id);
			if (!callbacks) return;
			pending.delete(id);

			if (type === "success") {
				callbacks.resolve(e.data.result as Summary);
			} else {
				callbacks.reject(new Error(e.data.error));
			}
		};
		worker.onerror = (e) => {
			console.error("[analysis] worker error", e);
			// Reject all pending requests
			for (const [id, callbacks] of pending) {
				callbacks.reject(new Error("Worker crashed"));
				pending.delete(id);
			}
		};
	}
	return worker;
}

/**
 * Preload the WASM worker during browser idle time.
 * This ensures the worker and WASM module are ready before the user uploads a file,
 * making the first analysis feel faster.
 */
export function preloadWorker(): void {
	if (typeof window !== "undefined" && "requestIdleCallback" in window) {
		window.requestIdleCallback(
			() => {
				logTiming("[analysis] preloading worker on idle", {});
				getWorker();
			},
			{ timeout: 5000 }
		);
	} else if (typeof window !== "undefined") {
		// Fallback for browsers without requestIdleCallback (Safari)
		setTimeout(() => {
			logTiming("[analysis] preloading worker (setTimeout fallback)", {});
			getWorker();
		}, 1000);
	}
}

export async function analyzeText(raw: string): Promise<Summary> {
	const totalStart = performance.now();

	return new Promise<Summary>((resolve, reject) => {
		const id = ++requestId;
		const w = getWorker();

		pending.set(id, {
			resolve: (result) => {
				logTiming("[analysis] analyzeText completed", {
					ms: Number((performance.now() - totalStart).toFixed(1)),
					chars: raw.length,
				});
				resolve(result);
			},
			reject,
		});

		const request: WorkerRequest = { id, type: "analyze", raw, topWords: ANALYSIS_TOP_WORDS, topEmojis: ANALYSIS_TOP_EMOJIS };
		w.postMessage(request);
	});
}

export type { Summary };

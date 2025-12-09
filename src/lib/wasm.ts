import type { Summary } from "./types";
import type { WorkerRequest, WorkerResponse } from "./analysis.worker";

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

		const request: WorkerRequest = { id, type: "analyze", raw, topWords: 50, topEmojis: 50 };
		w.postMessage(request);
	});
}

export type { Summary };

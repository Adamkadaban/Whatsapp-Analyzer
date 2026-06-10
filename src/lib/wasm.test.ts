import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ANALYSIS_TOP_WORDS, ANALYSIS_TOP_EMOJIS } from "./constants";

/**
 * Mock Worker that records instances and lets tests drive onmessage/onerror.
 * wasm.ts lazily creates a single Worker via `new Worker(url, opts)`.
 */
interface WorkerRequestLike {
  id: number;
  type: string;
  raw: string;
  topWords: number;
  topEmojis: number;
}

const workerInstances: MockWorker[] = [];

class MockWorker {
  onmessage: ((e: { data: unknown }) => void) | null = null;
  onerror: ((e: unknown) => void) | null = null;
  postMessage = vi.fn<(req: WorkerRequestLike) => void>();
  terminate = vi.fn();

  constructor(
    public url: string | URL,
    public options?: WorkerOptions,
  ) {
    workerInstances.push(this);
  }

  // Convenience helpers used by tests.
  emitMessage(data: unknown) {
    this.onmessage?.({ data });
  }

  emitError(e: unknown = new Event("error")) {
    this.onerror?.(e);
  }
}

describe("wasm worker client", () => {
  beforeEach(() => {
    vi.resetModules();
    workerInstances.length = 0;
    vi.stubGlobal("Worker", MockWorker as unknown as typeof Worker);
    // Silence the console.error emitted by the worker.onerror handler.
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("lazily creates one worker and posts a well-formed analyze request", async () => {
    const { analyzeText } = await import("./wasm");

    const promise = analyzeText("hello world");

    expect(workerInstances).toHaveLength(1);
    const worker = workerInstances[0];
    expect(worker.postMessage).toHaveBeenCalledTimes(1);

    const request = worker.postMessage.mock.calls[0][0];
    expect(request.type).toBe("analyze");
    expect(request.raw).toBe("hello world");
    expect(request.topWords).toBe(ANALYSIS_TOP_WORDS);
    expect(request.topEmojis).toBe(ANALYSIS_TOP_EMOJIS);
    expect(typeof request.id).toBe("number");

    // Resolve so the promise does not dangle.
    worker.emitMessage({ id: request.id, type: "success", result: { total_messages: 1 } });
    await promise;
  });

  it("resolves the pending request when a matching success message arrives", async () => {
    const { analyzeText } = await import("./wasm");

    const promise = analyzeText("chat text");
    const worker = workerInstances[0];
    const { id } = worker.postMessage.mock.calls[0][0];

    const result = { total_messages: 42, by_sender: [] };
    worker.emitMessage({ id, type: "success", result });

    await expect(promise).resolves.toEqual(result);
  });

  it("rejects the pending request when an error message arrives", async () => {
    const { analyzeText } = await import("./wasm");

    const promise = analyzeText("bad chat");
    const worker = workerInstances[0];
    const { id } = worker.postMessage.mock.calls[0][0];

    worker.emitMessage({ id, type: "error", error: "parse exploded" });

    await expect(promise).rejects.toThrow("parse exploded");
  });

  it("routes concurrent requests to the correct promise by id", async () => {
    const { analyzeText } = await import("./wasm");

    const p1 = analyzeText("first");
    const p2 = analyzeText("second");

    // Only one worker should ever be created (singleton).
    expect(workerInstances).toHaveLength(1);
    const worker = workerInstances[0];
    expect(worker.postMessage).toHaveBeenCalledTimes(2);

    const id1 = worker.postMessage.mock.calls[0][0].id;
    const id2 = worker.postMessage.mock.calls[1][0].id;
    expect(id1).not.toBe(id2);

    // Resolve out of order.
    worker.emitMessage({ id: id2, type: "success", result: { total_messages: 2 } });
    worker.emitMessage({ id: id1, type: "success", result: { total_messages: 1 } });

    await expect(p1).resolves.toEqual({ total_messages: 1 });
    await expect(p2).resolves.toEqual({ total_messages: 2 });
  });

  it("ignores messages whose id has no pending request", async () => {
    const { analyzeText } = await import("./wasm");

    const promise = analyzeText("chat");
    const worker = workerInstances[0];
    const { id } = worker.postMessage.mock.calls[0][0];

    // Unknown id should be a no-op and must not reject/resolve the real request.
    expect(() => worker.emitMessage({ id: id + 9999, type: "success", result: {} })).not.toThrow();

    let settled = false;
    promise.then(
      () => {
        settled = true;
      },
      () => {
        settled = true;
      },
    );
    await Promise.resolve();
    expect(settled).toBe(false);

    // The real message still resolves it.
    worker.emitMessage({ id, type: "success", result: { total_messages: 7 } });
    await expect(promise).resolves.toEqual({ total_messages: 7 });
  });

  it("rejects all pending requests when the worker crashes (onerror)", async () => {
    const { analyzeText } = await import("./wasm");

    const p1 = analyzeText("a");
    const p2 = analyzeText("b");
    const worker = workerInstances[0];

    worker.emitError();

    await expect(p1).rejects.toThrow("Worker crashed");
    await expect(p2).rejects.toThrow("Worker crashed");
  });

  it("clears pending state after a crash so later messages are no-ops", async () => {
    const { analyzeText } = await import("./wasm");

    const p1 = analyzeText("a");
    const worker = workerInstances[0];
    const { id } = worker.postMessage.mock.calls[0][0];

    worker.emitError();
    await expect(p1).rejects.toThrow("Worker crashed");

    // A late success for the already-rejected id must not throw.
    expect(() => worker.emitMessage({ id, type: "success", result: {} })).not.toThrow();
  });
});

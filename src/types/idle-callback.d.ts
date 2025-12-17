// Type declarations for requestIdleCallback API
// This API is not included in TypeScript's lib.dom.d.ts by default

interface IdleDeadline {
  readonly didTimeout: boolean;
  timeRemaining(): DOMHighResTimeStamp;
}

interface IdleRequestOptions {
  timeout?: number;
}

interface Window {
  requestIdleCallback(callback: (deadline: IdleDeadline) => void, options?: IdleRequestOptions): number;
  cancelIdleCallback(handle: number): void;
}

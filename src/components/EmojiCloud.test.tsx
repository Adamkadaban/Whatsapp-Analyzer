import { render, screen } from "@testing-library/react";
import EmojiCloud, { type CloudWord } from "./EmojiCloud";
import { vi } from "vitest";

vi.mock("d3-cloud", () => {
  return {
    default: () => {
      const self: any = {
        size: () => self,
        words: () => self,
        padding: () => self,
        spiral: () => self,
        font: () => self,
        fontSize: () => self,
        rotate: () => self,
        on: (_evt: string, cb: (output: any[]) => void) => {
          cb([
            { text: "😀", x: 0, y: 0, size: 32, rotate: 0, index: 0 },
            { text: "🔥", x: 8, y: 8, size: 28, rotate: 0, index: 1 },
          ]);
          return self;
        },
        start: () => self,
      };
      return self;
    },
  };
});

beforeAll(() => {
  class ResizeObserverMock {
    callback: ResizeObserverCallback;
    constructor(callback: ResizeObserverCallback) {
      this.callback = callback;
    }
    observe(target: Element) {
      this.callback([{ target } as ResizeObserverEntry], this as unknown as ResizeObserver);
    }
    unobserve() {}
    disconnect() {}
  }
  (globalThis as any).ResizeObserver = ResizeObserverMock;

  Object.defineProperty(HTMLElement.prototype, "clientWidth", {
    configurable: true,
    get() {
      return 360;
    },
  });
});

describe("EmojiCloud", () => {
  it("renders emoji words", () => {
    const words: CloudWord[] = [
      { label: "😀", value: 5 },
      { label: "🔥", value: 4 },
    ];

    render(<EmojiCloud words={words} height={200} />);

    expect(screen.getByText("😀")).toBeInTheDocument();
    expect(screen.getByText("🔥")).toBeInTheDocument();
  });
});

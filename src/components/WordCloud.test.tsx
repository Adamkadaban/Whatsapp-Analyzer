import { render, screen } from "@testing-library/react";
import WordCloud, { type CloudWord } from "./WordCloud";
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
            { text: "hello", x: 0, y: 0, size: 24, rotate: 0, index: 0 },
            { text: "world", x: 10, y: 10, size: 18, rotate: 0, index: 1 },
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
      this.callback([{ target } as ResizeObserverEntry], this);
    }
    disconnect() {}
  }
  (globalThis as any).ResizeObserver = ResizeObserverMock;

  Object.defineProperty(HTMLElement.prototype, "clientWidth", {
    configurable: true,
    get() {
      return 400;
    },
  });
});

describe("WordCloud", () => {
  it("renders cloud words", () => {
    const words: CloudWord[] = [
      { label: "hello", value: 5 },
      { label: "world", value: 3 },
    ];

    render(<WordCloud words={words} height={200} />);

    expect(screen.getByText("hello")).toBeInTheDocument();
    expect(screen.getByText("world")).toBeInTheDocument();
  });
});

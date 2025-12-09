import { render, screen } from "@testing-library/react";
import WordCloud, { type CloudWord } from "./WordCloud";
import { vi } from "vitest";

vi.mock("d3-cloud", () => {
  interface MockCloud {
    size: () => MockCloud;
    words: () => MockCloud;
    padding: () => MockCloud;
    spiral: () => MockCloud;
    font: () => MockCloud;
    fontSize: () => MockCloud;
    rotate: () => MockCloud;
    on: (evt: string, cb: (output: { text: string; x: number; y: number; size: number; rotate: number; index: number }[]) => void) => MockCloud;
    start: () => MockCloud;
  }
  return {
    default: (): MockCloud => {
      const self: MockCloud = {
        size: () => self,
        words: () => self,
        padding: () => self,
        spiral: () => self,
        font: () => self,
        fontSize: () => self,
        rotate: () => self,
        on: (_evt: string, cb) => {
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
      this.callback([{ target } as ResizeObserverEntry], this as unknown as ResizeObserver);
    }
    unobserve() {}
    disconnect() {}
  }
  globalThis.ResizeObserver = ResizeObserverMock;

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

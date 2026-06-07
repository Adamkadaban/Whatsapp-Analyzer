import { render, screen, act } from "@testing-library/react";
import WordCloud, { type CloudWord } from "./WordCloud";
import { vi } from "vitest";

// Track how many times the d3-cloud layout is constructed (one construction per
// relayout) so we can assert that rapid resize ticks are coalesced.
const { layoutSpy } = vi.hoisted(() => ({ layoutSpy: vi.fn() }));

vi.mock("d3-cloud", () => {
  interface MockCloud {
    size: () => MockCloud;
    words: () => MockCloud;
    padding: () => MockCloud;
    spiral: () => MockCloud;
    font: () => MockCloud;
    fontSize: () => MockCloud;
    rotate: () => MockCloud;
    on: (
      evt: string,
      cb: (
        output: {
          text: string;
          x: number;
          y: number;
          size: number;
          rotate: number;
          index: number;
        }[],
      ) => void,
    ) => MockCloud;
    start: () => MockCloud;
  }
  return {
    default: (): MockCloud => {
      layoutSpy();
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

// Captured ResizeObserver callbacks so tests can drive resize ticks manually.
const roCallbacks: ResizeObserverCallback[] = [];
let currentWidth = 400;

beforeAll(() => {
  class ResizeObserverMock {
    callback: ResizeObserverCallback;
    constructor(callback: ResizeObserverCallback) {
      this.callback = callback;
      roCallbacks.push(callback);
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
      return currentWidth;
    },
  });
});

beforeEach(() => {
  layoutSpy.mockClear();
  roCallbacks.length = 0;
  currentWidth = 400;
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

  it("debounces relayout across a burst of resize ticks", () => {
    vi.useFakeTimers();
    try {
      const words: CloudWord[] = [
        { label: "hello", value: 5 },
        { label: "world", value: 3 },
      ];

      render(<WordCloud words={words} height={200} />);

      // Initial synchronous measure runs the layout exactly once.
      expect(layoutSpy).toHaveBeenCalledTimes(1);

      const cb = roCallbacks[roCallbacks.length - 1];
      // Simulate a drag-resize: width changes and many ticks fire rapidly.
      currentWidth = 500;
      act(() => {
        for (let i = 0; i < 6; i++) cb([], {} as ResizeObserver);
      });

      // Still debounced — no extra relayout yet.
      expect(layoutSpy).toHaveBeenCalledTimes(1);

      act(() => {
        vi.advanceTimersByTime(150);
      });

      // The burst collapsed into a single additional relayout.
      expect(layoutSpy).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("exposes the cloud as an image with a descriptive accessible name", () => {
    const words: CloudWord[] = [
      { label: "hello", value: 5 },
      { label: "world", value: 3 },
    ];

    render(<WordCloud words={words} height={200} />);

    const img = screen.getByRole("img");
    expect(img.tagName.toLowerCase()).toBe("svg");
    const label = img.getAttribute("aria-label") ?? "";
    expect(label).toMatch(/word cloud/i);
    expect(label).toContain("hello");
  });
});

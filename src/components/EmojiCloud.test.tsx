import { render, screen } from "@testing-library/react";
import EmojiCloud, { type CloudWord } from "./EmojiCloud";
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
  globalThis.ResizeObserver = ResizeObserverMock;

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

  it("exposes the cloud as an image with a descriptive accessible name", () => {
    const words: CloudWord[] = [
      { label: "😀", value: 5 },
      { label: "🔥", value: 4 },
    ];

    render(<EmojiCloud words={words} height={200} />);

    const img = screen.getByRole("img");
    expect(img.tagName.toLowerCase()).toBe("svg");
    const label = img.getAttribute("aria-label") ?? "";
    expect(label).toMatch(/emoji cloud/i);
    expect(label).toContain("😀");
  });
});

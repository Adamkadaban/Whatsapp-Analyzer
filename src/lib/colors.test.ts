import { describe, it, expect } from "vitest";
import {
  CHART_COLORS,
  WORD_CLOUD_FONT,
  EMOJI_CLOUD_FONT,
  SITE_URL,
} from "./colors";

describe("colors module", () => {
  describe("CHART_COLORS", () => {
    it("contains 10 colors", () => {
      expect(CHART_COLORS).toHaveLength(10);
    });

    it("all colors are valid hex codes", () => {
      const hexPattern = /^#[0-9A-Fa-f]{6}$/;
      CHART_COLORS.forEach((color) => {
        expect(color).toMatch(hexPattern);
      });
    });

    it("all colors are unique", () => {
      const unique = new Set(CHART_COLORS);
      expect(unique.size).toBe(CHART_COLORS.length);
    });
  });

  describe("font constants", () => {
    it("WORD_CLOUD_FONT is a non-empty string", () => {
      expect(typeof WORD_CLOUD_FONT).toBe("string");
      expect(WORD_CLOUD_FONT.length).toBeGreaterThan(0);
    });

    it("EMOJI_CLOUD_FONT is a non-empty string", () => {
      expect(typeof EMOJI_CLOUD_FONT).toBe("string");
      expect(EMOJI_CLOUD_FONT.length).toBeGreaterThan(0);
    });
  });

  describe("SITE_URL", () => {
    it("is a valid URL", () => {
      expect(() => new URL(SITE_URL)).not.toThrow();
    });

    it("uses HTTPS protocol", () => {
      const url = new URL(SITE_URL);
      expect(url.protocol).toBe("https:");
    });
  });
});

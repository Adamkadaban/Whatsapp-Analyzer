import { describe, it, expect } from "vitest";
import {
  ANALYSIS_TOP_WORDS,
  ANALYSIS_TOP_EMOJIS,
  MAX_LEGEND_SENDERS,
  PROCESSING_SLOW_THRESHOLD_SEC,
  PROCESSING_VERY_SLOW_THRESHOLD_SEC,
  PDF_MAX_DIMENSION_PX,
  PDF_MAX_SCALE,
  PDF_HEIGHT_BUFFER_PX,
  MONTH_LABELS,
  WEEKDAY_LABELS,
} from "./constants";

describe("constants module", () => {
  describe("analysis limits", () => {
    it("ANALYSIS_TOP_WORDS is a positive number", () => {
      expect(ANALYSIS_TOP_WORDS).toBeGreaterThan(0);
      expect(Number.isInteger(ANALYSIS_TOP_WORDS)).toBe(true);
    });

    it("ANALYSIS_TOP_EMOJIS is a positive number", () => {
      expect(ANALYSIS_TOP_EMOJIS).toBeGreaterThan(0);
      expect(Number.isInteger(ANALYSIS_TOP_EMOJIS)).toBe(true);
    });
  });

  describe("chart display", () => {
    it("MAX_LEGEND_SENDERS is reasonable", () => {
      expect(MAX_LEGEND_SENDERS).toBeGreaterThanOrEqual(3);
      expect(MAX_LEGEND_SENDERS).toBeLessThanOrEqual(20);
    });
  });

  describe("processing thresholds", () => {
    it("slow threshold is less than very slow threshold", () => {
      expect(PROCESSING_SLOW_THRESHOLD_SEC).toBeLessThan(PROCESSING_VERY_SLOW_THRESHOLD_SEC);
    });

    it("thresholds are positive", () => {
      expect(PROCESSING_SLOW_THRESHOLD_SEC).toBeGreaterThan(0);
      expect(PROCESSING_VERY_SLOW_THRESHOLD_SEC).toBeGreaterThan(0);
    });
  });

  describe("PDF export", () => {
    it("PDF_MAX_DIMENSION_PX is within jsPDF limits", () => {
      // jsPDF has a theoretical limit around 14,400px
      expect(PDF_MAX_DIMENSION_PX).toBeLessThanOrEqual(14400);
      expect(PDF_MAX_DIMENSION_PX).toBeGreaterThan(1000);
    });

    it("PDF_MAX_SCALE is reasonable", () => {
      expect(PDF_MAX_SCALE).toBeGreaterThanOrEqual(1);
      expect(PDF_MAX_SCALE).toBeLessThanOrEqual(4);
    });

    it("PDF_HEIGHT_BUFFER_PX is positive", () => {
      expect(PDF_HEIGHT_BUFFER_PX).toBeGreaterThan(0);
    });
  });

  describe("date labels", () => {
    it("MONTH_LABELS has 12 entries", () => {
      expect(MONTH_LABELS).toHaveLength(12);
    });

    it("MONTH_LABELS starts with Jan and ends with Dec", () => {
      expect(MONTH_LABELS[0]).toBe("Jan");
      expect(MONTH_LABELS[11]).toBe("Dec");
    });

    it("WEEKDAY_LABELS has 7 entries", () => {
      expect(WEEKDAY_LABELS).toHaveLength(7);
    });

    it("WEEKDAY_LABELS starts with Sun (US convention)", () => {
      expect(WEEKDAY_LABELS[0]).toBe("Sun");
      expect(WEEKDAY_LABELS[6]).toBe("Sat");
    });
  });
});

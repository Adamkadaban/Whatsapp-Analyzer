import { describe, expect, it } from "vitest";
import { calcLongestStreak, type DailyDatum } from "./streak";

const dd = (day: string, messages = 1): DailyDatum => ({ day, messages });

describe("calcLongestStreak", () => {
  it("returns 0 for empty data", () => {
    expect(calcLongestStreak([])).toEqual({ days: 0, start: "", end: "" });
  });

  it("handles a single day", () => {
    expect(calcLongestStreak([dd("2024-01-01")])).toEqual({ days: 1, start: "2024-01-01", end: "2024-01-01" });
  });

  it("finds longest consecutive streak and returns correct start/end", () => {
    const data = [
      dd("2024-01-05"), // isolated
      dd("2024-01-01"),
      dd("2024-01-02"),
      dd("2024-01-03"),
      dd("2024-01-10"),
    ];
    expect(calcLongestStreak(data)).toEqual({ days: 3, start: "2024-01-01", end: "2024-01-03" });
  });

  it("is robust to DST forward (e.g., US 2024-03-10)", () => {
    // These dates straddle the DST spring forward; local offsets differ, but we parse in UTC.
    const data = [dd("2024-03-11"), dd("2024-03-09"), dd("2024-03-10")];
    expect(calcLongestStreak(data)).toEqual({ days: 3, start: "2024-03-09", end: "2024-03-11" });
  });

  it("is robust to DST backward (e.g., US 2024-11-03)", () => {
    const data = [dd("2024-11-02"), dd("2024-11-03"), dd("2024-11-04")];
    expect(calcLongestStreak(data)).toEqual({ days: 3, start: "2024-11-02", end: "2024-11-04" });
  });
});

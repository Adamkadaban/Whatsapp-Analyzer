import { renderHook, act, waitFor } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { useColorMap } from "./useColorMap";
import { CHART_COLORS } from "../colors";
import type { Summary, PersonBuckets, PersonStat } from "../types";
import { createEmptySummary } from "../__fixtures__/mockSummary";

function bucket(name: string): PersonBuckets {
  return {
    name,
    messages: 1,
    hourly: Array.from({ length: 24 }, () => 0),
    daily: [0, 0, 0, 0, 0, 0, 0],
    monthly: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  };
}

function stat(name: string, dominant_color?: string): PersonStat {
  return {
    name,
    total_words: 0,
    unique_words: 0,
    longest_message_words: 0,
    average_words_per_message: 0,
    top_emojis: [],
    dominant_color,
  };
}

function summaryWith(people: { name: string; dominant?: string }[]): Summary {
  return {
    ...createEmptySummary(),
    buckets_by_person: people.map((p) => bucket(p.name)),
    person_stats: people.map((p) => stat(p.name, p.dominant)),
  };
}

describe("useColorMap", () => {
  it("returns an empty map and palette fallback when summary is null", () => {
    const { result } = renderHook(() => useColorMap(null));

    expect(result.current.colorMap).toEqual({});
    // getColor falls back to the palette indexed by position.
    expect(result.current.getColor("Anyone", 0)).toBe(CHART_COLORS[0]);
    expect(result.current.getColor("Anyone", 2)).toBe(CHART_COLORS[2]);
    // Index wraps around the palette length.
    expect(result.current.getColor("Anyone", CHART_COLORS.length)).toBe(CHART_COLORS[0]);
  });

  it("assigns distinct palette colors by order when no dominant colors exist", async () => {
    const summary = summaryWith([{ name: "Alice" }, { name: "Bob" }, { name: "Carol" }]);
    const { result } = renderHook(() => useColorMap(summary));

    await waitFor(() => {
      expect(Object.keys(result.current.colorMap)).toHaveLength(3);
    });

    expect(result.current.colorMap).toEqual({
      Alice: CHART_COLORS[0],
      Bob: CHART_COLORS[1],
      Carol: CHART_COLORS[2],
    });
    expect(result.current.getColor("Bob", 99)).toBe(CHART_COLORS[1]);
  });

  it("prefers a person's dominant_color when present", async () => {
    const summary = summaryWith([
      { name: "Alice", dominant: "#abcdef" },
      { name: "Bob" },
    ]);
    const { result } = renderHook(() => useColorMap(summary));

    await waitFor(() => {
      expect(result.current.colorMap.Alice).toBe("#abcdef");
    });
    // Bob has no dominant color, so falls back to the first unused palette color.
    expect(result.current.colorMap.Bob).toBe(CHART_COLORS[0]);
  });

  it("avoids assigning the same color twice when dominant colors collide", async () => {
    const summary = summaryWith([
      { name: "Alice", dominant: "#123456" },
      { name: "Bob", dominant: "#123456" },
    ]);
    const { result } = renderHook(() => useColorMap(summary));

    await waitFor(() => {
      expect(result.current.colorMap.Alice).toBe("#123456");
    });
    // Bob's dominant color is already used; it must fall back to a palette color.
    expect(result.current.colorMap.Bob).not.toBe("#123456");
    expect(result.current.colorMap.Bob).toBe(CHART_COLORS[0]);
  });

  it("getColor reflects manual overrides applied via setColorMap", async () => {
    const summary = summaryWith([{ name: "Alice" }, { name: "Bob" }]);
    const { result } = renderHook(() => useColorMap(summary));

    await waitFor(() => {
      expect(result.current.colorMap.Alice).toBe(CHART_COLORS[0]);
    });

    act(() => {
      result.current.setColorMap((prev) => ({ ...prev, Alice: "#ff0000" }));
    });

    expect(result.current.colorMap.Alice).toBe("#ff0000");
    expect(result.current.getColor("Alice", 0)).toBe("#ff0000");
  });

  it("preserves a manual override across a summary change with the same people", async () => {
    const first = summaryWith([{ name: "Alice" }, { name: "Bob" }]);
    const { result, rerender } = renderHook(({ s }: { s: Summary }) => useColorMap(s), {
      initialProps: { s: first },
    });

    await waitFor(() => {
      expect(result.current.colorMap.Alice).toBe(CHART_COLORS[0]);
    });

    // User manually recolors Alice to a value not in the palette ordering.
    act(() => {
      result.current.setColorMap((prev) => ({ ...prev, Alice: "#0a0a0a" }));
    });
    expect(result.current.colorMap.Alice).toBe("#0a0a0a");

    // A new (equivalent) summary object triggers the effect again.
    const second = summaryWith([{ name: "Alice" }, { name: "Bob" }]);
    rerender({ s: second });

    await waitFor(() => {
      // The non-clashing manual override should survive re-computation.
      expect(result.current.colorMap.Alice).toBe("#0a0a0a");
      expect(result.current.colorMap.Bob).toBeDefined();
    });
  });
});

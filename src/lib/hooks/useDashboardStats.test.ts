import { renderHook } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { useDashboardStats } from "./useDashboardStats";
import { MONTH_LABELS, WEEKDAY_LABELS } from "../constants";
import type {
  Summary,
  PersonBuckets,
  SentimentDay,
  SentimentOverall,
  Count,
} from "../types";
import { createEmptySummary } from "../__fixtures__/mockSummary";

const c = (label: string, value: number): Count => ({ label, value });

function bucket(
  name: string,
  opts: { hourly?: number[]; daily?: number[]; monthly?: number[] } = {}
): PersonBuckets {
  return {
    name,
    messages: 1,
    hourly: opts.hourly ?? Array.from({ length: 24 }, (_, i) => i),
    daily: (opts.daily ?? [1, 2, 3, 4, 5, 6, 7]) as PersonBuckets["daily"],
    monthly: (opts.monthly ?? Array.from({ length: 12 }, (_, i) => i + 1)) as PersonBuckets["monthly"],
  };
}

describe("useDashboardStats", () => {
  describe("null / empty summary", () => {
    it("returns empty, safe defaults when summary is null", () => {
      const { result } = renderHook(() => useDashboardStats(null, true));
      const s = result.current;

      expect(s.dailyData).toEqual([]);
      expect(s.busiestDay).toBeNull();
      expect(s.quietestDay).toBeNull();
      expect(s.kpis).toEqual([]);
      expect(s.timelineData).toEqual([]);
      expect(s.hourlyStacked).toEqual([]);
      expect(s.monthlyRadar).toEqual([]);
      expect(s.weekdayRadar).toEqual([]);
      expect(s.senderData).toEqual([]);
      expect(s.conversationStartersData).toEqual([]);
      expect(s.wordCloud).toEqual([]);
      expect(s.emojiCloud).toEqual([]);
      expect(s.perPersonPhrases).toEqual([]);
      expect(s.sentimentLaneData).toEqual([]);
      expect(s.sentimentStacked).toEqual([]);
      expect(s.sentimentTimeline).toEqual([]);
      expect(s.hasSentiment).toBe(false);
      expect(s.topStarter).toBeUndefined();
      expect(s.topStarterShare).toBe(0);
      expect(s.longestStreakData.days).toBe(0);
    });

    it("handles a structurally-empty summary without throwing", () => {
      const { result } = renderHook(() => useDashboardStats(createEmptySummary(), true));
      const s = result.current;

      expect(s.busiestDay).toBeNull();
      expect(s.kpis).toHaveLength(8);
      expect(s.hasSentiment).toBe(false);
      // KPI for total messages should read 0.
      expect(s.kpis[0]).toMatchObject({ label: "Total messages", value: "0" });
    });
  });

  describe("daily-derived stats", () => {
    const summary: Summary = {
      ...createEmptySummary(),
      total_messages: 1234567,
      deleted_you: 3,
      deleted_others: 5,
      by_sender: [c("Alice", 10), c("Bob", 5)],
      daily: [
        c("2024-01-01", 10),
        c("2024-01-02", 40),
        c("2024-01-03", 5),
        c("2024-01-04", 22),
      ],
      timeline: [c("2024-01", 50), c("2024-02", 27)],
    };

    it("maps daily data and finds busiest / quietest days", () => {
      const { result } = renderHook(() => useDashboardStats(summary, true));
      const s = result.current;

      expect(s.dailyData).toEqual([
        { day: "2024-01-01", messages: 10 },
        { day: "2024-01-02", messages: 40 },
        { day: "2024-01-03", messages: 5 },
        { day: "2024-01-04", messages: 22 },
      ]);
      expect(s.busiestDay).toEqual({ day: "2024-01-02", messages: 40 });
      expect(s.quietestDay).toEqual({ day: "2024-01-03", messages: 5 });
    });

    it("builds KPIs from the summary", () => {
      const { result } = renderHook(() => useDashboardStats(summary, true));
      const kpis = result.current.kpis;

      const byLabel = Object.fromEntries(kpis.map((k) => [k.label, k]));

      expect(byLabel["Total messages"].value).toBe((1234567).toLocaleString());
      expect(byLabel["Total messages"].detail).toBe("Deleted you/others: 3/5");
      // Active days uses timeline length; senders uses by_sender length.
      expect(byLabel["Active days"].value).toBe("2");
      expect(byLabel["Active days"].detail).toBe("Senders: 2");
      expect(byLabel["Busiest day"].detail).toBe("40 messages");
      expect(byLabel["Quietest day"].detail).toBe("5 messages");
    });

    it("singularizes the message count detail when a day has exactly one message", () => {
      const single: Summary = {
        ...createEmptySummary(),
        daily: [c("2024-01-01", 1)],
        timeline: [c("2024-01", 1)],
      };
      const { result } = renderHook(() => useDashboardStats(single, true));
      const byLabel = Object.fromEntries(result.current.kpis.map((k) => [k.label, k]));

      expect(byLabel["Busiest day"].detail).toBe("1 message");
    });
  });

  describe("top word KPI honours the stopword filter", () => {
    const summary: Summary = {
      ...createEmptySummary(),
      top_words: [c("the", 100)],
      top_words_no_stop: [c("pizza", 30)],
      top_emojis: [c("😂", 12)],
    };

    it("uses top_words when filterStopwords is true", () => {
      const { result } = renderHook(() => useDashboardStats(summary, true));
      const byLabel = Object.fromEntries(result.current.kpis.map((k) => [k.label, k]));
      expect(byLabel["Top word"].value).toBe("the");
      expect(byLabel["Top word"].detail).toBe("100 uses");
      expect(byLabel["Top emoji"].value).toBe("😂");
      expect(byLabel["Top emoji"].detail).toBe("12 uses");
    });

    it("uses top_words_no_stop when filterStopwords is false", () => {
      const { result } = renderHook(() => useDashboardStats(summary, false));
      const byLabel = Object.fromEntries(result.current.kpis.map((k) => [k.label, k]));
      expect(byLabel["Top word"].value).toBe("pizza");
      expect(byLabel["Top word"].detail).toBe("30 uses");
    });
  });

  describe("conversation starters", () => {
    it("computes top starter and its share of all conversations", () => {
      const summary: Summary = {
        ...createEmptySummary(),
        conversation_starters: [c("Alice", 75), c("Bob", 25)],
        conversation_count: 100,
      };
      const { result } = renderHook(() => useDashboardStats(summary, true));

      expect(result.current.topStarter).toEqual({ label: "Alice", value: 75 });
      expect(result.current.topStarterShare).toBe(75);
      expect(result.current.conversationStartersData).toEqual([
        { name: "Alice", value: 75 },
        { name: "Bob", value: 25 },
      ]);

      const byLabel = Object.fromEntries(result.current.kpis.map((k) => [k.label, k]));
      expect(byLabel["Conversation starts"].value).toBe("Alice");
      expect(byLabel["Conversation starts"].detail).toContain("75%");
    });

    it("yields zero share when conversation_count is zero", () => {
      const summary: Summary = {
        ...createEmptySummary(),
        conversation_starters: [c("Alice", 5)],
        conversation_count: 0,
      };
      const { result } = renderHook(() => useDashboardStats(summary, true));
      expect(result.current.topStarterShare).toBe(0);
    });
  });

  describe("series transforms", () => {
    const summary: Summary = {
      ...createEmptySummary(),
      timeline: [c("2024-01", 50), c("2024-02", 27)],
      by_sender: Array.from({ length: 8 }, (_, i) => c(`P${i}`, 100 - i)),
      buckets_by_person: [
        bucket("Alice", { hourly: Array.from({ length: 24 }, (_, i) => i), daily: [10, 11, 12, 13, 14, 15, 16], monthly: Array.from({ length: 12 }, (_, i) => i * 2) }),
        bucket("Bob", { hourly: Array.from({ length: 24 }, (_, i) => i + 100), daily: [20, 21, 22, 23, 24, 25, 26], monthly: Array.from({ length: 12 }, (_, i) => i * 3) }),
      ],
    };

    it("maps timeline data", () => {
      const { result } = renderHook(() => useDashboardStats(summary, true));
      expect(result.current.timelineData).toEqual([
        { date: "2024-01", messages: 50 },
        { date: "2024-02", messages: 27 },
      ]);
    });

    it("limits sender data to the top 6", () => {
      const { result } = renderHook(() => useDashboardStats(summary, true));
      expect(result.current.senderData).toHaveLength(6);
      expect(result.current.senderData[0]).toEqual({ name: "P0", value: 100 });
    });

    it("builds 24 hourly-stacked rows keyed by person", () => {
      const { result } = renderHook(() => useDashboardStats(summary, true));
      const rows = result.current.hourlyStacked;
      expect(rows).toHaveLength(24);
      expect(rows[0]).toEqual({ hour: 0, Alice: 0, Bob: 100 });
      expect(rows[23]).toEqual({ hour: 23, Alice: 23, Bob: 123 });
    });

    it("builds 12 monthly radar rows using month labels", () => {
      const { result } = renderHook(() => useDashboardStats(summary, true));
      const rows = result.current.monthlyRadar;
      expect(rows).toHaveLength(12);
      expect(rows[0]).toEqual({ label: MONTH_LABELS[0], Alice: 0, Bob: 0 });
      expect(rows[5]).toEqual({ label: MONTH_LABELS[5], Alice: 10, Bob: 15 });
    });

    it("builds 7 weekday radar rows using weekday labels", () => {
      const { result } = renderHook(() => useDashboardStats(summary, true));
      const rows = result.current.weekdayRadar;
      expect(rows).toHaveLength(7);
      expect(rows[0]).toEqual({ label: WEEKDAY_LABELS[0], Alice: 10, Bob: 20 });
      expect(rows[6]).toEqual({ label: WEEKDAY_LABELS[6], Alice: 16, Bob: 26 });
    });
  });

  describe("clouds and phrases honour the stopword filter", () => {
    const summary: Summary = {
      ...createEmptySummary(),
      word_cloud: [c("the", 9)],
      word_cloud_no_stop: [c("pizza", 4)],
      emoji_cloud: [c("🔥", 7)],
      per_person_phrases: [{ name: "Alice", phrases: [c("with stop", 1)] }],
      per_person_phrases_no_stop: [{ name: "Alice", phrases: [c("no stop", 1)] }],
    };

    it("filterStopwords=true selects the stopword-inclusive variants", () => {
      const { result } = renderHook(() => useDashboardStats(summary, true));
      expect(result.current.wordCloud).toEqual([c("the", 9)]);
      expect(result.current.perPersonPhrases[0].phrases[0].label).toBe("with stop");
      expect(result.current.emojiCloud).toEqual([c("🔥", 7)]);
    });

    it("filterStopwords=false selects the no-stop variants", () => {
      const { result } = renderHook(() => useDashboardStats(summary, false));
      expect(result.current.wordCloud).toEqual([c("pizza", 4)]);
      expect(result.current.perPersonPhrases[0].phrases[0].label).toBe("no stop");
    });
  });

  describe("sentiment transforms", () => {
    const sentimentByDay: SentimentDay[] = [
      { name: "Alice", day: "2024-01-02", mean: 0.5, pos: 5, neu: 3, neg: 2 },
      { name: "Bob", day: "2024-01-02", mean: -0.25, pos: 1, neu: 1, neg: 8 },
      { name: "Alice", day: "2024-01-01", mean: 0.1, pos: 2, neu: 6, neg: 2 },
    ];
    const sentimentOverall: SentimentOverall[] = [
      { name: "Alice", mean: 0.33, pos: 50, neu: 30, neg: 20 },
    ];
    const summary: Summary = {
      ...createEmptySummary(),
      sentiment_by_day: sentimentByDay,
      sentiment_overall: sentimentOverall,
    };

    it("flags hasSentiment when daily sentiment exists", () => {
      const { result } = renderHook(() => useDashboardStats(summary, true));
      expect(result.current.hasSentiment).toBe(true);
    });

    it("pivots sentiment lanes by day, sorted ascending", () => {
      const { result } = renderHook(() => useDashboardStats(summary, true));
      const lanes = result.current.sentimentLaneData;

      expect(lanes).toEqual([
        { day: "2024-01-01", Alice: 0.1 },
        { day: "2024-01-02", Alice: 0.5, Bob: -0.25 },
      ]);
    });

    it("computes polarity percentages per person in sentimentStacked", () => {
      const { result } = renderHook(() => useDashboardStats(summary, true));
      const [alice] = result.current.sentimentStacked;

      // total = 50 + 30 + 20 = 100 -> percentages are the raw values.
      expect(alice).toEqual({ name: "Alice", mean: 0.33, pos: 50, neu: 30, neg: 20 });
    });

    it("computes a weighted-mean sentiment timeline per day", () => {
      const { result } = renderHook(() => useDashboardStats(summary, true));
      const timeline = result.current.sentimentTimeline;

      // 2024-01-01: only Alice, weight 10, mean 0.1 -> 0.1
      // 2024-01-02: Alice (w=10, mean 0.5) + Bob (w=10, mean -0.25)
      //   = (0.5*10 + -0.25*10) / 20 = 2.5 / 20 = 0.125
      expect(timeline).toEqual([
        { day: "2024-01-01", mean: 0.1 },
        { day: "2024-01-02", mean: 0.125 },
      ]);
    });

    it("returns empty sentiment series when no sentiment data exists", () => {
      const { result } = renderHook(() => useDashboardStats(createEmptySummary(), true));
      expect(result.current.sentimentLaneData).toEqual([]);
      expect(result.current.sentimentStacked).toEqual([]);
      expect(result.current.sentimentTimeline).toEqual([]);
      expect(result.current.hasSentiment).toBe(false);
    });
  });

  describe("longest streak", () => {
    it("computes the longest consecutive-day streak from daily data", () => {
      const summary: Summary = {
        ...createEmptySummary(),
        daily: [
          c("2024-01-01", 1),
          c("2024-01-02", 1),
          c("2024-01-03", 1),
          // gap
          c("2024-01-10", 1),
        ],
      };
      const { result } = renderHook(() => useDashboardStats(summary, true));
      expect(result.current.longestStreakData.days).toBe(3);
      expect(result.current.longestStreakData.start).toBe("2024-01-01");
      expect(result.current.longestStreakData.end).toBe("2024-01-03");
    });
  });
});

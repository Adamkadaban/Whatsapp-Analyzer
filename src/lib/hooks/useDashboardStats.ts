import { useMemo } from "react";
import type { Summary } from "../types";
import { calcLongestStreak, type DailyDatum } from "../streak";
import { MONTH_LABELS, WEEKDAY_LABELS } from "../constants";

interface KpiDatum {
  label: string;
  value: string;
  detail?: string;
}

export interface DashboardStatsResult {
  dailyData: DailyDatum[];
  busiestDay: DailyDatum | null;
  quietestDay: DailyDatum | null;
  longestStreakData: ReturnType<typeof calcLongestStreak>;
  kpis: KpiDatum[];
  timelineData: { date: string; messages: number }[];
  hourlyStacked: Record<string, number | string>[];
  monthlyRadar: Record<string, number | string>[];
  weekdayRadar: Record<string, number | string>[];
  senderData: { name: string; value: number }[];
  conversationStartersData: { name: string; value: number }[];
  topStarter: { label: string; value: number } | undefined;
  topStarterShare: number;
  wordCloud: { label: string; value: number }[];
  emojiCloud: { label: string; value: number }[];
  perPersonPhrases: Summary["per_person_phrases"];
  sentimentByDay: Summary["sentiment_by_day"];
  sentimentOverall: Summary["sentiment_overall"];
  sentimentLaneData: Record<string, number | string>[];
  sentimentStacked: { name: string; mean: number; pos: number; neu: number; neg: number }[];
  sentimentTimeline: { day: string; mean: number }[];
  hasSentiment: boolean;
}

// Parse YYYY-MM-DD as local date for display purposes
function parseLocalDate(dateStr: string): Date {
  const [year, month, day] = dateStr.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function formatDayLabel(day: string): string {
  const date = parseLocalDate(day);
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

/**
 * Hook that computes all derived statistics from the summary data.
 * This centralizes all the useMemo transformations for the dashboard.
 */
export function useDashboardStats(
  summary: Summary | null,
  filterStopwords: boolean,
): DashboardStatsResult {
  const dailyData: DailyDatum[] = useMemo(
    () => (summary ? summary.daily.map((d) => ({ day: d.label, messages: d.value })) : []),
    [summary],
  );

  const busiestDay = useMemo(() => {
    if (!dailyData.length) return null;
    return dailyData.reduce((max, d) => (d.messages > max.messages ? d : max), dailyData[0]);
  }, [dailyData]);

  const quietestDay = useMemo(() => {
    if (!dailyData.length) return null;
    return dailyData.reduce((min, d) => (d.messages < min.messages ? d : min), dailyData[0]);
  }, [dailyData]);

  const longestStreakData = useMemo(() => calcLongestStreak(dailyData), [dailyData]);

  const topStarter = summary?.conversation_starters[0];
  const topStarterShare =
    summary && topStarter && summary.conversation_count
      ? Math.round((topStarter.value / summary.conversation_count) * 100)
      : 0;

  const kpis: KpiDatum[] = useMemo(() => {
    if (!summary) return [];
    return [
      {
        label: "Total messages",
        value: summary.total_messages.toLocaleString(),
        detail: `Deleted you/others: ${summary.deleted_you}/${summary.deleted_others}`,
      },
      {
        label: "Active days",
        value: summary.timeline.length.toLocaleString(),
        detail: `Senders: ${summary.by_sender.length}`,
      },
      {
        label: "Busiest day",
        value: busiestDay ? formatDayLabel(busiestDay.day) : "-",
        detail: busiestDay
          ? `${busiestDay.messages.toLocaleString()} ${busiestDay.messages === 1 ? "message" : "messages"}`
          : "",
      },
      {
        label: "Quietest day",
        value: quietestDay ? formatDayLabel(quietestDay.day) : "-",
        detail: quietestDay
          ? `${quietestDay.messages.toLocaleString()} ${quietestDay.messages === 1 ? "message" : "messages"}`
          : "",
      },
      {
        label: "Longest streak",
        value: `${longestStreakData.days} ${longestStreakData.days === 1 ? "day" : "days"}`,
        detail: longestStreakData.start
          ? `${formatDayLabel(longestStreakData.start)} - ${formatDayLabel(longestStreakData.end)}`
          : "",
      },
      {
        label: "Conversation starts",
        value: topStarter?.label ?? "-",
        detail: `${topStarter?.label ?? "-"} started ${topStarterShare}% of conversations`,
      },
      {
        label: "Top emoji",
        value: summary.top_emojis[0]?.label ?? "-",
        detail: `${summary.top_emojis[0]?.value ?? 0} uses`,
      },
      {
        label: "Top word",
        value: (filterStopwords ? summary.top_words : summary.top_words_no_stop)[0]?.label ?? "-",
        detail: `${(filterStopwords ? summary.top_words : summary.top_words_no_stop)[0]?.value ?? 0} uses`,
      },
    ];
  }, [
    summary,
    busiestDay,
    quietestDay,
    longestStreakData,
    topStarter,
    topStarterShare,
    filterStopwords,
  ]);

  const timelineData = useMemo(
    () => (summary ? summary.timeline.map((d) => ({ date: d.label, messages: d.value })) : []),
    [summary],
  );

  const senderData = useMemo(
    () =>
      summary ? summary.by_sender.slice(0, 6).map((s) => ({ name: s.label, value: s.value })) : [],
    [summary],
  );

  const conversationStartersData = useMemo(
    () =>
      summary ? summary.conversation_starters.map((s) => ({ name: s.label, value: s.value })) : [],
    [summary],
  );

  const hourlyStacked = useMemo(() => {
    if (!summary) return [];
    return Array.from({ length: 24 }).map((_, hour) => {
      const row: Record<string, number | string> = { hour };
      summary.buckets_by_person.forEach((p) => {
        row[p.name] = p.hourly[hour];
      });
      return row;
    });
  }, [summary]);

  const monthlyRadar = useMemo(() => {
    if (!summary) return [];
    return MONTH_LABELS.map((label, idx) => {
      const row: Record<string, number | string> = { label };
      summary.buckets_by_person.forEach((p) => {
        row[p.name] = p.monthly[idx];
      });
      return row;
    });
  }, [summary]);

  const weekdayRadar = useMemo(() => {
    if (!summary) return [];
    return WEEKDAY_LABELS.map((label, idx) => {
      const row: Record<string, number | string> = { label };
      summary.buckets_by_person.forEach((p) => {
        row[p.name] = p.daily[idx];
      });
      return row;
    });
  }, [summary]);

  const wordCloud = useMemo(
    () => (summary ? (filterStopwords ? summary.word_cloud : summary.word_cloud_no_stop) : []),
    [summary, filterStopwords],
  );

  const emojiCloud = useMemo(() => summary?.emoji_cloud ?? [], [summary]);

  const perPersonPhrases = useMemo(
    () =>
      summary
        ? filterStopwords
          ? summary.per_person_phrases
          : summary.per_person_phrases_no_stop
        : [],
    [summary, filterStopwords],
  );

  const sentimentByDay = useMemo(() => summary?.sentiment_by_day ?? [], [summary]);
  const sentimentOverall = useMemo(() => summary?.sentiment_overall ?? [], [summary]);

  const sentimentLaneData = useMemo(() => {
    if (!sentimentByDay.length) return [] as Record<string, number | string>[];
    const byDay = new Map<string, Record<string, number | string>>();
    sentimentByDay.forEach((row) => {
      const entry = byDay.get(row.day) ?? { day: row.day };
      entry[row.name] = Number(row.mean.toFixed(3));
      byDay.set(row.day, entry);
    });
    return Array.from(byDay.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([, value]) => value);
  }, [sentimentByDay]);

  const sentimentStacked = useMemo(() => {
    if (!sentimentOverall.length)
      return [] as { name: string; mean: number; pos: number; neu: number; neg: number }[];
    return sentimentOverall.map((row) => {
      const total = Math.max(row.pos + row.neu + row.neg, 1);
      return {
        name: row.name,
        mean: Number(row.mean.toFixed(3)),
        pos: Number((((row.pos as number) / total) * 100).toFixed(1)),
        neu: Number((((row.neu as number) / total) * 100).toFixed(1)),
        neg: Number((((row.neg as number) / total) * 100).toFixed(1)),
      };
    });
  }, [sentimentOverall]);

  const sentimentTimeline = useMemo(() => {
    if (!sentimentByDay.length) return [] as { day: string; mean: number }[];
    const grouped = new Map<string, { sum: number; count: number }>();
    sentimentByDay.forEach((row) => {
      const weight = Math.max(row.pos + row.neu + row.neg, 1);
      const entry = grouped.get(row.day) ?? { sum: 0, count: 0 };
      entry.sum += row.mean * weight;
      entry.count += weight;
      grouped.set(row.day, entry);
    });
    return Array.from(grouped.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([day, agg]) => ({
        day,
        mean: agg.count === 0 ? 0 : Number((agg.sum / agg.count).toFixed(3)),
      }));
  }, [sentimentByDay]);

  const hasSentiment = sentimentByDay.length > 0;

  return {
    dailyData,
    busiestDay,
    quietestDay,
    longestStreakData,
    kpis,
    timelineData,
    hourlyStacked,
    monthlyRadar,
    weekdayRadar,
    senderData,
    conversationStartersData,
    topStarter,
    topStarterShare,
    wordCloud,
    emojiCloud,
    perPersonPhrases,
    sentimentByDay,
    sentimentOverall,
    sentimentLaneData,
    sentimentStacked,
    sentimentTimeline,
    hasSentiment,
  };
}

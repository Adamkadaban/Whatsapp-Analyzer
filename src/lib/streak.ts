export type DailyDatum = { day: string; messages: number };
export type StreakResult = { days: number; start: string; end: string };

/**
 * Compute longest consecutive-day streak of activity.
 * Dates are parsed in UTC to avoid DST/local-offset issues.
 * Assumes day labels are YYYY-MM-DD.
 */
export function calcLongestStreak(dailyData: DailyDatum[]): StreakResult {
  if (!dailyData.length) return { days: 0, start: "", end: "" };

  const oneDayMs = 24 * 60 * 60 * 1000;
  const sorted = [...dailyData].sort((a, b) => a.day.localeCompare(b.day));

  const toUtcMs = (day: string) => {
    const [year, month, date] = day.split("-").map(Number);
    return Date.UTC(year, month - 1, date);
  };

  let maxStreak = 1;
  let currentStreak = 1;
  let maxStart = 0;
  let maxEnd = 0;
  let currentStart = 0;

  for (let i = 1; i < sorted.length; i++) {
    const prev = toUtcMs(sorted[i - 1].day);
    const curr = toUtcMs(sorted[i].day);
    if (curr - prev === oneDayMs) {
      currentStreak++;
      if (currentStreak > maxStreak) {
        maxStreak = currentStreak;
        maxStart = currentStart;
        maxEnd = i;
      }
    } else {
      currentStreak = 1;
      currentStart = i;
    }
  }

  return {
    days: maxStreak,
    start: sorted[maxStart]?.day ?? "",
    end: sorted[maxEnd]?.day ?? sorted[maxStart]?.day ?? "",
  };
}

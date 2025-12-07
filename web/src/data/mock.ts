export const topSenders = [
  { name: "Addy", value: 4321 },
  { name: "Em", value: 3890 },
  { name: "Family", value: 2150 },
  { name: "Work", value: 1220 },
];

export const daily = Array.from({ length: 14 }).map((_, i) => ({
  day: `Day ${i + 1}`,
  messages: Math.round(200 + Math.sin(i) * 80 + Math.random() * 40),
}));

export const hourly = Array.from({ length: 24 }).map((_, h) => ({
  hour: h,
  messages: Math.round(30 + Math.sin(h / 2.5) * 18 + Math.random() * 12),
}));

export const kpis = [
  { label: "Total messages", value: "128k", detail: "+2.4k this week" },
  { label: "Active days", value: "842", detail: "Streak: 12" },
  { label: "Avg. response", value: "4m 12s", detail: "p50 2m • p95 11m" },
  { label: "Media shared", value: "6,210", detail: "images + audio" },
];

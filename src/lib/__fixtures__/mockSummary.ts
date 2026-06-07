/**
 * Mock Summary data for Dashboard tests.
 * This fixture provides realistic data structures that match the WASM output.
 */
import type {
  Summary,
  Journey,
  JourneyMessage,
  JourneyMoment,
  PersonBuckets,
  PersonStat,
  PersonPhrases,
  SentimentDay,
  SentimentOverall,
  Count,
} from "../types";

const createMockCount = (label: string, value: number): Count => ({
  label,
  value,
});

const createMockJourneyMessage = (
  sender: string,
  text: string,
  timestamp: string,
  is_you = false,
): JourneyMessage => ({
  sender,
  text,
  timestamp,
  is_you,
});

const createMockJourneyMoment = (
  title: string,
  description: string,
  messages: JourneyMessage[],
): JourneyMoment => ({
  title,
  description,
  date: "2024-06-15",
  messages,
  sentiment_score: 0.5,
});

const createMockJourney = (): Journey => ({
  first_day: "2024-01-15",
  last_day: "2024-12-01",
  total_days: 321,
  total_messages: 15432,
  first_messages: [
    createMockJourneyMessage("Alice", "Hey! How are you?", "2024-01-15T10:30:00Z", false),
    createMockJourneyMessage("You", "I'm good, thanks!", "2024-01-15T10:31:00Z", true),
  ],
  last_messages: [
    createMockJourneyMessage("You", "See you tomorrow!", "2024-12-01T22:00:00Z", true),
    createMockJourneyMessage("Alice", "Bye! 👋", "2024-12-01T22:01:00Z", false),
  ],
  interesting_moments: [
    createMockJourneyMoment("Most active day", "You exchanged 342 messages!", [
      createMockJourneyMessage("Alice", "This is so exciting!", "2024-06-15T14:00:00Z", false),
      createMockJourneyMessage("You", "I know right! 🎉", "2024-06-15T14:01:00Z", true),
    ]),
  ],
});

export const createMockPersonBuckets = (name: string, messages: number): PersonBuckets => ({
  name,
  messages,
  hourly: Array.from({ length: 24 }, () => Math.floor(Math.random() * 100)),
  daily: [120, 150, 180, 200, 190, 210, 140] as [
    number,
    number,
    number,
    number,
    number,
    number,
    number,
  ],
  monthly: [50, 60, 70, 80, 90, 100, 110, 120, 130, 120, 100, 80] as [
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
  ],
});

const createMockPersonStat = (name: string): PersonStat => ({
  name,
  total_words: 15000,
  unique_words: 2500,
  longest_message_words: 150,
  average_words_per_message: 8.5,
  top_emojis: [createMockCount("😂", 234), createMockCount("❤️", 189), createMockCount("👍", 156)],
  dominant_color: undefined,
});

const createMockPersonPhrases = (name: string): PersonPhrases => ({
  name,
  phrases: [
    createMockCount("haha yeah", 45),
    createMockCount("oh my god", 38),
    createMockCount("I know right", 32),
    createMockCount("that's so funny", 28),
    createMockCount("see you later", 25),
  ],
});

const createMockSentimentDay = (name: string, day: string): SentimentDay => ({
  name,
  day,
  mean: 0.3,
  pos: 45,
  neu: 40,
  neg: 15,
});

const createMockSentimentOverall = (name: string): SentimentOverall => ({
  name,
  mean: 0.35,
  pos: 48,
  neu: 38,
  neg: 14,
});

/**
 * Creates a complete mock Summary for testing.
 * This closely mirrors what the WASM analyzer returns.
 */
export const createMockSummary = (): Summary => ({
  total_messages: 15432,
  by_sender: [createMockCount("Alice", 8234), createMockCount("You", 7198)],
  daily: [
    createMockCount("2024-11-28", 45),
    createMockCount("2024-11-29", 67),
    createMockCount("2024-11-30", 89),
    createMockCount("2024-12-01", 52),
  ],
  hourly: Array.from({ length: 24 }, (_, i) => ({
    hour: i,
    value: Math.floor(Math.random() * 500),
  })),
  top_emojis: [
    createMockCount("😂", 523),
    createMockCount("❤️", 412),
    createMockCount("👍", 298),
    createMockCount("🔥", 187),
    createMockCount("😊", 156),
  ],
  top_words: [
    createMockCount("the", 2345),
    createMockCount("you", 1987),
    createMockCount("and", 1654),
    createMockCount("lol", 1432),
    createMockCount("yeah", 1298),
  ],
  top_words_no_stop: [
    createMockCount("lol", 1432),
    createMockCount("yeah", 1298),
    createMockCount("haha", 987),
    createMockCount("good", 876),
    createMockCount("nice", 654),
  ],
  deleted_you: 12,
  deleted_others: 8,
  timeline: [
    createMockCount("2024-01", 1234),
    createMockCount("2024-02", 1456),
    createMockCount("2024-03", 1678),
    createMockCount("2024-04", 1234),
    createMockCount("2024-05", 987),
    createMockCount("2024-06", 1567),
  ],
  weekly: Array.from({ length: 7 }, (_, i) => createMockCount(`Week ${i + 1}`, 200 + i * 50)),
  monthly: Array.from({ length: 12 }, (_, i) => createMockCount(`Month ${i + 1}`, 1000 + i * 100)),
  share_of_speech: [createMockCount("Alice", 53.4), createMockCount("You", 46.6)],
  buckets_by_person: [createMockPersonBuckets("Alice", 8234), createMockPersonBuckets("You", 7198)],
  word_cloud: Array.from({ length: 50 }, (_, i) => createMockCount(`word${i}`, 500 - i * 10)),
  word_cloud_no_stop: Array.from({ length: 50 }, (_, i) =>
    createMockCount(`content${i}`, 400 - i * 8),
  ),
  emoji_cloud: [
    createMockCount("😂", 523),
    createMockCount("❤️", 412),
    createMockCount("👍", 298),
    createMockCount("🔥", 187),
    createMockCount("😊", 156),
    createMockCount("🎉", 134),
    createMockCount("💕", 98),
    createMockCount("✨", 87),
  ],
  salient_phrases: [
    createMockCount("that's hilarious", 45),
    createMockCount("can't wait", 38),
    createMockCount("sounds good", 32),
  ],
  top_phrases: [
    createMockCount("I know", 234),
    createMockCount("haha yeah", 189),
    createMockCount("oh my god", 156),
  ],
  top_phrases_no_stop: [
    createMockCount("haha yeah", 189),
    createMockCount("sounds good", 145),
    createMockCount("can't wait", 132),
  ],
  per_person_phrases: [createMockPersonPhrases("Alice"), createMockPersonPhrases("You")],
  per_person_phrases_no_stop: [createMockPersonPhrases("Alice"), createMockPersonPhrases("You")],
  fun_facts: [
    {
      name: "Alice",
      total_words: 45000,
      longest_message_words: 234,
      unique_words: 3500,
      average_message_length: 5.5,
      top_emojis: ["😂", "❤️", "👍"],
    },
  ],
  person_stats: [createMockPersonStat("Alice"), createMockPersonStat("You")],
  per_person_daily: [
    { name: "Alice", daily: [createMockCount("2024-12-01", 45)] },
    { name: "You", daily: [createMockCount("2024-12-01", 38)] },
  ],
  sentiment_by_day: [
    createMockSentimentDay("Alice", "2024-12-01"),
    createMockSentimentDay("You", "2024-12-01"),
  ],
  sentiment_overall: [createMockSentimentOverall("Alice"), createMockSentimentOverall("You")],
  conversation_starters: [createMockCount("Alice", 156), createMockCount("You", 132)],
  conversation_count: 288,
  journey: createMockJourney(),
});

/**
 * Creates a minimal empty summary for edge case testing.
 */
export const createEmptySummary = (): Summary => ({
  total_messages: 0,
  by_sender: [],
  daily: [],
  hourly: [],
  top_emojis: [],
  top_words: [],
  top_words_no_stop: [],
  deleted_you: 0,
  deleted_others: 0,
  timeline: [],
  weekly: [],
  monthly: [],
  share_of_speech: [],
  buckets_by_person: [],
  word_cloud: [],
  word_cloud_no_stop: [],
  emoji_cloud: [],
  salient_phrases: [],
  top_phrases: [],
  top_phrases_no_stop: [],
  per_person_phrases: [],
  per_person_phrases_no_stop: [],
  fun_facts: [],
  person_stats: [],
  per_person_daily: [],
  sentiment_by_day: [],
  sentiment_overall: [],
  conversation_starters: [],
  conversation_count: 0,
  journey: undefined,
});

declare module "../../pkg/chat_core_wasm" {
  export interface Count {
    label: string;
    value: number;
  }

  export interface HourCount {
    hour: number;
    value: number;
  }

  export interface PersonBuckets {
    name: string;
    messages: number;
    hourly: number[];
    daily: number[];
    monthly: number[];
  }

  export interface FunFact {
    name: string;
    total_words: number;
    longest_message_words: number;
    unique_words: number;
    average_message_length: number;
    top_emojis: string[];
  }

  export interface Summary {
    total_messages: number;
    by_sender: Count[];
    daily: Count[];
    hourly: HourCount[];
    top_emojis: Count[];
    top_words: Count[];
    top_words_no_stop: Count[];
    deleted_you: number;
    deleted_others: number;
    timeline: Count[];
    weekly: Count[];
    monthly: Count[];
    share_of_speech: Count[];
    buckets_by_person: PersonBuckets[];
    word_cloud: Count[];
    word_cloud_no_stop: Count[];
    emoji_cloud: Count[];
    fun_facts: FunFact[];
    person_stats: PersonStat[];
    per_person_daily: PersonDaily[];
    sentiment_by_day: SentimentDay[];
    sentiment_overall: SentimentOverall[];
    conversation_starters: Count[];
    conversation_count: number;
  }

  export interface SentimentDay {
    name: string;
    day: string;
    mean: number;
    pos: number;
    neu: number;
    neg: number;
  }

  export interface SentimentOverall {
    name: string;
    mean: number;
    pos: number;
    neu: number;
    neg: number;
  }

  export interface PersonDaily {
    name: string;
    daily: Count[];
  }

  export interface PersonStat {
    name: string;
    total_words: number;
    unique_words: number;
    longest_message_words: number;
    average_words_per_message: number;
    top_emojis: Count[];
    dominant_color: string | null;
  }


  export function analyze_chat(raw: string, top_words_n: number, top_emojis_n: number): Summary;
  export function init_panic_hook(): void;
  export default function init(): Promise<void>;
}

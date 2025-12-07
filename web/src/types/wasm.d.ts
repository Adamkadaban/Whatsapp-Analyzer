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
    deleted_you: number;
    deleted_others: number;
    timeline: Count[];
    weekly: Count[];
    monthly: Count[];
    share_of_speech: Count[];
    buckets_by_person: PersonBuckets[];
    word_cloud: Count[];
    emoji_cloud: Count[];
    fun_facts: FunFact[];
  }

  export function analyze_chat(raw: string, top_words_n: number, top_emojis_n: number): Summary;
  export function init_panic_hook(): void;
  export default function init(): Promise<void>;
}

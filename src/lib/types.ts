/**
 * TypeScript definitions mirroring the Rust Summary struct returned by analyze_chat.
 * Keep in sync with chat-core-wasm/src/lib.rs
 */

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

export interface PersonStat {
	name: string;
	total_words: number;
	unique_words: number;
	longest_message_words: number;
	average_words_per_message: number;
	top_emojis: Count[];
	dominant_color: string | null;
}

export interface PersonDaily {
	name: string;
	daily: Count[];
}

export interface PersonPhrases {
	name: string;
	phrases: Count[];
}

export interface SentimentDay {
	day: string;
	name: string;
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

export interface JourneyMessage {
	sender: string;
	text: string;
	timestamp: string;
	is_you: boolean;
}

export interface JourneyMoment {
	title: string;
	description: string;
	date: string;
	messages: JourneyMessage[];
	sentiment_score: number;
}

export interface Journey {
	first_day: string;
	last_day: string;
	total_days: number;
	total_messages: number;
	first_messages: JourneyMessage[];
	last_messages: JourneyMessage[];
	interesting_moments: JourneyMoment[];
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
	salient_phrases: Count[];
	top_phrases: Count[];
	top_phrases_no_stop: Count[];
	per_person_phrases: PersonPhrases[];
	per_person_phrases_no_stop: PersonPhrases[];
	fun_facts: FunFact[];
	person_stats: PersonStat[];
	per_person_daily: PersonDaily[];
	sentiment_by_day: SentimentDay[];
	sentiment_overall: SentimentOverall[];
	conversation_starters: Count[];
	conversation_count: number;
	journey: Journey | null;
}

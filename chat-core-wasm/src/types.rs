use serde::Serialize;
use tsify_next::Tsify;
use wasm_bindgen::prelude::*;

#[derive(Debug, Serialize, Clone, Tsify)]
#[tsify(into_wasm_abi)]
pub struct Count {
    pub label: String,
    pub value: u32,
}

#[derive(Debug, Serialize, Clone, Tsify)]
#[tsify(into_wasm_abi)]
pub struct HourCount {
    pub hour: u32,
    pub value: u32,
}

#[derive(Debug, Serialize, Tsify)]
#[tsify(into_wasm_abi)]
pub struct Summary {
    pub total_messages: usize,
    pub by_sender: Vec<Count>,
    pub daily: Vec<Count>,
    pub hourly: Vec<HourCount>,
    pub top_emojis: Vec<Count>,
    pub top_words: Vec<Count>,
    pub top_words_no_stop: Vec<Count>,
    pub deleted_you: u32,
    pub deleted_others: u32,
    pub timeline: Vec<Count>,
    pub weekly: Vec<Count>,
    pub monthly: Vec<Count>,
    pub share_of_speech: Vec<Count>,
    pub buckets_by_person: Vec<PersonBuckets>,
    pub word_cloud: Vec<Count>,
    pub word_cloud_no_stop: Vec<Count>,
    pub emoji_cloud: Vec<Count>,
    pub salient_phrases: Vec<Count>,
    pub top_phrases: Vec<Count>,
    pub top_phrases_no_stop: Vec<Count>,
    pub per_person_phrases: Vec<PersonPhrases>,
    pub per_person_phrases_no_stop: Vec<PersonPhrases>,
    pub fun_facts: Vec<FunFact>,
    pub person_stats: Vec<PersonStat>,
    pub per_person_daily: Vec<PersonDaily>,
    pub sentiment_by_day: Vec<SentimentDay>,
    pub sentiment_overall: Vec<SentimentOverall>,
    pub conversation_starters: Vec<Count>,
    pub conversation_count: usize,
    pub journey: Option<Journey>,
}

impl Summary {
    pub fn daily_counts(&self) -> &[Count] {
        &self.daily
    }
}

#[derive(Debug, Serialize, Tsify)]
#[tsify(into_wasm_abi)]
pub struct PersonBuckets {
    pub name: String,
    pub messages: usize,
    pub hourly: [u32; 24],
    pub daily: [u32; 7],
    pub monthly: [u32; 12],
}

#[derive(Debug, Serialize, Tsify)]
#[tsify(into_wasm_abi)]
pub struct FunFact {
    pub name: String,
    pub total_words: u32,
    pub longest_message_words: u32,
    pub unique_words: u32,
    pub average_message_length: u32,
    pub top_emojis: Vec<String>,
}

#[derive(Debug, Serialize, Tsify)]
#[tsify(into_wasm_abi)]
pub struct PersonStat {
    pub name: String,
    pub total_words: u32,
    pub unique_words: u32,
    pub longest_message_words: u32,
    pub average_words_per_message: f32,
    pub top_emojis: Vec<Count>,
    pub dominant_color: Option<String>,
}

#[derive(Debug, Serialize, Tsify)]
#[tsify(into_wasm_abi)]
pub struct PersonDaily {
    pub name: String,
    pub daily: Vec<Count>,
}

#[derive(Debug, Clone, Serialize, Tsify)]
#[tsify(into_wasm_abi)]
pub struct PersonPhrases {
    pub name: String,
    pub phrases: Vec<Count>,
}

#[derive(Debug, Clone, Serialize, Tsify)]
#[tsify(into_wasm_abi)]
pub struct JourneyMessage {
    pub sender: String,
    pub text: String,
    pub timestamp: String,
    pub is_you: bool,
}

#[derive(Debug, Clone, Serialize, Tsify)]
#[tsify(into_wasm_abi)]
pub struct JourneyMoment {
    pub title: String,
    pub description: String,
    pub date: String,
    pub messages: Vec<JourneyMessage>,
    pub sentiment_score: f32,
}

#[derive(Debug, Clone, Serialize, Tsify)]
#[tsify(into_wasm_abi)]
pub struct Journey {
    pub first_day: String,
    pub last_day: String,
    pub total_days: u32,
    pub total_messages: usize,
    pub first_messages: Vec<JourneyMessage>,
    pub last_messages: Vec<JourneyMessage>,
    pub interesting_moments: Vec<JourneyMoment>,
}

#[derive(Debug, Serialize, Tsify)]
#[tsify(into_wasm_abi)]
pub struct SentimentDay {
    pub name: String,
    pub day: String,
    pub mean: f32,
    pub pos: u32,
    pub neu: u32,
    pub neg: u32,
}

#[derive(Debug, Serialize, Tsify)]
#[tsify(into_wasm_abi)]
pub struct SentimentOverall {
    pub name: String,
    pub mean: f32,
    pub pos: u32,
    pub neu: u32,
    pub neg: u32,
}

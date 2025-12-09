use chrono::{Datelike, NaiveDate, NaiveDateTime, Timelike, Weekday};
use once_cell::sync::OnceCell;
use regex::Regex;
use serde::Serialize;
use std::collections::{BTreeMap, HashMap, HashSet};
use stopwords::{Language, Spark, Stopwords};
use unicode_segmentation::UnicodeSegmentation;
use wasm_bindgen::prelude::*;

// Performance timing helpers, enabled via `--features timing` for debugging.
#[cfg(all(target_arch = "wasm32", feature = "timing"))]
fn perf_now() -> f64 {
    web_sys::window()
        .and_then(|w| w.performance())
        .map(|p| p.now())
        .unwrap_or(0.0)
}

#[cfg(all(target_arch = "wasm32", feature = "timing"))]
macro_rules! log_step {
    ($label:expr, $start:expr) => {
        web_sys::console::log_1(
            &format!("[wasm] {} took {:.1}ms", $label, perf_now() - $start).into(),
        );
    };
}

#[wasm_bindgen]
pub fn init_panic_hook() {
    #[cfg(feature = "console_error_panic_hook")]
    console_error_panic_hook::set_once();
}

#[derive(Debug, Serialize, Clone)]
pub struct Count {
    label: String,
    value: u32,
}

#[derive(Debug, Serialize, Clone)]
struct HourCount {
    hour: u32,
    value: u32,
}

#[derive(Debug, Serialize)]
pub struct Summary {
    total_messages: usize,
    by_sender: Vec<Count>,
    daily: Vec<Count>,
    hourly: Vec<HourCount>,
    top_emojis: Vec<Count>,
    top_words: Vec<Count>,
    top_words_no_stop: Vec<Count>,
    deleted_you: u32,
    deleted_others: u32,
    timeline: Vec<Count>,
    weekly: Vec<Count>,
    monthly: Vec<Count>,
    share_of_speech: Vec<Count>,
    buckets_by_person: Vec<PersonBuckets>,
    word_cloud: Vec<Count>,
    word_cloud_no_stop: Vec<Count>,
    emoji_cloud: Vec<Count>,
    salient_phrases: Vec<Count>,
    top_phrases: Vec<Count>,
    top_phrases_no_stop: Vec<Count>,
    per_person_phrases: Vec<PersonPhrases>,
    per_person_phrases_no_stop: Vec<PersonPhrases>,
    fun_facts: Vec<FunFact>,
    person_stats: Vec<PersonStat>,
    per_person_daily: Vec<PersonDaily>,
    sentiment_by_day: Vec<SentimentDay>,
    sentiment_overall: Vec<SentimentOverall>,
    conversation_starters: Vec<Count>,
    conversation_count: usize,
    journey: Option<Journey>,
}

impl Summary {
    pub fn daily_counts(&self) -> &[Count] {
        &self.daily
    }
}

#[derive(Debug, Serialize)]
struct PersonBuckets {
    name: String,
    messages: usize,
    hourly: [u32; 24],
    daily: [u32; 7],
    monthly: [u32; 12],
}

#[derive(Debug, Serialize)]
struct FunFact {
    name: String,
    total_words: u32,
    longest_message_words: u32,
    unique_words: u32,
    average_message_length: u32,
    top_emojis: Vec<String>,
}

#[derive(Debug, Serialize)]
struct PersonStat {
    name: String,
    total_words: u32,
    unique_words: u32,
    longest_message_words: u32,
    average_words_per_message: f32,
    top_emojis: Vec<Count>,
    dominant_color: Option<String>,
}

#[derive(Debug, Serialize)]
struct PersonDaily {
    name: String,
    daily: Vec<Count>,
}

#[derive(Debug, Clone, Serialize)]
struct PersonPhrases {
    name: String,
    phrases: Vec<Count>,
}

/// A single message for rendering in the journey section
#[derive(Debug, Clone, Serialize)]
struct JourneyMessage {
    sender: String,
    text: String,
    timestamp: String, // ISO 8601 datetime string
    is_you: bool,      // true if this is likely "you" (the exporter)
}

/// A notable moment with context messages
#[derive(Debug, Clone, Serialize)]
struct JourneyMoment {
    title: String,
    description: String,
    date: String,
    messages: Vec<JourneyMessage>,
    sentiment_score: f32,
}

/// The full journey through your messages
#[derive(Debug, Clone, Serialize)]
struct Journey {
    first_day: String,
    last_day: String,
    total_days: u32,
    total_messages: usize,
    first_messages: Vec<JourneyMessage>, // First few messages of the conversation
    last_messages: Vec<JourneyMessage>,  // Last few messages of the conversation
    interesting_moments: Vec<JourneyMoment>,
}

#[derive(Debug, Clone, Copy)]
enum SentimentClass {
    Positive,
    Neutral,
    Negative,
}

#[derive(Debug, Default, Clone, Copy)]
struct SentimentAgg {
    sum: f32,
    count: u32,
    pos: u32,
    neu: u32,
    neg: u32,
}

impl SentimentAgg {
    fn push(&mut self, compound: f32, class: SentimentClass) {
        self.sum += compound;
        self.count += 1;
        match class {
            SentimentClass::Positive => self.pos += 1,
            SentimentClass::Neutral => self.neu += 1,
            SentimentClass::Negative => self.neg += 1,
        }
    }

    fn mean(&self) -> f32 {
        if self.count == 0 {
            0.0
        } else {
            self.sum / self.count as f32
        }
    }
}

fn sentiment_lexicons() -> (
    &'static HashSet<&'static str>,
    &'static HashSet<&'static str>,
) {
    static POS: OnceCell<HashSet<&'static str>> = OnceCell::new();
    static NEG: OnceCell<HashSet<&'static str>> = OnceCell::new();
    let pos = POS.get_or_init(|| POSITIVE_WORDS.iter().copied().collect());
    let neg = NEG.get_or_init(|| NEGATIVE_WORDS.iter().copied().collect());
    (pos, neg)
}

fn sentiment_score(text: &str) -> (f32, SentimentClass) {
    let (pos_words, neg_words) = sentiment_lexicons();

    let mut score: i32 = 0;
    let mut hits: u32 = 0;

    for token in text.unicode_words() {
        let cleaned = token
            .trim_matches(|c: char| !c.is_alphanumeric())
            .to_lowercase();
        if cleaned.is_empty() {
            continue;
        }
        if pos_words.contains(cleaned.as_str()) {
            score += 2;
            hits += 1;
        } else if neg_words.contains(cleaned.as_str()) {
            score -= 2;
            hits += 1;
        }
    }

    for glyph in extract_emojis(text) {
        if POSITIVE_EMOJIS.contains(&glyph.as_str()) {
            score += 2;
            hits += 1;
        } else if NEGATIVE_EMOJIS.contains(&glyph.as_str()) {
            score -= 2;
            hits += 1;
        }
    }

    let compound = if hits == 0 {
        0.0
    } else {
        (score as f32) / (hits as f32 * 2.0)
    }
    .clamp(-1.0, 1.0);

    let class = classify_sentiment(compound);
    (compound, class)
}

fn classify_sentiment(compound: f32) -> SentimentClass {
    if compound > 0.05 {
        SentimentClass::Positive
    } else if compound < -0.05 {
        SentimentClass::Negative
    } else {
        SentimentClass::Neutral
    }
}

fn sentiment_breakdown(messages: &[Message]) -> (Vec<SentimentDay>, Vec<SentimentOverall>) {
    if messages.is_empty() {
        return (Vec::new(), Vec::new());
    }

    let mut per_day: HashMap<(String, String), SentimentAgg> = HashMap::new();
    let mut per_person: HashMap<String, SentimentAgg> = HashMap::new();

    for m in messages {
        let (compound, class) = sentiment_score(&m.text);
        let day = m.dt.date().format("%Y-%m-%d").to_string();

        let entry = per_day.entry((m.sender.clone(), day.clone())).or_default();
        entry.push(compound, class);

        per_person
            .entry(m.sender.clone())
            .or_default()
            .push(compound, class);
    }

    let mut sentiment_by_day: Vec<SentimentDay> = per_day
        .into_iter()
        .map(|((name, day), agg)| SentimentDay {
            name,
            day,
            mean: agg.mean(),
            pos: agg.pos,
            neu: agg.neu,
            neg: agg.neg,
        })
        .collect();

    sentiment_by_day.sort_by(|a, b| a.day.cmp(&b.day).then_with(|| a.name.cmp(&b.name)));

    let mut sentiment_overall: Vec<SentimentOverall> = per_person
        .into_iter()
        .map(|(name, agg)| SentimentOverall {
            name,
            mean: agg.mean(),
            pos: agg.pos,
            neu: agg.neu,
            neg: agg.neg,
        })
        .collect();

    sentiment_overall.sort_by(|a, b| {
        b.mean
            .partial_cmp(&a.mean)
            .unwrap_or(std::cmp::Ordering::Equal)
            .then_with(|| a.name.cmp(&b.name))
    });

    (sentiment_by_day, sentiment_overall)
}

#[derive(Debug, Serialize)]
struct SentimentDay {
    name: String,
    day: String,
    mean: f32,
    pos: u32,
    neu: u32,
    neg: u32,
}

#[derive(Debug, Serialize)]
struct SentimentOverall {
    name: String,
    mean: f32,
    pos: u32,
    neu: u32,
    neg: u32,
}

// Compact lexicon for sentiment scoring to keep WASM footprint small.
const POSITIVE_WORDS: [&str; 37] = [
    "love",
    "loving",
    "loved",
    "like",
    "great",
    "good",
    "amazing",
    "awesome",
    "fantastic",
    "nice",
    "cool",
    "fun",
    "yay",
    "happy",
    "glad",
    "thanks",
    "thank",
    "thx",
    "congrats",
    "winner",
    "win",
    "excited",
    "sweet",
    "wow",
    "perfect",
    "best",
    "brilliant",
    "enjoy",
    "enjoying",
    "haha",
    "lol",
    "lmao",
    "pls",
    "plz",
    "support",
    "proud",
    "celebrate",
];

const NEGATIVE_WORDS: [&str; 37] = [
    "hate", "hating", "hated", "bad", "terrible", "awful", "horrible", "worst", "sad", "angry",
    "mad", "upset", "tired", "annoyed", "pain", "hurt", "broken", "break", "breakup", "cry",
    "crying", "sucks", "suck", "wtf", "meh", "lame", "loser", "lost", "problem", "issues", "issue",
    "never", "nope", "cannot", "can't", "sorry", "ugh",
];

const POSITIVE_EMOJIS: [&str; 12] = [
    "😀", "😃", "😄", "😁", "😆", "😍", "😊", "😂", "🤣", "👍", "🙏", "❤️",
];
const NEGATIVE_EMOJIS: [&str; 10] = ["😢", "😭", "😡", "😠", "👎", "💔", "😞", "😔", "🙁", "☹️"];

#[derive(Debug, Clone)]
struct Message {
    dt: NaiveDateTime,
    sender: String,
    text: String,
}

// Fixed 30-minute gap threshold to define a new conversation
const CONVERSATION_GAP_MINUTES: i64 = 30;
const WHATSAPP_EXTRAS: [&str; 27] = [
    "<media",
    "<attached:",
    "audio",
    "omitted>",
    "bild",
    "image",
    "<medien",
    "ausgeschlossen>",
    "weggelassen",
    "omitted",
    "_",
    "_weggelassen>",
    "_ommited>",
    "_omesso>",
    "_omitted",
    "_attached",
    "edited>",
    "<this",
    "message",
    "missed",
    "voice",
    "call.",
    "location:",
    "deleted",
    "ich",
    "du",
    "wir",
];

// Map common color words to stable hex values so we can pick a user tint from chat content.
const COLOR_WORDS: [(&str, &str); 12] = [
    ("blue", "#64d8ff"),
    ("pink", "#ff7edb"),
    ("purple", "#8c7bff"),
    ("mint", "#7cf9c0"),
    ("orange", "#ffb347"),
    ("red", "#ff6b6b"),
    ("yellow", "#ffd166"),
    ("green", "#06d6a0"),
    ("teal", "#118ab2"),
    ("magenta", "#ef476f"),
    ("gold", "#f2c94c"),
    ("lavender", "#b39ddb"),
];

fn color_hex_for_word(word: &str) -> Option<&'static str> {
    COLOR_WORDS
        .iter()
        .find(|(label, _)| *label == word)
        .map(|(_, hex)| *hex)
}

fn pick_dominant_color(freq: &HashMap<String, u32>) -> Option<String> {
    if freq.is_empty() {
        return None;
    }

    let mut entries: Vec<_> = freq.iter().collect();
    entries.sort_by(|a, b| {
        // Higher count first; tie-break alphabetically for determinism.
        b.1.cmp(a.1).then_with(|| a.0.cmp(b.0))
    });

    let best_word = entries.first().map(|(w, _)| w.as_str())?;
    color_hex_for_word(best_word).map(|hex| hex.to_string())
}

fn stopwords_set() -> &'static HashSet<&'static str> {
    static STOPWORDS: OnceCell<HashSet<&'static str>> = OnceCell::new();
    STOPWORDS.get_or_init(|| {
        let mut set: HashSet<&'static str> = Spark::stopwords(Language::English)
            .unwrap_or_default()
            .iter()
            .copied()
            .collect();
        for extra in WHATSAPP_EXTRAS {
            set.insert(extra);
        }
        set
    })
}

fn conversation_initiations(messages: &[Message]) -> (Vec<Count>, usize) {
    conversation_initiations_with_gap(messages, CONVERSATION_GAP_MINUTES)
}

fn conversation_initiations_with_gap(
    messages: &[Message],
    gap_minutes: i64,
) -> (Vec<Count>, usize) {
    if messages.is_empty() {
        return (Vec::new(), 0);
    }

    let mut sorted = messages.to_vec();
    sorted.sort_by_key(|m| m.dt);

    let mut initiations: HashMap<String, u32> = HashMap::new();
    let mut conversation_count = 1usize;
    let mut prev_dt = sorted[0].dt;
    let mut current_initiator_recorded = true;

    *initiations.entry(sorted[0].sender.clone()).or_insert(0) += 1;

    for m in sorted.iter().skip(1) {
        let gap = (m.dt - prev_dt).num_minutes();
        if gap > gap_minutes {
            conversation_count += 1;
            current_initiator_recorded = false;
        }

        if !current_initiator_recorded {
            *initiations.entry(m.sender.clone()).or_insert(0) += 1;
            current_initiator_recorded = true;
        }

        prev_dt = m.dt;
    }

    let mut items: Vec<Count> = initiations
        .into_iter()
        .map(|(label, value)| Count { label, value })
        .collect();
    items.sort_by_key(|c| std::cmp::Reverse(c.value));
    (items, conversation_count)
}

fn re_bracket() -> &'static Regex {
    static RE: OnceCell<Regex> = OnceCell::new();
    RE.get_or_init(|| {
        Regex::new(r"^[\u{feff}\u{200e}]?\[(?P<date>\d{1,2}[\/.]\d{1,2}[\/.]\d{2,4}),\s+(?P<time>[^\]]+)\]\s+(?P<name>[^:]+):\s+(?P<msg>.*)$")
            .expect("valid regex")
    })
}

fn re_hyphen() -> &'static Regex {
    static RE: OnceCell<Regex> = OnceCell::new();
    RE.get_or_init(|| {
        Regex::new(r"^(?P<date>\d{1,2}[\/.]\d{1,2}[\/.]\d{2,4}),\s+(?P<time>\d{1,2}:\d{2}(?::\d{2})?(?:\s*[AP]M)?)\s+-\s+(?P<name>[^:]+):\s+(?P<msg>.*)$")
            .expect("valid regex")
    })
}

fn parse_timestamp(date: &str, time: &str) -> Option<NaiveDateTime> {
    let cleaned = time
        .replace(['\u{202f}', '\u{00a0}'], " ")
        .trim()
        .to_uppercase();

    let prefer_month_first = if date.contains('/') {
        let mut parts = date.split('/');
        let first = parts.next().and_then(|p| p.parse::<u32>().ok());
        let second = parts.next().and_then(|p| p.parse::<u32>().ok());
        match (first, second) {
            // If the first part is >12 it's definitely a day, so prefer day-first.
            (Some(a), Some(_)) if a > 12 => false,
            // If the second part is >12 then the first must be the month.
            (Some(_), Some(b)) if b > 12 => true,
            _ => true, // default to month/day to mirror previous behavior and tests
        }
    } else {
        false
    };

    let mut formats: Vec<&str> = Vec::new();

    // Build format list in the preferred order to reduce ambiguous swaps.
    if date.contains('.') {
        formats.extend_from_slice(&[
            "%d.%m.%Y, %H:%M:%S",
            "%d.%m.%Y, %H:%M",
            "%d.%m.%y, %H:%M:%S",
            "%d.%m.%y, %H:%M",
        ]);
        formats.extend_from_slice(&[
            "%d.%m.%Y, %I:%M:%S %p",
            "%d.%m.%Y, %I:%M %p",
            "%d.%m.%y, %I:%M:%S %p",
            "%d.%m.%y, %I:%M %p",
        ]);
    } else if prefer_month_first {
        formats.extend_from_slice(&[
            "%m/%d/%Y, %H:%M:%S",
            "%m/%d/%Y, %H:%M",
            "%m/%d/%y, %H:%M:%S",
            "%m/%d/%y, %H:%M",
        ]);
        formats.extend_from_slice(&[
            "%d/%m/%Y, %H:%M:%S",
            "%d/%m/%Y, %H:%M",
            "%d/%m/%y, %H:%M:%S",
            "%d/%m/%y, %H:%M",
        ]);
        formats.extend_from_slice(&[
            "%m/%d/%Y, %I:%M:%S %p",
            "%m/%d/%Y, %I:%M %p",
            "%m/%d/%y, %I:%M:%S %p",
            "%m/%d/%y, %I:%M %p",
        ]);
        formats.extend_from_slice(&[
            "%d/%m/%Y, %I:%M:%S %p",
            "%d/%m/%Y, %I:%M %p",
            "%d/%m/%y, %I:%M:%S %p",
            "%d/%m/%y, %I:%M %p",
        ]);
    } else {
        formats.extend_from_slice(&[
            "%d/%m/%Y, %H:%M:%S",
            "%d/%m/%Y, %H:%M",
            "%d/%m/%y, %H:%M:%S",
            "%d/%m/%y, %H:%M",
        ]);
        formats.extend_from_slice(&[
            "%m/%d/%Y, %H:%M:%S",
            "%m/%d/%Y, %H:%M",
            "%m/%d/%y, %H:%M:%S",
            "%m/%d/%y, %H:%M",
        ]);
        formats.extend_from_slice(&[
            "%d/%m/%Y, %I:%M:%S %p",
            "%d/%m/%Y, %I:%M %p",
            "%d/%m/%y, %I:%M:%S %p",
            "%d/%m/%y, %I:%M %p",
        ]);
        formats.extend_from_slice(&[
            "%m/%d/%Y, %I:%M:%S %p",
            "%m/%d/%Y, %I:%M %p",
            "%m/%d/%y, %I:%M:%S %p",
            "%m/%d/%y, %I:%M %p",
        ]);
    }

    formats.iter().find_map(|fmt| {
        NaiveDateTime::parse_from_str(&format!("{date}, {cleaned}"), fmt)
            .ok()
            .and_then(|dt| {
                if dt.year() < 100 {
                    dt.with_year(dt.year() + 2000)
                } else {
                    Some(dt)
                }
            })
    })
}

fn clean_sender(name: &str) -> String {
    name.trim_matches(|c: char| {
        c.is_whitespace() || matches!(c, '\u{feff}' | '\u{200e}' | '\u{200f}')
    })
    .chars()
    .filter(|c| {
        !c.is_control()
            && !matches!(
                *c,
                '\u{202a}'
                    | '\u{202b}'
                    | '\u{202c}'
                    | '\u{202d}'
                    | '\u{202e}'
                    | '\u{202f}'
                    | '\u{2060}'
                    | '\u{2066}'
                    | '\u{2067}'
                    | '\u{2068}'
                    | '\u{2069}'
            )
    })
    .collect()
}

fn parse_messages(raw: &str) -> Vec<Message> {
    let mut messages = Vec::new();
    let mut current: Option<Message> = None;

    for line in raw.lines() {
        if let Some(caps) = re_bracket()
            .captures(line)
            .or_else(|| re_hyphen().captures(line))
        {
            if let Some(msg) = current.take() {
                messages.push(msg);
            }

            let date = caps.name("date").map(|m| m.as_str()).unwrap_or("");
            let time = caps.name("time").map(|m| m.as_str()).unwrap_or("");
            let name = caps
                .name("name")
                .map(|m| clean_sender(m.as_str()))
                .unwrap_or_else(String::new);
            let text = caps
                .name("msg")
                .map(|m| m.as_str())
                .unwrap_or("")
                .to_string();

            if let Some(dt) = parse_timestamp(date, time) {
                current = Some(Message {
                    dt,
                    sender: name,
                    text,
                });
            }
        } else if let Some(msg) = current.as_mut() {
            msg.text.push('\n');
            msg.text.push_str(line.trim());
        }
    }

    if let Some(msg) = current.take() {
        messages.push(msg);
    }

    filter_system_messages(messages)
}

fn filter_system_messages(messages: Vec<Message>) -> Vec<Message> {
    let mut filtered = Vec::with_capacity(messages.len());
    let mut iter = messages.into_iter();

    if let Some(first) = iter.next() {
        if !is_system_message(&first) {
            filtered.push(first);
        }
    }

    for msg in iter {
        if !is_system_message(&msg) {
            filtered.push(msg);
        }
    }
    filtered
}

fn is_system_message(msg: &Message) -> bool {
    let sender = msg.sender.to_lowercase();
    if sender == "system" {
        return true;
    }

    let text = msg.text.trim().to_lowercase();

    // Common WhatsApp system banners and notifications to ignore.
    text.contains("messages and calls are end-to-end encrypted")
        || text.contains("created group")
        || text.contains("changed this group's icon")
        || (text.contains("security code") && text.contains("tap to learn more"))
}

fn is_media_omitted_message(text: &str) -> bool {
    text.trim().eq_ignore_ascii_case("<media omitted>")
}

fn count_by_sender(messages: &[Message]) -> Vec<Count> {
    let mut map = HashMap::new();
    for m in messages {
        *map.entry(m.sender.clone()).or_insert(0u32) += 1;
    }
    let mut items: Vec<_> = map
        .into_iter()
        .map(|(label, value)| Count { label, value })
        .collect();
    items.sort_by_key(|c| std::cmp::Reverse(c.value));
    items
}

fn daily_counts(messages: &[Message]) -> Vec<Count> {
    let mut map = BTreeMap::new();
    for m in messages {
        let date: NaiveDate = m.dt.date();
        *map.entry(date).or_insert(0u32) += 1;
    }
    map.into_iter()
        .map(|(d, value)| Count {
            label: d.format("%Y-%m-%d").to_string(),
            value,
        })
        .collect()
}

/// Compute longest consecutive-day streak from daily counts (YYYY-MM-DD labels).
pub fn longest_streak(daily: &[Count]) -> Option<(u32, String, String)> {
    if daily.is_empty() {
        return None;
    }
    // Sort lexicographically; labels are ISO dates.
    let mut sorted = daily.to_vec();
    sorted.sort_by(|a, b| a.label.cmp(&b.label));

    let parse_day = |s: &str| NaiveDate::parse_from_str(s, "%Y-%m-%d").ok();
    let (mut max_streak, mut current_streak) = (1u32, 1u32);
    let (mut max_start_idx, mut max_end_idx) = (0usize, 0usize);
    let mut current_start_idx = 0usize;

    for i in 1..sorted.len() {
        let prev = parse_day(&sorted[i - 1].label);
        let curr = parse_day(&sorted[i].label);
        if let (Some(p), Some(c)) = (prev, curr) {
            if c - p == chrono::Duration::days(1) {
                current_streak += 1;
                if current_streak > max_streak {
                    max_streak = current_streak;
                    max_start_idx = current_start_idx;
                    max_end_idx = i;
                }
                continue;
            }
        }
        current_streak = 1;
        current_start_idx = i;
    }

    let start = sorted.get(max_start_idx).map(|c| c.label.clone())?;
    let end = sorted
        .get(max_end_idx)
        .map(|c| c.label.clone())
        .unwrap_or_else(|| start.clone());
    Some((max_streak, start, end))
}

/// Fast path: compute longest streak directly from raw chat text without building full summary.
/// Parses WhatsApp-style headers and increments per-day counts, then computes streak.
pub fn longest_streak_from_raw(raw: &str) -> Option<(u32, String, String)> {
    use std::collections::BTreeMap;

    let mut map: BTreeMap<NaiveDate, u32> = BTreeMap::new();
    for line in raw.lines() {
        if let Some(caps) = re_bracket()
            .captures(line)
            .or_else(|| re_hyphen().captures(line))
        {
            let date = caps.name("date").map(|m| m.as_str()).unwrap_or("");
            let time = caps.name("time").map(|m| m.as_str()).unwrap_or("");
            if let Some(dt) = parse_timestamp(date, time) {
                *map.entry(dt.date()).or_insert(0) += 1;
            }
        }
    }

    if map.is_empty() {
        return None;
    }

    let daily: Vec<Count> = map
        .into_iter()
        .map(|(d, value)| Count {
            label: d.format("%Y-%m-%d").to_string(),
            value,
        })
        .collect();
    longest_streak(&daily)
}

fn hourly_counts(messages: &[Message]) -> Vec<HourCount> {
    let mut map = [0u32; 24];
    for m in messages {
        let h = m.dt.hour() as usize;
        if h < 24 {
            map[h] += 1;
        }
    }
    map.iter()
        .enumerate()
        .map(|(hour, value)| HourCount {
            hour: hour as u32,
            value: *value,
        })
        .collect()
}

fn weekly_counts(messages: &[Message]) -> Vec<Count> {
    let mut map = [0u32; 7];
    for m in messages {
        let idx = weekday_index(m.dt.weekday());
        map[idx] += 1;
    }
    map.iter()
        .enumerate()
        .map(|(i, value)| Count {
            label: weekday_label(i),
            value: *value,
        })
        .collect()
}

fn monthly_counts(messages: &[Message]) -> Vec<Count> {
    let mut map: BTreeMap<String, u32> = BTreeMap::new();
    for m in messages {
        let label = format!("{:04}-{:02}", m.dt.year(), m.dt.month());
        *map.entry(label).or_insert(0) += 1;
    }
    map.into_iter()
        .map(|(label, value)| Count { label, value })
        .collect()
}

fn salient_phrases(messages: &[Message], take: usize) -> Vec<Count> {
    // Scale minimum count with corpus size to avoid processing rare n-grams
    let min_count: u32 = if messages.len() > 100000 {
        5
    } else if messages.len() > 10000 {
        3
    } else {
        2
    };
    let stop = stopwords_set();

    let mut unigram_counts: HashMap<String, u32> = HashMap::new();
    let mut phrase_counts: HashMap<String, (u32, usize, Vec<String>)> = HashMap::new();
    let mut total_windows: HashMap<usize, u32> = HashMap::new();
    let mut total_tokens: u32 = 0;

    for m in messages {
        if is_media_omitted_message(&m.text) {
            continue;
        }
        let tokens = tokenize(&m.text, false, stop);
        if tokens.len() < 2 {
            continue;
        }

        for t in &tokens {
            *unigram_counts.entry(t.clone()).or_insert(0) += 1;
            total_tokens += 1;
        }

        for window in 2..=4 {
            if tokens.len() < window {
                break;
            }
            for slice in tokens.windows(window) {
                let stop_count = slice.iter().filter(|t| stop.contains(t.as_str())).count();
                let non_stop = window - stop_count;
                if non_stop == 0 {
                    continue;
                }
                let has_long = slice.iter().any(|t| t.len() >= 3);
                if !has_long {
                    continue;
                }

                let (alpha, numeric) = tokens_alpha_numeric_stats(slice);
                if alpha == 0 {
                    continue;
                }
                let numeric_ratio = numeric as f64 / slice.len() as f64;
                if numeric_ratio > 0.5 {
                    continue;
                }

                let non_stop_ratio = non_stop as f64 / window as f64;
                if window == 2 && non_stop_ratio < 0.5 {
                    continue;
                }

                let phrase = slice.join(" ");
                let entry = phrase_counts.entry(phrase.clone()).or_insert((
                    0,
                    window,
                    slice.iter().map(|t| t.to_string()).collect(),
                ));
                entry.0 += 1;
                entry.1 = entry.1.max(window);
                *total_windows.entry(window).or_insert(0) += 1;
            }
        }
    }

    if total_tokens == 0 {
        return Vec::new();
    }

    let mut records: Vec<PhraseRecord> = Vec::new();
    for (phrase, (count, len, tokens)) in phrase_counts.into_iter() {
        if count < min_count {
            continue;
        }
        let total_w = *total_windows.get(&len).unwrap_or(&0);
        if total_w == 0 {
            continue;
        }

        let mut sum_log_uni = 0.0;
        for t in &tokens {
            let Some(c) = unigram_counts.get(t) else {
                sum_log_uni = 0.0;
                break;
            };
            let c = *c as f64;
            sum_log_uni += (c / total_tokens as f64).ln();
        }
        if sum_log_uni == 0.0 {
            continue;
        }
        let p_phrase = (count as f64) / (total_w as f64);
        let pmi = p_phrase.ln() - sum_log_uni;
        if pmi <= 0.0 {
            continue;
        }

        let (_stop_count, non_stop) = tokens_stop_stats(&tokens, stop);
        if non_stop == 0 {
            continue;
        }
        let (alpha, numeric) = tokens_alpha_numeric_stats(&tokens);
        if alpha == 0 {
            continue;
        }
        let numeric_ratio = if tokens.is_empty() {
            0.0
        } else {
            numeric as f64 / tokens.len() as f64
        };
        if numeric_ratio > 0.5 {
            continue;
        }
        let non_stop_ratio = non_stop as f64 / len as f64;
        if len == 2 && non_stop_ratio < 0.5 {
            continue;
        }

        let score =
            pmi * (count as f64) * non_stop_ratio.max(0.3) * (1.0 + 0.25 * (len as f64 - 2.0));

        records.push(PhraseRecord {
            phrase,
            count,
            len,
            tokens,
            score,
        });
    }

    records.sort_by(|a, b| {
        b.score
            .partial_cmp(&a.score)
            .unwrap_or(std::cmp::Ordering::Equal)
            .then_with(|| b.count.cmp(&a.count))
            .then_with(|| b.len.cmp(&a.len))
            .then_with(|| a.phrase.cmp(&b.phrase))
    });

    suppress_subphrases(records, take * 5)
        .into_iter()
        .take(take)
        .map(|r| Count {
            label: r.phrase,
            value: r.count,
        })
        .collect()
}

fn extract_emojis(text: &str) -> Vec<String> {
    let mut out = Vec::new();
    let mut idx = 0;
    while idx < text.len() {
        let rest = &text[idx..];
        if let Some(m) = emoji_re().find(rest) {
            if m.start() == 0 {
                // Greedy match at the current cursor; should cover full ZWJ/skin-tone sequence.
                out.push(m.as_str().to_string());
                idx += m.end();
                continue;
            }
        }
        // Advance by one scalar if no emoji match at current position.
        idx += rest.chars().next().map(|c| c.len_utf8()).unwrap_or(1);
    }
    out
}

fn top_emojis(messages: &[Message], take: usize) -> Vec<Count> {
    let mut map = HashMap::new();
    for text in messages.iter().map(|m| m.text.as_str()) {
        for hit in extract_emojis(text) {
            *map.entry(hit).or_insert(0u32) += 1;
        }
    }
    let mut items: Vec<_> = map
        .into_iter()
        .map(|(label, value)| Count { label, value })
        .collect();
    items.sort_by_key(|c| std::cmp::Reverse(c.value));
    items.truncate(take);
    items
}

fn top_words(messages: &[Message], take: usize, filter_stop: bool) -> Vec<Count> {
    let stop = stopwords_set();

    let mut map = HashMap::new();
    for m in messages {
        let text = m.text.as_str();
        if is_media_omitted_message(text) {
            continue;
        }
        for token in tokenize(text, filter_stop, stop) {
            let short_alnum = token.len() < 3 && token.chars().all(|c| c.is_alphanumeric());
            if short_alnum {
                continue;
            }
            *map.entry(token).or_insert(0u32) += 1;
        }
    }
    let mut items: Vec<_> = map
        .into_iter()
        .map(|(label, value)| Count { label, value })
        .collect();
    items.sort_by_key(|c| std::cmp::Reverse(c.value));
    items.truncate(take);
    items
}

fn word_cloud(messages: &[Message], take: usize, filter_stop: bool) -> Vec<Count> {
    let stop = stopwords_set();
    let mut map = HashMap::new();
    for m in messages {
        let text = m.text.as_str();
        if is_media_omitted_message(text) {
            continue;
        }
        for token in tokenize(text, filter_stop, stop) {
            if token.is_empty() {
                continue;
            }
            *map.entry(token).or_insert(0u32) += 1;
        }
    }
    let mut items: Vec<_> = map
        .into_iter()
        .map(|(label, value)| Count { label, value })
        .collect();
    items.sort_by_key(|c| std::cmp::Reverse(c.value));
    items.truncate(take);
    items
}

fn emoji_cloud(messages: &[Message], take: usize) -> Vec<Count> {
    let mut counts = top_emojis(messages, usize::MAX);
    counts.truncate(take);
    counts
}

fn emoji_re() -> &'static Regex {
    static RE: OnceCell<Regex> = OnceCell::new();
    RE.get_or_init(|| {
        // Match complete emoji sequences including:
        // - Regional indicator pairs (flags like 🇺🇸)
        // - Base emoji with optional skin tone modifiers (🏻-🏿) and variation selectors (️)
        // - ZWJ sequences (👨‍👩‍👧‍👦) where emojis are joined by \u{200D}
        Regex::new(
            r"(?x)
            [\u{1F1E6}-\u{1F1FF}]{2}  # Regional indicator pairs (flags)
            |
            (?:
                [\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2300}-\u{23FF}\u{2B50}-\u{2B55}\u{203C}\u{2049}\u{25AA}\u{25AB}\u{25B6}\u{25C0}\u{25FB}-\u{25FE}\u{00A9}\u{00AE}\u{2122}\u{2139}\u{2194}-\u{2199}\u{21A9}\u{21AA}\u{231A}\u{231B}\u{2328}\u{23CF}\u{23E9}-\u{23F3}\u{23F8}-\u{23FA}\u{24C2}\u{25AA}\u{25AB}\u{25B6}\u{25C0}\u{2934}\u{2935}\u{3030}\u{303D}\u{3297}\u{3299}]
                [\u{1F3FB}-\u{1F3FF}]?  # Optional skin tone modifier
                \u{FE0F}?               # Optional variation selector
                (?:\u{200D}             # ZWJ
                    [\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2640}\u{2642}\u{2695}\u{2696}\u{2708}\u{2764}]
                    [\u{1F3FB}-\u{1F3FF}]?
                    \u{FE0F}?
                )*                      # Zero or more ZWJ + emoji
            )
            "
        ).expect("emoji regex")
    })
}

fn url_re() -> &'static Regex {
    static RE: OnceCell<Regex> = OnceCell::new();
    RE.get_or_init(|| {
        // Matches common URL forms so we can strip them before tokenization.
        Regex::new(r"(?i)\bhttps?://\S+|\bwww\.[^\s]+").expect("url regex")
    })
}

fn tokenize(text: &str, filter_stop: bool, stop: &HashSet<&'static str>) -> Vec<String> {
    let cleaned_urls = url_re().replace_all(text, " ");
    cleaned_urls
        .split_whitespace()
        .filter_map(|raw| {
            let token = raw.to_lowercase();
            let canonical = token
                .trim_matches(|c: char| !c.is_alphanumeric())
                .to_string();

            if filter_stop && !canonical.is_empty() && stop.contains(canonical.as_str()) {
                return None;
            }

            if token.is_empty() {
                None
            } else {
                Some(token)
            }
        })
        .collect()
}

#[derive(Clone)]
struct PhraseRecord {
    phrase: String,
    count: u32,
    len: usize,
    tokens: Vec<String>,
    score: f64,
}

fn tokens_stop_stats(tokens: &[String], stop: &HashSet<&'static str>) -> (usize, usize) {
    let stop_count = tokens.iter().filter(|t| stop.contains(t.as_str())).count();
    let non_stop = tokens.len().saturating_sub(stop_count);
    (stop_count, non_stop)
}

fn tokens_alpha_numeric_stats(tokens: &[String]) -> (usize, usize) {
    let mut alpha = 0;
    let mut numeric = 0;
    for t in tokens {
        if t.chars().all(|c| c.is_ascii_digit()) {
            numeric += 1;
        } else {
            // Treat any non-pure-digit token (including emoticons like <3 or punctuation-adjacent tokens) as alpha-ish.
            alpha += 1;
        }
    }
    (alpha, numeric)
}

fn contains_subsequence(long: &[String], short: &[String]) -> bool {
    if short.is_empty() || short.len() > long.len() {
        return false;
    }
    long.windows(short.len()).any(|w| w == short)
}

fn suppress_subphrases(records: Vec<PhraseRecord>, max_input: usize) -> Vec<PhraseRecord> {
    // Limit input size to avoid O(n²) blowup on large datasets.
    let records: Vec<PhraseRecord> = if records.len() > max_input {
        records.into_iter().take(max_input).collect()
    } else {
        records
    };

    let mut kept: Vec<PhraseRecord> = Vec::new();
    'outer: for rec in records {
        for existing in kept.iter_mut() {
            if existing.len > rec.len
                && existing.count >= 2
                && contains_subsequence(&existing.tokens, &rec.tokens)
            {
                // Drop shorter phrase when a longer containing phrase is established.
                continue 'outer;
            }

            if rec.len > existing.len
                && rec.count >= 2
                && contains_subsequence(&rec.tokens, &existing.tokens)
            {
                let overlap = existing.len as f64 / rec.len as f64;
                if overlap >= 0.5 && rec.count * 10 >= existing.count * 6 {
                    // Prefer the longer variant when it is at least ~60% as common as the shorter.
                    *existing = rec;
                    continue 'outer;
                }
            }
        }
        kept.push(rec);
    }
    kept
}

fn top_phrases(messages: &[Message], take: usize, _filter_stop: bool) -> Vec<Count> {
    const MAX_N: usize = 5;
    const PMI_THRESHOLD: f64 = 0.1;
    const SEP: &str = "\x00";

    let stop = stopwords_set();

    let mut total_tokens: u32 = 0;
    // Use String keys (joined with SEP) instead of Vec<String> for faster hashing.
    let mut ngram_counts: HashMap<String, u32> = HashMap::new();
    let mut unigram_counts: HashMap<String, u32> = HashMap::new();

    // Pre-filter tokens per message once.
    let mut all_token_lists: Vec<Vec<String>> = Vec::with_capacity(messages.len());
    for m in messages {
        let text = m.text.as_str();
        if is_media_omitted_message(text) {
            continue;
        }
        let tokens = tokenize(text, false, stop);
        if tokens.is_empty() {
            continue;
        }
        total_tokens += tokens.len() as u32;
        all_token_lists.push(tokens);
    }

    if total_tokens == 0 {
        return Vec::new();
    }

    // Count n-grams.
    for tokens in &all_token_lists {
        let tlen = tokens.len();
        for i in 0..tlen {
            for n in 1..=MAX_N.min(tlen - i) {
                let slice = &tokens[i..i + n];

                // Quick filter: skip all-empty slices.
                if slice.iter().all(|t| t.is_empty()) {
                    continue;
                }

                // For n>1, require at least one non-stopword.
                if n > 1 {
                    let non_stop = slice.iter().filter(|t| !stop.contains(t.as_str())).count();
                    if non_stop == 0 {
                        continue;
                    }
                    if n == 2 && non_stop < 1 {
                        continue;
                    }
                }

                // Require at least one alphabetic token, reject >50% numeric.
                let (alpha, numeric) = tokens_alpha_numeric_stats(slice);
                if alpha == 0 || (numeric as f64 / n as f64) > 0.5 {
                    continue;
                }

                // Build string key by joining with SEP.
                let key = slice.join(SEP);
                *ngram_counts.entry(key).or_insert(0) += 1;

                if n == 1 {
                    *unigram_counts.entry(slice[0].clone()).or_insert(0) += 1;
                }
            }
        }
    }

    let total_tokens_f = total_tokens as f64;
    let mut records: Vec<PhraseRecord> = Vec::new();

    // Minimum count threshold scales with corpus size to avoid processing rare n-grams.
    // Scale min count more aggressively for large corpora
    let min_count: u32 = if total_tokens > 500000 {
        5
    } else if total_tokens > 100000 {
        4
    } else if total_tokens > 50000 {
        3
    } else if total_tokens > 10000 {
        2
    } else {
        1
    };

    for (key, &count) in ngram_counts.iter() {
        if count < min_count {
            continue;
        }
        // Split key back into tokens.
        let tokens: Vec<&str> = key.split(SEP).collect();
        let len = tokens.len();
        if len < 2 {
            continue;
        }

        // Require at least one non-stopword.
        let non_stop = tokens.iter().filter(|t| !stop.contains(*t)).count();
        if non_stop == 0 {
            continue;
        }

        // For bigrams, require at least 50% non-stopwords.
        if len == 2 && (non_stop as f64 / len as f64) < 0.5 {
            continue;
        }

        // Compute PMI.
        let p_phrase = count as f64 / total_tokens_f;
        if p_phrase == 0.0 {
            continue;
        }
        let mut prod = 1.0;
        let mut missing_uni = false;
        for t in &tokens {
            let Some(&c) = unigram_counts.get(*t) else {
                missing_uni = true;
                break;
            };
            prod *= (c as f64) / total_tokens_f;
        }
        if missing_uni || prod == 0.0 {
            continue;
        }
        let pmi = (p_phrase / prod).log2();
        if !(len >= 4 && count >= 2) && pmi < PMI_THRESHOLD {
            continue;
        }

        let phrase = tokens.join(" ");
        let score = pmi * (count as f64) * (len as f64).powf(2.0);
        records.push(PhraseRecord {
            phrase,
            count,
            len,
            tokens: tokens.into_iter().map(String::from).collect(),
            score,
        });
    }

    records.sort_by(|a, b| {
        b.len
            .cmp(&a.len)
            .then_with(|| {
                b.score
                    .partial_cmp(&a.score)
                    .unwrap_or(std::cmp::Ordering::Equal)
            })
            .then_with(|| b.count.cmp(&a.count))
            .then_with(|| a.phrase.cmp(&b.phrase))
    });

    suppress_subphrases(records, take * 5)
        .into_iter()
        .take(take)
        .map(|r| Count {
            label: r.phrase,
            value: r.count,
        })
        .collect()
}

fn per_person_phrases(messages: &[Message], take: usize, _filter_stop: bool) -> Vec<PersonPhrases> {
    // Scale minimum count with corpus size
    let min_count: u32 = if messages.len() > 100000 {
        5
    } else if messages.len() > 10000 {
        3
    } else {
        1
    };
    let stop = stopwords_set();
    // (count, window_size, tokens)
    type PhraseData = (u32, usize, Vec<String>);
    let mut map: HashMap<String, HashMap<String, PhraseData>> = HashMap::new();

    for m in messages {
        if is_media_omitted_message(&m.text) {
            continue;
        }
        let tokens = tokenize(&m.text, false, stop);
        if tokens.len() < 2 {
            continue;
        }
        for window in 2..=5 {
            if tokens.len() < window {
                break;
            }
            for slice in tokens.windows(window) {
                if slice.iter().all(|t| t.is_empty()) {
                    continue;
                }
                let stop_count = slice.iter().filter(|t| stop.contains(t.as_str())).count();
                let non_stop = window - stop_count;
                if non_stop == 0 {
                    continue;
                }

                let (alpha, numeric) = tokens_alpha_numeric_stats(slice);
                if alpha == 0 {
                    continue;
                }
                let numeric_ratio = numeric as f64 / slice.len() as f64;
                if numeric_ratio > 0.5 {
                    continue;
                }

                let non_stop_ratio = non_stop as f64 / window as f64;
                if window == 2 && non_stop_ratio < 0.5 {
                    continue;
                }

                let phrase = slice.join(" ");
                let entry = map.entry(m.sender.clone()).or_default();
                let val = entry.entry(phrase.clone()).or_insert((
                    0u32,
                    window,
                    slice.iter().map(|t| t.to_string()).collect(),
                ));
                val.0 += 1;
                val.1 = val.1.max(window);
            }
        }
    }

    let mut res: Vec<PersonPhrases> = map
        .into_iter()
        .map(|(name, phrases)| {
            let mut records: Vec<PhraseRecord> = Vec::new();
            for (label, (value, len, tokens)) in phrases.into_iter() {
                // Skip rare phrases early.
                if value < min_count {
                    continue;
                }
                let (_stop_count, non_stop) = tokens_stop_stats(&tokens, stop);
                if non_stop == 0 {
                    continue;
                }
                let (alpha, numeric) = tokens_alpha_numeric_stats(&tokens);
                if alpha == 0 {
                    continue;
                }
                let numeric_ratio = if tokens.is_empty() {
                    0.0
                } else {
                    numeric as f64 / tokens.len() as f64
                };
                if numeric_ratio > 0.5 {
                    continue;
                }
                let non_stop_ratio = non_stop as f64 / len as f64;
                if len == 2 && non_stop_ratio < 0.5 {
                    continue;
                }
                let score = (value as f64) * (len as f64).powf(1.6) * non_stop_ratio.max(0.3);
                records.push(PhraseRecord {
                    phrase: label,
                    count: value,
                    len,
                    tokens,
                    score,
                });
            }

            records.sort_by(|a, b| {
                b.score
                    .partial_cmp(&a.score)
                    .unwrap_or(std::cmp::Ordering::Equal)
                    .then_with(|| b.count.cmp(&a.count))
                    .then_with(|| b.len.cmp(&a.len))
                    .then_with(|| a.phrase.cmp(&b.phrase))
            });

            let phrases = suppress_subphrases(records, take * 5)
                .into_iter()
                .take(take)
                .map(|r| Count {
                    label: r.phrase,
                    value: r.count,
                })
                .collect::<Vec<_>>();

            // Re-sort final phrases by count descending for display consistency
            let mut phrases = phrases;
            phrases.sort_by(|a, b| b.value.cmp(&a.value));

            PersonPhrases { name, phrases }
        })
        .collect();

    res.sort_by(|a, b| a.name.cmp(&b.name));
    res
}

fn deleted_counts(messages: &[Message]) -> (u32, u32) {
    let mut you = 0u32;
    let mut others = 0u32;
    for text in messages.iter().map(|m| m.text.as_str()) {
        if text == "You deleted this message" {
            you += 1;
        } else if text == "This message was deleted" {
            others += 1;
        }
    }
    (you, others)
}

fn timeline(messages: &[Message]) -> Vec<Count> {
    if messages.is_empty() {
        return Vec::new();
    }
    let mut sorted = messages.to_vec();
    sorted.sort_by_key(|m| m.dt);
    let start = sorted.first().unwrap().dt.date();
    let end = sorted.last().unwrap().dt.date();

    let mut map = BTreeMap::new();
    let mut cursor = start;
    while cursor <= end {
        map.insert(cursor, 0u32);
        cursor = cursor.succ_opt().unwrap();
    }
    for m in sorted {
        let d = m.dt.date();
        if let Some(v) = map.get_mut(&d) {
            *v += 1;
        }
    }
    map.into_iter()
        .map(|(d, value)| Count {
            label: d.format("%Y-%m-%d").to_string(),
            value,
        })
        .collect()
}

fn weekday_index(wd: Weekday) -> usize {
    wd.num_days_from_sunday() as usize
}

fn weekday_label(idx: usize) -> String {
    match idx {
        0 => "Sun",
        1 => "Mon",
        2 => "Tue",
        3 => "Wed",
        4 => "Thu",
        5 => "Fri",
        6 => "Sat",
        _ => "?",
    }
    .to_string()
}

fn buckets_by_person(messages: &[Message]) -> Vec<PersonBuckets> {
    let mut grouped: HashMap<&str, Vec<&Message>> = HashMap::new();
    for m in messages {
        grouped.entry(m.sender.as_str()).or_default().push(m);
    }

    let mut buckets = Vec::with_capacity(grouped.len());
    for (name, msgs) in grouped.into_iter() {
        let mut hourly = [0u32; 24];
        let mut daily = [0u32; 7];
        let mut monthly = [0u32; 12];

        for m in &msgs {
            hourly[m.dt.hour() as usize] += 1;
            daily[weekday_index(m.dt.weekday())] += 1;
            monthly[(m.dt.month0()) as usize] += 1;
        }

        buckets.push(PersonBuckets {
            name: name.to_string(),
            messages: msgs.len(),
            hourly,
            daily,
            monthly,
        });
    }

    buckets.sort_by_key(|b| std::cmp::Reverse(b.messages as u32));
    buckets
}

fn per_person_daily(messages: &[Message]) -> Vec<PersonDaily> {
    let mut grouped: HashMap<&str, BTreeMap<NaiveDate, u32>> = HashMap::new();
    for m in messages {
        grouped
            .entry(m.sender.as_str())
            .or_default()
            .entry(m.dt.date())
            .and_modify(|v| *v += 1)
            .or_insert(1);
    }

    let mut result = Vec::with_capacity(grouped.len());
    for (name, map) in grouped.into_iter() {
        let daily = map
            .into_iter()
            .map(|(d, value)| Count {
                label: d.format("%Y-%m-%d").to_string(),
                value,
            })
            .collect();
        result.push(PersonDaily {
            name: name.to_string(),
            daily,
        });
    }

    result.sort_by_key(|p| p.name.clone());
    result
}

fn fun_facts(messages: &[Message]) -> Vec<FunFact> {
    let mut grouped: HashMap<&str, Vec<&Message>> = HashMap::new();
    for m in messages {
        grouped.entry(m.sender.as_str()).or_default().push(m);
    }

    let mut facts = Vec::with_capacity(grouped.len());
    for (name, msgs) in grouped.into_iter() {
        let mut total_words = 0u32;
        let mut longest_message = 0u32;
        let mut freq: HashMap<String, u32> = HashMap::new();
        let mut emoji_freq: HashMap<String, u32> = HashMap::new();
        let mut counted_msgs = 0u32;

        for m in msgs.iter() {
            if is_media_omitted_message(&m.text) {
                continue;
            }
            counted_msgs += 1;
            let mut words_in_message = 0u32;
            for token in m.text.unicode_words() {
                let cleaned = token
                    .trim_matches(|c: char| !c.is_alphanumeric())
                    .to_lowercase();
                if cleaned.is_empty() {
                    continue;
                }
                words_in_message += 1;
                total_words += 1;
                *freq.entry(cleaned).or_insert(0) += 1;
            }
            longest_message = longest_message.max(words_in_message);

            for hit in extract_emojis(&m.text) {
                *emoji_freq.entry(hit).or_insert(0) += 1;
            }
        }

        let unique_words = freq.values().filter(|v| **v == 1).count() as u32;
        let avg_len = if counted_msgs == 0 {
            0
        } else {
            (total_words as f64 / counted_msgs as f64).round() as u32
        };

        let mut top_emoji_vec: Vec<_> = emoji_freq.into_iter().collect();
        top_emoji_vec.sort_by_key(|(_, v)| std::cmp::Reverse(*v));
        top_emoji_vec.truncate(3);

        facts.push(FunFact {
            name: name.to_string(),
            total_words,
            longest_message_words: longest_message,
            unique_words,
            average_message_length: avg_len,
            top_emojis: top_emoji_vec.into_iter().map(|(k, _)| k).collect(),
        });
    }

    facts.sort_by_key(|f| std::cmp::Reverse(f.total_words));
    facts
}

fn person_stats(messages: &[Message]) -> Vec<PersonStat> {
    let mut grouped: HashMap<&str, Vec<&Message>> = HashMap::new();
    for m in messages {
        grouped.entry(m.sender.as_str()).or_default().push(m);
    }

    let mut stats = Vec::with_capacity(grouped.len());
    for (name, msgs) in grouped.into_iter() {
        let mut total_words = 0u32;
        let mut longest_message = 0u32;
        let mut vocab: HashMap<String, u32> = HashMap::new();
        let mut emoji_freq: HashMap<String, u32> = HashMap::new();
        let mut color_freq: HashMap<String, u32> = HashMap::new();
        let mut counted_msgs = 0u32;

        for m in &msgs {
            if is_media_omitted_message(&m.text) {
                continue;
            }
            counted_msgs += 1;
            let mut words_in_message = 0u32;
            for token in m.text.unicode_words() {
                let cleaned = token
                    .trim_matches(|c: char| !c.is_alphanumeric())
                    .to_lowercase();
                if cleaned.is_empty() {
                    continue;
                }
                words_in_message += 1;
                total_words += 1;
                *vocab.entry(cleaned.clone()).or_insert(0) += 1;

                if color_hex_for_word(&cleaned).is_some() {
                    *color_freq.entry(cleaned).or_insert(0) += 1;
                }
            }
            longest_message = longest_message.max(words_in_message);

            for hit in extract_emojis(&m.text) {
                *emoji_freq.entry(hit).or_insert(0) += 1;
            }
        }

        let unique_words = vocab.len() as u32;
        let avg = if counted_msgs == 0 {
            0.0
        } else {
            total_words as f32 / counted_msgs as f32
        };

        let mut top_emoji_vec: Vec<_> = emoji_freq.into_iter().collect();
        top_emoji_vec.sort_by_key(|(_, v)| std::cmp::Reverse(*v));
        top_emoji_vec.truncate(10);
        let top_emojis = top_emoji_vec
            .into_iter()
            .map(|(label, value)| Count { label, value })
            .collect();

        let dominant_color = pick_dominant_color(&color_freq);

        stats.push(PersonStat {
            name: name.to_string(),
            total_words,
            unique_words,
            longest_message_words: longest_message,
            average_words_per_message: avg,
            top_emojis,
            dominant_color,
        });
    }

    stats.sort_by_key(|s| std::cmp::Reverse(s.total_words));
    stats
}

#[wasm_bindgen]
pub fn analyze_chat(raw: &str, top_words_n: u32, top_emojis_n: u32) -> Result<JsValue, JsValue> {
    let summary = summarize(raw, top_words_n as usize, top_emojis_n as usize)
        .map_err(|e| JsValue::from_str(&e))?;

    serde_wasm_bindgen::to_value(&summary).map_err(|e| JsValue::from_str(&e.to_string()))
}

/// Non-WASM version for benchmarking. Returns JSON string.
#[cfg(not(target_arch = "wasm32"))]
pub fn analyze_chat_native(
    raw: &str,
    top_words_n: usize,
    top_emojis_n: usize,
) -> Result<String, String> {
    let summary = summarize(raw, top_words_n, top_emojis_n)?;
    serde_json::to_string(&summary).map_err(|e| e.to_string())
}

/// Convert a Message to a JourneyMessage
fn to_journey_message(msg: &Message, likely_you: &str) -> JourneyMessage {
    JourneyMessage {
        sender: msg.sender.clone(),
        text: msg.text.clone(),
        timestamp: msg.dt.format("%Y-%m-%dT%H:%M:%S").to_string(),
        is_you: msg.sender == likely_you,
    }
}

/// Find "interesting" moments in the chat based on sentiment extremes and other signals
fn find_interesting_moments(
    messages: &[Message],
    likely_you: &str,
    max_moments: usize,
) -> Vec<JourneyMoment> {
    if messages.len() < 10 {
        return Vec::new();
    }

    // Score each message for "interestingness"
    // High absolute sentiment, long messages, exclamation marks, question marks, etc.
    let mut scored: Vec<(usize, f32, f32)> = Vec::new(); // (index, interest_score, sentiment)

    for (i, msg) in messages.iter().enumerate() {
        let (sentiment, _) = sentiment_score(&msg.text);
        let text_len = msg.text.len() as f32;
        let exclamation_count = msg.text.matches('!').count() as f32;
        let question_count = msg.text.matches('?').count() as f32;
        let emoji_count = extract_emojis(&msg.text).len() as f32;
        let caps_ratio = if !msg.text.is_empty() {
            msg.text.chars().filter(|c| c.is_uppercase()).count() as f32 / msg.text.len() as f32
        } else {
            0.0
        };

        // Skip very short or system messages
        if text_len < 10.0 || msg.text.contains("omitted") || msg.text.contains("deleted") {
            continue;
        }

        // Interest score: combination of factors
        let interest = sentiment.abs() * 2.0
            + (text_len / 100.0).min(3.0)
            + exclamation_count * 0.5
            + question_count * 0.3
            + emoji_count * 0.3
            + caps_ratio * 2.0;

        scored.push((i, interest, sentiment));
    }

    if scored.is_empty() {
        return Vec::new();
    }

    // Divide messages into time segments to ensure spread
    let num_segments = max_moments.max(3);
    let segment_size = messages.len() / num_segments;

    // For each segment, find the best positive and best negative moment
    let mut positive_candidates: Vec<(usize, f32, f32)> = Vec::new(); // (idx, interest, sentiment)
    let mut negative_candidates: Vec<(usize, f32, f32)> = Vec::new();

    for seg in 0..num_segments {
        let seg_start = seg * segment_size;
        let seg_end = if seg == num_segments - 1 {
            messages.len()
        } else {
            (seg + 1) * segment_size
        };

        // Find best positive moment in this segment
        let best_positive = scored
            .iter()
            .filter(|(idx, _, sent)| *idx >= seg_start && *idx < seg_end && *sent > 0.1)
            .max_by(|a, b| a.1.partial_cmp(&b.1).unwrap_or(std::cmp::Ordering::Equal));

        if let Some(&candidate) = best_positive {
            positive_candidates.push(candidate);
        }

        // Find best negative moment in this segment
        let best_negative = scored
            .iter()
            .filter(|(idx, _, sent)| *idx >= seg_start && *idx < seg_end && *sent < -0.1)
            .max_by(|a, b| a.1.partial_cmp(&b.1).unwrap_or(std::cmp::Ordering::Equal));

        if let Some(&candidate) = best_negative {
            negative_candidates.push(candidate);
        }
    }

    // Sort candidates by interest score
    positive_candidates.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));
    negative_candidates.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));

    // Select moments: try to get a mix of positive and negative, spread over time
    let mut selected: Vec<(usize, f32)> = Vec::new();
    let mut pos_iter = positive_candidates.iter().peekable();
    let mut neg_iter = negative_candidates.iter().peekable();

    // Alternate between positive and negative, ensuring spread
    let min_gap = (messages.len() / (max_moments + 1)).max(30);

    while selected.len() < max_moments {
        // Try to add a positive moment
        for &(idx, _, sentiment) in pos_iter.by_ref() {
            let too_close = selected
                .iter()
                .any(|(sel_idx, _)| (idx as i64 - *sel_idx as i64).abs() < min_gap as i64);
            if !too_close {
                selected.push((idx, sentiment));
                break;
            }
        }

        if selected.len() >= max_moments {
            break;
        }

        // Try to add a negative moment
        for &(idx, _, sentiment) in neg_iter.by_ref() {
            let too_close = selected
                .iter()
                .any(|(sel_idx, _)| (idx as i64 - *sel_idx as i64).abs() < min_gap as i64);
            if !too_close {
                selected.push((idx, sentiment));
                break;
            }
        }

        // If we couldn't add any more, break to avoid infinite loop
        if pos_iter.peek().is_none() && neg_iter.peek().is_none() {
            break;
        }
    }

    // If we still don't have enough, fall back to top interesting moments
    if selected.len() < max_moments {
        scored.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));
        for (idx, _interest, sentiment) in &scored {
            let too_close = selected
                .iter()
                .any(|(sel_idx, _)| (*idx as i64 - *sel_idx as i64).abs() < min_gap as i64);
            if !too_close {
                selected.push((*idx, *sentiment));
                if selected.len() >= max_moments {
                    break;
                }
            }
        }
    }

    // Sort by chronological order
    selected.sort_by_key(|(idx, _)| *idx);

    // Build moments with context
    let mut moments = Vec::new();
    for (idx, sentiment) in selected {
        let start = idx.saturating_sub(2);
        let end = (idx + 3).min(messages.len());

        let context_messages: Vec<JourneyMessage> = messages[start..end]
            .iter()
            .map(|m| to_journey_message(m, likely_you))
            .collect();

        let main_msg = &messages[idx];
        let title = if sentiment > 0.3 {
            "A joyful moment".to_string()
        } else if sentiment < -0.3 {
            "A heartfelt exchange".to_string()
        } else if main_msg.text.contains('?') {
            "A curious conversation".to_string()
        } else if main_msg.text.len() > 200 {
            "A meaningful message".to_string()
        } else {
            "A memorable moment".to_string()
        };

        let description = format!("On {}", main_msg.dt.format("%B %d, %Y at %I:%M %p"));

        moments.push(JourneyMoment {
            title,
            description,
            date: main_msg.dt.format("%Y-%m-%d").to_string(),
            messages: context_messages,
            sentiment_score: sentiment,
        });
    }

    moments
}

/// Build the journey through your messages
fn build_journey(messages: &[Message]) -> Option<Journey> {
    if messages.is_empty() {
        return None;
    }

    // Sort messages chronologically (important when multiple files are combined)
    let mut sorted_messages = messages.to_vec();
    sorted_messages.sort_by_key(|m| m.dt);

    let first_msg = sorted_messages.first()?;
    let last_msg = sorted_messages.last()?;

    let first_day = first_msg.dt.date();
    let last_day = last_msg.dt.date();
    let total_days = (last_day - first_day).num_days().max(1) as u32;

    // Determine who is "you" - typically the person who sent "You deleted this message"
    // or has fewer messages (exporter is often the one getting the export)
    let mut sender_counts: HashMap<&str, usize> = HashMap::new();
    let mut deleted_you_sender: Option<&str> = None;

    for msg in &sorted_messages {
        *sender_counts.entry(&msg.sender).or_insert(0) += 1;
        if msg.text.contains("You deleted this message") && deleted_you_sender.is_none() {
            deleted_you_sender = Some(&msg.sender);
        }
    }

    // If we found a "You deleted" message, that sender is "you"
    // Otherwise, pick the sender with fewer messages (often the exporter)
    let likely_you = deleted_you_sender.unwrap_or_else(|| {
        sender_counts
            .iter()
            .min_by_key(|(_, count)| *count)
            .map(|(sender, _)| *sender)
            .unwrap_or("")
    });

    // Get first conversation messages (until a 30-min gap or max 5 messages)
    let mut first_messages: Vec<JourneyMessage> = Vec::new();
    for (i, msg) in sorted_messages.iter().enumerate() {
        first_messages.push(to_journey_message(msg, likely_you));
        if first_messages.len() >= 5 {
            break;
        }
        // Check if next message is more than 30 mins away (new conversation)
        if let Some(next_msg) = sorted_messages.get(i + 1) {
            let gap = next_msg.dt.signed_duration_since(msg.dt).num_minutes();
            if gap > CONVERSATION_GAP_MINUTES {
                break;
            }
        }
    }

    // Get last conversation messages (go backwards from end until 30-min gap or max 5)
    let mut last_messages: Vec<JourneyMessage> = Vec::new();
    for i in (0..sorted_messages.len()).rev() {
        let msg = &sorted_messages[i];
        last_messages.push(to_journey_message(msg, likely_you));
        if last_messages.len() >= 5 {
            break;
        }
        // Check if previous message is more than 30 mins before (new conversation)
        if i > 0 {
            let prev_msg = &sorted_messages[i - 1];
            let gap = msg.dt.signed_duration_since(prev_msg.dt).num_minutes();
            if gap > CONVERSATION_GAP_MINUTES {
                break;
            }
        }
    }
    // Reverse to get chronological order
    last_messages.reverse();

    let interesting_moments = find_interesting_moments(&sorted_messages, likely_you, 4);

    Some(Journey {
        first_day: first_day.format("%B %d, %Y").to_string(),
        last_day: last_day.format("%B %d, %Y").to_string(),
        total_days,
        total_messages: sorted_messages.len(),
        first_messages,
        last_messages,
        interesting_moments,
    })
}

pub fn summarize(raw: &str, top_words_n: usize, top_emojis_n: usize) -> Result<Summary, String> {
    #[cfg(all(target_arch = "wasm32", feature = "timing"))]
    let t0 = perf_now();

    let messages = parse_messages(raw);
    #[cfg(all(target_arch = "wasm32", feature = "timing"))]
    log_step!("parse_messages", t0);

    if messages.is_empty() {
        return Err("No messages parsed".into());
    }

    #[cfg(all(target_arch = "wasm32", feature = "timing"))]
    let t1 = perf_now();
    let (del_you, del_others) = deleted_counts(&messages);
    #[cfg(all(target_arch = "wasm32", feature = "timing"))]
    log_step!("deleted_counts", t1);

    #[cfg(all(target_arch = "wasm32", feature = "timing"))]
    let t2 = perf_now();
    let (conversation_starters, conversation_count) = conversation_initiations(&messages);
    #[cfg(all(target_arch = "wasm32", feature = "timing"))]
    log_step!("conversation_initiations", t2);

    #[cfg(all(target_arch = "wasm32", feature = "timing"))]
    let t3 = perf_now();
    let (sentiment_by_day, sentiment_overall) = sentiment_breakdown(&messages);
    #[cfg(all(target_arch = "wasm32", feature = "timing"))]
    log_step!("sentiment_breakdown", t3);

    // Note: filter_stop is currently unused in top_phrases and per_person_phrases, so we reuse results.
    #[cfg(all(target_arch = "wasm32", feature = "timing"))]
    let t4 = perf_now();
    let word_cloud_val = word_cloud(&messages, 150, true);
    #[cfg(all(target_arch = "wasm32", feature = "timing"))]
    log_step!("word_cloud(filter=true)", t4);

    #[cfg(all(target_arch = "wasm32", feature = "timing"))]
    let t5 = perf_now();
    let word_cloud_no_stop_val = word_cloud(&messages, 150, false);
    #[cfg(all(target_arch = "wasm32", feature = "timing"))]
    log_step!("word_cloud(filter=false)", t5);

    #[cfg(all(target_arch = "wasm32", feature = "timing"))]
    let t6 = perf_now();
    let salient_phrases_val = salient_phrases(&messages, 50);
    #[cfg(all(target_arch = "wasm32", feature = "timing"))]
    log_step!("salient_phrases", t6);

    #[cfg(all(target_arch = "wasm32", feature = "timing"))]
    let t7 = perf_now();
    let top_phrases_val = top_phrases(&messages, 100, true);
    #[cfg(all(target_arch = "wasm32", feature = "timing"))]
    log_step!("top_phrases", t7);

    let top_phrases_no_stop_val = top_phrases_val.clone();

    #[cfg(all(target_arch = "wasm32", feature = "timing"))]
    let t8 = perf_now();
    let per_person_phrases_val = per_person_phrases(&messages, 20, true);
    #[cfg(all(target_arch = "wasm32", feature = "timing"))]
    log_step!("per_person_phrases", t8);

    let per_person_phrases_no_stop_val = per_person_phrases_val.clone();

    #[cfg(all(target_arch = "wasm32", feature = "timing"))]
    let t9 = perf_now();
    let person_stats_val = person_stats(&messages);
    #[cfg(all(target_arch = "wasm32", feature = "timing"))]
    log_step!("person_stats", t9);

    #[cfg(all(target_arch = "wasm32", feature = "timing"))]
    let t10 = perf_now();
    let by_sender = count_by_sender(&messages);
    #[cfg(all(target_arch = "wasm32", feature = "timing"))]
    log_step!("count_by_sender", t10);

    #[cfg(all(target_arch = "wasm32", feature = "timing"))]
    let t11 = perf_now();
    let daily = daily_counts(&messages);
    #[cfg(all(target_arch = "wasm32", feature = "timing"))]
    log_step!("daily_counts", t11);

    #[cfg(all(target_arch = "wasm32", feature = "timing"))]
    let t12 = perf_now();
    let hourly = hourly_counts(&messages);
    #[cfg(all(target_arch = "wasm32", feature = "timing"))]
    log_step!("hourly_counts", t12);

    #[cfg(all(target_arch = "wasm32", feature = "timing"))]
    let t13 = perf_now();
    let top_emojis_val = top_emojis(&messages, top_emojis_n);
    #[cfg(all(target_arch = "wasm32", feature = "timing"))]
    log_step!("top_emojis", t13);

    #[cfg(all(target_arch = "wasm32", feature = "timing"))]
    let t14 = perf_now();
    let top_words_val = top_words(&messages, top_words_n, true);
    #[cfg(all(target_arch = "wasm32", feature = "timing"))]
    log_step!("top_words(filter=true)", t14);

    #[cfg(all(target_arch = "wasm32", feature = "timing"))]
    let t15 = perf_now();
    let top_words_no_stop_val = top_words(&messages, top_words_n, false);
    #[cfg(all(target_arch = "wasm32", feature = "timing"))]
    log_step!("top_words(filter=false)", t15);

    #[cfg(all(target_arch = "wasm32", feature = "timing"))]
    let t16 = perf_now();
    let timeline_val = timeline(&messages);
    #[cfg(all(target_arch = "wasm32", feature = "timing"))]
    log_step!("timeline", t16);

    #[cfg(all(target_arch = "wasm32", feature = "timing"))]
    let t17 = perf_now();
    let weekly = weekly_counts(&messages);
    #[cfg(all(target_arch = "wasm32", feature = "timing"))]
    log_step!("weekly_counts", t17);

    #[cfg(all(target_arch = "wasm32", feature = "timing"))]
    let t18 = perf_now();
    let monthly = monthly_counts(&messages);
    #[cfg(all(target_arch = "wasm32", feature = "timing"))]
    log_step!("monthly_counts", t18);

    #[cfg(all(target_arch = "wasm32", feature = "timing"))]
    let t19 = perf_now();
    let buckets = buckets_by_person(&messages);
    #[cfg(all(target_arch = "wasm32", feature = "timing"))]
    log_step!("buckets_by_person", t19);

    #[cfg(all(target_arch = "wasm32", feature = "timing"))]
    let t20 = perf_now();
    let emoji_cloud_val = emoji_cloud(&messages, 1000);
    #[cfg(all(target_arch = "wasm32", feature = "timing"))]
    log_step!("emoji_cloud", t20);

    #[cfg(all(target_arch = "wasm32", feature = "timing"))]
    let t21 = perf_now();
    let fun_facts_val = fun_facts(&messages);
    #[cfg(all(target_arch = "wasm32", feature = "timing"))]
    log_step!("fun_facts", t21);

    #[cfg(all(target_arch = "wasm32", feature = "timing"))]
    let t22 = perf_now();
    let per_person_daily_val = per_person_daily(&messages);
    #[cfg(all(target_arch = "wasm32", feature = "timing"))]
    log_step!("per_person_daily", t22);

    #[cfg(all(target_arch = "wasm32", feature = "timing"))]
    let t23 = perf_now();
    let journey_val = build_journey(&messages);
    #[cfg(all(target_arch = "wasm32", feature = "timing"))]
    log_step!("build_journey", t23);

    #[cfg(all(target_arch = "wasm32", feature = "timing"))]
    {
        let total = perf_now() - t0;
        web_sys::console::log_1(&format!("[wasm] summarize total: {:.1}ms", total).into());
    }

    Ok(Summary {
        total_messages: messages.len(),
        by_sender,
        daily,
        hourly,
        top_emojis: top_emojis_val,
        top_words: top_words_val,
        top_words_no_stop: top_words_no_stop_val,
        deleted_you: del_you,
        deleted_others: del_others,
        timeline: timeline_val,
        weekly,
        monthly,
        share_of_speech: count_by_sender(&messages),
        buckets_by_person: buckets,
        word_cloud: word_cloud_val,
        word_cloud_no_stop: word_cloud_no_stop_val,
        emoji_cloud: emoji_cloud_val,
        salient_phrases: salient_phrases_val,
        top_phrases: top_phrases_val,
        top_phrases_no_stop: top_phrases_no_stop_val,
        per_person_phrases: per_person_phrases_val,
        per_person_phrases_no_stop: per_person_phrases_no_stop_val,
        fun_facts: fun_facts_val,
        person_stats: person_stats_val,
        per_person_daily: per_person_daily_val,
        sentiment_by_day,
        sentiment_overall,
        conversation_starters,
        conversation_count,
        journey: journey_val,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn longest_streak_from_raw_matches_daily_counts() {
        let raw = sample_chat();
        let msgs = parse_messages(raw);
        let daily = daily_counts(&msgs);
        let expected = longest_streak(&daily);
        let fast = longest_streak_from_raw(raw);
        assert_eq!(expected, fast);
    }
    #[test]
    fn longest_streak_basic() {
        let daily = vec![
            Count {
                label: "2024-01-01".into(),
                value: 10,
            },
            Count {
                label: "2024-01-02".into(),
                value: 5,
            },
            Count {
                label: "2024-01-05".into(),
                value: 1,
            },
        ];
        let (len, start, end) = longest_streak(&daily).unwrap();
        assert_eq!(len, 2);
        assert_eq!(start, "2024-01-01");
        assert_eq!(end, "2024-01-02");
    }

    #[test]
    fn longest_streak_ties_pick_first() {
        let daily = vec![
            Count {
                label: "2024-01-01".into(),
                value: 1,
            },
            Count {
                label: "2024-01-02".into(),
                value: 1,
            },
            Count {
                label: "2024-01-04".into(),
                value: 1,
            },
            Count {
                label: "2024-01-05".into(),
                value: 1,
            },
        ];
        let (len, start, end) = longest_streak(&daily).unwrap();
        assert_eq!(len, 2);
        assert_eq!(start, "2024-01-01");
        assert_eq!(end, "2024-01-02");
    }

    use chrono::NaiveDateTime;

    fn msg(sender: &str, text: &str) -> Message {
        Message {
            dt: NaiveDateTime::parse_from_str("2020-01-01 00:00:00", "%Y-%m-%d %H:%M:%S").unwrap(),
            sender: sender.to_string(),
            text: text.to_string(),
        }
    }

    fn sample_chat() -> &'static str {
        "[8/19/19, 5:04:35 PM] Alice: 😂😂 wow\n[8/19/19, 5:05:00 PM] Bob: You deleted this message\n8/20/19, 7:00 AM - Alice: Another day\n8/21/19, 8:00 AM - Bob: This message was deleted\n9/01/19, 9:00 AM - Alice: A fresh month"
    }

    #[test]
    fn parses_and_summarizes() {
        let summary = summarize(sample_chat(), 5, 5).unwrap();
        assert_eq!(summary.total_messages, 5);
        assert!(summary.by_sender.len() >= 2);
        assert_eq!(summary.top_emojis[0].value, 2);
        assert!(summary.top_words_no_stop.len() >= summary.top_words.len());
        assert_eq!(summary.deleted_you, 1);
        assert_eq!(summary.deleted_others, 1);
        assert!(summary.daily.len() >= 2);
        assert!(summary.hourly.len() >= 2);
        assert_eq!(summary.timeline.len(), 14);
        assert_eq!(summary.weekly.len(), 7);
        assert_eq!(summary.monthly.len(), 2);
        assert_eq!(summary.fun_facts.len(), 2);
        assert!(!summary.word_cloud.is_empty());
        assert!(!summary.word_cloud_no_stop.is_empty());
        assert!(!summary.per_person_daily.is_empty());
        assert_eq!(summary.timeline[1].value, 1);
        assert_eq!(summary.conversation_count, 4);
        assert_eq!(summary.conversation_starters[0].label, "Alice");
        assert_eq!(summary.conversation_starters[0].value, 3);
    }

    #[test]
    fn person_stats_counts_words_and_emojis() {
        let raw =
            "[8/19/19, 5:04:35 PM] Alice: Hello hello 😀\n8/19/19, 6:10 PM - Bob: wow 😀 great";
        let summary = summarize(raw, 10, 5).unwrap();
        let alice = summary
            .person_stats
            .iter()
            .find(|p| p.name == "Alice")
            .expect("has alice");
        assert_eq!(alice.total_words, 2);
        assert!(alice.top_emojis.iter().any(|e| e.label == "😀"));
        let bob = summary
            .person_stats
            .iter()
            .find(|p| p.name == "Bob")
            .expect("has bob");
        assert_eq!(bob.total_words, 2);
        assert!(bob.top_emojis.iter().any(|e| e.label == "😀"));
    }

    #[test]
    fn extract_preserves_compound_emoji() {
        let input = "t🤷‍♀️";
        let out = extract_emojis(input);
        assert_eq!(out, vec!["🤷‍♀️"], "should keep the full ZWJ sequence");
    }

    #[test]
    fn top_emojis_counts_full_sequence_not_components() {
        let messages = vec![msg("a", "hello 🤷‍♀️ there"), msg("b", "another 🤷‍♀️ test")];
        let counts = top_emojis(&messages, 10);
        assert_eq!(counts.len(), 1);
        assert_eq!(counts[0].label, "🤷‍♀️");
        assert_eq!(counts[0].value, 2);
    }

    #[test]
    fn multiple_compound_emojis_are_counted_without_components() {
        let messages = vec![msg("a", "🤷‍♀️🤦‍♂️"), msg("b", "test 🤦‍♂️")];
        let counts = top_emojis(&messages, 10);
        assert_eq!(counts.len(), 2);
        let shrug = counts.iter().find(|c| c.label == "🤷‍♀️").unwrap();
        let facepalm = counts.iter().find(|c| c.label == "🤦‍♂️").unwrap();
        assert_eq!(shrug.value, 1);
        assert_eq!(facepalm.value, 2);
    }

    #[test]
    fn parses_common_whatsapp_formats() {
        let raw = "13.12.2023, 22:45 - Alice: Guten Abend\n[14/12/2023, 07:05:10] Bob: Morning!\n1/2/24, 9:15 AM - Carol: Hi";
        let messages = parse_messages(raw);
        assert_eq!(messages.len(), 3);
        assert!(messages.iter().any(|m| m.sender == "Alice"));
        assert!(messages.iter().any(|m| m.sender == "Bob"));
        assert!(messages.iter().any(|m| m.sender == "Carol"));
        // Ensure 24h and 12h timestamps both land in the expected day
        assert_eq!(messages[0].dt.date().day(), 13);
        assert_eq!(messages[1].dt.date().day(), 14);
    }

    #[test]
    fn person_stats_picks_dominant_color_case_insensitive() {
        let raw = "[8/19/19, 5:04:35 PM] Alice: BLUE blue Blue rocks\n8/19/19, 6:10 PM - Bob: green vibes and more green";
        let summary = summarize(raw, 10, 5).unwrap();
        let alice = summary
            .person_stats
            .iter()
            .find(|p| p.name == "Alice")
            .expect("has alice");
        let bob = summary
            .person_stats
            .iter()
            .find(|p| p.name == "Bob")
            .expect("has bob");

        assert_eq!(alice.dominant_color.as_deref(), Some("#64d8ff"));
        assert_eq!(bob.dominant_color.as_deref(), Some("#06d6a0"));
    }

    #[test]
    fn top_words_respects_stopword_toggle() {
        let raw = "[8/19/19, 5:04:35 PM] Alice: the the hello world";
        let summary = summarize(raw, 10, 5).unwrap();
        let with_stop = summary
            .top_words
            .iter()
            .find(|c| c.label == "hello")
            .map(|c| c.value)
            .unwrap_or(0);
        let without_stop = summary
            .top_words_no_stop
            .iter()
            .find(|c| c.label == "the")
            .map(|c| c.value)
            .unwrap_or(0);
        assert!(with_stop >= 1);
        assert!(without_stop >= 2);
    }

    #[test]
    fn top_phrases_counts_bigrams_and_trigrams() {
        let raw = "[1/1/24, 1:00:00 PM] A: hello world hello world\n[1/1/24, 1:01:00 PM] A: hello world again";
        let summary = summarize(raw, 10, 5).unwrap();
        let hw = summary
            .top_phrases
            .iter()
            .find(|c| c.label == "hello world")
            .map(|c| c.value)
            .unwrap_or(0);
        assert!(hw >= 3);

        let trigram = summary
            .top_phrases
            .iter()
            .find(|c| c.label == "hello world hello")
            .map(|c| c.value)
            .unwrap_or(0);
        assert!(trigram >= 1);
    }

    #[test]
    fn collapses_overlapping_phrase_variants() {
        let raw = "\
[1/1/24, 1:00:00 PM] A: my love\n\
[1/1/24, 1:01:00 PM] A: my love\n\
[1/1/24, 1:02:00 PM] A: my love\n\
[1/1/24, 1:03:00 PM] A: good job my love\n\
[1/1/24, 1:04:00 PM] A: good job my love\n\
[1/1/24, 1:05:00 PM] A: good job my love\n\
[1/1/24, 1:06:00 PM] A: job my love\n\
[1/1/24, 1:07:00 PM] A: job my love\n\
[1/1/24, 1:08:00 PM] A: good job\n\
[1/1/24, 1:09:00 PM] A: good job\n\
[1/1/24, 1:10:00 PM] A: good job my";

        let summary = summarize(raw, 10, 5).unwrap();
        let variants = [
            "my love",
            "good job",
            "job my love",
            "good job my",
            "good job my love",
        ];

        let matches: Vec<&Count> = summary
            .top_phrases
            .iter()
            .filter(|c| variants.contains(&c.label.as_str()))
            .collect();

        assert_eq!(matches.len(), 1, "variants should collapse to one phrase");
        assert_eq!(matches[0].label, "good job my love");
        assert!(matches[0].value >= 3);
    }

    #[test]
    fn heart_shortcuts_are_not_stripped_to_numbers() {
        let raw = "\
[1/1/24, 1:00:00 PM] A: good job my love <3\n\
[1/1/24, 1:01:00 PM] A: good job my love <333\n\
[1/1/24, 1:02:00 PM] A: my love <3";

        let summary = summarize(raw, 10, 5).unwrap();
        let words: Vec<&str> = summary
            .top_words_no_stop
            .iter()
            .map(|c| c.label.as_str())
            .collect();
        assert!(words.contains(&"<3"));
        assert!(!words.contains(&"3"));

        let phrases: Vec<&str> = summary
            .top_phrases
            .iter()
            .map(|c| c.label.as_str())
            .collect();
        assert!(phrases.iter().any(|p| p.contains("<3")));
        assert!(!phrases.iter().any(|p| p.ends_with(" 3")));
    }

    #[test]
    fn phrases_ignore_urls() {
        let raw = "[1/1/24, 1:00:00 PM] A: check https://www.google.com later\n[1/1/24, 1:01:00 PM] A: check https://www.google.com later";
        let summary = summarize(raw, 10, 5).unwrap();
        let phrases: Vec<&str> = summary
            .top_phrases
            .iter()
            .map(|c| c.label.as_str())
            .collect();

        assert!(phrases.contains(&"check later"));
        assert!(phrases
            .iter()
            .all(|p| !p.contains("http") && !p.contains("www")));
    }

    #[test]
    fn media_omitted_messages_do_not_count_for_words_or_phrases() {
        let raw =
            "[1/1/24, 1:00:00 PM] A: <Media omitted>\n[1/1/24, 1:01:00 PM] A: hello world again";
        let summary = summarize(raw, 10, 5).unwrap();

        let words_no_stop: Vec<&str> = summary
            .top_words_no_stop
            .iter()
            .map(|c| c.label.as_str())
            .collect();
        assert!(words_no_stop.contains(&"hello"));
        assert!(!words_no_stop.contains(&"media"));
        assert!(!words_no_stop.contains(&"omitted"));

        let phrases: Vec<&str> = summary
            .top_phrases
            .iter()
            .map(|c| c.label.as_str())
            .collect();
        assert!(phrases.contains(&"hello world"));
        assert!(!phrases.iter().any(|p| p.contains("media")));

        let stats = summary
            .person_stats
            .iter()
            .find(|p| p.name == "A")
            .expect("has A");
        assert_eq!(stats.total_words, 3);
        assert!((stats.average_words_per_message - 3.0).abs() < f32::EPSILON);
    }

    #[test]
    fn salient_phrases_surface_surprising_pairs() {
        let raw = "[1/1/24, 1:00:00 PM] A: i think we should go\n[1/1/24, 1:01:00 PM] A: i think it works\n[1/1/24, 1:02:00 PM] A: i think so too\n[1/1/24, 1:03:00 PM] A: quantum entanglement is wild\n[1/1/24, 1:04:00 PM] A: quantum entanglement feels magical\n[1/1/24, 1:05:00 PM] A: quantum entanglement again";
        let summary = summarize(raw, 10, 5).unwrap();

        assert!(!summary.salient_phrases.is_empty());
        // Rare but repeated technical phrase should outrank common filler.
        assert_eq!(summary.salient_phrases[0].label, "quantum entanglement");
    }

    #[test]
    fn per_person_phrases_tracked() {
        let raw =
            "[1/1/24, 1:00:00 PM] A: hello world\n[1/1/24, 1:01:00 PM] B: different phrase here";
        let summary = summarize(raw, 10, 5).unwrap();

        let a = summary
            .per_person_phrases
            .iter()
            .find(|p| p.name == "A")
            .expect("has A");
        assert!(a.phrases.iter().any(|c| c.label == "hello world"));

        let b = summary
            .per_person_phrases
            .iter()
            .find(|p| p.name == "B")
            .expect("has B");
        assert!(b.phrases.iter().any(|c| c.label == "different phrase"));
    }

    #[test]
    fn conversation_starters_respect_gap() {
        // Two conversations separated by > 30 minutes; initiators should be Alice then Em.
        let raw = "[8/19/19, 5:00:00 PM] Alice: Hi\n[8/19/19, 5:10:00 PM] Bob: ok\n[8/19/19, 6:00:01 PM] Bob: New convo\n[8/19/19, 6:05:00 PM] Alice: reply";
        let summary = summarize(raw, 5, 5).unwrap();
        assert_eq!(summary.conversation_count, 2);
        let starters = summary
            .conversation_starters
            .iter()
            .map(|c| (c.label.as_str(), c.value))
            .collect::<std::collections::HashMap<_, _>>();
        assert_eq!(starters.get("Alice"), Some(&1));
        assert_eq!(starters.get("Bob"), Some(&1));
    }

    #[test]
    fn timeline_fills_missing_days() {
        // Messages on 1st and 3rd should create zero on 2nd.
        let raw = "[9/1/19, 9:00:00 AM] A: hello\n[9/3/19, 9:00:00 AM] A: again";
        let summary = summarize(raw, 5, 5).unwrap();
        assert_eq!(summary.timeline.len(), 3);
        assert_eq!(summary.timeline[1].label, "2019-09-02");
        assert_eq!(summary.timeline[1].value, 0);
    }

    #[test]
    fn buckets_cover_hour_day_month() {
        let raw =
            "[1/1/24, 1:00:00 AM] A: hi\n[1/1/24, 1:00:00 PM] B: hey\n[2/2/24, 1:00:00 AM] A: yo";
        let summary = summarize(raw, 5, 5).unwrap();
        let a = summary
            .buckets_by_person
            .iter()
            .find(|b| b.name == "A")
            .expect("has A");
        assert_eq!(a.hourly[1], 2);
        assert_eq!(a.daily[1], 1); // Monday Jan 1
        assert_eq!(a.daily[5], 1); // Friday Feb 2
        assert_eq!(a.monthly[0], 1);
        assert_eq!(a.monthly[1], 1);
    }

    #[test]
    fn stopwords_and_extras_filtered_from_word_cloud() {
        let raw =
            "[8/19/19, 5:00:00 PM] A: the and omitted> hello world\n[8/19/19, 5:01:00 PM] A: hello";
        let summary = summarize(raw, 10, 5).unwrap();
        let words = summary
            .word_cloud
            .iter()
            .map(|c| c.label.as_str())
            .collect::<Vec<_>>();
        assert!(words.contains(&"hello"));
        assert!(!words.contains(&"the"));
        assert!(!words.contains(&"omitted"));
    }

    #[test]
    fn security_code_banners_are_filtered_even_with_sender() {
        let raw = "\
[1/1/24, 1:00:00 PM] A: hello there\n\
[1/1/24, 1:01:00 PM] A: Your security code with Bob changed. Tap to learn more.\n\
[1/1/24, 1:02:00 PM] B: hi";

        let messages = parse_messages(raw);
        assert_eq!(
            messages.len(),
            2,
            "system-like security code banner should be dropped"
        );

        let summary = summarize(raw, 10, 5).unwrap();
        assert_eq!(summary.total_messages, 2);
        assert_eq!(summary.by_sender.len(), 2);
    }

    #[test]
    fn color_tie_break_is_alphabetical() {
        let raw = "[8/19/19, 5:00:00 PM] A: red red\n[8/19/19, 5:01:00 PM] A: blue blue";
        let summary = summarize(raw, 5, 5).unwrap();
        let a = summary
            .person_stats
            .iter()
            .find(|p| p.name == "A")
            .expect("has A");
        // Equal counts; alphabetical tie-break -> blue hex
        assert_eq!(a.dominant_color.as_deref(), Some("#64d8ff"));
    }

    #[test]
    fn sentiment_is_computed() {
        let raw =
            "[8/19/19, 5:04:35 PM] Alice: I love this!\n8/20/19, 7:00 AM - Bob: this is terrible";
        let summary = summarize(raw, 5, 5).unwrap();
        assert!(!summary.sentiment_by_day.is_empty());
        assert!(!summary.sentiment_overall.is_empty());
        assert!(summary
            .sentiment_overall
            .iter()
            .any(|s| s.name == "Alice" && s.mean > 0.0));
        assert!(summary
            .sentiment_overall
            .iter()
            .any(|s| s.name == "Bob" && s.mean < 0.0));
    }

    #[test]
    fn summarize_errors_on_empty() {
        let err = summarize("", 5, 5).unwrap_err();
        assert!(err.contains("No messages parsed"));
    }

    #[test]
    fn journey_includes_multiple_first_and_last_messages() {
        // Create chat where first 3 messages are within 30 mins, then gap, then last 3 within 30 mins
        let raw = r#"[1/1/20, 10:00:00 AM] Alice: First message!
[1/1/20, 10:05:00 AM] Bob: Second message
[1/1/20, 10:10:00 AM] Alice: Third message
[1/1/20, 2:00:00 PM] Bob: Middle of day
[1/1/20, 8:00:00 PM] Alice: Evening start
[1/1/20, 8:05:00 PM] Bob: Evening reply
[1/1/20, 8:10:00 PM] Alice: Evening end"#;
        let summary = summarize(raw, 5, 5).unwrap();
        let journey = summary.journey.expect("journey should exist");

        // First conversation should have 3 messages (10:00, 10:05, 10:10 - all within 30 min)
        assert_eq!(
            journey.first_messages.len(),
            3,
            "first conversation should have 3 messages"
        );
        assert_eq!(journey.first_messages[0].text, "First message!");
        assert_eq!(journey.first_messages[1].text, "Second message");
        assert_eq!(journey.first_messages[2].text, "Third message");

        // Last conversation should have 3 messages (8:00, 8:05, 8:10 - all within 30 min)
        assert_eq!(
            journey.last_messages.len(),
            3,
            "last conversation should have 3 messages"
        );
        assert_eq!(journey.last_messages[0].text, "Evening start");
        assert_eq!(journey.last_messages[1].text, "Evening reply");
        assert_eq!(journey.last_messages[2].text, "Evening end");
    }

    #[test]
    fn journey_sorts_messages_from_multiple_files() {
        // Simulate multiple files concatenated where second file has earlier messages
        let raw = r#"[1/2/20, 10:00:00 AM] Alice: Day 2 message
[1/2/20, 10:05:00 AM] Bob: Day 2 reply
[1/1/20, 10:00:00 AM] Alice: Day 1 first message
[1/1/20, 10:05:00 AM] Bob: Day 1 reply"#;
        let summary = summarize(raw, 5, 5).unwrap();
        let journey = summary.journey.expect("journey should exist");

        // First messages should be from Day 1 (chronologically first), not file order
        assert_eq!(journey.first_messages[0].text, "Day 1 first message");
        assert_eq!(journey.first_messages[1].text, "Day 1 reply");

        // Last messages should be from Day 2 (chronologically last)
        assert_eq!(journey.last_messages[0].text, "Day 2 message");
        assert_eq!(journey.last_messages[1].text, "Day 2 reply");
    }
}

use chrono::{Datelike, NaiveDate, NaiveDateTime, Timelike, Weekday};
use once_cell::sync::OnceCell;
use regex::Regex;
use serde::Serialize;
use std::collections::{BTreeMap, HashMap, HashSet};
use stopwords::{Language, Spark, Stopwords};
use unicode_segmentation::UnicodeSegmentation;
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub fn init_panic_hook() {
    #[cfg(feature = "console_error_panic_hook")]
    console_error_panic_hook::set_once();
}

#[derive(Debug, Serialize, Clone)]
struct Count {
    label: String,
    value: u32,
}

#[derive(Debug, Serialize, Clone)]
struct HourCount {
    hour: u32,
    value: u32,
}

#[derive(Debug, Serialize)]
struct Summary {
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
    fun_facts: Vec<FunFact>,
    person_stats: Vec<PersonStat>,
    per_person_daily: Vec<PersonDaily>,
    sentiment_by_day: Vec<SentimentDay>,
    sentiment_overall: Vec<SentimentOverall>,
    conversation_starters: Vec<Count>,
    conversation_count: usize,
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

    for emoji in emoji_re().find_iter(text) {
        let glyph = emoji.as_str();
        if POSITIVE_EMOJIS.contains(&glyph) {
            score += 2;
            hits += 1;
        } else if NEGATIVE_EMOJIS.contains(&glyph) {
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
    sender == "system"
        || msg
            .text
            .contains("Messages and calls are end-to-end encrypted")
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

fn top_emojis(messages: &[Message], take: usize) -> Vec<Count> {
    let mut map = HashMap::new();
    for text in messages.iter().map(|m| m.text.as_str()) {
        for hit in emoji_re().find_iter(text) {
            *map.entry(hit.as_str().to_string()).or_insert(0u32) += 1;
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
    for text in messages.iter().map(|m| m.text.as_str()) {
        for token in text.unicode_words() {
            let cleaned = token
                .trim_matches(|c: char| !c.is_alphanumeric())
                .to_lowercase();
            if cleaned.len() < 3 {
                continue;
            }
            if filter_stop && stop.contains(cleaned.as_str()) {
                continue;
            }
            *map.entry(cleaned).or_insert(0u32) += 1;
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
    for text in messages.iter().map(|m| m.text.as_str()) {
        for token in text.unicode_words() {
            let cleaned = token
                .trim_matches(|c: char| !c.is_alphanumeric())
                .to_lowercase();
            if cleaned.is_empty() {
                continue;
            }
            if filter_stop && stop.contains(cleaned.as_str()) {
                continue;
            }
            *map.entry(cleaned).or_insert(0u32) += 1;
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

        for m in msgs.iter() {
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

            for hit in emoji_re().find_iter(&m.text) {
                *emoji_freq.entry(hit.as_str().to_string()).or_insert(0) += 1;
            }
        }

        let unique_words = freq.values().filter(|v| **v == 1).count() as u32;
        let avg_len = if msgs.is_empty() {
            0
        } else {
            (total_words as f64 / msgs.len() as f64).round() as u32
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

        for m in &msgs {
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

            for hit in emoji_re().find_iter(&m.text) {
                *emoji_freq.entry(hit.as_str().to_string()).or_insert(0) += 1;
            }
        }

        let unique_words = vocab.len() as u32;
        let avg = if msgs.is_empty() {
            0.0
        } else {
            total_words as f32 / msgs.len() as f32
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

fn summarize(raw: &str, top_words_n: usize, top_emojis_n: usize) -> Result<Summary, String> {
    let messages = parse_messages(raw);
    if messages.is_empty() {
        return Err("No messages parsed".into());
    }

    let (del_you, del_others) = deleted_counts(&messages);
    let (conversation_starters, conversation_count) = conversation_initiations(&messages);
    let (sentiment_by_day, sentiment_overall) = sentiment_breakdown(&messages);
    Ok(Summary {
        total_messages: messages.len(),
        by_sender: count_by_sender(&messages),
        daily: daily_counts(&messages),
        hourly: hourly_counts(&messages),
        top_emojis: top_emojis(&messages, top_emojis_n),
        top_words: top_words(&messages, top_words_n, true),
        top_words_no_stop: top_words(&messages, top_words_n, false),
        deleted_you: del_you,
        deleted_others: del_others,
        timeline: timeline(&messages),
        weekly: weekly_counts(&messages),
        monthly: monthly_counts(&messages),
        share_of_speech: count_by_sender(&messages),
        buckets_by_person: buckets_by_person(&messages),
        word_cloud: word_cloud(&messages, 150, true),
        word_cloud_no_stop: word_cloud(&messages, 150, false),
        emoji_cloud: emoji_cloud(&messages, 1000),
        fun_facts: fun_facts(&messages),
        person_stats: person_stats(&messages),
        per_person_daily: per_person_daily(&messages),
        sentiment_by_day,
        sentiment_overall,
        conversation_starters,
        conversation_count,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample_chat() -> &'static str {
        "[8/19/19, 5:04:35 PM] Addy: 😂😂 wow\n[8/19/19, 5:05:00 PM] Em: You deleted this message\n8/20/19, 7:00 AM - Addy: Another day\n8/21/19, 8:00 AM - Em: This message was deleted\n9/01/19, 9:00 AM - Addy: A fresh month"
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
        assert_eq!(summary.conversation_starters[0].label, "Addy");
        assert_eq!(summary.conversation_starters[0].value, 3);
    }

    #[test]
    fn person_stats_counts_words_and_emojis() {
        let raw = "[8/19/19, 5:04:35 PM] Addy: Hello hello 😀\n8/19/19, 6:10 PM - Em: wow 😀 great";
        let summary = summarize(raw, 10, 5).unwrap();
        let addy = summary
            .person_stats
            .iter()
            .find(|p| p.name == "Addy")
            .expect("has addy");
        assert_eq!(addy.total_words, 2);
        assert!(addy.top_emojis.iter().any(|e| e.label == "😀"));
        let em = summary
            .person_stats
            .iter()
            .find(|p| p.name == "Em")
            .expect("has em");
        assert_eq!(em.total_words, 2);
        assert!(em.top_emojis.iter().any(|e| e.label == "😀"));
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
        let raw = "[8/19/19, 5:04:35 PM] Addy: BLUE blue Blue rocks\n8/19/19, 6:10 PM - Em: green vibes and more green";
        let summary = summarize(raw, 10, 5).unwrap();
        let addy = summary
            .person_stats
            .iter()
            .find(|p| p.name == "Addy")
            .expect("has addy");
        let em = summary
            .person_stats
            .iter()
            .find(|p| p.name == "Em")
            .expect("has em");

        assert_eq!(addy.dominant_color.as_deref(), Some("#64d8ff"));
        assert_eq!(em.dominant_color.as_deref(), Some("#06d6a0"));
    }

    #[test]
    fn top_words_respects_stopword_toggle() {
        let raw = "[8/19/19, 5:04:35 PM] Addy: the the hello world";
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
    fn conversation_starters_respect_gap() {
        // Two conversations separated by > 30 minutes; initiators should be Addy then Em.
        let raw = "[8/19/19, 5:00:00 PM] Addy: Hi\n[8/19/19, 5:10:00 PM] Em: ok\n[8/19/19, 6:00:01 PM] Em: New convo\n[8/19/19, 6:05:00 PM] Addy: reply";
        let summary = summarize(raw, 5, 5).unwrap();
        assert_eq!(summary.conversation_count, 2);
        let starters = summary
            .conversation_starters
            .iter()
            .map(|c| (c.label.as_str(), c.value))
            .collect::<std::collections::HashMap<_, _>>();
        assert_eq!(starters.get("Addy"), Some(&1));
        assert_eq!(starters.get("Em"), Some(&1));
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
            "[8/19/19, 5:04:35 PM] Addy: I love this!\n8/20/19, 7:00 AM - Em: this is terrible";
        let summary = summarize(raw, 5, 5).unwrap();
        assert!(!summary.sentiment_by_day.is_empty());
        assert!(!summary.sentiment_overall.is_empty());
        assert!(summary
            .sentiment_overall
            .iter()
            .any(|s| s.name == "Addy" && s.mean > 0.0));
        assert!(summary
            .sentiment_overall
            .iter()
            .any(|s| s.name == "Em" && s.mean < 0.0));
    }

    #[test]
    fn summarize_errors_on_empty() {
        let err = summarize("", 5, 5).unwrap_err();
        assert!(err.contains("No messages parsed"));
    }
}

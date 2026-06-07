use once_cell::sync::OnceCell;
use std::collections::HashSet;
use unicode_segmentation::UnicodeSegmentation;

use crate::parsing::Message;
use crate::text::extract_emojis;
use crate::types::{SentimentDay, SentimentOverall};

#[derive(Debug, Clone, Copy)]
pub(crate) enum SentimentClass {
    Positive,
    Neutral,
    Negative,
}

#[derive(Debug, Default, Clone, Copy)]
pub(crate) struct SentimentAgg {
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

pub(crate) fn sentiment_score(text: &str) -> (f32, SentimentClass) {
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

pub(crate) fn classify_sentiment(compound: f32) -> SentimentClass {
    if compound > 0.05 {
        SentimentClass::Positive
    } else if compound < -0.05 {
        SentimentClass::Negative
    } else {
        SentimentClass::Neutral
    }
}

pub(crate) fn sentiment_breakdown(
    messages: &[Message],
) -> (Vec<SentimentDay>, Vec<SentimentOverall>) {
    if messages.is_empty() {
        return (Vec::new(), Vec::new());
    }

    let mut per_day: std::collections::HashMap<(String, String), SentimentAgg> =
        std::collections::HashMap::new();
    let mut per_person: std::collections::HashMap<String, SentimentAgg> =
        std::collections::HashMap::new();

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

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::NaiveDateTime;

    fn msg(sender: &str, text: &str, dt_str: &str) -> Message {
        Message {
            dt: NaiveDateTime::parse_from_str(dt_str, "%Y-%m-%d %H:%M:%S").unwrap(),
            sender: sender.to_string(),
            text: text.to_string(),
        }
    }

    #[test]
    fn classify_thresholds() {
        assert!(matches!(classify_sentiment(0.5), SentimentClass::Positive));
        assert!(matches!(classify_sentiment(-0.5), SentimentClass::Negative));
        assert!(matches!(classify_sentiment(0.0), SentimentClass::Neutral));
        assert!(matches!(classify_sentiment(0.05), SentimentClass::Neutral));
        assert!(matches!(
            classify_sentiment(0.051),
            SentimentClass::Positive
        ));
        assert!(matches!(
            classify_sentiment(-0.051),
            SentimentClass::Negative
        ));
    }

    #[test]
    fn sentiment_score_neutral_for_empty_or_plain() {
        let (compound, class) = sentiment_score("");
        assert_eq!(compound, 0.0);
        assert!(matches!(class, SentimentClass::Neutral));

        let (c2, _) = sentiment_score("the cat sat on the mat");
        assert_eq!(c2, 0.0);
    }

    #[test]
    fn sentiment_score_positive_words() {
        let (compound, class) = sentiment_score("I love this, it is great and awesome");
        assert!(compound > 0.0);
        assert!(matches!(class, SentimentClass::Positive));
    }

    #[test]
    fn sentiment_score_negative_words() {
        let (compound, class) = sentiment_score("this is terrible and awful, I hate it");
        assert!(compound < 0.0);
        assert!(matches!(class, SentimentClass::Negative));
    }

    #[test]
    fn sentiment_score_clamped_to_unit_range() {
        let (compound, _) = sentiment_score("love love love amazing awesome great perfect best");
        assert!(compound <= 1.0);
        assert!(compound >= -1.0);
    }

    #[test]
    fn sentiment_score_emoji_positive() {
        let (compound, class) = sentiment_score("😀😍👍");
        assert!(compound > 0.0);
        assert!(matches!(class, SentimentClass::Positive));
    }

    #[test]
    fn sentiment_score_emoji_negative() {
        let (compound, _) = sentiment_score("😢😭💔");
        assert!(compound < 0.0);
    }

    #[test]
    fn sentiment_score_mixed_can_cancel() {
        // Two positive (+2 each) and two negative (-2 each) words -> score 0.
        let (compound, class) = sentiment_score("love hate good bad");
        assert_eq!(compound, 0.0);
        assert!(matches!(class, SentimentClass::Neutral));
    }

    #[test]
    fn sentiment_breakdown_empty() {
        let (by_day, overall) = sentiment_breakdown(&[]);
        assert!(by_day.is_empty());
        assert!(overall.is_empty());
    }

    #[test]
    fn sentiment_breakdown_aggregates_per_person_and_day() {
        let messages = vec![
            msg("Alice", "I love this great day", "2023-01-01 10:00:00"),
            msg("Bob", "this is awful and terrible", "2023-01-01 11:00:00"),
            msg("Alice", "another good one", "2023-01-02 10:00:00"),
        ];
        let (by_day, overall) = sentiment_breakdown(&messages);

        // 3 (person, day) buckets.
        assert_eq!(by_day.len(), 3);
        // 2 people overall.
        assert_eq!(overall.len(), 2);

        let alice = overall.iter().find(|o| o.name == "Alice").unwrap();
        let bob = overall.iter().find(|o| o.name == "Bob").unwrap();
        assert!(alice.mean > 0.0);
        assert!(bob.mean < 0.0);
        assert_eq!(alice.pos, 2);
        assert_eq!(bob.neg, 1);

        // Overall sorted by descending mean -> Alice (positive) before Bob.
        assert_eq!(overall[0].name, "Alice");
    }

    #[test]
    fn sentiment_breakdown_day_sorted() {
        let messages = vec![
            msg("Alice", "good", "2023-02-01 10:00:00"),
            msg("Alice", "bad", "2023-01-01 10:00:00"),
        ];
        let (by_day, _) = sentiment_breakdown(&messages);
        assert_eq!(by_day.len(), 2);
        assert!(by_day[0].day <= by_day[1].day);
    }

    #[test]
    fn sentiment_agg_mean_handles_zero_count() {
        let agg = SentimentAgg::default();
        assert_eq!(agg.mean(), 0.0);
    }
}

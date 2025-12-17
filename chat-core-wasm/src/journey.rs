use std::collections::HashMap;

use crate::parsing::Message;
use crate::sentiment::sentiment_score;
use crate::text::CONVERSATION_GAP_MINUTES;
use crate::types::{Journey, JourneyMessage, JourneyMoment};

fn to_journey_message(msg: &Message, likely_you: &str) -> JourneyMessage {
    JourneyMessage {
        sender: msg.sender.clone(),
        text: msg.text.clone(),
        timestamp: msg.dt.format("%Y-%m-%dT%H:%M:%S").to_string(),
        is_you: msg.sender == likely_you,
    }
}

fn find_interesting_moments(
    messages: &[Message],
    likely_you: &str,
    max_moments: usize,
) -> Vec<JourneyMoment> {
    if messages.len() < 10 {
        return Vec::new();
    }

    let mut scored: Vec<(usize, f32, f32)> = Vec::new();

    for (i, msg) in messages.iter().enumerate() {
        let text = msg.text.trim();
        if text.len() < 6 || text.contains("omitted") || text.contains("deleted") {
            continue;
        }

        let features = text_features(text);
        let (sentiment, _) = sentiment_score(text);

        // Skip clearly spammy/technical drops.
        if features.url_count > 2 {
            continue;
        }
        if features.symbol_ratio > 0.45 && features.word_count < 80 {
            continue;
        }

        let length_score = if features.word_count > 8 {
            (features.word_count as f32).ln().min(3.5)
        } else {
            0.0
        };

        let diversity_score = (features.unique_ratio * 3.0).min(2.5);
        let sentiment_score_abs = sentiment.abs() * 2.6;
        let expression_score = (features.emoji_count as f32) * 0.35
            + (features.exclamation_count as f32) * 0.35
            + (features.question_count as f32) * 0.25
            + features.caps_ratio * 1.5;

        let mut penalty = 0.0;
        penalty += (features.symbol_ratio * 3.5).min(2.5);
        penalty += (features.digit_ratio * 3.0).min(2.0);
        if features.url_count > 0 {
            penalty += 0.8 + 0.4 * (features.url_count as f32 - 1.0).max(0.0);
        }
        if features.word_count > 120 && sentiment.abs() < 0.2 {
            penalty += 1.5;
        }
        if features.word_count > 200 && features.symbol_ratio > 0.25 {
            penalty += 1.5;
        }

        let interest =
            sentiment_score_abs + length_score + diversity_score + expression_score - penalty;

        // Require a minimum meaningful threshold and some words.
        if features.word_count < 6 || interest < 1.0 {
            continue;
        }

        scored.push((i, interest, sentiment));
    }

    if scored.is_empty() {
        return Vec::new();
    }

    let num_segments = max_moments.max(3);
    let segment_size = messages.len() / num_segments;

    let mut positive_candidates: Vec<(usize, f32, f32)> = Vec::new();
    let mut negative_candidates: Vec<(usize, f32, f32)> = Vec::new();

    for seg in 0..num_segments {
        let seg_start = seg * segment_size;
        let seg_end = if seg == num_segments - 1 {
            messages.len()
        } else {
            (seg + 1) * segment_size
        };

        let best_positive = scored
            .iter()
            .filter(|(idx, _, sent)| *idx >= seg_start && *idx < seg_end && *sent > 0.1)
            .max_by(|a, b| a.1.partial_cmp(&b.1).unwrap_or(std::cmp::Ordering::Equal));

        if let Some(&candidate) = best_positive {
            positive_candidates.push(candidate);
        }

        let best_negative = scored
            .iter()
            .filter(|(idx, _, sent)| *idx >= seg_start && *idx < seg_end && *sent < -0.1)
            .max_by(|a, b| a.1.partial_cmp(&b.1).unwrap_or(std::cmp::Ordering::Equal));

        if let Some(&candidate) = best_negative {
            negative_candidates.push(candidate);
        }
    }

    positive_candidates.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));
    negative_candidates.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));

    let mut selected: Vec<(usize, f32)> = Vec::new();
    let mut pos_iter = positive_candidates.iter().peekable();
    let mut neg_iter = negative_candidates.iter().peekable();

    let min_gap = (messages.len() / (max_moments + 1)).max(30);

    while selected.len() < max_moments {
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

        for &(idx, _, sentiment) in neg_iter.by_ref() {
            let too_close = selected
                .iter()
                .any(|(sel_idx, _)| (idx as i64 - *sel_idx as i64).abs() < min_gap as i64);
            if !too_close {
                selected.push((idx, sentiment));
                break;
            }
        }

        if pos_iter.peek().is_none() && neg_iter.peek().is_none() {
            break;
        }
    }

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

    selected.sort_by_key(|(idx, _)| *idx);

    let mut moments = Vec::new();
    for (idx, sentiment) in selected {
        let start = idx.saturating_sub(2);
        let end = (idx + 3).min(messages.len());

        let context_messages: Vec<JourneyMessage> = messages[start..end]
            .iter()
            .map(|m| to_journey_message(m, likely_you))
            .collect();

        let main_msg = &messages[idx];
        let main_features = text_features(main_msg.text.trim());
        let title = if main_features.url_count > 0 || main_features.symbol_ratio > 0.35 {
            "A technical share".to_string()
        } else if sentiment > 0.35 {
            "A joyful moment".to_string()
        } else if sentiment < -0.35 {
            "A heartfelt exchange".to_string()
        } else if main_msg.text.contains('?') {
            "A curious conversation".to_string()
        } else if main_msg.text.len() > 220 {
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

#[derive(Default)]
struct TextFeatures {
    word_count: usize,
    unique_ratio: f32,
    emoji_count: usize,
    exclamation_count: usize,
    question_count: usize,
    caps_ratio: f32,
    symbol_ratio: f32,
    digit_ratio: f32,
    url_count: usize,
}

fn text_features(text: &str) -> TextFeatures {
    if text.is_empty() {
        return TextFeatures::default();
    }

    let mut alpha = 0usize;
    let mut digit = 0usize;
    let mut symbol = 0usize;
    let mut emoji_count = 0usize;
    let mut caps = 0usize;
    let mut exclamation = 0usize;
    let mut question = 0usize;

    let words: Vec<&str> = text.split_whitespace().filter(|w| !w.is_empty()).collect();
    let unique_words: std::collections::HashSet<&str> = words.iter().copied().collect();

    for ch in text.chars() {
        if ch.is_ascii_alphabetic() {
            alpha += 1;
            if ch.is_uppercase() {
                caps += 1;
            }
        } else if ch.is_ascii_digit() {
            digit += 1;
        } else if ch == '!' {
            exclamation += 1;
            symbol += 1;
        } else if ch == '?' {
            question += 1;
            symbol += 1;
        } else if ch.is_whitespace() {
            // ignore
        } else {
            // crude emoji detection: anything outside ASCII range
            if !ch.is_ascii() {
                emoji_count += 1;
            }
            symbol += 1;
        }
    }

    let total = alpha + digit + symbol;
    let symbol_ratio = if total == 0 {
        0.0
    } else {
        symbol as f32 / total as f32
    };
    let digit_ratio = if total == 0 {
        0.0
    } else {
        digit as f32 / total as f32
    };
    let caps_ratio = if (alpha + digit + symbol) == 0 {
        0.0
    } else {
        caps as f32 / (alpha + digit + symbol) as f32
    };

    let url_count = words
        .iter()
        .filter(|w| w.starts_with("http://") || w.starts_with("https://") || w.starts_with("www."))
        .count();

    TextFeatures {
        word_count: words.len(),
        unique_ratio: if words.is_empty() {
            0.0
        } else {
            unique_words.len() as f32 / words.len() as f32
        },
        emoji_count,
        exclamation_count: exclamation,
        question_count: question,
        caps_ratio,
        symbol_ratio,
        digit_ratio,
        url_count,
    }
}

pub(crate) fn build_journey(messages: &[Message]) -> Option<Journey> {
    if messages.is_empty() {
        return None;
    }

    let mut sorted_messages = messages.to_vec();
    sorted_messages.sort_by_key(|m| m.dt);

    let first_msg = sorted_messages.first()?;
    let last_msg = sorted_messages.last()?;

    let first_day = first_msg.dt.date();
    let last_day = last_msg.dt.date();
    let total_days = (last_day - first_day).num_days().max(1) as u32;

    let mut sender_counts: HashMap<&str, usize> = HashMap::new();
    let mut deleted_you_sender: Option<&str> = None;

    for msg in &sorted_messages {
        *sender_counts.entry(&msg.sender).or_insert(0) += 1;
        if msg.text.contains("You deleted this message") && deleted_you_sender.is_none() {
            deleted_you_sender = Some(&msg.sender);
        }
    }

    let likely_you = deleted_you_sender.unwrap_or_else(|| {
        sender_counts
            .iter()
            .min_by_key(|(_, count)| *count)
            .map(|(sender, _)| *sender)
            .unwrap_or("")
    });

    let mut first_messages: Vec<JourneyMessage> = Vec::new();
    for (i, msg) in sorted_messages.iter().enumerate() {
        first_messages.push(to_journey_message(msg, likely_you));
        if first_messages.len() >= 5 {
            break;
        }
        if let Some(next_msg) = sorted_messages.get(i + 1) {
            let gap = next_msg.dt.signed_duration_since(msg.dt).num_minutes();
            if gap > CONVERSATION_GAP_MINUTES {
                break;
            }
        }
    }

    let mut last_messages: Vec<JourneyMessage> = Vec::new();
    for i in (0..sorted_messages.len()).rev() {
        let msg = &sorted_messages[i];
        last_messages.push(to_journey_message(msg, likely_you));
        if last_messages.len() >= 5 {
            break;
        }
        if i > 0 {
            let prev_msg = &sorted_messages[i - 1];
            let gap = msg.dt.signed_duration_since(prev_msg.dt).num_minutes();
            if gap > CONVERSATION_GAP_MINUTES {
                break;
            }
        }
    }
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

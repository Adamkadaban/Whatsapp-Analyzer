use chrono::{Datelike, NaiveDate, Timelike};
use std::collections::{BTreeMap, HashMap};
use unicode_segmentation::UnicodeSegmentation;

use crate::parsing::{
    parse_timestamp, re_bracket_pattern, re_hyphen_pattern, weekday_index, weekday_label, Message,
};
use crate::text::{
    color_hex_for_word, extract_emojis, is_media_omitted_message, pick_dominant_color,
};
use crate::types::{Count, FunFact, HourCount, PersonBuckets, PersonDaily, PersonStat};

pub(crate) fn conversation_initiations(
    messages: &[Message],
    gap_minutes: i64,
) -> (Vec<Count>, usize) {
    conversation_initiations_with_gap(messages, gap_minutes)
}

pub(crate) fn conversation_initiations_with_gap(
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

pub(crate) fn count_by_sender(messages: &[Message]) -> Vec<Count> {
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

pub(crate) fn daily_counts(messages: &[Message]) -> Vec<Count> {
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

pub fn longest_streak(daily: &[Count]) -> Option<(u32, String, String)> {
    if daily.is_empty() {
        return None;
    }
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

pub fn longest_streak_from_raw(raw: &str) -> Option<(u32, String, String)> {
    let mut map: BTreeMap<NaiveDate, u32> = BTreeMap::new();
    for line in raw.lines() {
        if let Some(caps) = re_bracket_pattern()
            .captures(line)
            .or_else(|| re_hyphen_pattern().captures(line))
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

pub(crate) fn hourly_counts(messages: &[Message]) -> Vec<HourCount> {
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

pub(crate) fn weekly_counts(messages: &[Message]) -> Vec<Count> {
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

pub(crate) fn monthly_counts(messages: &[Message]) -> Vec<Count> {
    let mut map: BTreeMap<String, u32> = BTreeMap::new();
    for m in messages {
        let label = format!("{:04}-{:02}", m.dt.year(), m.dt.month());
        *map.entry(label).or_insert(0) += 1;
    }
    map.into_iter()
        .map(|(label, value)| Count { label, value })
        .collect()
}

pub(crate) fn deleted_counts(messages: &[Message]) -> (u32, u32) {
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

pub(crate) fn timeline(messages: &[Message]) -> Vec<Count> {
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

pub(crate) fn buckets_by_person(messages: &[Message]) -> Vec<PersonBuckets> {
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

pub(crate) fn per_person_daily(messages: &[Message]) -> Vec<PersonDaily> {
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

pub(crate) fn fun_facts(messages: &[Message]) -> Vec<FunFact> {
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

pub(crate) fn person_stats(messages: &[Message]) -> Vec<PersonStat> {
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

use wasm_bindgen::prelude::*;

mod journey;
mod metrics;
mod parsing;
mod phrases;
mod sentiment;
mod text;
mod types;

pub use metrics::{longest_streak, longest_streak_from_raw};
pub use types::{Count, Summary};

use text::CONVERSATION_GAP_MINUTES;

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

#[wasm_bindgen]
pub fn analyze_chat(raw: &str, top_words_n: u32, top_emojis_n: u32) -> Result<JsValue, JsValue> {
    let summary = summarize(raw, top_words_n as usize, top_emojis_n as usize)
        .map_err(|e| JsValue::from_str(&e))?;

    serde_wasm_bindgen::to_value(&summary).map_err(|e| JsValue::from_str(&e.to_string()))
}

#[cfg(not(target_arch = "wasm32"))]
pub fn analyze_chat_native(
    raw: &str,
    top_words_n: usize,
    top_emojis_n: usize,
) -> Result<String, String> {
    let summary = summarize(raw, top_words_n, top_emojis_n)?;
    serde_json::to_string(&summary).map_err(|e| e.to_string())
}

pub fn summarize(raw: &str, top_words_n: usize, top_emojis_n: usize) -> Result<Summary, String> {
    #[cfg(all(target_arch = "wasm32", feature = "timing"))]
    let t0 = perf_now();

    let messages = parsing::parse_messages(raw);
    #[cfg(all(target_arch = "wasm32", feature = "timing"))]
    log_step!("parse_messages", t0);

    if messages.is_empty() {
        return Err("No messages parsed".into());
    }

    #[cfg(all(target_arch = "wasm32", feature = "timing"))]
    let t1 = perf_now();
    let (del_you, del_others) = metrics::deleted_counts(&messages);
    #[cfg(all(target_arch = "wasm32", feature = "timing"))]
    log_step!("deleted_counts", t1);

    #[cfg(all(target_arch = "wasm32", feature = "timing"))]
    let t2 = perf_now();
    let (conversation_starters, conversation_count) =
        metrics::conversation_initiations(&messages, CONVERSATION_GAP_MINUTES);
    #[cfg(all(target_arch = "wasm32", feature = "timing"))]
    log_step!("conversation_initiations", t2);

    #[cfg(all(target_arch = "wasm32", feature = "timing"))]
    let t3 = perf_now();
    let (sentiment_by_day, sentiment_overall) = sentiment::sentiment_breakdown(&messages);
    #[cfg(all(target_arch = "wasm32", feature = "timing"))]
    log_step!("sentiment_breakdown", t3);

    #[cfg(all(target_arch = "wasm32", feature = "timing"))]
    let t4 = perf_now();
    let word_cloud_val = phrases::word_cloud(&messages, 150, true);
    #[cfg(all(target_arch = "wasm32", feature = "timing"))]
    log_step!("word_cloud(filter=true)", t4);

    #[cfg(all(target_arch = "wasm32", feature = "timing"))]
    let t5 = perf_now();
    let word_cloud_no_stop_val = phrases::word_cloud(&messages, 150, false);
    #[cfg(all(target_arch = "wasm32", feature = "timing"))]
    log_step!("word_cloud(filter=false)", t5);

    #[cfg(all(target_arch = "wasm32", feature = "timing"))]
    let t6 = perf_now();
    let salient_phrases_val = phrases::salient_phrases(&messages, 50);
    #[cfg(all(target_arch = "wasm32", feature = "timing"))]
    log_step!("salient_phrases", t6);

    #[cfg(all(target_arch = "wasm32", feature = "timing"))]
    let t7 = perf_now();
    let top_phrases_val = phrases::top_phrases(&messages, 100, true);
    #[cfg(all(target_arch = "wasm32", feature = "timing"))]
    log_step!("top_phrases", t7);

    #[cfg(all(target_arch = "wasm32", feature = "timing"))]
    let t8 = perf_now();
    let top_phrases_no_stop_val = phrases::top_phrases(&messages, 100, false);
    #[cfg(all(target_arch = "wasm32", feature = "timing"))]
    log_step!("top_phrases_no_stop", t8);

    #[cfg(all(target_arch = "wasm32", feature = "timing"))]
    let t9 = perf_now();
    let per_person_phrases_val = phrases::per_person_phrases(&messages, 20, true);
    #[cfg(all(target_arch = "wasm32", feature = "timing"))]
    log_step!("per_person_phrases", t9);

    #[cfg(all(target_arch = "wasm32", feature = "timing"))]
    let t10 = perf_now();
    let per_person_phrases_no_stop_val = phrases::per_person_phrases(&messages, 20, false);
    #[cfg(all(target_arch = "wasm32", feature = "timing"))]
    log_step!("per_person_phrases_no_stop", t10);

    #[cfg(all(target_arch = "wasm32", feature = "timing"))]
    let t11 = perf_now();
    let person_stats_val = metrics::person_stats(&messages);
    #[cfg(all(target_arch = "wasm32", feature = "timing"))]
    log_step!("person_stats", t11);

    #[cfg(all(target_arch = "wasm32", feature = "timing"))]
    let t12 = perf_now();
    let by_sender = metrics::count_by_sender(&messages);
    #[cfg(all(target_arch = "wasm32", feature = "timing"))]
    log_step!("count_by_sender", t12);

    #[cfg(all(target_arch = "wasm32", feature = "timing"))]
    let t13 = perf_now();
    let daily = metrics::daily_counts(&messages);
    #[cfg(all(target_arch = "wasm32", feature = "timing"))]
    log_step!("daily_counts", t13);

    #[cfg(all(target_arch = "wasm32", feature = "timing"))]
    let t14 = perf_now();
    let hourly = metrics::hourly_counts(&messages);
    #[cfg(all(target_arch = "wasm32", feature = "timing"))]
    log_step!("hourly_counts", t14);

    #[cfg(all(target_arch = "wasm32", feature = "timing"))]
    let t15 = perf_now();
    let top_emojis_val = phrases::top_emojis(&messages, top_emojis_n);
    #[cfg(all(target_arch = "wasm32", feature = "timing"))]
    log_step!("top_emojis", t15);

    #[cfg(all(target_arch = "wasm32", feature = "timing"))]
    let t16 = perf_now();
    let top_words_val = phrases::top_words(&messages, top_words_n, true);
    #[cfg(all(target_arch = "wasm32", feature = "timing"))]
    log_step!("top_words(filter=true)", t16);

    #[cfg(all(target_arch = "wasm32", feature = "timing"))]
    let t17 = perf_now();
    let top_words_no_stop_val = phrases::top_words(&messages, top_words_n, false);
    #[cfg(all(target_arch = "wasm32", feature = "timing"))]
    log_step!("top_words(filter=false)", t17);

    #[cfg(all(target_arch = "wasm32", feature = "timing"))]
    let t18 = perf_now();
    let timeline_val = metrics::timeline(&messages);
    #[cfg(all(target_arch = "wasm32", feature = "timing"))]
    log_step!("timeline", t18);

    #[cfg(all(target_arch = "wasm32", feature = "timing"))]
    let t19 = perf_now();
    let weekly = metrics::weekly_counts(&messages);
    #[cfg(all(target_arch = "wasm32", feature = "timing"))]
    log_step!("weekly_counts", t19);

    #[cfg(all(target_arch = "wasm32", feature = "timing"))]
    let t20 = perf_now();
    let monthly = metrics::monthly_counts(&messages);
    #[cfg(all(target_arch = "wasm32", feature = "timing"))]
    log_step!("monthly_counts", t20);

    #[cfg(all(target_arch = "wasm32", feature = "timing"))]
    let t21 = perf_now();
    let buckets = metrics::buckets_by_person(&messages);
    #[cfg(all(target_arch = "wasm32", feature = "timing"))]
    log_step!("buckets_by_person", t21);

    #[cfg(all(target_arch = "wasm32", feature = "timing"))]
    let t22 = perf_now();
    let emoji_cloud_val = phrases::emoji_cloud(&messages, 1000);
    #[cfg(all(target_arch = "wasm32", feature = "timing"))]
    log_step!("emoji_cloud", t22);

    #[cfg(all(target_arch = "wasm32", feature = "timing"))]
    let t23 = perf_now();
    let fun_facts_val = metrics::fun_facts(&messages);
    #[cfg(all(target_arch = "wasm32", feature = "timing"))]
    log_step!("fun_facts", t23);

    #[cfg(all(target_arch = "wasm32", feature = "timing"))]
    let t24 = perf_now();
    let per_person_daily_val = metrics::per_person_daily(&messages);
    #[cfg(all(target_arch = "wasm32", feature = "timing"))]
    log_step!("per_person_daily", t24);

    #[cfg(all(target_arch = "wasm32", feature = "timing"))]
    let t25 = perf_now();
    let journey_val = journey::build_journey(&messages);
    #[cfg(all(target_arch = "wasm32", feature = "timing"))]
    log_step!("build_journey", t25);

    #[cfg(all(target_arch = "wasm32", feature = "timing"))]
    {
        let total = perf_now() - t0;
        web_sys::console::log_1(&format!("[wasm] summarize total: {:.1}ms", total).into());
    }

    Ok(Summary {
        total_messages: messages.len(),
        by_sender: by_sender.clone(),
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
        share_of_speech: by_sender,
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
    use chrono::{Datelike, NaiveDateTime};
    use std::collections::HashMap;

    use crate::parsing::Message;
    use crate::{metrics, parsing, phrases, text};

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
    fn longest_streak_from_raw_matches_daily_counts() {
        let raw = sample_chat();
        let msgs = parsing::parse_messages(raw);
        let daily = metrics::daily_counts(&msgs);
        let expected = metrics::longest_streak(&daily);
        let fast = metrics::longest_streak_from_raw(raw);
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
        let (len, start, end) = metrics::longest_streak(&daily).unwrap();
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
        let (len, start, end) = metrics::longest_streak(&daily).unwrap();
        assert_eq!(len, 2);
        assert_eq!(start, "2024-01-01");
        assert_eq!(end, "2024-01-02");
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
        let out = text::extract_emojis(input);
        assert_eq!(out, vec!["🤷‍♀️"], "should keep the full ZWJ sequence");
    }

    #[test]
    fn top_emojis_counts_full_sequence_not_components() {
        let messages = vec![msg("a", "hello 🤷‍♀️ there"), msg("b", "another 🤷‍♀️ test")];
        let counts = phrases::top_emojis(&messages, 10);
        assert_eq!(counts.len(), 1);
        assert_eq!(counts[0].label, "🤷‍♀️");
        assert_eq!(counts[0].value, 2);
    }

    #[test]
    fn multiple_compound_emojis_are_counted_without_components() {
        let messages = vec![msg("a", "🤷‍♀️🤦‍♂️"), msg("b", "test 🤦‍♂️")];
        let counts = phrases::top_emojis(&messages, 10);
        assert_eq!(counts.len(), 2);
        let shrug = counts.iter().find(|c| c.label == "🤷‍♀️").unwrap();
        let facepalm = counts.iter().find(|c| c.label == "🤦‍♂️").unwrap();
        assert_eq!(shrug.value, 1);
        assert_eq!(facepalm.value, 2);
    }

    #[test]
    fn parses_common_whatsapp_formats() {
        let raw = "13.12.2023, 22:45 - Alice: Guten Abend\n[14/12/2023, 07:05:10] Bob: Morning!\n1/2/24, 9:15 AM - Carol: Hi";
        let messages = parsing::parse_messages(raw);
        assert_eq!(messages.len(), 3);
        assert!(messages.iter().any(|m| m.sender == "Alice"));
        assert!(messages.iter().any(|m| m.sender == "Bob"));
        assert!(messages.iter().any(|m| m.sender == "Carol"));
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
        let raw = "[8/19/19, 5:00:00 PM] Alice: Hi\n[8/19/19, 5:10:00 PM] Bob: ok\n[8/19/19, 6:00:01 PM] Bob: New convo\n[8/19/19, 6:05:00 PM] Alice: reply";
        let summary = summarize(raw, 5, 5).unwrap();
        assert_eq!(summary.conversation_count, 2);
        let starters = summary
            .conversation_starters
            .iter()
            .map(|c| (c.label.as_str(), c.value))
            .collect::<HashMap<_, _>>();
        assert_eq!(starters.get("Alice"), Some(&1));
        assert_eq!(starters.get("Bob"), Some(&1));
    }

    #[test]
    fn timeline_fills_missing_days() {
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
        assert_eq!(a.daily[1], 1);
        assert_eq!(a.daily[5], 1);
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

        let messages = parsing::parse_messages(raw);
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
        let raw = r#"[1/1/20, 10:00:00 AM] Alice: First message!
[1/1/20, 10:05:00 AM] Bob: Second message
[1/1/20, 10:10:00 AM] Alice: Third message
[1/1/20, 2:00:00 PM] Bob: Middle of day
[1/1/20, 8:00:00 PM] Alice: Evening start
[1/1/20, 8:05:00 PM] Bob: Evening reply
[1/1/20, 8:10:00 PM] Alice: Evening end"#;
        let summary = summarize(raw, 5, 5).unwrap();
        let journey = summary.journey.expect("journey should exist");

        assert_eq!(
            journey.first_messages.len(),
            3,
            "first conversation should have 3 messages"
        );
        assert_eq!(journey.first_messages[0].text, "First message!");
        assert_eq!(journey.first_messages[1].text, "Second message");
        assert_eq!(journey.first_messages[2].text, "Third message");

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
        let raw = r#"[1/2/20, 10:00:00 AM] Alice: Day 2 message
[1/2/20, 10:05:00 AM] Bob: Day 2 reply
[1/1/20, 10:00:00 AM] Alice: Day 1 first message
[1/1/20, 10:05:00 AM] Bob: Day 1 reply"#;
        let summary = summarize(raw, 5, 5).unwrap();
        let journey = summary.journey.expect("journey should exist");

        assert_eq!(journey.first_messages[0].text, "Day 1 first message");
        assert_eq!(journey.first_messages[1].text, "Day 1 reply");

        assert_eq!(journey.last_messages[0].text, "Day 2 message");
        assert_eq!(journey.last_messages[1].text, "Day 2 reply");
    }
}

use chrono::{Datelike, NaiveDateTime};
use once_cell::sync::OnceCell;
use regex::Regex;

#[derive(Debug, Clone)]
pub(crate) struct Message {
    pub(crate) dt: NaiveDateTime,
    pub(crate) sender: String,
    pub(crate) text: String,
}

fn re_bracket() -> &'static Regex {
    static RE: OnceCell<Regex> = OnceCell::new();
    RE.get_or_init(|| {
        // SAFE: compile-time-constant pattern, validated by tests; never depends on user input.
        Regex::new(r"^[\u{feff}\u{200e}]?\[(?P<date>\d{1,2}[\/.]\d{1,2}[\/.]\d{2,4}),\s+(?P<time>[^\]]+)\]\s+(?P<name>[^:]+):\s+(?P<msg>.*)$")
            .expect("valid regex")
    })
}

fn re_hyphen() -> &'static Regex {
    static RE: OnceCell<Regex> = OnceCell::new();
    RE.get_or_init(|| {
        // SAFE: compile-time-constant pattern, validated by tests; never depends on user input.
        Regex::new(r"^(?P<date>\d{1,2}[\/.]\d{1,2}[\/.]\d{2,4}),\s+(?P<time>\d{1,2}:\d{2}(?::\d{2})?(?:\s*[AP]M)?)\s+-\s+(?P<name>[^:]+):\s+(?P<msg>.*)$")
            .expect("valid regex")
    })
}

pub(crate) fn parse_timestamp(date: &str, time: &str) -> Option<NaiveDateTime> {
    let cleaned = time
        .replace(['\u{202f}', '\u{00a0}'], " ")
        .trim()
        .to_uppercase();

    let prefer_month_first = if date.contains('/') {
        let mut parts = date.split('/');
        let first = parts.next().and_then(|p| p.parse::<u32>().ok());
        let second = parts.next().and_then(|p| p.parse::<u32>().ok());
        match (first, second) {
            (Some(a), Some(_)) if a > 12 => false,
            (Some(_), Some(b)) if b > 12 => true,
            _ => true,
        }
    } else {
        false
    };

    let mut formats: Vec<&str> = Vec::new();

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

    text.contains("messages and calls are end-to-end encrypted")
        || text.contains("created group")
        || text.contains("changed this group's icon")
        || (text.contains("security code") && text.contains("tap to learn more"))
}

pub(crate) fn parse_messages(raw: &str) -> Vec<Message> {
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
pub(crate) fn weekday_index(wd: chrono::Weekday) -> usize {
    wd.num_days_from_sunday() as usize
}

pub(crate) fn weekday_label(idx: usize) -> String {
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

pub(crate) fn re_bracket_pattern() -> &'static Regex {
    re_bracket()
}

pub(crate) fn re_hyphen_pattern() -> &'static Regex {
    re_hyphen()
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::{Datelike, Timelike};

    #[test]
    fn parse_timestamp_bracket_pm_style() {
        let dt = parse_timestamp("8/19/19", "5:04:35 PM").expect("parses");
        assert_eq!(dt.year(), 2019);
        assert_eq!(dt.month(), 8);
        assert_eq!(dt.date().day(), 19);
        assert_eq!(dt.hour(), 17);
        assert_eq!(dt.minute(), 4);
        assert_eq!(dt.second(), 35);
    }

    #[test]
    fn parse_timestamp_24h_hyphen_style() {
        let dt = parse_timestamp("13.12.2023", "22:45").expect("parses dotted");
        assert_eq!(dt.year(), 2023);
        assert_eq!(dt.month(), 12);
        assert_eq!(dt.date().day(), 13);
        assert_eq!(dt.hour(), 22);
        assert_eq!(dt.minute(), 45);
    }

    #[test]
    fn parse_timestamp_day_first_when_day_gt_12() {
        // 25 cannot be a month, so it must be day/month/year.
        let dt = parse_timestamp("25/12/2023", "09:30").expect("parses");
        assert_eq!(dt.month(), 12);
        assert_eq!(dt.date().day(), 25);
    }

    #[test]
    fn parse_timestamp_handles_narrow_nbsp_in_time() {
        // WhatsApp inserts U+202F before AM/PM; it must be normalized.
        let dt = parse_timestamp("1/2/2024", "9:15\u{202f}AM").expect("parses nbsp");
        assert_eq!(dt.hour(), 9);
        assert_eq!(dt.minute(), 15);
    }

    #[test]
    fn parse_timestamp_two_digit_year_expands() {
        let dt = parse_timestamp("3/4/05", "1:00 PM").expect("parses");
        assert_eq!(dt.year(), 2005);
    }

    #[test]
    fn parse_timestamp_rejects_garbage() {
        assert!(parse_timestamp("not-a-date", "nonsense").is_none());
        assert!(parse_timestamp("", "").is_none());
        assert!(parse_timestamp("99/99/99", "99:99:99").is_none());
    }

    #[test]
    fn parse_messages_empty_input() {
        assert!(parse_messages("").is_empty());
        assert!(parse_messages("\n\n   \n").is_empty());
    }

    #[test]
    fn parse_messages_garbage_only_is_empty() {
        let raw = "this is not a chat\njust random lines\n123 456";
        assert!(parse_messages(raw).is_empty());
    }

    #[test]
    fn parse_messages_both_formats() {
        let raw = "[8/19/19, 5:04:35 PM] Alice: hi there\n8/20/19, 7:00 AM - Bob: morning";
        let msgs = parse_messages(raw);
        assert_eq!(msgs.len(), 2);
        assert_eq!(msgs[0].sender, "Alice");
        assert_eq!(msgs[0].text, "hi there");
        assert_eq!(msgs[1].sender, "Bob");
    }

    #[test]
    fn parse_messages_multiline_continuation() {
        let raw = "[8/19/19, 5:04:35 PM] Alice: first line\nsecond line\nthird line\n[8/19/19, 5:05:00 PM] Bob: reply";
        let msgs = parse_messages(raw);
        assert_eq!(msgs.len(), 2);
        assert_eq!(msgs[0].text, "first line\nsecond line\nthird line");
    }

    #[test]
    fn parse_messages_skips_lines_with_unparseable_dates() {
        // Header matches the regex shape but the date is impossible -> skipped, no panic.
        let raw =
            "[99/99/99, 5:04:35 PM] Ghost: should be dropped\n[8/19/19, 5:04:35 PM] Alice: kept";
        let msgs = parse_messages(raw);
        assert_eq!(msgs.len(), 1);
        assert_eq!(msgs[0].sender, "Alice");
    }

    #[test]
    fn parse_messages_filters_system_messages() {
        let raw = "[8/19/19, 5:00:00 PM] System: Messages and calls are end-to-end encrypted.\n[8/19/19, 5:04:35 PM] Alice: real message";
        let msgs = parse_messages(raw);
        assert_eq!(msgs.len(), 1);
        assert_eq!(msgs[0].sender, "Alice");
    }

    #[test]
    fn parse_messages_keeps_deleted_markers() {
        let raw = "[8/19/19, 5:00:00 PM] Alice: You deleted this message\n[8/19/19, 5:04:35 PM] Bob: This message was deleted";
        let msgs = parse_messages(raw);
        assert_eq!(msgs.len(), 2);
        assert_eq!(msgs[0].text, "You deleted this message");
        assert_eq!(msgs[1].text, "This message was deleted");
    }

    #[test]
    fn parse_messages_single_sender() {
        let raw = "[1/1/20, 1:00:00 PM] Solo: a\n[1/1/20, 1:01:00 PM] Solo: b\n[1/1/20, 1:02:00 PM] Solo: c";
        let msgs = parse_messages(raw);
        assert_eq!(msgs.len(), 3);
        assert!(msgs.iter().all(|m| m.sender == "Solo"));
    }

    #[test]
    fn parse_messages_unicode_and_emoji_text() {
        let raw = "[1/1/20, 1:00:00 PM] Zoé: héllo 😀 你好 🤷‍♀️";
        let msgs = parse_messages(raw);
        assert_eq!(msgs.len(), 1);
        assert_eq!(msgs[0].sender, "Zoé");
        assert!(msgs[0].text.contains("😀"));
        assert!(msgs[0].text.contains("你好"));
    }

    #[test]
    fn clean_sender_strips_bidi_and_control_marks() {
        let cleaned = clean_sender("\u{200e}\u{202a}Alice\u{202c}\u{200f}");
        assert_eq!(cleaned, "Alice");
    }

    #[test]
    fn clean_sender_trims_whitespace() {
        assert_eq!(clean_sender("  Bob  "), "Bob");
    }

    #[test]
    fn is_system_message_detects_banners() {
        let sys = Message {
            dt: parse_timestamp("1/1/20", "1:00 PM").unwrap(),
            sender: "Alice".into(),
            text: "Your security code with Bob changed. Tap to learn more.".into(),
        };
        assert!(is_system_message(&sys));

        let normal = Message {
            dt: parse_timestamp("1/1/20", "1:00 PM").unwrap(),
            sender: "Alice".into(),
            text: "hello".into(),
        };
        assert!(!is_system_message(&normal));
    }

    #[test]
    fn is_system_message_detects_system_sender() {
        let sys = Message {
            dt: parse_timestamp("1/1/20", "1:00 PM").unwrap(),
            sender: "system".into(),
            text: "anything".into(),
        };
        assert!(is_system_message(&sys));
    }

    #[test]
    fn weekday_index_and_label_round_trip() {
        assert_eq!(weekday_label(weekday_index(chrono::Weekday::Sun)), "Sun");
        assert_eq!(weekday_label(weekday_index(chrono::Weekday::Wed)), "Wed");
        assert_eq!(weekday_label(weekday_index(chrono::Weekday::Sat)), "Sat");
        assert_eq!(weekday_label(99), "?");
    }
}

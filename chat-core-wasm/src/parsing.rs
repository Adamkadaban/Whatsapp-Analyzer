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

use anyhow::{Context, Result};
use chrono::NaiveDateTime;
use clap::Parser;
use polars::prelude::*;
use regex::Regex;
use std::collections::{HashMap, HashSet};
use std::fs::File;
use std::io::{BufRead, BufReader};
use std::path::PathBuf;
use std::sync::OnceLock;
use unicode_segmentation::UnicodeSegmentation;

#[derive(Parser, Debug)]
#[command(author, version, about = "WhatsApp chat analyzer", long_about = None)]
struct Args {
    #[arg(help = "Path to exported WhatsApp txt file")]
    input: PathBuf,
    #[arg(short, long, default_value_t = 20, help = "Top N words to display")]
    top_words: usize,
    #[arg(short = 'e', long, default_value_t = 10, help = "Top N emojis to display")]
    top_emojis: usize,
}

#[derive(Debug, Clone)]
struct Message {
    dt: NaiveDateTime,
    sender: String,
    text: String,
}

fn message_regex_bracket() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| {
        Regex::new(r"^[\u{feff}\u{200e}]?\[(?P<date>\d{1,2}/\d{1,2}/\d{2}),\s+(?P<time>[^\]]+)\]\s+(?P<name>[^:]+):\s+(?P<msg>.*)$")
            .expect("regex compiled")
    })
}

fn message_regex_hyphen() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| {
        Regex::new(r"^(?P<date>\d{1,2}/\d{1,2}/\d{2}),\s+(?P<time>\d{1,2}:\d{2}(?::\d{2})?\s*[AP]M)\s+-\s+(?P<name>[^:]+):\s+(?P<msg>.*)$")
            .expect("regex compiled")
    })
}

fn parse_timestamp(date: &str, time: &str) -> Option<NaiveDateTime> {
    let t = time.replace('\u{202f}', " ").replace('\u{00a0}', " ");
    let candidates = ["%m/%d/%y, %I:%M:%S %p", "%m/%d/%y, %I:%M %p"];
    candidates.iter().find_map(|fmt| NaiveDateTime::parse_from_str(&format!("{date}, {t}"), fmt).ok())
}

fn parse_whatsapp_file(path: &PathBuf) -> Result<Vec<Message>> {
    let file = File::open(path).with_context(|| format!("Cannot open {:?}", path))?;
    let reader = BufReader::new(file);
    let mut messages = Vec::new();
    let mut current: Option<Message> = None;

    for line in reader.lines() {
        let line = line?;
        if let Some(caps) = message_regex_bracket().captures(&line).or_else(|| message_regex_hyphen().captures(&line)) {
            if let Some(msg) = current.take() {
                messages.push(msg);
            }

            let date = caps.name("date").map(|m| m.as_str()).unwrap_or("");
            let time = caps.name("time").map(|m| m.as_str()).unwrap_or("");
            let name = caps.name("name").map(|m| m.as_str()).unwrap_or("").trim();
            let text = caps.name("msg").map(|m| m.as_str()).unwrap_or("").to_string();

            if let Some(dt) = parse_timestamp(date, time) {
                current = Some(Message {
                    dt,
                    sender: name.to_string(),
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

    Ok(messages)
}

fn as_dataframe(messages: &[Message]) -> Result<DataFrame> {
    let timestamps: Vec<i64> = messages
        .iter()
        .map(|m| m.dt.and_utc().timestamp_millis())
        .collect();
    let names: Vec<&str> = messages.iter().map(|m| m.sender.as_str()).collect();
    let texts: Vec<&str> = messages.iter().map(|m| m.text.as_str()).collect();

    let dt_series = Series::new("dt_raw", timestamps);
    let df = DataFrame::new(vec![dt_series, Series::new("name", names), Series::new("message", texts)])?;

    df.lazy()
        .with_columns([col("dt_raw").cast(DataType::Datetime(TimeUnit::Milliseconds, None)).alias("dt")])
        .select([col("dt"), col("name"), col("message")])
        .collect()
        .map_err(Into::into)
}

fn count_by_sender(df: &DataFrame) -> Result<DataFrame> {
    df.clone()
        .lazy()
        .group_by([col("name")])
        .agg([col("name").count().alias("messages")])
        .sort(
            ["messages"],
            SortMultipleOptions {
                descending: vec![true],
                nulls_last: vec![false],
                multithreaded: true,
                maintain_order: false,
            },
        )
        .collect()
        .map_err(Into::into)
}

fn daily_counts(df: &DataFrame) -> Result<DataFrame> {
    df.clone()
        .lazy()
        .with_columns([col("dt").dt().date().alias("date")])
        .group_by([col("date")])
        .agg([col("date").count().alias("messages")])
        .sort(
            ["date"],
            SortMultipleOptions {
                descending: vec![false],
                nulls_last: vec![false],
                multithreaded: true,
                maintain_order: false,
            },
        )
        .collect()
        .map_err(Into::into)
}

fn hour_histogram(df: &DataFrame) -> Result<HashMap<u32, u32>> {
    let mut counts = HashMap::new();
    let hours = df
        .clone()
        .lazy()
        .with_columns([col("dt").dt().hour().cast(DataType::UInt32).alias("hour")])
        .select([col("hour")])
        .collect()?;

    let hour_col = hours.column("hour")?;
    for h in hour_col.u32()?.into_no_null_iter() {
        *counts.entry(h).or_insert(0) += 1;
    }
    Ok(counts)
}

fn emoji_regex() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| {
        Regex::new(r"([\u{1F1E6}-\u{1F1FF}]{2}|[\u{1F300}-\u{1FAFF}]|[\u{2600}-\u{27BF}])")
            .expect("emoji regex")
    })
}

fn emoji_frequency(messages: &[Message]) -> HashMap<String, u32> {
    let mut counts = HashMap::new();
    for text in messages.iter().map(|m| m.text.as_str()) {
        for m in emoji_regex().find_iter(text) {
            *counts.entry(m.as_str().to_string()).or_insert(0) += 1;
        }
    }
    counts
}

fn word_frequency(messages: &[Message]) -> HashMap<String, u32> {
    let stopwords: HashSet<&'static str> = [
        "the", "and", "of", "to", "in", "a", "is", "it", "i", "you", "for", "on", "that",
        "this", "was", "with", "at", "be", "are", "my", "me", "we", "they", "them", "your",
    ]
    .into_iter()
    .collect();

    let mut counts = HashMap::new();
    for text in messages.iter().map(|m| m.text.as_str()) {
        for token in text.unicode_words() {
            let token = token.trim_matches(|c: char| !c.is_alphanumeric()).to_lowercase();
            if token.len() < 3 || stopwords.contains(token.as_str()) {
                continue;
            }
            *counts.entry(token).or_insert(0) += 1;
        }
    }
    counts
}

fn deleted_counts(messages: &[Message]) -> (u32, u32) {
    let mut you = 0;
    let mut them = 0;
    for m in messages.iter().map(|m| m.text.as_str()) {
        if m == "You deleted this message" {
            you += 1;
        } else if m == "This message was deleted" {
            them += 1;
        }
    }
    (you, them)
}

fn print_top(map: HashMap<String, u32>, take: usize, label: &str) {
    let mut items: Vec<_> = map.into_iter().collect();
    items.sort_by_key(|(_, v)| std::cmp::Reverse(*v));
    println!("{label}");
    for (i, (k, v)) in items.into_iter().take(take).enumerate() {
        println!("{:<3} {:<12} {}", i + 1, v, k);
    }
    println!();
}

fn main() -> Result<()> {
    let args = Args::parse();
    let messages = parse_whatsapp_file(&args.input)?;
    if messages.is_empty() {
        println!("No messages parsed.");
        return Ok(());
    }

    let df = as_dataframe(&messages)?;

    let sender_counts = count_by_sender(&df)?;
    let day_counts = daily_counts(&df)?;
    let hour_counts = hour_histogram(&df)?;
    let emoji_counts = emoji_frequency(&messages);
    let word_counts = word_frequency(&messages);
    let deleted = deleted_counts(&messages);

    println!("Messages by sender:\n{}", sender_counts);
    println!("Daily message volume:\n{}", day_counts);

    println!("Hourly distribution (0-23):");
    let mut hours: Vec<_> = hour_counts.into_iter().collect();
    hours.sort_by_key(|(h, _)| *h);
    for (h, c) in hours {
        println!("{:02}:00 - {}", h, c);
    }
    println!();

    println!("Deleted messages -> you: {}, others: {}\n", deleted.0, deleted.1);
    print_top(emoji_counts, args.top_emojis, "Top emojis:");
    print_top(word_counts, args.top_words, "Top words:");

    Ok(())
}

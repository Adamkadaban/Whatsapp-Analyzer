use std::collections::HashMap;

use crate::parsing::Message;
use crate::text::{
    extract_emojis, is_media_omitted_message, stopwords_set, tokenize, tokens_alpha_numeric_stats,
    tokens_stop_stats,
};
use crate::types::{Count, PersonPhrases};

pub(crate) fn salient_phrases(messages: &[Message], take: usize) -> Vec<Count> {
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

pub(crate) fn top_emojis(messages: &[Message], take: usize) -> Vec<Count> {
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

pub(crate) fn top_words(messages: &[Message], take: usize, filter_stop: bool) -> Vec<Count> {
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

pub(crate) fn word_cloud(messages: &[Message], take: usize, filter_stop: bool) -> Vec<Count> {
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

pub(crate) fn emoji_cloud(messages: &[Message], take: usize) -> Vec<Count> {
    let mut counts = top_emojis(messages, usize::MAX);
    counts.truncate(take);
    counts
}

pub(crate) fn top_phrases(messages: &[Message], take: usize, _filter_stop: bool) -> Vec<Count> {
    const MAX_N: usize = 5;
    const PMI_THRESHOLD: f64 = 0.1;
    const SEP: &str = "\x00";

    let stop = stopwords_set();

    let mut total_tokens: u32 = 0;
    let mut ngram_counts: HashMap<String, u32> = HashMap::new();
    let mut unigram_counts: HashMap<String, u32> = HashMap::new();

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

    for tokens in &all_token_lists {
        let tlen = tokens.len();
        for i in 0..tlen {
            for n in 1..=MAX_N.min(tlen - i) {
                let slice = &tokens[i..i + n];

                if slice.iter().all(|t| t.is_empty()) {
                    continue;
                }

                if n > 1 {
                    let non_stop = slice.iter().filter(|t| !stop.contains(t.as_str())).count();
                    if non_stop == 0 {
                        continue;
                    }
                    if n == 2 && non_stop < 1 {
                        continue;
                    }
                }

                let (alpha, numeric) = tokens_alpha_numeric_stats(slice);
                if alpha == 0 || (numeric as f64 / n as f64) > 0.5 {
                    continue;
                }

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
        let tokens: Vec<&str> = key.split(SEP).collect();
        let len = tokens.len();
        if len < 2 {
            continue;
        }

        let non_stop = tokens.iter().filter(|t| !stop.contains(*t)).count();
        if non_stop == 0 {
            continue;
        }

        if len == 2 && (non_stop as f64 / len as f64) < 0.5 {
            continue;
        }

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

pub(crate) fn per_person_phrases(
    messages: &[Message],
    take: usize,
    _filter_stop: bool,
) -> Vec<PersonPhrases> {
    let min_count: u32 = if messages.len() > 100000 {
        5
    } else if messages.len() > 10000 {
        3
    } else {
        1
    };
    let stop = stopwords_set();
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

            let mut phrases = phrases;
            phrases.sort_by(|a, b| b.value.cmp(&a.value));

            PersonPhrases { name, phrases }
        })
        .collect();

    res.sort_by(|a, b| a.name.cmp(&b.name));
    res
}

fn contains_subsequence(long: &[String], short: &[String]) -> bool {
    if short.is_empty() || short.len() > long.len() {
        return false;
    }
    long.windows(short.len()).any(|w| w == short)
}

fn suppress_subphrases(records: Vec<PhraseRecord>, max_input: usize) -> Vec<PhraseRecord> {
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
                continue 'outer;
            }

            if rec.len > existing.len
                && rec.count >= 2
                && contains_subsequence(&rec.tokens, &existing.tokens)
            {
                let overlap = existing.len as f64 / rec.len as f64;
                if overlap >= 0.5 && rec.count * 10 >= existing.count * 6 {
                    *existing = rec;
                    continue 'outer;
                }
            }
        }
        kept.push(rec);
    }
    kept
}

#[derive(Clone)]
struct PhraseRecord {
    phrase: String,
    count: u32,
    len: usize,
    tokens: Vec<String>,
    score: f64,
}

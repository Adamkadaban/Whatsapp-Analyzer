use once_cell::sync::OnceCell;
use regex::Regex;
use std::collections::{HashMap, HashSet};
use stopwords::{Language, Spark, Stopwords};

// Fixed 30-minute gap threshold to define a new conversation
pub(crate) const CONVERSATION_GAP_MINUTES: i64 = 30;

// Extras seen in WhatsApp exports that should be filtered from stopwords.
pub(crate) const WHATSAPP_EXTRAS: [&str; 27] = [
    "<media",
    "<attached:",
    "audio",
    "omitted>",
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
    "bild",
    "image",
    "<medien",
    "ausgeschlossen>",
    "weggelassen",
    "omitted",
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

pub(crate) fn color_hex_for_word(word: &str) -> Option<&'static str> {
    COLOR_WORDS
        .iter()
        .find(|(label, _)| *label == word)
        .map(|(_, hex)| *hex)
}

pub(crate) fn pick_dominant_color(freq: &HashMap<String, u32>) -> Option<String> {
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

/// Languages supported for stopword filtering.
const SUPPORTED_LANGUAGES: [Language; 3] =
    [Language::English, Language::Portuguese, Language::Spanish];

pub(crate) fn stopwords_set() -> &'static HashSet<&'static str> {
    static STOPWORDS: OnceCell<HashSet<&'static str>> = OnceCell::new();
    STOPWORDS.get_or_init(|| {
        let mut set: HashSet<&'static str> = HashSet::new();
        // Merge stopwords from all supported languages
        for lang in SUPPORTED_LANGUAGES {
            if let Some(words) = Spark::stopwords(lang) {
                set.extend(words.iter().copied());
            }
        }
        for extra in WHATSAPP_EXTRAS {
            set.insert(extra);
        }
        set
    })
}

pub(crate) fn is_media_omitted_message(text: &str) -> bool {
    text.trim().eq_ignore_ascii_case("<media omitted>")
}

pub(crate) fn extract_emojis(text: &str) -> Vec<String> {
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

pub(crate) fn tokenize(text: &str, filter_stop: bool, stop: &HashSet<&'static str>) -> Vec<String> {
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

pub(crate) fn tokens_stop_stats(tokens: &[String], stop: &HashSet<&'static str>) -> (usize, usize) {
    let stop_count = tokens.iter().filter(|t| stop.contains(t.as_str())).count();
    let non_stop = tokens.len().saturating_sub(stop_count);
    (stop_count, non_stop)
}

pub(crate) fn tokens_alpha_numeric_stats(tokens: &[String]) -> (usize, usize) {
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

fn emoji_re() -> &'static Regex {
    static RE: OnceCell<Regex> = OnceCell::new();
    RE.get_or_init(|| {
        // Match complete emoji sequences including:
        // - Regional indicator pairs (flags like 1fa1f8)
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
        )
        // SAFE: compile-time-constant pattern, exercised by unit tests; independent of user input.
        .expect("emoji regex")
    })
}

fn url_re() -> &'static Regex {
    static RE: OnceCell<Regex> = OnceCell::new();
    RE.get_or_init(|| {
        // Matches common URL forms so we can strip them before tokenization.
        // SAFE: compile-time-constant pattern; independent of user input.
        Regex::new(r"(?i)\bhttps?://\S+|\bwww\.[^\s]+").expect("url regex")
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn color_hex_lookup_known_and_unknown() {
        assert_eq!(color_hex_for_word("blue"), Some("#64d8ff"));
        assert_eq!(color_hex_for_word("lavender"), Some("#b39ddb"));
        // Case-sensitive lookup: callers lowercase first.
        assert_eq!(color_hex_for_word("Blue"), None);
        assert_eq!(color_hex_for_word("notacolor"), None);
        assert_eq!(color_hex_for_word(""), None);
    }

    #[test]
    fn pick_dominant_color_empty_is_none() {
        let freq: HashMap<String, u32> = HashMap::new();
        assert_eq!(pick_dominant_color(&freq), None);
    }

    #[test]
    fn pick_dominant_color_picks_highest_count() {
        let mut freq = HashMap::new();
        freq.insert("blue".to_string(), 1u32);
        freq.insert("green".to_string(), 5u32);
        assert_eq!(pick_dominant_color(&freq).as_deref(), Some("#06d6a0"));
    }

    #[test]
    fn pick_dominant_color_tie_breaks_alphabetically() {
        let mut freq = HashMap::new();
        freq.insert("red".to_string(), 3u32);
        freq.insert("blue".to_string(), 3u32);
        // "blue" sorts before "red" alphabetically on the tie.
        assert_eq!(pick_dominant_color(&freq).as_deref(), Some("#64d8ff"));
    }

    #[test]
    fn pick_dominant_color_non_color_word_returns_none() {
        let mut freq = HashMap::new();
        freq.insert("banana".to_string(), 9u32);
        assert_eq!(pick_dominant_color(&freq), None);
    }

    #[test]
    fn media_omitted_detection_is_trim_and_case_insensitive() {
        assert!(is_media_omitted_message("<Media omitted>"));
        assert!(is_media_omitted_message("  <media omitted>  "));
        assert!(is_media_omitted_message("<MEDIA OMITTED>"));
        assert!(!is_media_omitted_message("media omitted"));
        assert!(!is_media_omitted_message("hello <media omitted> world"));
        assert!(!is_media_omitted_message(""));
    }

    #[test]
    fn extract_emojis_empty_and_plain_text() {
        assert!(extract_emojis("").is_empty());
        assert!(extract_emojis("just plain ascii text 123").is_empty());
    }

    #[test]
    fn extract_emojis_simple_and_repeated() {
        assert_eq!(extract_emojis("😀"), vec!["😀"]);
        assert_eq!(extract_emojis("a😀b😀"), vec!["😀", "😀"]);
    }

    #[test]
    fn extract_emojis_keeps_zwj_sequence_intact() {
        let out = extract_emojis("hi 🤷‍♀️ there");
        assert_eq!(out, vec!["🤷‍♀️"]);
    }

    #[test]
    fn extract_emojis_flag_regional_indicator_pair() {
        let out = extract_emojis("🇺🇸");
        assert_eq!(out.len(), 1);
        assert_eq!(out[0], "🇺🇸");
    }

    #[test]
    fn extract_emojis_handles_unicode_text_boundaries() {
        // Mixed multibyte non-emoji text must not panic or mis-slice.
        let out = extract_emojis("héllo naïve Ωmega 你好 😀");
        assert_eq!(out, vec!["😀"]);
    }

    #[test]
    fn tokenize_strips_urls_and_lowercases() {
        let stop = stopwords_set();
        let toks = tokenize("Hello WORLD https://example.com/page foo", false, stop);
        assert!(toks.contains(&"hello".to_string()));
        assert!(toks.contains(&"world".to_string()));
        assert!(toks.contains(&"foo".to_string()));
        assert!(toks.iter().all(|t| !t.contains("example")));
    }

    #[test]
    fn tokenize_filter_stop_removes_stopwords() {
        let stop = stopwords_set();
        let with = tokenize("the cat and the dog", false, stop);
        let without = tokenize("the cat and the dog", true, stop);
        assert!(with.len() > without.len());
        assert!(!without.contains(&"the".to_string()));
        assert!(without.contains(&"cat".to_string()));
    }

    #[test]
    fn tokenize_empty_input_yields_nothing() {
        let stop = stopwords_set();
        assert!(tokenize("", false, stop).is_empty());
        assert!(tokenize("   \n\t  ", false, stop).is_empty());
    }

    #[test]
    fn tokenize_preserves_heart_shortcut() {
        let stop = stopwords_set();
        let toks = tokenize("love you <3", false, stop);
        assert!(toks.contains(&"<3".to_string()));
        assert!(!toks.contains(&"3".to_string()));
    }

    #[test]
    fn tokens_stop_stats_counts_correctly() {
        let stop = stopwords_set();
        let toks = vec![
            "the".to_string(),
            "cat".to_string(),
            "and".to_string(),
            "dog".to_string(),
        ];
        let (stop_count, non_stop) = tokens_stop_stats(&toks, stop);
        assert_eq!(stop_count + non_stop, toks.len());
        assert!(stop_count >= 2); // "the" and "and"
    }

    #[test]
    fn tokens_stop_stats_empty() {
        let stop = stopwords_set();
        assert_eq!(tokens_stop_stats(&[], stop), (0, 0));
    }

    #[test]
    fn tokens_alpha_numeric_stats_splits() {
        let toks = vec![
            "hello".to_string(),
            "123".to_string(),
            "world".to_string(),
            "42".to_string(),
        ];
        let (alpha, numeric) = tokens_alpha_numeric_stats(&toks);
        assert_eq!(numeric, 2);
        assert_eq!(alpha, 2);
    }

    #[test]
    fn tokens_alpha_numeric_stats_treats_symbols_as_alpha() {
        let toks = vec!["<3".to_string(), "9".to_string()];
        let (alpha, numeric) = tokens_alpha_numeric_stats(&toks);
        assert_eq!(alpha, 1);
        assert_eq!(numeric, 1);
    }

    #[test]
    fn stopwords_set_includes_languages_and_extras() {
        let stop = stopwords_set();
        assert!(stop.contains("the"));
        // WhatsApp extras are merged in.
        assert!(stop.contains("omitted"));
        assert!(stop.contains("deleted"));
    }
}

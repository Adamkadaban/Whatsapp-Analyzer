use serde::Serialize;

#[derive(Debug, Serialize, Clone)]
pub struct Count {
    pub label: String,
    pub value: u32,
}

#[derive(Debug, Serialize, Clone)]
pub(crate) struct HourCount {
    pub(crate) hour: u32,
    pub(crate) value: u32,
}

#[derive(Debug, Serialize)]
pub struct Summary {
    pub(crate) total_messages: usize,
    pub(crate) by_sender: Vec<Count>,
    pub(crate) daily: Vec<Count>,
    pub(crate) hourly: Vec<HourCount>,
    pub(crate) top_emojis: Vec<Count>,
    pub(crate) top_words: Vec<Count>,
    pub(crate) top_words_no_stop: Vec<Count>,
    pub(crate) deleted_you: u32,
    pub(crate) deleted_others: u32,
    pub(crate) timeline: Vec<Count>,
    pub(crate) weekly: Vec<Count>,
    pub(crate) monthly: Vec<Count>,
    pub(crate) share_of_speech: Vec<Count>,
    pub(crate) buckets_by_person: Vec<PersonBuckets>,
    pub(crate) word_cloud: Vec<Count>,
    pub(crate) word_cloud_no_stop: Vec<Count>,
    pub(crate) emoji_cloud: Vec<Count>,
    pub(crate) salient_phrases: Vec<Count>,
    pub(crate) top_phrases: Vec<Count>,
    pub(crate) top_phrases_no_stop: Vec<Count>,
    pub(crate) per_person_phrases: Vec<PersonPhrases>,
    pub(crate) per_person_phrases_no_stop: Vec<PersonPhrases>,
    pub(crate) fun_facts: Vec<FunFact>,
    pub(crate) person_stats: Vec<PersonStat>,
    pub(crate) per_person_daily: Vec<PersonDaily>,
    pub(crate) sentiment_by_day: Vec<SentimentDay>,
    pub(crate) sentiment_overall: Vec<SentimentOverall>,
    pub(crate) conversation_starters: Vec<Count>,
    pub(crate) conversation_count: usize,
    pub(crate) journey: Option<Journey>,
}

impl Summary {
    pub fn daily_counts(&self) -> &[Count] {
        &self.daily
    }
}

#[derive(Debug, Serialize)]
pub(crate) struct PersonBuckets {
    pub(crate) name: String,
    pub(crate) messages: usize,
    pub(crate) hourly: [u32; 24],
    pub(crate) daily: [u32; 7],
    pub(crate) monthly: [u32; 12],
}

#[derive(Debug, Serialize)]
pub(crate) struct FunFact {
    pub(crate) name: String,
    pub(crate) total_words: u32,
    pub(crate) longest_message_words: u32,
    pub(crate) unique_words: u32,
    pub(crate) average_message_length: u32,
    pub(crate) top_emojis: Vec<String>,
}

#[derive(Debug, Serialize)]
pub(crate) struct PersonStat {
    pub(crate) name: String,
    pub(crate) total_words: u32,
    pub(crate) unique_words: u32,
    pub(crate) longest_message_words: u32,
    pub(crate) average_words_per_message: f32,
    pub(crate) top_emojis: Vec<Count>,
    pub(crate) dominant_color: Option<String>,
}

#[derive(Debug, Serialize)]
pub(crate) struct PersonDaily {
    pub(crate) name: String,
    pub(crate) daily: Vec<Count>,
}

#[derive(Debug, Clone, Serialize)]
pub(crate) struct PersonPhrases {
    pub(crate) name: String,
    pub(crate) phrases: Vec<Count>,
}

#[derive(Debug, Clone, Serialize)]
pub(crate) struct JourneyMessage {
    pub(crate) sender: String,
    pub(crate) text: String,
    pub(crate) timestamp: String,
    pub(crate) is_you: bool,
}

#[derive(Debug, Clone, Serialize)]
pub(crate) struct JourneyMoment {
    pub(crate) title: String,
    pub(crate) description: String,
    pub(crate) date: String,
    pub(crate) messages: Vec<JourneyMessage>,
    pub(crate) sentiment_score: f32,
}

#[derive(Debug, Clone, Serialize)]
pub(crate) struct Journey {
    pub(crate) first_day: String,
    pub(crate) last_day: String,
    pub(crate) total_days: u32,
    pub(crate) total_messages: usize,
    pub(crate) first_messages: Vec<JourneyMessage>,
    pub(crate) last_messages: Vec<JourneyMessage>,
    pub(crate) interesting_moments: Vec<JourneyMoment>,
}

#[derive(Debug, Serialize)]
pub(crate) struct SentimentDay {
    pub(crate) name: String,
    pub(crate) day: String,
    pub(crate) mean: f32,
    pub(crate) pos: u32,
    pub(crate) neu: u32,
    pub(crate) neg: u32,
}

#[derive(Debug, Serialize)]
pub(crate) struct SentimentOverall {
    pub(crate) name: String,
    pub(crate) mean: f32,
    pub(crate) pos: u32,
    pub(crate) neu: u32,
    pub(crate) neg: u32,
}

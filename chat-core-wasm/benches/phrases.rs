use criterion::{black_box, criterion_group, criterion_main, BenchmarkId, Criterion};

fn generate_chat(num_messages: usize) -> String {
    let senders = ["Alice", "Bob", "Charlie", "Diana"];
    let phrases = [
        "let's go to the park",
        "I love this weather",
        "what do you think about it",
        "see you later",
        "that sounds great",
        "I'm on my way",
        "can't wait to see you",
        "this is amazing",
        "happy birthday to you",
        "let me know when ready",
        "the quick brown fox",
        "hello world program",
        "machine learning model",
        "artificial intelligence",
        "good morning everyone",
        "have a nice day",
        "thanks for your help",
        "looking forward to it",
    ];
    let emojis = ["😀", "🎉", "❤️", "🚀", "👍", "😂", "🔥", "💯"];

    let mut lines = Vec::with_capacity(num_messages);
    for i in 0..num_messages {
        let sender = senders[i % senders.len()];
        let phrase = phrases[i % phrases.len()];
        let emoji = if i % 5 == 0 {
            emojis[i % emojis.len()]
        } else {
            ""
        };
        let hour = (8 + (i % 14)) % 24;
        let minute = i % 60;
        let day = 1 + (i % 28);
        let month = 1 + (i / 1000) % 12;
        let ampm = if hour >= 12 { "PM" } else { "AM" };
        let hour12 = if hour == 0 {
            12
        } else if hour > 12 {
            hour - 12
        } else {
            hour
        };
        lines.push(format!(
            "[{}/{}//23, {}:{:02}:00 {}] {}: {} {}",
            month, day, hour12, minute, ampm, sender, phrase, emoji
        ));
    }
    lines.join("\n")
}

fn generate_realistic_chat(num_messages: usize) -> String {
    let senders = ["Alice", "Bob", "Charlie", "Diana", "Eve", "Frank"];
    let messages = [
        "hey how are you doing today",
        "i'm good thanks for asking",
        "did you see the news about the economy",
        "yeah it's pretty crazy what's happening",
        "we should meet up sometime soon",
        "sounds great let me know when you're free",
        "how about this weekend maybe saturday",
        "saturday works for me what time",
        "let's say around noon at the usual place",
        "perfect see you then",
        "don't forget to bring the documents",
        "which documents are you talking about",
        "the ones we discussed last week",
        "oh right i'll make sure to bring them",
        "great thanks so much",
        "no problem happy to help",
        "by the way have you heard from john lately",
        "not really he's been pretty quiet",
        "i hope everything is okay with him",
        "me too we should check in on him",
        "good idea i'll send him a message",
        "let me know what he says",
        "will do talk to you later",
        "bye take care",
        "you too have a great day",
        "thanks you as well",
    ];
    let emojis = [
        "😀", "🎉", "❤️", "🚀", "👍", "😂", "🔥", "💯", "🙏", "🤔", "😊", "💪",
    ];

    let mut lines = Vec::with_capacity(num_messages);
    for i in 0..num_messages {
        let sender = senders[i % senders.len()];
        let base_msg = messages[i % messages.len()];
        let extra = if i % 7 == 0 {
            format!(" {}", emojis[i % emojis.len()])
        } else if i % 11 == 0 {
            format!(" and also something else unique_{}", i)
        } else {
            String::new()
        };
        let msg = format!("{}{}", base_msg, extra);

        let hour = (8 + (i % 14)) % 24;
        let minute = i % 60;
        let day = 1 + (i % 28);
        let month = 1 + (i / 1000) % 12;
        let ampm = if hour >= 12 { "PM" } else { "AM" };
        let hour12 = if hour == 0 {
            12
        } else if hour > 12 {
            hour - 12
        } else {
            hour
        };
        lines.push(format!(
            "[{}/{}//23, {}:{:02}:00 {}] {}: {}",
            month, day, hour12, minute, ampm, sender, msg
        ));
    }
    lines.join("\n")
}

fn bench_analyze_chat(c: &mut Criterion) {
    let mut group = c.benchmark_group("analyze_chat");

    for size in [100, 1000, 5000, 10000, 20000].iter() {
        let chat = generate_chat(*size);
        group.bench_with_input(BenchmarkId::new("messages", size), &chat, |b, chat| {
            b.iter(|| chat_core_wasm::analyze_chat_native(black_box(chat), 20, 20));
        });
    }

    group.finish();
}

fn bench_realistic_chat(c: &mut Criterion) {
    let mut group = c.benchmark_group("realistic_chat");
    group.sample_size(10);

    for size in [1000, 5000, 10000, 50000].iter() {
        let chat = generate_realistic_chat(*size);
        group.bench_with_input(BenchmarkId::new("messages", size), &chat, |b, chat| {
            b.iter(|| chat_core_wasm::analyze_chat_native(black_box(chat), 50, 50));
        });
    }

    group.finish();
}

fn bench_real_file(c: &mut Criterion) {
    // Use BENCH_FILE env var or fall back to samples/sample.txt
    let path = std::env::var("BENCH_FILE").unwrap_or_else(|_| "../samples/sample.txt".to_string());
    let chat = std::fs::read_to_string(&path).unwrap_or_else(|e| {
        panic!(
            "Failed to read {}: {}. Set BENCH_FILE env var to your chat file.",
            path, e
        )
    });

    let mut group = c.benchmark_group("real_file");
    group.sample_size(10);

    group.bench_function("full_90k_lines", |b| {
        b.iter(|| chat_core_wasm::analyze_chat_native(black_box(&chat), 50, 50));
    });

    group.finish();
}

criterion_group!(
    benches,
    bench_analyze_chat,
    bench_realistic_chat,
    bench_real_file
);
criterion_main!(benches);

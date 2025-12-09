use std::fs;
use std::time::Instant;

fn main() {
    // Relative to project root when run via `cargo run --example bench_real` from chat-core-wasm/
    let path = std::env::var("BENCH_FILE").unwrap_or_else(|_| "../samples/sample.txt".to_string());
    let raw =
        fs::read_to_string(&path).unwrap_or_else(|e| panic!("Failed to read {}: {}", path, e));
    println!("Loaded {} bytes, {} lines", raw.len(), raw.lines().count());

    // Run multiple times to get a better average
    for i in 0..3 {
        let start = Instant::now();
        match chat_core_wasm::analyze_chat_native(&raw, 20, 20) {
            Ok(json) => {
                if i == 0 {
                    println!("Success! JSON length: {}", json.len());
                }
            }
            Err(e) => {
                println!("Error: {}", e);
            }
        }
        println!("Run {}: {:?}", i + 1, start.elapsed());
    }
}

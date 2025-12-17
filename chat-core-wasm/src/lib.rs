use wasm_bindgen::prelude::*;

mod analysis;
mod journey;
mod metrics;
mod parsing;
mod phrases;
mod sentiment;
mod text;
mod types;

#[cfg(not(target_arch = "wasm32"))]
pub use analysis::analyze_chat_native;
pub use analysis::summarize;
pub use metrics::{longest_streak, longest_streak_from_raw};
pub use types::{Count, Summary};

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

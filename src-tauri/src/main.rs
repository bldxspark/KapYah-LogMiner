// File purpose: Native desktop entry point that starts the Tauri application runtime.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    drone_log_analyzer_lib::run();
}

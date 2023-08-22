// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::sync::Mutex;
use crate::config::PhotoArchiveConfig;
use crate::state::PhotoArchiveState;

mod commands;
mod state;
mod common;
mod config;

fn main() {
    let config = PhotoArchiveConfig::load_or_initialize()
        .expect("Error loading configuration");

    tauri::Builder::default()
        .manage(PhotoArchiveState {
            archive_path: Mutex::new(config.archive_dir),
        })
        .invoke_handler(tauri::generate_handler![commands::list_sources, commands::import_source, commands::sync_source])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

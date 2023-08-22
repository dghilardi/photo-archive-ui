use std::path::PathBuf;
use std::sync::Mutex;

pub struct PhotoArchiveState {
    pub archive_path: Mutex<PathBuf>,
}
use std::fs;
use std::path::PathBuf;
use anyhow::anyhow;
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct PhotoArchiveConfig {
    pub archive_dir: PathBuf,
}

impl Default for PhotoArchiveConfig {
    fn default() -> Self {
        Self {
            archive_dir: dirs::data_dir()
                .expect("Could not detect data_dir")
                .join("photo-archive"),
        }
    }
}

impl PhotoArchiveConfig {
    pub fn load_or_initialize() -> anyhow::Result<Self> {
        let config_dir = dirs::config_dir()
            .ok_or_else(|| anyhow!("Cannot load config dir"))?;

        let config_file_path = config_dir
            .join("photo-archive")
            .join("config.toml");

        if config_file_path.exists() {
            let config = toml::from_str(&std::fs::read_to_string(config_file_path)?)?;
            Ok(config)
        } else {
            let default_config = PhotoArchiveConfig::default();
            fs::create_dir_all(config_file_path.parent().expect("Could not detect conf parent dir"))?;
            fs::write(config_file_path, toml::to_string(&default_config)?)?;
            Ok(default_config)
        }
    }
}
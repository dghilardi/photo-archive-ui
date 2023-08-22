use serde::Serialize;
use thiserror::Error;

#[derive(Debug, Error, Serialize)]
pub enum PhotoArchiveError {
    #[error("Generic Error - {0}")]
    Generic(String),
}

impl From<anyhow::Error> for PhotoArchiveError {
    fn from(value: anyhow::Error) -> Self {
        Self::Generic(value.to_string())
    }
}
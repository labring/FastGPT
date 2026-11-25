use thiserror::Error;

use crate::protocol::{JsonRpcError, JsonRpcErrorCode};

pub(super) type FsResult<T> = Result<T, FsError>;

#[derive(Debug, Error)]
pub(super) enum FsError {
    #[error("Params required")]
    MissingParams,
    #[error("Invalid params: {0}")]
    InvalidParams(#[from] serde_json::Error),
    #[error(transparent)]
    Io(#[from] std::io::Error),
    #[error("Invalid file content: {0}")]
    InvalidContent(#[from] base64::DecodeError),
    #[error("Data Conflict: The file has been modified elsewhere.")]
    FileConflict,
    #[error("File is too large to {operation} ({size} bytes > {max_size} bytes)")]
    FileTooLarge {
        operation: &'static str,
        size: u64,
        max_size: u64,
    },
    #[error(
        "Disk quota exceeded ({used} bytes >= {limit} bytes). Please delete unused files to free space."
    )]
    DiskQuotaExceeded { used: u64, limit: u64 },
    #[error("Forbidden: read-only sandbox ticket")]
    PermissionDenied,
    #[error("Method not found")]
    MethodNotFound,
    #[error("{0}")]
    Message(String),
}

impl FsError {
    pub(super) fn message(message: impl Into<String>) -> Self {
        Self::Message(message.into())
    }

    const fn code(&self) -> JsonRpcErrorCode {
        match self {
            Self::FileConflict => JsonRpcErrorCode::FileConflict,
            Self::FileTooLarge { .. } => JsonRpcErrorCode::FileTooLarge,
            Self::DiskQuotaExceeded { .. } => JsonRpcErrorCode::DiskQuotaExceeded,
            Self::PermissionDenied => JsonRpcErrorCode::PermissionDenied,
            Self::MethodNotFound => JsonRpcErrorCode::MethodNotFound,
            Self::MissingParams
            | Self::InvalidParams(_)
            | Self::Io(_)
            | Self::InvalidContent(_)
            | Self::Message(_) => JsonRpcErrorCode::InternalError,
        }
    }
}

impl From<FsError> for JsonRpcError {
    fn from(error: FsError) -> Self {
        Self {
            code: error.code(),
            message: error.to_string(),
        }
    }
}

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

    fn code(&self) -> JsonRpcErrorCode {
        match self {
            Self::FileConflict => JsonRpcErrorCode::FileConflict,
            Self::FileTooLarge { .. } => JsonRpcErrorCode::FileTooLarge,
            Self::DiskQuotaExceeded { .. } => JsonRpcErrorCode::DiskQuotaExceeded,
            Self::Io(err)
                if matches!(
                    err.kind(),
                    std::io::ErrorKind::StorageFull | std::io::ErrorKind::QuotaExceeded
                ) =>
            {
                JsonRpcErrorCode::DiskQuotaExceeded
            }
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn maps_disk_full_io_errors_to_disk_quota_exceeded() {
        for kind in [
            std::io::ErrorKind::StorageFull,
            std::io::ErrorKind::QuotaExceeded,
        ] {
            let err = JsonRpcError::from(FsError::Io(std::io::Error::new(kind, "disk full")));
            assert_eq!(err.code, JsonRpcErrorCode::DiskQuotaExceeded);
        }

        #[cfg(unix)]
        for raw in [libc::ENOSPC, libc::EDQUOT] {
            let err = JsonRpcError::from(FsError::Io(std::io::Error::from_raw_os_error(raw)));
            assert_eq!(err.code, JsonRpcErrorCode::DiskQuotaExceeded);
        }

        let other = JsonRpcError::from(FsError::Io(std::io::Error::new(
            std::io::ErrorKind::PermissionDenied,
            "denied",
        )));
        assert_eq!(other.code, JsonRpcErrorCode::InternalError);
    }
}

use thiserror::Error;
use tokio_tungstenite::tungstenite::Error as WsError;

use crate::error::AuthError;

pub(super) type RelayResult<T> = Result<T, RelayError>;

/// Relay setup errors retain their original source while presenting stable operator-facing text.
#[derive(Debug, Error)]
pub(super) enum RelayError {
    #[error("Invalid sandbox endpoint: {0}")]
    InvalidEndpoint(&'static str),
    #[error(transparent)]
    RefreshAuth(#[from] AuthError),
    #[error("Failed to build WebSocket request: {source}")]
    WebSocketRequest {
        #[source]
        source: WsError,
    },
    #[error(
        "Upstream returned a non-101 HTTP error (e.g. 401 Unauthorized or 502 Bad Gateway). This typically means the sandboxed agent has not fully started up yet, or failed to bind to its port 1318."
    )]
    UpstreamNotReady {
        #[source]
        source: WsError,
    },
    #[error("Failed to connect upstream after {attempts} attempts: {source}")]
    UpstreamConnect {
        attempts: u8,
        #[source]
        source: WsError,
    },
}

impl RelayError {
    /// Distinguishes an HTTP handshake response from transport-level connection failures.
    pub(super) fn upstream_connect(attempts: u8, source: WsError) -> Self {
        if matches!(&source, WsError::Http(_)) {
            Self::UpstreamNotReady { source }
        } else {
            Self::UpstreamConnect { attempts, source }
        }
    }
}

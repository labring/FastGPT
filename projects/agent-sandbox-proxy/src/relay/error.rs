use thiserror::Error;
use tokio_tungstenite::tungstenite::Error as WsError;

pub(super) type RelayResult<T> = Result<T, RelayError>;

/// Relay setup errors retain their original source while presenting stable operator-facing text.
#[derive(Debug, Error)]
pub(super) enum RelayError {
    #[error("Sandbox endpoint URL is empty")]
    EmptyEndpoint,
    #[error("Invalid sandbox endpoint URL: {source}")]
    InvalidEndpoint {
        #[source]
        source: url::ParseError,
    },
    #[error("Invalid workspace preview path")]
    InvalidPreviewPath,
    #[error("Sandbox endpoint cannot be used as a base URL")]
    EndpointCannotBeBase,
    #[error("Invalid loopback rewrite host: {host}")]
    InvalidRewriteHost { host: String },
    #[error("Unsupported sandbox endpoint scheme: {scheme}")]
    UnsupportedEndpointScheme { scheme: String },
    #[error("Failed to set sandbox endpoint scheme to {scheme}")]
    EndpointSchemeRewrite { scheme: &'static str },
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

#[cfg(test)]
mod tests {
    use super::RelayError;
    use tokio_tungstenite::tungstenite::{Error as WsError, http::Response};

    #[test]
    fn classifies_http_handshake_response_as_not_ready() {
        let response = Response::builder().status(502).body(None).unwrap();
        let error = RelayError::upstream_connect(10, WsError::Http(Box::new(response)));

        assert!(matches!(error, RelayError::UpstreamNotReady { .. }));
    }

    #[test]
    fn classifies_transport_failure_as_connect_error() {
        let source = std::io::Error::new(std::io::ErrorKind::ConnectionRefused, "refused");
        let error = RelayError::upstream_connect(10, WsError::Io(source));

        assert!(matches!(
            error,
            RelayError::UpstreamConnect { attempts: 10, .. }
        ));
    }
}

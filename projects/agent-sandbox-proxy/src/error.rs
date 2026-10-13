use axum::{
    body::Body,
    http::{
        StatusCode,
        header::{CACHE_CONTROL, CONTENT_TYPE, REFERRER_POLICY, X_CONTENT_TYPE_OPTIONS},
    },
    response::{IntoResponse, Response},
};
use thiserror::Error;
use tracing::warn;

/**
 * 构造统一的安全 HTTP 错误响应。
 *
 * 注入全套安全响应头（`text/plain; charset=utf-8`、`private, no-store`、`nosniff`、`no-referrer`），
 * 对外返回静态通用文案，防止客户端通过响应差异、MIME 嗅探或缓存推断内部运行状态。
 */
pub fn safe_error_response(status: StatusCode, message: &'static str) -> Response<Body> {
    let mut response = Response::new(Body::from(message));
    *response.status_mut() = status;
    response.headers_mut().insert(
        CONTENT_TYPE,
        axum::http::HeaderValue::from_static("text/plain; charset=utf-8"),
    );
    response.headers_mut().insert(
        CACHE_CONTROL,
        axum::http::HeaderValue::from_static("private, no-store"),
    );
    response.headers_mut().insert(
        REFERRER_POLICY,
        axum::http::HeaderValue::from_static("no-referrer"),
    );
    response.headers_mut().insert(
        X_CONTENT_TYPE_OPTIONS,
        axum::http::HeaderValue::from_static("nosniff"),
    );
    response
}

/**
 * WebSocket 鉴权领域错误。
 *
 * 记录底层验证与寻址失败根因，在实现 `IntoResponse` 时收敛为恒定无歧义的通用响应（401 / 403），
 * 阻断 Error Oracle 与指纹泄露。
 */
#[derive(Debug, Error)]
pub enum AuthError {
    #[error("Ticket is missing")]
    MissingTicket,

    #[error("JWT validation error: {0}")]
    Jwt(#[from] jsonwebtoken::errors::Error),

    #[error("Ticket channel mismatch: expected {expected}, got {actual}")]
    ChannelMismatch {
        expected: &'static str,
        actual: String,
    },

    #[error("Channel '{channel}' requires write permission")]
    PermissionDenied { channel: &'static str },

    #[error("Sandbox address resolution failed: {0}")]
    ResolutionFailed(String),
}

impl IntoResponse for AuthError {
    fn into_response(self) -> Response {
        warn!(error = %self, "[Auth] Authentication rejected");

        match self {
            AuthError::MissingTicket
            | AuthError::Jwt(_)
            | AuthError::ChannelMismatch { .. }
            | AuthError::PermissionDenied { .. } => {
                safe_error_response(StatusCode::UNAUTHORIZED, "Unauthorized")
            }
            AuthError::ResolutionFailed(_) => {
                safe_error_response(StatusCode::FORBIDDEN, "Forbidden")
            }
        }
    }
}

/**
 * Preview 文件代理领域错误。
 *
 * 封装预览凭证校验、沙盒寻址与上游 HTTP 代理转发过程中的错误，
 * 对外收敛映射为通用安全的 HTTP 响应，杜绝底层路径、内部地址与上游堆栈泄漏。
 */
#[derive(Debug, Error)]
pub enum PreviewError {
    #[error("Invalid preview session id: {0}")]
    InvalidSessionId(&'static str),

    #[error("Preview session resolution failed: {0}")]
    ResolutionFailed(String),

    #[error("Missing upstream credentials: {0}")]
    MissingCredentials(&'static str),

    #[error("Invalid preview request: {0}")]
    InvalidRequest(String),

    #[error("Failed to connect sandbox preview service: {0}")]
    UpstreamConnect(String),

    #[error("Sandbox preview upstream returned status: {0}")]
    UpstreamStatus(StatusCode),
}

impl IntoResponse for PreviewError {
    fn into_response(self) -> Response {
        warn!(error = %self, "[Preview] Request rejected or upstream failed");

        match self {
            PreviewError::InvalidSessionId(_) => {
                safe_error_response(StatusCode::UNAUTHORIZED, "Unauthorized preview session")
            }
            PreviewError::ResolutionFailed(_) => {
                safe_error_response(StatusCode::FORBIDDEN, "Preview session resolution failed")
            }
            PreviewError::InvalidRequest(_) => {
                safe_error_response(StatusCode::BAD_REQUEST, "Invalid preview request")
            }
            PreviewError::MissingCredentials(_)
            | PreviewError::UpstreamConnect(_)
            | PreviewError::UpstreamStatus(_) => {
                safe_error_response(StatusCode::BAD_GATEWAY, "Sandbox preview is unavailable")
            }
        }
    }
}

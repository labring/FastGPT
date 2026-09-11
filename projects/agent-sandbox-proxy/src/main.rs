use axum::{
    Router,
    body::Body,
    extract::{Path, Query, ws::WebSocketUpgrade},
    http::{HeaderMap, Method},
    response::{IntoResponse, Response},
    routing::get,
};
use serde::Deserialize;
use std::net::SocketAddr;
use tracing::{error, info};

mod auth;
mod error;
mod preview;
mod relay;

use auth::{
    invalidate_cached_preview_sandbox_address, resolve_cached_preview_sandbox_address,
    resolve_sandbox_address,
};
use error::{AuthError, PreviewError};
use preview::proxy_preview_file;
use relay::handle_relay;

const DEFAULT_PORT: u16 = 1006;

#[derive(Deserialize)]
struct WsQuery {
    ticket: Option<String>,
}

#[derive(Deserialize)]
struct PreviewPath {
    sandbox_id: String,
    session_id: String,
    path: String,
}

#[tokio::main]
async fn main() {
    dotenvy::from_filename(".env.local").ok();
    dotenvy::dotenv().ok();

    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "info,fastgpt_agent_sandbox_proxy=debug".into()),
        )
        .init();

    let port = get_listener_port("PORT", DEFAULT_PORT);
    let preview_port = get_listener_port("PREVIEW_PORT", port);

    if port == preview_port {
        info!("FastGPT Agent Sandbox Proxy listening on port {}", port);
        serve_on_port(port, combined_router())
            .await
            .expect("Server encountered a fatal error");
        return;
    }

    info!(
        "FastGPT Agent Sandbox Proxy listening on WebSocket port {} and preview port {}",
        port, preview_port
    );
    tokio::try_join!(
        serve_on_port(port, websocket_router()),
        serve_on_port(preview_port, preview_router())
    )
    .expect("Server encountered a fatal error");
}

fn websocket_router() -> Router {
    Router::new()
        .route("/health", get(health_check))
        .route("/fs", get(fs_handler))
        .route("/terminal", get(terminal_handler))
}

fn preview_router() -> Router {
    Router::new().route("/health", get(health_check)).route(
        "/preview/{sandbox_id}/{session_id}/{*path}",
        get(preview_handler).head(preview_handler),
    )
}

fn combined_router() -> Router {
    websocket_router().route(
        "/preview/{sandbox_id}/{session_id}/{*path}",
        get(preview_handler).head(preview_handler),
    )
}

fn get_listener_port(name: &str, default_port: u16) -> u16 {
    std::env::var(name)
        .ok()
        .and_then(|p| p.parse().ok())
        .unwrap_or(default_port)
}

/** 在指定端口运行一个独立 Router；不同协议端口由 main 并发托管。 */
async fn serve_on_port(port: u16, app: Router) -> std::io::Result<()> {
    let addr = SocketAddr::new(
        std::net::IpAddr::V4(std::net::Ipv4Addr::new(0, 0, 0, 0)),
        port,
    );
    let listener = tokio::net::TcpListener::bind(addr).await?;
    axum::serve(listener, app).await
}

async fn health_check() -> &'static str {
    "OK"
}

/**
 * 统一授权与地址置换辅助函数。
 *
 * 验证 WebSocket ticket 并向 FastGPT 主站置换出真实的沙盒物理端点寻址信息。
 * 错误收敛为领域级 `AuthError`，在 API 边界统一转换为安全响应，避免底层细节泄露。
 */
async fn verify_and_resolve_auth(
    ticket_opt: Option<String>,
    expected_channel: &'static str,
) -> Result<(auth::SandboxAddress, auth::Claims), AuthError> {
    let ticket = ticket_opt
        .filter(|t| !t.is_empty())
        .ok_or(AuthError::MissingTicket)?;

    let claims = verify_ticket_for_channel(&ticket, expected_channel)?;
    let address = resolve_sandbox_address(&ticket)
        .await
        .map_err(AuthError::ResolutionFailed)?;

    Ok((address, claims))
}

/**
 * 校验 Ticket 对应的频道 (fs/terminal) 及写权限要求。
 */
fn verify_ticket_for_channel(
    ticket: &str,
    expected_channel: &'static str,
) -> Result<auth::Claims, AuthError> {
    let claims = auth::verify_jwt_ticket(ticket)?;
    if claims.channel != expected_channel {
        return Err(AuthError::ChannelMismatch {
            expected: expected_channel,
            actual: claims.channel,
        });
    }
    if expected_channel == "terminal" && claims.permission != "write" {
        return Err(AuthError::PermissionDenied {
            channel: expected_channel,
        });
    }
    Ok(claims)
}

fn verify_preview_session_id(sandbox_id: &str, session_id: &str) -> Result<(), PreviewError> {
    let Some((source_prefix, sandbox_hash)) = sandbox_id.split_once('-') else {
        return Err(PreviewError::InvalidSessionId("invalid sandbox id format"));
    };
    let hash_bytes = sandbox_hash.as_bytes();
    let session_bytes = session_id.as_bytes();
    if !matches!(source_prefix, "app" | "skilledit")
        || hash_bytes.len() != 16
        || !hash_bytes
            .iter()
            .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(byte))
        || session_bytes.len() != 24
        || !session_bytes[0].is_ascii_lowercase()
        || !session_bytes
            .iter()
            .all(|byte| byte.is_ascii_alphanumeric())
    {
        return Err(PreviewError::InvalidSessionId("invalid session format"));
    }
    Ok(())
}

async fn fs_handler(
    ws: WebSocketUpgrade,
    Query(query): Query<WsQuery>,
) -> Result<Response, AuthError> {
    let (address, claims) = verify_and_resolve_auth(query.ticket, "fs").await?;
    info!("[Auth] Ticket verified & address resolved successfully. Upgrading to WebSocket (FS)...");
    let ws_limits = address.ws_limits;
    Ok(ws
        .max_message_size(ws_limits.max_message_bytes)
        .max_frame_size(ws_limits.max_frame_bytes)
        .on_upgrade(move |socket| handle_relay(socket, address, claims, false))
        .into_response())
}

async fn terminal_handler(
    ws: WebSocketUpgrade,
    Query(query): Query<WsQuery>,
) -> Result<Response, AuthError> {
    let (address, claims) = verify_and_resolve_auth(query.ticket, "terminal").await?;
    info!(
        "[Auth] Ticket verified & address resolved successfully. Upgrading to WebSocket (TERMINAL)..."
    );
    let ws_limits = address.ws_limits;
    Ok(ws
        .max_message_size(ws_limits.max_message_bytes)
        .max_frame_size(ws_limits.max_frame_bytes)
        .on_upgrade(move |socket| handle_relay(socket, address, claims, true))
        .into_response())
}

async fn preview_handler(
    Path(params): Path<PreviewPath>,
    method: Method,
    headers: HeaderMap,
) -> Result<Response<Body>, PreviewError> {
    verify_preview_session_id(&params.sandbox_id, &params.session_id)?;
    let preview_credential = format!("{}:{}", params.sandbox_id, params.session_id);

    let address = resolve_cached_preview_sandbox_address(&preview_credential)
        .await
        .map_err(PreviewError::ResolutionFailed)?;

    match proxy_preview_file(&address, &params.path, &method, &headers).await {
        Ok(response) => Ok(response),
        Err(first_error) => {
            error!("[Preview] Cached upstream request failed: {}", first_error);
            invalidate_cached_preview_sandbox_address(&preview_credential).await;

            let fresh_address = resolve_cached_preview_sandbox_address(&preview_credential)
                .await
                .map_err(PreviewError::ResolutionFailed)?;

            proxy_preview_file(&fresh_address, &params.path, &method, &headers).await
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_preview_session_ids() {
        assert!(
            verify_preview_session_id("app-0123456789abcdef", "a12345678901234567890123").is_ok()
        );
        assert!(
            verify_preview_session_id("skilledit-0123456789abcdef", "a12345678901234567890123")
                .is_ok()
        );
    }

    #[test]
    fn rejects_invalid_preview_session_ids() {
        assert!(matches!(
            verify_preview_session_id("short", "a12345678901234567890123"),
            Err(PreviewError::InvalidSessionId(_))
        ));
        assert!(matches!(
            verify_preview_session_id("0123456789abcdef", "a12345678901234567890123"),
            Err(PreviewError::InvalidSessionId(_))
        ));
        assert!(matches!(
            verify_preview_session_id("other-0123456789abcdef", "a12345678901234567890123"),
            Err(PreviewError::InvalidSessionId(_))
        ));
        assert!(matches!(
            verify_preview_session_id("app-0123456789abcdef", "A12345678901234567890123"),
            Err(PreviewError::InvalidSessionId(_))
        ));
        assert!(matches!(
            verify_preview_session_id("app-0123456789abcdef", "a1234567890123456789012-"),
            Err(PreviewError::InvalidSessionId(_))
        ));
        assert!(matches!(
            verify_preview_session_id("app-0123456789abcdeG", "a12345678901234567890123"),
            Err(PreviewError::InvalidSessionId(_))
        ));
        assert!(matches!(
            verify_ticket_for_channel("a12345678901234567890123", "fs"),
            Err(AuthError::Jwt(_))
        ));
    }
}

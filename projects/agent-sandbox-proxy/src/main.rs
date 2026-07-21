use axum::{
    Router,
    body::Body,
    extract::{Path, Query, ws::WebSocketUpgrade},
    http::{HeaderMap, Method, StatusCode},
    response::{IntoResponse, Response},
    routing::get,
};
use serde::Deserialize;
use std::net::SocketAddr;
use tracing::{error, info};

mod auth;
mod preview;
mod relay;

use auth::{
    invalidate_cached_sandbox_address, resolve_cached_sandbox_address, resolve_sandbox_address,
};
use preview::{bad_gateway_response, preview_error_response, proxy_preview_file};
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

/// 统一授权与地址置换辅助函数
async fn verify_and_resolve_auth(
    ticket_opt: Option<String>,
    expected_channel: &'static str,
) -> Result<(auth::SandboxAddress, auth::Claims), (StatusCode, String)> {
    let ticket = match ticket_opt {
        Some(t) if !t.is_empty() => t,
        _ => {
            error!("[Auth] Ticket missing in WebSocket upgrade request.");
            return Err((
                StatusCode::UNAUTHORIZED,
                "Unauthorized: ticket is required".to_string(),
            ));
        }
    };

    let claims = verify_ticket_for_channel(&ticket, expected_channel).map_err(|err| {
        error!("[Auth] Local JWT verification failed: {}", err);
        (StatusCode::UNAUTHORIZED, format!("Unauthorized: {}", err))
    })?;

    let address = resolve_sandbox_address(&ticket).await.map_err(|err| {
        error!("[Auth] Ticket resolution failed: {}", err);
        (StatusCode::FORBIDDEN, format!("Forbidden: {}", err))
    })?;

    Ok((address, claims))
}

fn verify_ticket_for_channel(
    ticket: &str,
    expected_channel: &'static str,
) -> Result<auth::Claims, String> {
    let claims = auth::verify_jwt_ticket(ticket)?;
    if claims.channel != expected_channel {
        return Err("ticket channel mismatch".to_string());
    }
    if expected_channel == "terminal" && claims.permission != "write" {
        return Err("terminal ticket requires write permission".to_string());
    }
    Ok(claims)
}

fn verify_preview_session_id(sandbox_id: &str, session_id: &str) -> Result<(), String> {
    let sandbox_bytes = sandbox_id.as_bytes();
    let session_bytes = session_id.as_bytes();
    if sandbox_bytes.len() != 16
        || !sandbox_bytes
            .iter()
            .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(byte))
        || session_bytes.len() != 24
        || !session_bytes[0].is_ascii_lowercase()
        || !session_bytes
            .iter()
            .all(|byte| byte.is_ascii_alphanumeric())
    {
        return Err("invalid preview session id".to_string());
    }
    Ok(())
}

async fn fs_handler(ws: WebSocketUpgrade, Query(query): Query<WsQuery>) -> impl IntoResponse {
    match verify_and_resolve_auth(query.ticket, "fs").await {
        Ok((address, claims)) => {
            info!(
                "[Auth] Ticket verified & address resolved successfully. Upgrading to WebSocket (FS)..."
            );
            let ws_limits = address.ws_limits;
            ws.max_message_size(ws_limits.max_message_bytes)
                .max_frame_size(ws_limits.max_frame_bytes)
                .on_upgrade(move |socket| handle_relay(socket, address, claims, false))
                .into_response()
        }
        Err((status, err_msg)) => (status, err_msg).into_response(),
    }
}

async fn terminal_handler(ws: WebSocketUpgrade, Query(query): Query<WsQuery>) -> impl IntoResponse {
    match verify_and_resolve_auth(query.ticket, "terminal").await {
        Ok((address, claims)) => {
            info!(
                "[Auth] Ticket verified & address resolved successfully. Upgrading to WebSocket (TERMINAL)..."
            );
            let ws_limits = address.ws_limits;
            ws.max_message_size(ws_limits.max_message_bytes)
                .max_frame_size(ws_limits.max_frame_bytes)
                .on_upgrade(move |socket| handle_relay(socket, address, claims, true))
                .into_response()
        }
        Err((status, err_msg)) => (status, err_msg).into_response(),
    }
}

async fn preview_handler(
    Path(params): Path<PreviewPath>,
    method: Method,
    headers: HeaderMap,
) -> Response<Body> {
    if let Err(error) = verify_preview_session_id(&params.sandbox_id, &params.session_id) {
        error!("[Preview] Session validation failed: {}", error);
        return preview_error_response(StatusCode::UNAUTHORIZED, "Unauthorized preview session");
    }
    let preview_credential = format!("{}:{}", params.sandbox_id, params.session_id);

    let address = match resolve_cached_sandbox_address(&preview_credential).await {
        Ok(address) => address,
        Err(error) => {
            error!("[Preview] Session resolution failed: {}", error);
            return preview_error_response(
                StatusCode::FORBIDDEN,
                "Preview session resolution failed",
            );
        }
    };

    match proxy_preview_file(&address, &params.path, &method, &headers).await {
        Ok(response) => response,
        Err(first_error) => {
            error!("[Preview] Cached upstream request failed: {}", first_error);
            invalidate_cached_sandbox_address(&preview_credential).await;

            let fresh_address = match resolve_cached_sandbox_address(&preview_credential).await {
                Ok(address) => address,
                Err(error) => {
                    error!("[Preview] Upstream re-resolution failed: {}", error);
                    return bad_gateway_response();
                }
            };
            proxy_preview_file(&fresh_address, &params.path, &method, &headers)
                .await
                .unwrap_or_else(|error| {
                    error!("[Preview] Upstream retry failed: {}", error);
                    bad_gateway_response()
                })
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_preview_session_ids() {
        assert!(verify_preview_session_id("0123456789abcdef", "a12345678901234567890123").is_ok());
    }

    #[test]
    fn rejects_invalid_preview_session_ids() {
        assert!(verify_preview_session_id("short", "a12345678901234567890123").is_err());
        assert!(verify_preview_session_id("0123456789abcdef", "A12345678901234567890123").is_err());
        assert!(verify_preview_session_id("0123456789abcdef", "a1234567890123456789012-").is_err());
        assert!(verify_preview_session_id("0123456789abcdeG", "a12345678901234567890123").is_err());
        assert!(verify_ticket_for_channel("a12345678901234567890123", "fs").is_err());
    }
}

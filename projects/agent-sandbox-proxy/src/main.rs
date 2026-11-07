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
        "/preview/{session_id}/{*path}",
        get(preview_handler).head(preview_handler),
    )
}

fn combined_router() -> Router {
    websocket_router().route(
        "/preview/{session_id}/{*path}",
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

/** 仅校验随机 token 格式；来源、沙盒归属与有效期统一由主站根据 session 解析。 */
fn verify_preview_session_id(session_id: &str) -> Result<(), PreviewError> {
    let session_bytes = session_id.as_bytes();
    if session_bytes.len() != 24
        || !session_bytes[0].is_ascii_lowercase()
        || !session_bytes
            .iter()
            .all(|byte| byte.is_ascii_alphanumeric())
    {
        return Err(PreviewError::InvalidSessionId("invalid session format"));
    }
    Ok(())
}

/**
 * 解析新旧 Preview 路径，旧链接保留 sandboxId:sessionId 凭证交给主站校验。
 *
 * 两种格式共用通配路由，避免旧路径与新链接的多层资源路径冲突；新 token 不含连字符，
 * 旧 sandboxId 必须符合历史格式，不能根据客户端路径推断或授予 Sandbox 访问权限。
 */
fn resolve_preview_request(params: &PreviewPath) -> Result<(String, &str), PreviewError> {
    if verify_preview_session_id(&params.session_id).is_ok() {
        return Ok((params.session_id.clone(), &params.path));
    }

    let Some((source_prefix, sandbox_hash)) = params.session_id.split_once('-') else {
        return Err(PreviewError::InvalidSessionId("invalid session format"));
    };
    if !matches!(source_prefix, "app" | "skilledit")
        || sandbox_hash.len() != 16
        || !sandbox_hash
            .bytes()
            .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
    {
        return Err(PreviewError::InvalidSessionId("invalid sandbox id format"));
    }

    let (session_id, path) = params
        .path
        .split_once('/')
        .filter(|(_, path)| !path.is_empty())
        .ok_or_else(|| PreviewError::InvalidRequest("Preview file path is missing".to_string()))?;
    verify_preview_session_id(session_id)?;

    Ok((format!("{}:{}", params.session_id, session_id), path))
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
    let (credential, path) = resolve_preview_request(&params)?;

    let address = resolve_cached_preview_sandbox_address(&credential)
        .await
        .map_err(PreviewError::ResolutionFailed)?;

    match proxy_preview_file(&address, path, &method, &headers).await {
        Ok(response) => Ok(response),
        Err(first_error) => {
            error!("[Preview] Cached upstream request failed: {}", first_error);
            invalidate_cached_preview_sandbox_address(&credential).await;

            let fresh_address = resolve_cached_preview_sandbox_address(&credential)
                .await
                .map_err(PreviewError::ResolutionFailed)?;

            proxy_preview_file(&fresh_address, path, &method, &headers).await
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_preview_session_ids() {
        assert!(verify_preview_session_id("a12345678901234567890123").is_ok());
        assert!(verify_preview_session_id("zAbCdEfGhIjKlMnOpQrStUv9").is_ok());
    }

    #[test]
    fn rejects_invalid_preview_session_ids() {
        for session_id in [
            "",
            "a1234567890123456789012",
            "a123456789012345678901234",
            "A12345678901234567890123",
            "112345678901234567890123",
            "a1234567890123456789012-",
            "a1234567890123456789012_",
            "a1234567890123456789012é",
            "a1234567890123456789012\n",
            "app-0123456789abcdef:a12345678901234567890123",
        ] {
            assert!(matches!(
                verify_preview_session_id(session_id),
                Err(PreviewError::InvalidSessionId(_))
            ));
        }
    }

    #[test]
    fn resolves_current_preview_paths_without_consuming_file_segments() {
        for path in [
            "index.html",
            "dist/assets/app.js",
            "app-0123456789abcdef/index.html",
        ] {
            let params = PreviewPath {
                session_id: "a12345678901234567890123".to_string(),
                path: path.to_string(),
            };
            assert_eq!(
                resolve_preview_request(&params).unwrap(),
                ("a12345678901234567890123".to_string(), path)
            );
        }
    }

    #[test]
    fn resolves_legacy_preview_paths_and_relative_assets() {
        for sandbox_id in ["app-0123456789abcdef", "skilledit-0123456789abcdef"] {
            for path in ["index.html", "dist/assets/app.js", "test dir/预览.html"] {
                let params = PreviewPath {
                    session_id: sandbox_id.to_string(),
                    path: format!("a12345678901234567890123/{path}"),
                };
                assert_eq!(
                    resolve_preview_request(&params).unwrap(),
                    (format!("{sandbox_id}:a12345678901234567890123"), path)
                );
            }
        }
    }

    #[test]
    fn rejects_malformed_legacy_preview_credentials() {
        for sandbox_id in [
            "other-0123456789abcdef",
            "app-0123456789abcdeG",
            "app-0123456789abcde",
            "app-0123456789abcdef0",
            "app-0123456789abcdef:extra",
        ] {
            let params = PreviewPath {
                session_id: sandbox_id.to_string(),
                path: "a12345678901234567890123/index.html".to_string(),
            };
            assert!(matches!(
                resolve_preview_request(&params),
                Err(PreviewError::InvalidSessionId(_))
            ));
        }

        for session_id in [
            "invalid",
            "A12345678901234567890123",
            "a1234567890123456789012-",
        ] {
            let params = PreviewPath {
                session_id: "app-0123456789abcdef".to_string(),
                path: format!("{session_id}/index.html"),
            };
            assert!(matches!(
                resolve_preview_request(&params),
                Err(PreviewError::InvalidSessionId(_))
            ));
        }
    }

    #[test]
    fn rejects_legacy_preview_paths_without_a_file() {
        for path in ["a12345678901234567890123", "a12345678901234567890123/"] {
            let params = PreviewPath {
                session_id: "app-0123456789abcdef".to_string(),
                path: path.to_string(),
            };
            assert!(matches!(
                resolve_preview_request(&params),
                Err(PreviewError::InvalidRequest(_))
            ));
        }
    }
}

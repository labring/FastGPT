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

#[derive(Deserialize)]
struct WsQuery {
    ticket: Option<String>,
}

#[derive(Deserialize)]
struct PreviewPath {
    ticket: String,
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

    let app = Router::new()
        .route("/health", get(health_check))
        .route("/fs", get(fs_handler))
        .route("/terminal", get(terminal_handler))
        .route(
            "/preview/{ticket}/{*path}",
            get(preview_handler).head(preview_handler),
        );

    let port: u16 = std::env::var("PORT")
        .ok()
        .and_then(|p| p.parse().ok())
        .unwrap_or(1006);
    let addr = SocketAddr::new(
        std::net::IpAddr::V4(std::net::Ipv4Addr::new(0, 0, 0, 0)),
        port,
    );

    info!(
        "FastGPT Rust Agent Sandbox Proxy starting up on port {}",
        port
    );

    let listener = tokio::net::TcpListener::bind(addr)
        .await
        .expect("Failed to bind to server address");

    axum::serve(listener, app)
        .await
        .expect("Server encountered a fatal error during execution");
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
    if expected_channel == "preview" && claims.permission != "read" {
        return Err("preview ticket requires read permission".to_string());
    }
    Ok(claims)
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
    if let Err(error) = verify_ticket_for_channel(&params.ticket, "preview") {
        error!("[Preview] Ticket verification failed: {}", error);
        return preview_error_response(StatusCode::UNAUTHORIZED, "Unauthorized preview ticket");
    }

    let address = match resolve_cached_sandbox_address(&params.ticket).await {
        Ok(address) => address,
        Err(error) => {
            error!("[Preview] Ticket resolution failed: {}", error);
            return preview_error_response(
                StatusCode::FORBIDDEN,
                "Preview ticket resolution failed",
            );
        }
    };

    match proxy_preview_file(&address, &params.path, &method, &headers).await {
        Ok(response) => response,
        Err(first_error) => {
            error!("[Preview] Cached upstream request failed: {}", first_error);
            invalidate_cached_sandbox_address(&params.ticket).await;

            let fresh_address = match resolve_cached_sandbox_address(&params.ticket).await {
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
    use jsonwebtoken::{EncodingKey, Header, encode};
    use std::time::{SystemTime, UNIX_EPOCH};

    fn preview_ticket(permission: &str) -> String {
        auth::init_test_proxy_secret();
        let exp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_secs()
            + 60;
        encode(
            &Header::default(),
            &auth::Claims {
                source_type: "app".to_string(),
                source_id: "app-id".to_string(),
                user_id: "user-id".to_string(),
                chat_id: "chat-id".to_string(),
                team_id: "team-id".to_string(),
                channel: "preview".to_string(),
                permission: permission.to_string(),
                exp,
            },
            &EncodingKey::from_secret(auth::get_proxy_secret().as_bytes()),
        )
        .unwrap()
    }

    #[test]
    fn accepts_read_only_preview_tickets() {
        let ticket = preview_ticket("read");
        let claims = verify_ticket_for_channel(&ticket, "preview").unwrap();
        assert_eq!(claims.channel, "preview");
        assert_eq!(claims.permission, "read");
    }

    #[test]
    fn rejects_preview_write_permission_and_channel_mismatch() {
        let ticket = preview_ticket("write");
        assert!(verify_ticket_for_channel(&ticket, "preview").is_err());
        assert!(verify_ticket_for_channel(&ticket, "fs").is_err());
    }
}

use axum::{
    Router,
    extract::{Query, ws::WebSocketUpgrade},
    http::StatusCode,
    response::IntoResponse,
    routing::get,
};
use serde::Deserialize;
use std::net::SocketAddr;
use tracing::{error, info};

mod auth;
mod relay;

use auth::resolve_sandbox_address;
use relay::handle_relay;

const MAX_WS_MESSAGE_SIZE: usize = 16 * 1024 * 1024;
const MAX_WS_FRAME_SIZE: usize = 4 * 1024 * 1024;

#[derive(Deserialize)]
struct WsQuery {
    ticket: Option<String>,
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
        .route("/terminal", get(terminal_handler));

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

    let claims = auth::verify_jwt_ticket(&ticket).map_err(|err| {
        error!("[Auth] Local JWT verification failed: {}", err);
        (StatusCode::UNAUTHORIZED, format!("Unauthorized: {}", err))
    })?;

    if claims.channel != expected_channel {
        error!(
            "[Auth] JWT channel mismatch. expected: {}, actual: {}",
            expected_channel, claims.channel
        );
        return Err((
            StatusCode::UNAUTHORIZED,
            "Unauthorized: ticket channel mismatch".to_string(),
        ));
    }

    if expected_channel == "terminal" && claims.permission != "write" {
        error!(
            "[Auth] JWT terminal permission mismatch. actual: {}",
            claims.permission
        );
        return Err((
            StatusCode::UNAUTHORIZED,
            "Unauthorized: terminal ticket requires write permission".to_string(),
        ));
    }

    let address = resolve_sandbox_address(&ticket).await.map_err(|err| {
        error!("[Auth] Ticket resolution failed: {}", err);
        (StatusCode::FORBIDDEN, format!("Forbidden: {}", err))
    })?;

    Ok((address, claims))
}

async fn fs_handler(ws: WebSocketUpgrade, Query(query): Query<WsQuery>) -> impl IntoResponse {
    match verify_and_resolve_auth(query.ticket, "fs").await {
        Ok((address, claims)) => {
            info!(
                "[Auth] Ticket verified & address resolved successfully. Upgrading to WebSocket (FS)..."
            );
            ws.max_message_size(MAX_WS_MESSAGE_SIZE)
                .max_frame_size(MAX_WS_FRAME_SIZE)
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
            ws.max_message_size(MAX_WS_MESSAGE_SIZE)
                .max_frame_size(MAX_WS_FRAME_SIZE)
                .on_upgrade(move |socket| handle_relay(socket, address, claims, true))
                .into_response()
        }
        Err((status, err_msg)) => (status, err_msg).into_response(),
    }
}

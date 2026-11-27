use axum::{
    Router,
    body::Body,
    extract::{Path, Query, State, ws::WebSocketUpgrade},
    http::{HeaderMap, Method, StatusCode},
    response::{IntoResponse, Response},
    routing::get,
};
use serde::Deserialize;
use std::net::SocketAddr;
use tracing::{info, warn};

mod auth;
mod endpoint;
mod error;
mod preview;
mod relay;

use auth::{
    authenticate_ws_ticket, refresh_preview_sandbox_address, resolve_cached_preview_sandbox_address,
};
use error::{AuthError, PreviewError};
use preview::{proxy_preview_file, resolve_preview_request};
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
    let env_map = dotenv::EnvLoader::with_paths([".env", ".env.local"])
        .required(false)
        .sequence(dotenv::EnvSequence::InputThenEnv)
        .load()
        .unwrap_or_else(|err| {
            eprintln!("Warning: failed to load .env files, falling back to process env: {err}");
            std::env::vars().collect()
        });

    let env_filter = env_map
        .get("RUST_LOG")
        .and_then(|value| tracing_subscriber::EnvFilter::try_new(value).ok())
        .unwrap_or_else(|| "info,fastgpt_agent_sandbox_proxy=debug".into());
    tracing_subscriber::fmt().with_env_filter(env_filter).init();

    if let Err(err) = auth::init_config(&env_map) {
        tracing::error!("Invalid proxy configuration: {}", err);
        std::process::exit(1);
    }
    endpoint::init_rewrite_host(
        env_map
            .get("AGENT_SANDBOX_PROXY_REWRITE_HOST")
            .map(String::as_str),
    );

    let port = get_listener_port_from_env(&env_map, "PORT", DEFAULT_PORT);
    // 部分网关/部署环境不支持在单个端口同时暴露 WebSocket（/fs、/terminal）与 HTTP（/preview）两种协议，
    // 因此保留 PREVIEW_PORT 独立监听能力；未显式配置时默认复用 PORT 走单端口模式。
    let preview_port = get_listener_port_from_env(&env_map, "PREVIEW_PORT", port);
    let (shutdown_tx, shutdown_rx) = tokio::sync::watch::channel(false);

    tokio::spawn(async move {
        wait_for_shutdown_signal().await;
        info!("Shutdown signal received, stopping FastGPT Agent Sandbox Proxy");
        let _ = shutdown_tx.send(true);
    });

    if port == preview_port {
        info!("FastGPT Agent Sandbox Proxy listening on port {}", port);
        serve_on_port(port, combined_router(shutdown_rx.clone()), shutdown_rx)
            .await
            .expect("Server encountered a fatal error");
        return;
    }

    info!(
        "FastGPT Agent Sandbox Proxy listening on WebSocket port {} and preview port {}",
        port, preview_port
    );
    tokio::try_join!(
        serve_on_port(
            port,
            websocket_router(shutdown_rx.clone()),
            shutdown_rx.clone()
        ),
        serve_on_port(preview_port, preview_router(), shutdown_rx)
    )
    .expect("Server encountered a fatal error");
}

async fn wait_for_shutdown_signal() {
    let ctrl_c = async {
        let _ = tokio::signal::ctrl_c().await;
    };

    #[cfg(unix)]
    let terminate = async {
        if let Ok(mut sigterm) =
            tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate())
        {
            sigterm.recv().await;
        } else {
            std::future::pending::<()>().await;
        }
    };

    #[cfg(not(unix))]
    let terminate = std::future::pending::<()>();

    tokio::select! {
        _ = ctrl_c => {}
        _ = terminate => {}
    }
}

fn websocket_router(shutdown_rx: tokio::sync::watch::Receiver<bool>) -> Router {
    Router::new()
        .route("/health", get(health_check))
        .route("/fs", get(fs_handler))
        .route("/terminal", get(terminal_handler))
        .with_state(shutdown_rx)
}

fn preview_router() -> Router {
    Router::new().route("/health", get(health_check)).route(
        "/preview/{session_id}/{*path}",
        get(preview_handler).head(preview_handler),
    )
}

fn combined_router(shutdown_rx: tokio::sync::watch::Receiver<bool>) -> Router {
    websocket_router(shutdown_rx).route(
        "/preview/{session_id}/{*path}",
        get(preview_handler).head(preview_handler),
    )
}

fn get_listener_port_from_env(env_map: &dotenv::EnvMap, name: &str, default_port: u16) -> u16 {
    env_map
        .get(name)
        .and_then(|p| p.parse().ok())
        .unwrap_or(default_port)
}

/** 在指定端口运行一个独立 Router；不同协议端口由 main 并发托管。 */
async fn serve_on_port(
    port: u16,
    app: Router,
    mut shutdown_rx: tokio::sync::watch::Receiver<bool>,
) -> std::io::Result<()> {
    let addr = SocketAddr::new(
        std::net::IpAddr::V4(std::net::Ipv4Addr::new(0, 0, 0, 0)),
        port,
    );
    let listener = tokio::net::TcpListener::bind(addr).await?;
    axum::serve(listener, app)
        .with_graceful_shutdown(async move {
            let _ = shutdown_rx.wait_for(|shutting_down| *shutting_down).await;
        })
        .await
}

async fn health_check() -> &'static str {
    "OK"
}

async fn ws_upgrade_handler(
    ws: WebSocketUpgrade,
    shutdown_rx: tokio::sync::watch::Receiver<bool>,
    ticket: Option<String>,
    channel: &'static str,
) -> Result<Response, AuthError> {
    let is_terminal = channel == "terminal";
    let (address, claims, ticket) = authenticate_ws_ticket(ticket, channel).await?;
    info!(
        "[Auth] Ticket verified & address resolved successfully. Upgrading to WebSocket ({})...",
        channel.to_ascii_uppercase()
    );
    let ws_limits = address.ws_limits;
    Ok(ws
        .max_message_size(ws_limits.max_message_bytes)
        .max_frame_size(ws_limits.max_frame_bytes)
        .on_upgrade(move |socket| {
            handle_relay(socket, ticket, address, claims, is_terminal, shutdown_rx)
        })
        .into_response())
}

async fn fs_handler(
    ws: WebSocketUpgrade,
    State(shutdown_rx): State<tokio::sync::watch::Receiver<bool>>,
    Query(query): Query<WsQuery>,
) -> Result<Response, AuthError> {
    ws_upgrade_handler(ws, shutdown_rx, query.ticket, "fs").await
}

async fn terminal_handler(
    ws: WebSocketUpgrade,
    State(shutdown_rx): State<tokio::sync::watch::Receiver<bool>>,
    Query(query): Query<WsQuery>,
) -> Result<Response, AuthError> {
    ws_upgrade_handler(ws, shutdown_rx, query.ticket, "terminal").await
}

async fn preview_handler(
    Path(params): Path<PreviewPath>,
    method: Method,
    headers: HeaderMap,
) -> Result<Response<Body>, PreviewError> {
    let (credential, path) = resolve_preview_request(&params.session_id, &params.path)?;

    let resolved = resolve_cached_preview_sandbox_address(&credential)
        .await
        .map_err(PreviewError::ResolutionFailed)?;

    match proxy_preview_file(&resolved.address, path, &method, &headers).await {
        Ok(response) => Ok(response),
        Err(first_error) => {
            let is_unauthorized = matches!(
                &first_error,
                PreviewError::UpstreamStatus(status) if *status == StatusCode::UNAUTHORIZED
            );
            // 仅在命中本地缓存后发生可重试上游失败，或上游返回 401（需穿透刷新 App 侧密码缓存）时重试一次，
            // 避免冷缓存刚解析完地址又对同一失败立即重复请求 verifyTicket。
            let should_retry = is_unauthorized
                || (resolved.from_cache
                    && matches!(
                        &first_error,
                        PreviewError::MissingEndpoint(_)
                            | PreviewError::UpstreamConnect(_)
                            | PreviewError::UpstreamStatus(_)
                    ));
            if !should_retry {
                return Err(first_error);
            }

            warn!(
                "[Preview] Upstream request failed ({}), refreshing resolved address and retrying once",
                first_error
            );
            let fresh_address =
                refresh_preview_sandbox_address(&credential, resolved.generation, is_unauthorized)
                    .await
                    .map_err(PreviewError::ResolutionFailed)?;

            proxy_preview_file(&fresh_address, path, &method, &headers).await
        }
    }
}

use std::sync::Arc;

use axum::{
    Router,
    extract::{DefaultBodyLimit, Request, State},
    http::StatusCode,
    middleware::{self, Next},
    response::Response,
    routing::{get, post},
};
use tokio::net::TcpListener;
use tokio::sync::watch;
use tracing::{error, info};

mod archive;
mod connection;
mod disk;
mod fs;
mod password;
mod preview;
mod protocol;
mod terminal;
mod workspace;

use archive::{extract_handler, pack_handler};
use connection::handle_connection;
use disk::disk_usage_handler;
use password::{AGENT_TOKEN_HEADER, load_or_create_ide_agent_password, verify_ide_agent_token};
use workspace::get_workspace_root;

async fn verify_http_agent_token(
    State(expected_password): State<Arc<String>>,
    request: Request,
    next: Next,
) -> Response {
    let provided = request
        .headers()
        .get(AGENT_TOKEN_HEADER)
        .and_then(|value| value.to_str().ok())
        .unwrap_or("");

    if !verify_ide_agent_token(provided, expected_password.as_str()) {
        return preview::text_response(
            StatusCode::UNAUTHORIZED,
            "Unauthorized: Invalid or missing agent token",
        );
    }

    next.run(request).await
}

fn build_http_router(expected_password: Arc<String>) -> Router {
    preview::preview_router()
        .route("/disk-usage", get(disk_usage_handler))
        .route("/archive/pack", post(pack_handler))
        .route(
            "/archive/extract",
            post(extract_handler).layer(DefaultBodyLimit::disable()),
        )
        .layer(middleware::from_fn_with_state(
            expected_password,
            verify_http_agent_token,
        ))
}

const WS_BIND_ADDR: &str = "0.0.0.0:1318";
const HTTP_BIND_ADDR: &str = "0.0.0.0:1319";

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

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env().unwrap_or_else(|_| "info".into()),
        )
        .init();

    let workspace = get_workspace_root();
    info!(
        "FastGPT IDE Agent starting. Workspace root: {:?}",
        workspace
    );

    tokio::fs::create_dir_all(workspace)
        .await
        .unwrap_or_else(|err| panic!("Failed to create workspace root {:?}: {}", workspace, err));

    let expected_password = Arc::new(
        load_or_create_ide_agent_password()
            .unwrap_or_else(|err| panic!("Failed to initialize IDE Agent password: {err}")),
    );
    let ws_password = Arc::clone(&expected_password);
    let http_password = Arc::clone(&expected_password);

    let ws_listener = TcpListener::bind(WS_BIND_ADDR)
        .await
        .unwrap_or_else(|_| panic!("Failed to bind to {}", WS_BIND_ADDR));
    info!("FastGPT IDE Agent WebSocket listening on {}", WS_BIND_ADDR);

    let http_listener = TcpListener::bind(HTTP_BIND_ADDR)
        .await
        .unwrap_or_else(|_| panic!("Failed to bind to {}", HTTP_BIND_ADDR));
    info!("FastGPT IDE Agent HTTP listening on {}", HTTP_BIND_ADDR);

    let (shutdown_tx, mut ws_shutdown_rx) = watch::channel(false);
    let mut http_shutdown_rx = shutdown_tx.subscribe();

    let serve_ws = tokio::spawn(async move {
        let mut connections = tokio::task::JoinSet::new();

        loop {
            tokio::select! {
                _ = ws_shutdown_rx.changed() => {
                    if *ws_shutdown_rx.borrow() {
                        break;
                    }
                }
                Some(_) = connections.join_next(), if !connections.is_empty() => {}
                accept_res = ws_listener.accept() => {
                    match accept_res {
                        Ok((stream, _)) => {
                            let conn_shutdown_rx = ws_shutdown_rx.clone();
                            let conn_password = Arc::clone(&ws_password);
                            connections.spawn(async move {
                                handle_connection(stream, conn_password, conn_shutdown_rx).await;
                            });
                        }
                        Err(err) => {
                            error!(
                                "Accept connection error: {:?}. Temporary pause for 50ms...",
                                err
                            );
                            tokio::time::sleep(std::time::Duration::from_millis(50)).await;
                        }
                    }
                }
            }
        }

        if tokio::time::timeout(std::time::Duration::from_secs(3), async {
            while connections.join_next().await.is_some() {}
        })
        .await
        .is_err()
        {
            connections.shutdown().await;
        }
    });

    let serve_http = tokio::spawn(async move {
        let app = build_http_router(http_password);
        axum::serve(http_listener, app)
            .with_graceful_shutdown(async move {
                let _ = http_shutdown_rx
                    .wait_for(|shutting_down| *shutting_down)
                    .await;
            })
            .await
    });

    wait_for_shutdown_signal().await;
    info!("Shutdown signal received, stopping FastGPT IDE Agent");
    let _ = shutdown_tx.send(true);

    if let Err(err) = serve_ws.await {
        error!("WebSocket server task failed during shutdown: {}", err);
    }
    match serve_http.await {
        Ok(Ok(())) => {}
        Ok(Err(err)) => error!("HTTP server error during shutdown: {}", err),
        Err(err) => error!("HTTP server task failed during shutdown: {}", err),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::{body::Body, http::Request};
    use tower::ServiceExt;

    #[tokio::test]
    async fn http_router_requires_agent_token_header() {
        let _workspace = workspace::init_test_workspace();
        let router = build_http_router(Arc::new("expected-secret".to_string()));

        for (method, uri) in [
            ("GET", "/preview/missing.txt"),
            ("GET", "/disk-usage"),
            ("POST", "/archive/pack"),
            ("POST", "/archive/extract"),
        ] {
            let unauth = router
                .clone()
                .oneshot(
                    Request::builder()
                        .method(method)
                        .uri(uri)
                        .body(Body::empty())
                        .unwrap(),
                )
                .await
                .unwrap();
            assert_eq!(unauth.status(), StatusCode::UNAUTHORIZED);
            assert_eq!(
                unauth.headers().get("x-fastgpt-preview-origin").unwrap(),
                "ide-agent"
            );

            let wrong = router
                .clone()
                .oneshot(
                    Request::builder()
                        .method(method)
                        .uri(uri)
                        .header(AGENT_TOKEN_HEADER, "wrong-secret")
                        .body(Body::empty())
                        .unwrap(),
                )
                .await
                .unwrap();
            assert_eq!(wrong.status(), StatusCode::UNAUTHORIZED);
        }

        let authorized_preview = router
            .clone()
            .oneshot(
                Request::builder()
                    .uri("/preview/does-not-exist.txt")
                    .header(AGENT_TOKEN_HEADER, "expected-secret")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(authorized_preview.status(), StatusCode::NOT_FOUND);

        let authorized_disk = router
            .oneshot(
                Request::builder()
                    .uri("/disk-usage?refresh=1")
                    .header(AGENT_TOKEN_HEADER, "expected-secret")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(authorized_disk.status(), StatusCode::OK);
        let body_bytes = axum::body::to_bytes(authorized_disk.into_body(), 64 * 1024)
            .await
            .unwrap();
        let parsed: serde_json::Value = serde_json::from_slice(&body_bytes).unwrap();
        assert!(parsed["usedBytes"].is_u64());
    }
}

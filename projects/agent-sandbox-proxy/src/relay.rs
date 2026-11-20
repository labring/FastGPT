use axum::extract::ws::{Message as AxumMsg, WebSocket as AxumWs};
use futures_util::{SinkExt, StreamExt};
use std::collections::HashMap;
use std::time::Duration;
use tokio_tungstenite::{
    connect_async_with_config,
    tungstenite::{
        client::IntoClientRequest,
        protocol::{Message as WsMsg, WebSocketConfig},
    },
};
use tracing::{debug, error, info, warn};

use crate::auth::{
    KeepaliveOutcome, SandboxAddress, WsLimits, parse_upstream_headers, refresh_ws_ticket_address,
    send_keepalive,
};
use crate::endpoint::build_ws_upstream_base_url;
use crate::error::AuthError;

mod error;
mod message;

use error::{RelayError, RelayResult};
use message::{
    UpstreamControl, WS_CLOSE_INTERNAL_ERROR_CODE, axum_to_tungstenite, close_client_ws,
    is_upstream_closed_error, send_client_close, send_client_close_message, send_upstream_close,
    tungstenite_to_axum, upstream_close_message, upstream_error_client_close,
};

fn log_upstream_ws_error(context: &str, err: &tokio_tungstenite::tungstenite::Error) {
    if is_upstream_closed_error(err) {
        debug!("[WSProxy] {context}: {err}");
    } else {
        error!("[WSProxy] {context}: {err}");
    }
}

type UpstreamWsStream =
    tokio_tungstenite::WebSocketStream<tokio_tungstenite::MaybeTlsStream<tokio::net::TcpStream>>;

const UPSTREAM_CONNECT_MAX_ATTEMPTS: u8 = 10;
const UPSTREAM_CONNECT_RETRY_DELAY: Duration = Duration::from_millis(300);
const UPSTREAM_CONNECT_ATTEMPT_TIMEOUT: Duration = Duration::from_secs(10);

async fn wait_for_shutdown(shutdown_rx: &mut tokio::sync::watch::Receiver<bool>) {
    if *shutdown_rx.borrow() {
        return;
    }
    while shutdown_rx.changed().await.is_ok() {
        if *shutdown_rx.borrow() {
            return;
        }
    }
    // Keep pending if the sender was dropped in tests/detached routers so shutdown never misfires.
    std::future::pending::<()>().await;
}

fn upstream_ws_config(ws_limits: WsLimits) -> WebSocketConfig {
    WebSocketConfig::default()
        .max_message_size(Some(ws_limits.max_message_bytes))
        .max_frame_size(Some(ws_limits.max_frame_bytes))
}

/// 连接沙盒内的 IDE Agent，允许 agent 冷启动时出现短暂端口不可用。
async fn connect_upstream_with_retry(
    target_url: String,
    ws_limits: WsLimits,
    upstream_headers: &HashMap<String, String>,
) -> RelayResult<UpstreamWsStream> {
    let parsed_headers = parse_upstream_headers(upstream_headers);
    let ws_config = upstream_ws_config(ws_limits);
    let mut attempts = 0;

    loop {
        attempts += 1;

        let mut request = target_url
            .clone()
            .into_client_request()
            .map_err(|source| RelayError::WebSocketRequest { source })?;
        for (header_name, header_value) in &parsed_headers {
            // 不覆盖 into_client_request 已生成的 Host / Upgrade / Sec-WebSocket-* 握手头。
            if !request.headers().contains_key(header_name) {
                request
                    .headers_mut()
                    .insert(header_name.clone(), header_value.clone());
            }
        }

        let connect_result = match tokio::time::timeout(
            UPSTREAM_CONNECT_ATTEMPT_TIMEOUT,
            connect_async_with_config(request, Some(ws_config), false),
        )
        .await
        {
            Ok(result) => result,
            Err(_elapsed) => Err(tokio_tungstenite::tungstenite::Error::Io(
                std::io::Error::new(
                    std::io::ErrorKind::TimedOut,
                    "upstream WebSocket connect timed out",
                ),
            )),
        };

        match connect_result {
            Ok((ws, _)) => return Ok(ws),
            Err(source) => {
                let is_client_error = matches!(
                    &source,
                    tokio_tungstenite::tungstenite::Error::Http(resp)
                        if resp.status().is_client_error()
                );
                let error_message = source.to_string();
                error!(
                    "[WSProxy] Attempt {}/{} to connect upstream failed: {}. (Target: {})",
                    attempts, UPSTREAM_CONNECT_MAX_ATTEMPTS, error_message, target_url
                );

                // Permanent 4xx handshake rejections (e.g. 401/403/404) should fail fast without sleeping.
                if is_client_error || attempts >= UPSTREAM_CONNECT_MAX_ATTEMPTS {
                    return Err(RelayError::upstream_connect(attempts, source));
                }

                tokio::time::sleep(UPSTREAM_CONNECT_RETRY_DELAY).await;
            }
        }
    }
}

#[derive(Debug)]
enum UpstreamConnectFailure {
    InvalidEndpoint { code: u16, reason: &'static str },
    ConnectFailed(String),
}

fn is_upstream_unauthorized(err: &RelayError) -> bool {
    matches!(
        err,
        RelayError::UpstreamNotReady {
            source: tokio_tungstenite::tungstenite::Error::Http(resp),
        } if resp.status() == tokio_tungstenite::tungstenite::http::StatusCode::UNAUTHORIZED
    )
}

fn build_upstream_target_url(
    address: &SandboxAddress,
    permission: &str,
    is_terminal: bool,
) -> Result<String, (u16, &'static str)> {
    let url = address
        .sandbox_url
        .as_deref()
        .filter(|url| !url.is_empty())
        .ok_or_else(|| {
            error!("[WSProxy] Sandbox endpoint url is missing from address resolution.");
            (1008, "Sandbox endpoint is missing")
        })?;

    let ws_base = build_ws_upstream_base_url(url).map_err(|err| {
        error!("[WSProxy] {}", err);
        (1008, "Invalid sandbox endpoint")
    })?;

    Ok(format!(
        "{}{}?permission={}",
        ws_base,
        if is_terminal { "/terminal" } else { "/fs" },
        permission
    ))
}

async fn connect_upstream_with_refresh_fn<F, Fut>(
    initial_target_url: String,
    initial_address: SandboxAddress,
    permission: &str,
    is_terminal: bool,
    refresh_fn: F,
) -> Result<UpstreamWsStream, UpstreamConnectFailure>
where
    F: FnOnce() -> Fut,
    Fut: std::future::Future<Output = Result<SandboxAddress, AuthError>>,
{
    match connect_upstream_with_retry(
        initial_target_url,
        initial_address.ws_limits,
        &initial_address.upstream_headers,
    )
    .await
    {
        Ok(up_ws) => Ok(up_ws),
        Err(first_err) if is_upstream_unauthorized(&first_err) => {
            warn!(
                "[WSProxy] Upstream rejected WebSocket handshake with 401; refreshing sandbox endpoint/token and retrying once"
            );
            let fresh_address = refresh_fn()
                .await
                .map_err(|err| UpstreamConnectFailure::ConnectFailed(err.to_string()))?;
            let fresh_target_url =
                build_upstream_target_url(&fresh_address, permission, is_terminal).map_err(
                    |(code, reason)| UpstreamConnectFailure::InvalidEndpoint { code, reason },
                )?;
            info!(
                "[WSProxy] Retrying upstream connection target URL: {}",
                fresh_target_url
            );
            connect_upstream_with_retry(
                fresh_target_url,
                fresh_address.ws_limits,
                &fresh_address.upstream_headers,
            )
            .await
            .map_err(|err| UpstreamConnectFailure::ConnectFailed(err.to_string()))
        }
        Err(first_err) => Err(UpstreamConnectFailure::ConnectFailed(first_err.to_string())),
    }
}

/// 建立浏览器与沙盒 IDE Agent 的双向 WebSocket 中继。
pub async fn handle_relay(
    client_ws: AxumWs,
    ticket: String,
    address: SandboxAddress,
    claims: crate::auth::Claims,
    is_terminal: bool,
    mut shutdown_rx: tokio::sync::watch::Receiver<bool>,
) {
    let (mut client_sink, mut client_stream) = client_ws.split();

    let permission_to_forward = claims.permission.clone();
    let target_url = match build_upstream_target_url(&address, &permission_to_forward, is_terminal)
    {
        Ok(url) => url,
        Err((code, reason)) => {
            close_client_ws(&mut client_sink, code, reason).await;
            return;
        }
    };

    info!(
        "[WSProxy] Formed upstream connection target URL: {}",
        target_url
    );

    let mut buffer: Vec<AxumMsg> = Vec::new();
    let up_ws = {
        let connect_fut = connect_upstream_with_refresh_fn(
            target_url,
            address,
            &permission_to_forward,
            is_terminal,
            || refresh_ws_ticket_address(&ticket),
        );
        tokio::pin!(connect_fut);

        // 上游连接建立前，先短暂缓冲浏览器发来的初始化帧，避免首包丢失。
        loop {
            tokio::select! {
                res = &mut connect_fut => {
                    match res {
                        Ok(up_ws) => {
                            info!("[WSProxy] WebSocket handshake with Sandboxed Agent completed successfully.");
                            break up_ws;
                        }
                        Err(UpstreamConnectFailure::InvalidEndpoint { code, reason }) => {
                            close_client_ws(&mut client_sink, code, reason).await;
                            return;
                        }
                        Err(UpstreamConnectFailure::ConnectFailed(err)) => {
                            error!("[WSProxy] Final handshake with upstream sandboxed agent failed: {}", err);
                            close_client_ws(&mut client_sink, 1011, "Failed to connect sandbox agent").await;
                            return;
                        }
                    }
                }

                msg_opt = client_stream.next() => {
                    match msg_opt {
                        Some(Ok(msg)) => {
                            if matches!(msg, AxumMsg::Close(_)) {
                                info!("[WSProxy] Client sent Close frame during handshake. Aborting connection!");
                                return;
                            }
                            // 握手期只缓冲少量初始化帧，防止异常客户端撑爆内存。
                            if buffer.len() >= 5 {
                                error!("[WSProxy] Handshake buffer capacity exceeded maximum limit. Forcing connection termination!");
                                close_client_ws(&mut client_sink, 1008, "Handshake buffer limit exceeded").await;
                                return;
                            }
                            debug!("[WSProxy] Buffering client initialization frame.");
                            buffer.push(msg);
                        }
                        Some(Err(err)) => {
                            error!("[WSProxy] Client WebSocket encountered read error: {}", err);
                            return;
                        }
                        None => {
                            info!("[WSProxy] Client WebSocket closed connection before handshake completed.");
                            return;
                        }
                    }
                }

                _ = wait_for_shutdown(&mut shutdown_rx) => {
                    info!("[WSProxy] Shutdown signal received during handshake. Closing client WebSocket.");
                    close_client_ws(&mut client_sink, 1001, "Proxy shutting down").await;
                    return;
                }
            }
        }
    };

    // 5. 阶段二：冲刷及分拆 Upstream
    let (mut up_sink, up_stream) = up_ws.split();

    for buffered_msg in buffer.drain(..) {
        if let Err(err) = up_sink.send(axum_to_tungstenite(buffered_msg)).await {
            log_upstream_ws_error("Failed while flushing buffered message to upstream", &err);
            close_client_ws(&mut client_sink, 1011, "Failed to forward buffered message").await;
            return;
        }
    }

    let (client_msg_tx, mut client_msg_rx) = tokio::sync::mpsc::channel::<AxumMsg>(100);
    let (client_close_tx, mut client_close_rx) = tokio::sync::mpsc::channel::<AxumMsg>(1);
    let (upstream_control_tx, mut upstream_control_rx) =
        tokio::sync::mpsc::channel::<UpstreamControl>(4);
    let mut client_writer = tokio::spawn(async move {
        loop {
            tokio::select! {
                biased;
                close_msg = client_close_rx.recv() => {
                    // Drain any already-queued data frames before transmitting the terminal Close frame.
                    let mut sink_ok = true;
                    while let Ok(pending_msg) = client_msg_rx.try_recv() {
                        if client_sink.send(pending_msg).await.is_err() {
                            sink_ok = false;
                            break;
                        }
                    }
                    if sink_ok && let Some(msg) = close_msg {
                        let _ = client_sink.send(msg).await;
                    }
                    break;
                }
                msg = client_msg_rx.recv() => {
                    let Some(msg) = msg else {
                        break;
                    };
                    if client_sink.send(msg).await.is_err() {
                        break;
                    }
                }
            }
        }
    });

    // Client -> Upstream (含周期性向 Upstream 发送 Ping 帧以保持连接活跃，防止长连接空闲超时断开)
    let client_to_upstream_close_tx = client_close_tx.clone();
    let client_to_upstream = async move {
        let mut ping_interval = tokio::time::interval(Duration::from_secs(10));
        // 跳过第一次 tick 以免在刚刚握手完时发送 Ping
        ping_interval.tick().await;

        loop {
            tokio::select! {
                biased;
                control = upstream_control_rx.recv() => {
                    let Some(control) = control else {
                        break;
                    };
                    let result = match control {
                        UpstreamControl::Close(message) => up_sink.send(message).await,
                        UpstreamControl::Flush => up_sink.flush().await,
                    };
                    if let Err(err) = result {
                        log_upstream_ws_error("Error handling upstream control frame", &err);
                    }
                    break;
                }
                _ = ping_interval.tick() => {
                    debug!("[WSProxy] Sending WebSocket Ping frame to upstream sandbox agent...");
                    if let Err(err) = up_sink.send(WsMsg::Ping(Default::default())).await {
                        log_upstream_ws_error("Error sending Ping frame to upstream sandbox agent", &err);
                        send_client_close(&client_to_upstream_close_tx, WS_CLOSE_INTERNAL_ERROR_CODE, "Sandbox agent connection lost");
                        break;
                    }
                }
                msg_opt = client_stream.next() => {
                    match msg_opt {
                        Some(Ok(msg)) => {
                            match msg {
                                AxumMsg::Close(frame) => {
                                    debug!("[WSProxy] Client sent Close frame. Forwarding close upstream and stopping client pipeline.");
                                    if let Err(err) = up_sink
                                        .send(axum_to_tungstenite(AxumMsg::Close(frame)))
                                        .await
                                    {
                                        log_upstream_ws_error("Error forwarding client Close frame to upstream", &err);
                                    }
                                    break;
                                }
                                msg => {
                                    if let Err(err) = up_sink.send(axum_to_tungstenite(msg)).await {
                                        log_upstream_ws_error("Error forwarding client message to upstream", &err);
                                        let (code, reason) = upstream_error_client_close(&err);
                                        send_client_close(&client_to_upstream_close_tx, code, reason);
                                        break;
                                    }
                                }
                            }
                        }
                        Some(Err(err)) => {
                            error!("[WSProxy] Client stream read error: {}", err);
                            break;
                        }
                        None => {
                            debug!("[WSProxy] Client stream finished (None)");
                            break;
                        }
                    }
                }
            }
        }
    };

    // Upstream -> Client
    let upstream_to_client_msg_tx = client_msg_tx.clone();
    let upstream_to_client_close_tx = client_close_tx.clone();
    let upstream_to_client_upstream_control_tx = upstream_control_tx.clone();
    let upstream_to_client = async move {
        let mut up_stream = up_stream;
        while let Some(msg_res) = up_stream.next().await {
            match msg_res {
                Ok(WsMsg::Close(frame)) => {
                    let _ = upstream_to_client_upstream_control_tx.try_send(UpstreamControl::Flush);
                    if let Some(close_msg) = tungstenite_to_axum(WsMsg::Close(frame)) {
                        send_client_close_message(&upstream_to_client_close_tx, close_msg);
                    }
                    break;
                }
                Ok(msg) => {
                    let Some(client_msg) = tungstenite_to_axum(msg) else {
                        continue;
                    };
                    if upstream_to_client_msg_tx.send(client_msg).await.is_err() {
                        break;
                    }
                }
                Err(err) => {
                    log_upstream_ws_error("Upstream stream read error", &err);
                    let (code, reason) = upstream_error_client_close(&err);
                    send_client_close(&upstream_to_client_close_tx, code, reason);
                    break;
                }
            }
        }
    };

    // WebSocket 存续期间周期性刷新 sandbox 活跃时间。
    let keepalive_client_close_tx = client_close_tx.clone();
    let keepalive_upstream_control_tx = upstream_control_tx.clone();
    let keepalive_loop = async move {
        let mut fail_count: u8 = 0;
        loop {
            tokio::time::sleep(Duration::from_secs(120)).await;

            match send_keepalive(&claims).await {
                KeepaliveOutcome::Ok => fail_count = 0,
                KeepaliveOutcome::PermanentError => {
                    error!(
                        "[KeepAlive] Permanent client or permission error. Forcing connection termination!"
                    );
                    send_client_close(
                        &keepalive_client_close_tx,
                        1008,
                        "Sandbox keepalive rejected",
                    );
                    send_upstream_close(
                        &keepalive_upstream_control_tx,
                        upstream_close_message(1008, "Sandbox keepalive rejected"),
                    );
                    break;
                }
                KeepaliveOutcome::TransientError => {
                    fail_count += 1;
                    if fail_count >= 3 {
                        error!(
                            "[KeepAlive] Heartbeat failed consecutively for 3 times. Forcing connection termination!"
                        );
                        send_client_close(
                            &keepalive_client_close_tx,
                            1011,
                            "Sandbox keepalive failed",
                        );
                        send_upstream_close(
                            &keepalive_upstream_control_tx,
                            upstream_close_message(1011, "Sandbox keepalive failed"),
                        );
                        break;
                    }
                }
            }
        }
    };

    tokio::pin!(client_to_upstream);
    tokio::pin!(upstream_to_client);
    tokio::pin!(keepalive_loop);

    let mut client_to_upstream_done = false;
    let mut upstream_to_client_done = false;

    // 任意方向先结束后，仍给另一方向一个短窗口完成 Close 握手，避免把正常关闭变成物理断开。
    tokio::select! {
        _ = &mut client_to_upstream => {
            client_to_upstream_done = true;
            debug!("[WSProxy] Client to Upstream pipeline finished.");
        }
        _ = &mut upstream_to_client => {
            upstream_to_client_done = true;
            debug!("[WSProxy] Upstream to Client pipeline finished.");
        }
        _ = &mut keepalive_loop => {
            debug!("[WSProxy] Keepalive pipeline finished.");
        }
        _ = &mut client_writer => {
            debug!("[WSProxy] Client writer pipeline finished.");
            send_upstream_close(
                &upstream_control_tx,
                upstream_close_message(1000, "Client connection closed")
            );
        }
        _ = wait_for_shutdown(&mut shutdown_rx) => {
            info!("[WSProxy] Shutdown signal received, closing active relay.");
            send_client_close(&client_close_tx, 1001, "Proxy shutting down");
            send_upstream_close(
                &upstream_control_tx,
                upstream_close_message(1001, "Proxy shutting down"),
            );
        }
    }

    if !client_to_upstream_done {
        let _ = tokio::time::timeout(Duration::from_millis(500), &mut client_to_upstream).await;
    }
    if !upstream_to_client_done {
        let _ = tokio::time::timeout(Duration::from_millis(500), &mut upstream_to_client).await;
    }

    drop(client_msg_tx);
    drop(client_close_tx);
    drop(upstream_control_tx);
    if !client_writer.is_finished() {
        let _ = tokio::time::timeout(Duration::from_millis(200), &mut client_writer).await;
    }
    if !client_writer.is_finished() {
        client_writer.abort();
        let _ = client_writer.await;
    }

    info!("[WSProxy] Bidirectional forwarding pipelines successfully closed.");
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::{Router, extract::ws::WebSocketUpgrade, http::HeaderMap, routing::get};

    #[tokio::test]
    async fn connect_upstream_forwards_safe_upstream_headers_only() {
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();

        tokio::spawn(async move {
            let app = Router::new().route(
                "/fs",
                get(move |headers: HeaderMap, ws: WebSocketUpgrade| async move {
                    assert_eq!(headers.get("open-sandbox-api-key").unwrap(), "osb-key");
                    assert_eq!(headers.get("x-sandbox-token").unwrap(), "ep-token");
                    assert_eq!(headers.get("host").unwrap(), &addr.to_string());
                    assert_ne!(headers.get("sec-websocket-key").unwrap(), "fake-key");
                    ws.on_upgrade(|mut socket| async move {
                        let _ = socket.close().await;
                    })
                }),
            );
            axum::serve(listener, app).await.unwrap();
        });

        let upstream_headers = HashMap::from([
            ("OPEN-SANDBOX-API-KEY".to_string(), "osb-key".to_string()),
            ("X-Sandbox-Token".to_string(), "ep-token".to_string()),
            ("Host".to_string(), "evil.example.com".to_string()),
            ("Sec-WebSocket-Key".to_string(), "fake-key".to_string()),
            ("Connection".to_string(), "close".to_string()),
        ]);

        let mut ws = connect_upstream_with_retry(
            format!("ws://{addr}/fs?permission=read"),
            WsLimits::default(),
            &upstream_headers,
        )
        .await
        .unwrap();
        let _ = ws.close(None).await;
    }

    #[tokio::test]
    async fn connect_upstream_fast_fails_on_client_http_error() {
        use axum::http::StatusCode;
        use std::sync::{
            Arc,
            atomic::{AtomicUsize, Ordering},
        };

        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();
        let hits = Arc::new(AtomicUsize::new(0));
        let hits_for_route = Arc::clone(&hits);

        tokio::spawn(async move {
            let app = Router::new().route(
                "/fs",
                get(move || {
                    let hits = Arc::clone(&hits_for_route);
                    async move {
                        hits.fetch_add(1, Ordering::SeqCst);
                        StatusCode::FORBIDDEN
                    }
                }),
            );
            axum::serve(listener, app).await.unwrap();
        });

        let err = connect_upstream_with_retry(
            format!("ws://{addr}/fs?permission=read"),
            WsLimits::default(),
            &HashMap::new(),
        )
        .await
        .unwrap_err();

        assert!(matches!(
            err,
            RelayError::UpstreamNotReady {
                source: tokio_tungstenite::tungstenite::Error::Http(ref resp),
            } if resp.status() == StatusCode::FORBIDDEN
        ));
        assert_eq!(hits.load(Ordering::SeqCst), 1);
    }

    #[tokio::test]
    async fn connect_upstream_refreshes_once_on_401_unauthorized() {
        use axum::http::StatusCode;
        use axum::response::IntoResponse;
        use std::sync::{
            Arc,
            atomic::{AtomicUsize, Ordering},
        };

        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();
        let refresh_calls = Arc::new(AtomicUsize::new(0));
        let refresh_calls_cloned = Arc::clone(&refresh_calls);

        tokio::spawn(async move {
            let app = Router::new().route(
                "/fs",
                get(move |headers: HeaderMap, ws: WebSocketUpgrade| async move {
                    if headers
                        .get("x-fastgpt-agent-token")
                        .and_then(|v| v.to_str().ok())
                        == Some("fresh-secret")
                    {
                        return ws
                            .on_upgrade(|mut socket| async move {
                                let _ = socket.close().await;
                            })
                            .into_response();
                    }
                    StatusCode::UNAUTHORIZED.into_response()
                }),
            );
            axum::serve(listener, app).await.unwrap();
        });

        let initial_address = SandboxAddress {
            sandbox_url: Some(format!("http://{addr}")),
            upstream_headers: HashMap::from([(
                "x-fastgpt-agent-token".to_string(),
                "stale-secret".to_string(),
            )]),
            ws_limits: WsLimits::default(),
        };
        let initial_target = build_upstream_target_url(&initial_address, "read", false).unwrap();

        let mut ws = connect_upstream_with_refresh_fn(
            initial_target,
            initial_address,
            "read",
            false,
            || async move {
                refresh_calls_cloned.fetch_add(1, Ordering::SeqCst);
                Ok(SandboxAddress {
                    sandbox_url: Some(format!("http://{addr}")),
                    upstream_headers: HashMap::from([(
                        "x-fastgpt-agent-token".to_string(),
                        "fresh-secret".to_string(),
                    )]),
                    ws_limits: WsLimits::default(),
                })
            },
        )
        .await
        .unwrap();
        let _ = ws.close(None).await;
        assert_eq!(refresh_calls.load(Ordering::SeqCst), 1);
    }
}

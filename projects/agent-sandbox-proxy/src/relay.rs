use axum::extract::ws::{Message as AxumMsg, WebSocket as AxumWs};
use futures_util::{SinkExt, StreamExt, stream::SplitSink};
use std::time::Duration;
use tokio_tungstenite::{
    connect_async_with_config,
    tungstenite::{
        Error as WsError,
        client::IntoClientRequest,
        protocol::{Message as WsMsg, WebSocketConfig},
    },
};
use tracing::{debug, error, info};

use crate::auth::{SandboxAddress, get_http_client, get_proxy_secret};

const MAX_WS_MESSAGE_SIZE: usize = 16 * 1024 * 1024;
const MAX_WS_FRAME_SIZE: usize = 4 * 1024 * 1024;

type UpstreamWsStream =
    tokio_tungstenite::WebSocketStream<tokio_tungstenite::MaybeTlsStream<tokio::net::TcpStream>>;
type ClientWsSink = SplitSink<AxumWs, AxumMsg>;

enum UpstreamControl {
    Close(WsMsg),
    Flush,
}

const UPSTREAM_CONNECT_MAX_ATTEMPTS: u8 = 10;
const UPSTREAM_CONNECT_RETRY_DELAY: Duration = Duration::from_millis(300);

fn upstream_ws_config() -> WebSocketConfig {
    WebSocketConfig::default()
        .max_message_size(Some(MAX_WS_MESSAGE_SIZE))
        .max_frame_size(Some(MAX_WS_FRAME_SIZE))
}

/// 连接沙盒内的 IDE Agent，允许 agent 冷启动时出现短暂端口不可用。
async fn connect_upstream_with_retry(target_url: String) -> Result<UpstreamWsStream, String> {
    let mut attempts = 0;
    let safe_target_url = redact_sensitive_query(&target_url);

    loop {
        attempts += 1;

        let request = match target_url.clone().into_client_request() {
            Ok(req) => req,
            Err(err) => return Err(format!("Failed to build WebSocket request: {}", err)),
        };

        match connect_async_with_config(request, Some(upstream_ws_config()), false).await {
            Ok((ws, _)) => return Ok(ws),
            Err(err) => {
                let err_str = err.to_string();
                error!(
                    "[WSProxy] Attempt {}/{} to connect upstream failed: {}. (Target: {})",
                    attempts, UPSTREAM_CONNECT_MAX_ATTEMPTS, err_str, safe_target_url
                );

                if attempts >= UPSTREAM_CONNECT_MAX_ATTEMPTS {
                    let friendly_hint = if err_str.contains("sec-websocket-key") {
                        "Upstream returned a non-101 HTTP error (e.g. 401 Unauthorized or 502 Bad Gateway). \
                         This typically means the sandboxed agent has not fully started up yet, \
                         or failed to bind to its port 1318.".to_string()
                    } else {
                        err_str
                    };
                    return Err(friendly_hint);
                }

                tokio::time::sleep(UPSTREAM_CONNECT_RETRY_DELAY).await;
            }
        }
    }
}

/// 建立浏览器与沙盒 IDE Agent 的双向 WebSocket 中继。
pub async fn handle_relay(
    client_ws: AxumWs,
    address: SandboxAddress,
    claims: crate::auth::Claims,
    is_terminal: bool,
) {
    let (mut client_sink, mut client_stream) = client_ws.split();

    let Some(ref token_to_forward) = address.agent_token else {
        error!("[WSProxy] Agent token is missing from address resolution.");
        close_client_ws(&mut client_sink, 1008, "Agent token is missing").await;
        return;
    };
    let permission_to_forward = claims.permission.as_str();

    let target_url = match address.sandbox_url.as_deref().filter(|url| !url.is_empty()) {
        Some(url) => {
            let ws_base = url
                .trim()
                .trim_end_matches('/')
                .replacen("http://", "ws://", 1)
                .replacen("https://", "wss://", 1);
            let ws_base = if ws_base.starts_with("ws://") || ws_base.starts_with("wss://") {
                ws_base
            } else {
                format!("ws://{}", ws_base)
            };

            format!(
                "{}{}?token={}&permission={}",
                ws_base,
                if is_terminal { "/terminal" } else { "/fs" },
                token_to_forward,
                permission_to_forward
            )
        }
        None => {
            error!("[WSProxy] Sandbox endpoint url is missing from address resolution.");
            close_client_ws(&mut client_sink, 1008, "Sandbox endpoint is missing").await;
            return;
        }
    };

    info!(
        "[WSProxy] Formed upstream connection target URL: {}",
        redact_sensitive_query(&target_url)
    );

    let connect_fut = connect_upstream_with_retry(target_url);
    tokio::pin!(connect_fut);

    let mut buffer: Vec<AxumMsg> = Vec::new();
    let mut upstream_ws = None;

    // 上游连接建立前，先短暂缓冲浏览器发来的初始化帧，避免首包丢失。
    loop {
        tokio::select! {
            res = &mut connect_fut, if upstream_ws.is_none() => {
                match res {
                    Ok(up_ws) => {
                        info!("[WSProxy] WebSocket handshake with Sandboxed Agent completed successfully.");
                        upstream_ws = Some(up_ws);
                        break;
                    }
                    Err(err) => {
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
        }
    }

    // 5. 阶段二：冲刷及分拆 Upstream
    let up_ws = match upstream_ws {
        Some(ws) => ws,
        None => return,
    };
    let (mut up_sink, up_stream) = up_ws.split();

    for buffered_msg in buffer.drain(..) {
        match axum_to_tungstenite(buffered_msg) {
            Ok(ws_msg) => {
                if let Err(err) = up_sink.send(ws_msg).await {
                    if is_upstream_closed_error(&err) {
                        debug!(
                            "[WSProxy] Upstream closed while flushing buffered message: {}",
                            err
                        );
                    } else {
                        error!(
                            "[WSProxy] Error flushing buffered message to upstream: {}",
                            err
                        );
                    }
                    close_client_ws(&mut client_sink, 1011, "Failed to forward buffered message")
                        .await;
                    return;
                }
            }
            Err(_) => {
                error!(
                    "[WSProxy] Dropping unsupported buffered WebSocket message before upstream flush."
                );
            }
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
                    if let Some(msg) = close_msg {
                        let _ = client_sink.send(msg).await;
                    }
                    break;
                }
                msg = client_msg_rx.recv() => {
                    let Some(msg) = msg else {
                        break;
                    };
                    let should_stop = matches!(msg, AxumMsg::Close(_));
                    if client_sink.send(msg).await.is_err() {
                        break;
                    }
                    if should_stop {
                        break;
                    }
                }
            }
        }
    });

    // Client -> Upstream (含周期性向 Upstream 发送 Ping 帧以保持连接活跃，解决 Devbox 链路空闲重置)
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
                        if is_upstream_closed_error(&err) {
                            debug!("[WSProxy] Upstream closed while handling control frame: {}", err);
                        } else {
                            error!("[WSProxy] Error handling upstream control frame: {}", err);
                        }
                    }
                    break;
                }
                _ = ping_interval.tick() => {
                    debug!("[WSProxy] Sending WebSocket Ping frame to Upstream Devbox...");
                    if let Err(err) = up_sink.send(WsMsg::Ping(Default::default())).await {
                        if is_upstream_closed_error(&err) {
                            debug!("[WSProxy] Upstream closed before Ping frame was sent: {}", err);
                        } else {
                            error!("[WSProxy] Error sending Ping frame to Upstream Devbox: {}", err);
                        }
                        send_client_close(&client_to_upstream_close_tx, 1011, "Sandbox agent connection lost");
                        break;
                    }
                }
                msg_opt = client_stream.next() => {
                    match msg_opt {
                        Some(Ok(msg)) => {
                            match msg {
                                AxumMsg::Close(frame) => {
                                    debug!("[WSProxy] Client sent Close frame. Forwarding close upstream and stopping client pipeline.");
                                    if let Ok(ws_msg) = axum_to_tungstenite(AxumMsg::Close(frame))
                                        && let Err(err) = up_sink.send(ws_msg).await
                                    {
                                        if is_upstream_closed_error(&err) {
                                            debug!("[WSProxy] Upstream already closed while forwarding client Close frame: {}", err);
                                        } else {
                                            error!("[WSProxy] Error forwarding client Close frame to upstream: {}", err);
                                        }
                                    }
                                    break;
                                }
                                msg => match axum_to_tungstenite(msg) {
                                    Ok(ws_msg) => if let Err(err) = up_sink.send(ws_msg).await {
                                        if is_upstream_closed_error(&err) {
                                            debug!("[WSProxy] Upstream closed while forwarding client message: {}", err);
                                        } else {
                                            error!("[WSProxy] Error forwarding client message to upstream: {}", err);
                                        }
                                        send_client_close(&client_to_upstream_close_tx, 1011, "Sandbox agent connection lost");
                                        break;
                                    },
                                    Err(_) => debug!("[WSProxy] Dropping unsupported client WebSocket message."),
                                },
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
                    send_upstream_flush(&upstream_to_client_upstream_control_tx);
                    send_client_close_message(
                        &upstream_to_client_close_tx,
                        tungstenite_to_axum(WsMsg::Close(frame))
                            .unwrap_or_else(|_| client_close_message(1000, "Sandbox agent closed")),
                    );
                    break;
                }
                Ok(msg) => {
                    let Ok(client_msg) = tungstenite_to_axum(msg) else {
                        continue;
                    };
                    if upstream_to_client_msg_tx.send(client_msg).await.is_err() {
                        break;
                    }
                }
                Err(err) => {
                    if is_upstream_closed_error(&err) {
                        debug!("[WSProxy] Upstream stream closed: {}", err);
                    } else {
                        error!("[WSProxy] Upstream stream read error: {}", err);
                    }
                    send_client_close(
                        &upstream_to_client_close_tx,
                        1011,
                        "Sandbox agent connection lost",
                    );
                    break;
                }
            }
        }
    };

    // WebSocket 存续期间周期性刷新 sandbox 活跃时间。
    let keepalive_client_close_tx = client_close_tx.clone();
    let keepalive_upstream_control_tx = upstream_control_tx.clone();
    let keepalive_loop = async move {
        let client = get_http_client();
        let app_url = std::env::var("FASTGPT_APP_URL")
            .unwrap_or_else(|_| "http://localhost:3000".to_string());
        let clean_app_url = app_url.trim_end_matches('/');
        let request_url = format!("{}/api/core/ai/sandbox/keepalive", clean_app_url);

        let mut fail_count = 0;
        loop {
            tokio::time::sleep(Duration::from_secs(120)).await;

            debug!(
                "[KeepAlive] Sending heartbeat for appId: {}, chatId: {}",
                claims.app_id, claims.chat_id
            );

            let body = serde_json::json!({
                "appId": claims.app_id,
                "userId": claims.user_id,
                "chatId": claims.chat_id,
                "teamId": claims.team_id,
            });

            let request = client
                .post(&request_url)
                .header("X-Proxy-Token", get_proxy_secret())
                .json(&body);

            match request.send().await {
                Ok(resp) => {
                    let status = resp.status();
                    if status.is_success() {
                        debug!("[KeepAlive] Heartbeat succeeded.");
                        fail_count = 0;
                    } else {
                        let err_text = resp.text().await.unwrap_or_else(|_| "Unknown".to_string());
                        error!(
                            "[KeepAlive] Heartbeat rejected by App (status {}): {}",
                            status, err_text
                        );

                        if status.is_client_error() {
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
                Err(err) => {
                    error!("[KeepAlive] Failed to send heartbeat request: {}", err);
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
    }

    info!("[WSProxy] Bidirectional forwarding pipelines successfully closed.");
}

fn is_upstream_closed_error(err: &WsError) -> bool {
    matches!(err, WsError::ConnectionClosed | WsError::AlreadyClosed)
        || matches!(
            err,
            WsError::Io(io_err)
                if matches!(
                    io_err.kind(),
                    std::io::ErrorKind::ConnectionReset
                        | std::io::ErrorKind::BrokenPipe
                        | std::io::ErrorKind::NotConnected
                )
        )
}

async fn close_client_ws(client_sink: &mut ClientWsSink, code: u16, reason: &str) {
    let _ = client_sink.send(client_close_message(code, reason)).await;
}

fn send_client_close(client_tx: &tokio::sync::mpsc::Sender<AxumMsg>, code: u16, reason: &str) {
    send_client_close_message(client_tx, client_close_message(code, reason));
}

fn send_client_close_message(client_tx: &tokio::sync::mpsc::Sender<AxumMsg>, message: AxumMsg) {
    let _ = client_tx.try_send(message);
}

fn send_upstream_close(upstream_tx: &tokio::sync::mpsc::Sender<UpstreamControl>, message: WsMsg) {
    let _ = upstream_tx.try_send(UpstreamControl::Close(message));
}

fn send_upstream_flush(upstream_tx: &tokio::sync::mpsc::Sender<UpstreamControl>) {
    let _ = upstream_tx.try_send(UpstreamControl::Flush);
}

fn client_close_message(code: u16, reason: &str) -> AxumMsg {
    AxumMsg::Close(Some(axum::extract::ws::CloseFrame {
        code,
        reason: reason.into(),
    }))
}

fn upstream_close_message(code: u16, reason: &str) -> WsMsg {
    axum_to_tungstenite(client_close_message(code, reason)).unwrap_or(WsMsg::Close(None))
}

fn redact_sensitive_query(url: &str) -> String {
    let Some((base, query)) = url.split_once('?') else {
        return url.to_string();
    };

    let redacted_query = query
        .split('&')
        .map(|pair| {
            let key = pair.split_once('=').map(|(key, _)| key).unwrap_or(pair);
            if key == "token" || key == "access_token" {
                format!("{}=<redacted>", key)
            } else {
                pair.to_string()
            }
        })
        .collect::<Vec<_>>()
        .join("&");

    format!("{}?{}", base, redacted_query)
}

// ==================== 协议格式对齐转换器 ====================

fn axum_to_tungstenite(msg: AxumMsg) -> Result<WsMsg, ()> {
    match msg {
        AxumMsg::Text(t) => Ok(WsMsg::Text(t.to_string().into())),
        AxumMsg::Binary(b) => Ok(WsMsg::Binary(b)),
        AxumMsg::Ping(p) => Ok(WsMsg::Ping(p)),
        AxumMsg::Pong(p) => Ok(WsMsg::Pong(p)),
        AxumMsg::Close(c) => Ok(WsMsg::Close(c.map(|frame| {
            tokio_tungstenite::tungstenite::protocol::CloseFrame {
                code: frame.code.into(),
                reason: frame.reason.to_string().into(),
            }
        }))),
    }
}

fn tungstenite_to_axum(msg: WsMsg) -> Result<AxumMsg, ()> {
    match msg {
        WsMsg::Text(t) => Ok(AxumMsg::Text(t.to_string().into())),
        WsMsg::Binary(b) => Ok(AxumMsg::Binary(b)),
        WsMsg::Ping(p) => Ok(AxumMsg::Ping(p)),
        WsMsg::Pong(p) => Ok(AxumMsg::Pong(p)),
        WsMsg::Close(c) => Ok(AxumMsg::Close(c.map(|frame| {
            axum::extract::ws::CloseFrame {
                code: frame.code.into(),
                reason: frame.reason.to_string().into(),
            }
        }))),
        _ => Err(()),
    }
}

use axum::extract::ws::{Message as AxumMsg, WebSocket as AxumWs};
use futures_util::{SinkExt, StreamExt};
use std::time::Duration;
use tokio_tungstenite::{
    connect_async_with_config,
    tungstenite::{
        client::IntoClientRequest,
        protocol::{Message as WsMsg, WebSocketConfig},
    },
};
use tracing::{debug, error, info};

use crate::auth::{SandboxAddress, WsLimits, get_http_client, get_proxy_secret};

mod error;
mod message;
mod url;

use error::{RelayError, RelayResult};
use message::{
    UpstreamControl, WS_CLOSE_INTERNAL_ERROR_CODE, axum_to_tungstenite, client_close_message,
    close_client_ws, is_upstream_closed_error, send_client_close, send_client_close_message,
    send_upstream_close, send_upstream_flush, tungstenite_to_axum, upstream_close_message,
    upstream_error_client_close,
};
pub(crate) use url::build_http_preview_url;
use url::{build_ws_upstream_base_url, redact_sensitive_query};

type UpstreamWsStream =
    tokio_tungstenite::WebSocketStream<tokio_tungstenite::MaybeTlsStream<tokio::net::TcpStream>>;

const UPSTREAM_CONNECT_MAX_ATTEMPTS: u8 = 10;
const UPSTREAM_CONNECT_RETRY_DELAY: Duration = Duration::from_millis(300);

fn upstream_ws_config(ws_limits: WsLimits) -> WebSocketConfig {
    WebSocketConfig::default()
        .max_message_size(Some(ws_limits.max_message_bytes))
        .max_frame_size(Some(ws_limits.max_frame_bytes))
}

/// 连接沙盒内的 IDE Agent，允许 agent 冷启动时出现短暂端口不可用。
async fn connect_upstream_with_retry(
    target_url: String,
    ws_limits: WsLimits,
) -> RelayResult<UpstreamWsStream> {
    let mut attempts = 0;
    let safe_target_url = redact_sensitive_query(&target_url);

    loop {
        attempts += 1;

        let request = target_url
            .clone()
            .into_client_request()
            .map_err(|source| RelayError::WebSocketRequest { source })?;

        match connect_async_with_config(request, Some(upstream_ws_config(ws_limits)), false).await {
            Ok((ws, _)) => return Ok(ws),
            Err(source) => {
                let error_message = source.to_string();
                error!(
                    "[WSProxy] Attempt {}/{} to connect upstream failed: {}. (Target: {})",
                    attempts, UPSTREAM_CONNECT_MAX_ATTEMPTS, error_message, safe_target_url
                );

                if attempts >= UPSTREAM_CONNECT_MAX_ATTEMPTS {
                    return Err(RelayError::upstream_connect(attempts, source));
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
    let ws_limits = address.ws_limits;

    let target_url = match address.sandbox_url.as_deref().filter(|url| !url.is_empty()) {
        Some(url) => {
            let ws_base = match build_ws_upstream_base_url(url) {
                Ok(ws_base) => ws_base,
                Err(err) => {
                    error!("[WSProxy] {}", err);
                    close_client_ws(&mut client_sink, 1008, "Invalid sandbox endpoint").await;
                    return;
                }
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

    let connect_fut = connect_upstream_with_retry(target_url, ws_limits);
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
        if let Err(err) = up_sink.send(axum_to_tungstenite(buffered_msg)).await {
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
                                        if is_upstream_closed_error(&err) {
                                            debug!("[WSProxy] Upstream already closed while forwarding client Close frame: {}", err);
                                        } else {
                                            error!("[WSProxy] Error forwarding client Close frame to upstream: {}", err);
                                        }
                                    }
                                    break;
                                }
                                msg => {
                                    if let Err(err) = up_sink.send(axum_to_tungstenite(msg)).await {
                                        if is_upstream_closed_error(&err) {
                                            debug!("[WSProxy] Upstream closed while forwarding client message: {}", err);
                                        } else {
                                            error!("[WSProxy] Error forwarding client message to upstream: {}", err);
                                        }
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
                    send_upstream_flush(&upstream_to_client_upstream_control_tx);
                    send_client_close_message(
                        &upstream_to_client_close_tx,
                        tungstenite_to_axum(WsMsg::Close(frame))
                            .unwrap_or_else(|| client_close_message(1000, "Sandbox agent closed")),
                    );
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
                    if is_upstream_closed_error(&err) {
                        debug!("[WSProxy] Upstream stream closed: {}", err);
                    } else {
                        error!("[WSProxy] Upstream stream read error: {}", err);
                    }
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
        let client = get_http_client();
        let app_url = std::env::var("FASTGPT_APP_URL")
            .unwrap_or_else(|_| "http://localhost:3000".to_string());
        let clean_app_url = app_url.trim_end_matches('/');
        let request_url = format!("{}/api/core/ai/sandbox/keepalive", clean_app_url);

        let mut fail_count = 0;
        loop {
            tokio::time::sleep(Duration::from_secs(120)).await;

            debug!(
                "[KeepAlive] Sending heartbeat for sourceType: {}, sourceId: {}, chatId: {}",
                claims.source_type, claims.source_id, claims.chat_id
            );

            let body = serde_json::json!({
                "sourceType": claims.source_type,
                "sourceId": claims.source_id,
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
        let _ = client_writer.await;
    }

    info!("[WSProxy] Bidirectional forwarding pipelines successfully closed.");
}

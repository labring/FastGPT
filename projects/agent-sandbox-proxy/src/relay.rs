use axum::extract::ws::{Message as AxumMsg, WebSocket as AxumWs};
use futures_util::{SinkExt, StreamExt};
use std::time::Duration;
use tokio_tungstenite::{
    connect_async, tungstenite::client::IntoClientRequest, tungstenite::protocol::Message as WsMsg,
};
use tracing::{debug, error, info};

use crate::auth::SandboxAddress;

type UpstreamWsStream =
    tokio_tungstenite::WebSocketStream<tokio_tungstenite::MaybeTlsStream<tokio::net::TcpStream>>;

/// 连接沙盒内的 IDE Agent，允许 agent 冷启动时出现短暂端口不可用。
async fn connect_upstream_with_retry(target_url: String) -> Result<UpstreamWsStream, String> {
    let mut attempts = 0;
    let max_attempts = 3;
    let retry_delay = Duration::from_millis(150);
    let safe_target_url = redact_sensitive_query(&target_url);

    loop {
        attempts += 1;

        let request = match target_url.clone().into_client_request() {
            Ok(req) => req,
            Err(err) => return Err(format!("Failed to build WebSocket request: {}", err)),
        };

        match connect_async(request).await {
            Ok((ws, _)) => return Ok(ws),
            Err(err) => {
                let err_str = err.to_string();
                error!(
                    "[WSProxy] Attempt {}/{} to connect upstream failed: {}. (Target: {})",
                    attempts, max_attempts, err_str, safe_target_url
                );

                if attempts >= max_attempts {
                    let friendly_hint = if err_str.contains("sec-websocket-key") {
                        "Upstream returned a non-101 HTTP error (e.g. 401 Unauthorized or 502 Bad Gateway). \
                         This typically means the sandboxed agent has not fully started up yet, \
                         or failed to bind to its port 1318.".to_string()
                    } else {
                        err_str
                    };
                    return Err(friendly_hint);
                }

                tokio::time::sleep(retry_delay).await;
            }
        }
    }
}

/// 建立浏览器与沙盒 IDE Agent 的双向 WebSocket 中继。
pub async fn handle_relay(
    client_ws: AxumWs,
    address: SandboxAddress,
    claims: crate::auth::Claims,
    ticket: String,
    is_terminal: bool,
) {
    let (client_sink, mut client_stream) = client_ws.split();

    let token_to_forward = &ticket;

    // 根据 provider 返回的 endpoint 形态拼接 IDE Agent 的真实 WebSocket 地址。
    let target_url = match address.sandbox_url {
        Some(ref url) if !url.is_empty() => {
            let ws_base = url
                .replace("http://", "ws://")
                .replace("https://", "wss://");

            let ws_base = if ws_base.ends_with('/') {
                &ws_base[..ws_base.len() - 1]
            } else {
                &ws_base
            };

            format!(
                "{}{}?token={}",
                ws_base,
                if is_terminal { "/terminal" } else { "/fs" },
                token_to_forward
            )
        }
        _ => {
            let port = address.sandbox_port.unwrap_or(1318);
            format!(
                "ws://{}:{}/proxy/{}/port/1318{}?token={}",
                address.sandbox_ip,
                port,
                address.sandbox_id,
                if is_terminal { "/terminal" } else { "/fs" },
                token_to_forward
            )
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
        if let Ok(ws_msg) = axum_to_tungstenite(buffered_msg) {
            if let Err(err) = up_sink.send(ws_msg).await {
                error!(
                    "[WSProxy] Error flushing buffered message to upstream: {}",
                    err
                );
                return;
            }
        }
    }

    // Client -> Upstream
    let client_to_upstream = client_stream
        .filter_map(|msg_res| async {
            match msg_res {
                Ok(msg) => axum_to_tungstenite(msg).ok().map(Ok),
                Err(err) => {
                    let err_str = err.to_string();
                    if err_str.contains("reset")
                        || err_str.contains("closed")
                        || err_str.contains("Broken pipe")
                    {
                        debug!("[WSProxy] Client stream physical disconnect: {}", err_str);
                    } else {
                        error!("[WSProxy] Client stream read error: {}", err_str);
                    }
                    None
                }
            }
        })
        .forward(up_sink);

    // Upstream -> Client
    let upstream_to_client = up_stream
        .filter_map(|msg_res| async {
            match msg_res {
                Ok(msg) => tungstenite_to_axum(msg).ok().map(Ok),
                Err(err) => {
                    let err_str = err.to_string();
                    if err_str.contains("reset")
                        || err_str.contains("closed")
                        || err_str.contains("Broken pipe")
                    {
                        debug!("[WSProxy] Upstream stream physical disconnect: {}", err_str);
                    } else {
                        error!("[WSProxy] Upstream stream read error: {}", err_str);
                    }
                    None
                }
            }
        })
        .forward(client_sink);

    // WebSocket 存续期间周期性刷新 sandbox 活跃时间。
    let keepalive_loop = async {
        let client = crate::auth::get_http_client();
        let app_url = std::env::var("FASTGPT_APP_URL")
            .unwrap_or_else(|_| "http://localhost:3000".to_string());
        let clean_app_url = app_url.trim_end_matches('/');
        let request_url = format!("{}/api/core/ai/sandbox/keepalive", clean_app_url);

        let proxy_secret = std::env::var("AGENT_SANDBOX_PROXY_SECRET")
            .ok()
            .filter(|s| !s.trim().is_empty());

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

            let mut request = client.post(&request_url).json(&body);

            if let Some(ref secret) = proxy_secret {
                request = request.header("X-Proxy-Token", secret);
            }

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
                            error!("[KeepAlive] Permanent client or permission error. Forcing connection termination!");
                            break;
                        }

                        fail_count += 1;
                        if fail_count >= 3 {
                            error!("[KeepAlive] Heartbeat failed consecutively for 3 times. Forcing connection termination!");
                            break;
                        }
                    }
                }
                Err(err) => {
                    error!("[KeepAlive] Failed to send heartbeat request: {}", err);
                    fail_count += 1;
                    if fail_count >= 3 {
                        error!("[KeepAlive] Heartbeat failed consecutively for 3 times. Forcing connection termination!");
                        break;
                    }
                }
            }
        }
    };

    // 任意方向断开或保活失败时，select 会 Drop 其它 future 并释放连接。
    tokio::select! {
        res_c2u = client_to_upstream => {
            if let Err(err) = res_c2u {
                let err_str = err.to_string();
                if !is_clean_close_error(&err_str) {
                    error!("[WSProxy] Client to Upstream pipeline finished with error: {:?}", err_str);
                } else {
                    debug!("[WSProxy] Client to Upstream pipeline finished cleanly (physical close): {:?}", err_str);
                }
            }
        }
        res_u2c = upstream_to_client => {
            if let Err(err) = res_u2c {
                let err_str = err.to_string();
                if !is_clean_close_error(&err_str) {
                    error!("[WSProxy] Upstream to Client pipeline finished with error: {:?}", err_str);
                } else {
                    debug!("[WSProxy] Upstream to Client pipeline finished cleanly (physical close): {:?}", err_str);
                }
            }
        }
        _ = keepalive_loop => {
            // keepalive_loop 会伴随 WebSocket 连接断开被自动 Drop，无需手动退出
        }
    }

    info!("[WSProxy] Bidirectional forwarding pipelines successfully closed.");
}

fn is_clean_close_error(err_str: &str) -> bool {
    err_str.contains("AlreadyClosed")
        || err_str.contains("reset")
        || err_str.contains("closed")
        || err_str.contains("closing")
        || err_str.contains("Broken pipe")
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
        AxumMsg::Text(t) => Ok(WsMsg::Text(t)),
        AxumMsg::Binary(b) => Ok(WsMsg::Binary(b)),
        AxumMsg::Ping(p) => Ok(WsMsg::Ping(p)),
        AxumMsg::Pong(p) => Ok(WsMsg::Pong(p)),
        AxumMsg::Close(c) => Ok(WsMsg::Close(c.map(|frame| {
            tokio_tungstenite::tungstenite::protocol::CloseFrame {
                code: frame.code.into(),
                reason: frame.reason,
            }
        }))),
    }
}

fn tungstenite_to_axum(msg: WsMsg) -> Result<AxumMsg, ()> {
    match msg {
        WsMsg::Text(t) => Ok(AxumMsg::Text(t)),
        WsMsg::Binary(b) => Ok(AxumMsg::Binary(b)),
        WsMsg::Ping(p) => Ok(AxumMsg::Ping(p)),
        WsMsg::Pong(p) => Ok(AxumMsg::Pong(p)),
        WsMsg::Close(c) => Ok(AxumMsg::Close(c.map(|frame| {
            axum::extract::ws::CloseFrame {
                code: frame.code.into(),
                reason: frame.reason,
            }
        }))),
        _ => Err(()),
    }
}

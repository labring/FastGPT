use std::sync::Arc;
use std::time::Duration;

use futures_util::SinkExt;
use tokio::net::TcpStream;
use tokio::sync::{mpsc, oneshot, watch};
use tokio_tungstenite::tungstenite::Message;
use tokio_tungstenite::tungstenite::protocol::frame::CloseFrame;
use tracing::error;

pub(crate) async fn finish_or_abort<T>(task: &mut tokio::task::JoinHandle<T>) {
    if !task.is_finished() {
        let _ = tokio::time::timeout(Duration::from_millis(200), &mut *task).await;
    }
    if !task.is_finished() {
        task.abort();
        let _ = task.await;
    }
}

pub(crate) async fn wait_for_shutdown(shutdown_rx: &mut watch::Receiver<bool>) {
    if shutdown_rx
        .wait_for(|shutting_down| *shutting_down)
        .await
        .is_err()
    {
        std::future::pending::<()>().await;
    }
}

pub(crate) async fn run_ws_send_loop<S>(
    mut ws_sink: S,
    mut outbound_rx: mpsc::Receiver<Message>,
    mut close_rx: oneshot::Receiver<Option<CloseFrame>>,
) where
    S: futures_util::Sink<Message> + Unpin,
{
    loop {
        tokio::select! {
            biased;
            close_reason = &mut close_rx => {
                // Flush already-queued responses/events before sending the terminal Close frame.
                let mut sink_ok = true;
                while let Ok(pending) = outbound_rx.try_recv() {
                    if ws_sink.send(pending).await.is_err() {
                        sink_ok = false;
                        break;
                    }
                }
                if sink_ok && let Ok(frame) = close_reason {
                    let _ = ws_sink.send(Message::Close(frame)).await;
                }
                break;
            }
            message = outbound_rx.recv() => {
                let Some(message) = message else {
                    break;
                };
                let should_stop = matches!(message, Message::Close(_));
                if ws_sink.send(message).await.is_err() || should_stop {
                    break;
                }
            }
        }
    }
}

use crate::fs::{FsPermission, handle_fs_session};
use crate::password::{AGENT_TOKEN_HEADER, verify_ide_agent_token};
use crate::terminal::handle_terminal_session;

const WS_MAX_MESSAGE_BYTES_ENV: &str = "FASTGPT_IDE_WS_MAX_MESSAGE_BYTES";
const WS_MAX_FRAME_BYTES_ENV: &str = "FASTGPT_IDE_WS_MAX_FRAME_BYTES";

fn read_positive_usize_env(key: &str) -> Option<usize> {
    std::env::var(key)
        .ok()?
        .parse::<usize>()
        .ok()
        .filter(|value| *value > 0)
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum Channel {
    Fs,
    Terminal,
}

fn ws_config() -> tokio_tungstenite::tungstenite::protocol::WebSocketConfig {
    let config = tokio_tungstenite::tungstenite::protocol::WebSocketConfig::default();
    let config = match read_positive_usize_env(WS_MAX_MESSAGE_BYTES_ENV) {
        Some(max_message_bytes) => config.max_message_size(Some(max_message_bytes)),
        None => config,
    };

    match read_positive_usize_env(WS_MAX_FRAME_BYTES_ENV) {
        Some(max_frame_bytes) => config.max_frame_size(Some(max_frame_bytes)),
        None => config,
    }
}

fn extract_token(
    req: &tokio_tungstenite::tungstenite::handshake::server::Request,
) -> Option<String> {
    req.headers()
        .get(AGENT_TOKEN_HEADER)
        .and_then(|value| value.to_str().ok())
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToString::to_string)
        .or_else(|| extract_query_value(req, "token"))
}

fn extract_query_value(
    req: &tokio_tungstenite::tungstenite::handshake::server::Request,
    target_key: &str,
) -> Option<String> {
    req.uri().query().and_then(|query| {
        query.split('&').find_map(|pair| {
            let (key, value) = pair.split_once('=')?;
            (key == target_key).then(|| value.to_string())
        })
    })
}

fn build_unauthorized_response(
    err: &str,
) -> tokio_tungstenite::tungstenite::handshake::server::ErrorResponse {
    let mut resp =
        tokio_tungstenite::tungstenite::http::Response::new(Some(format!("Unauthorized: {}", err)));
    *resp.status_mut() = tokio_tungstenite::tungstenite::http::StatusCode::UNAUTHORIZED;
    resp
}

#[allow(clippy::result_large_err)]
// tokio_tungstenite's Callback trait requires unboxed ErrorResponse.
fn validate_handshake_request(
    req: &tokio_tungstenite::tungstenite::handshake::server::Request,
    expected_password: &str,
) -> Result<(Channel, FsPermission), tokio_tungstenite::tungstenite::handshake::server::ErrorResponse>
{
    let parsed_channel = match req.uri().path() {
        "/fs" => Channel::Fs,
        "/terminal" => Channel::Terminal,
        _ => return Err(build_unauthorized_response("Unknown websocket path")),
    };

    let token_opt = extract_token(req);
    if !token_opt
        .as_deref()
        .is_some_and(|provided| verify_ide_agent_token(provided, expected_password))
    {
        return Err(build_unauthorized_response(
            "Invalid or missing agent token",
        ));
    }

    let fs_permission = match extract_query_value(req, "permission") {
        Some(value) => FsPermission::parse(&value)
            .ok_or_else(|| build_unauthorized_response("Invalid fs permission"))?,
        None => FsPermission::Read,
    };

    if parsed_channel == Channel::Terminal && fs_permission != FsPermission::Write {
        return Err(build_unauthorized_response(
            "Terminal connection requires write permission",
        ));
    }

    Ok((parsed_channel, fs_permission))
}

pub async fn handle_connection(
    stream: TcpStream,
    expected_password: Arc<String>,
    shutdown_rx: watch::Receiver<bool>,
) {
    let mut channel = None;
    let mut fs_permission = FsPermission::Read;

    #[allow(clippy::result_large_err)]
    // tokio_tungstenite's Callback trait requires unboxed ErrorResponse.
    let callback =
        |req: &tokio_tungstenite::tungstenite::handshake::server::Request,
         response: tokio_tungstenite::tungstenite::handshake::server::Response| {
            let (parsed_channel, permission) =
                validate_handshake_request(req, expected_password.as_str())?;
            channel = Some(parsed_channel);
            fs_permission = permission;
            Ok(response)
        };

    let handshake = tokio::time::timeout(
        Duration::from_secs(10),
        tokio_tungstenite::accept_hdr_async_with_config(stream, callback, Some(ws_config())),
    )
    .await;

    let ws_stream = match handshake {
        Ok(Ok(ws)) => ws,
        Ok(Err(e)) => {
            error!("Failed to accept websocket: {}", e);
            return;
        }
        Err(_) => {
            error!("Timed out waiting for websocket handshake");
            return;
        }
    };

    let Some(channel) = channel else {
        return;
    };
    match channel {
        Channel::Terminal => handle_terminal_session(ws_stream, shutdown_rx).await,
        Channel::Fs => handle_fs_session(ws_stream, fs_permission, shutdown_rx).await,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tokio_tungstenite::tungstenite::handshake::server::Request;

    fn ws_request(uri: &str) -> Request {
        Request::builder().uri(uri).body(()).unwrap()
    }

    fn ws_request_with_header(uri: &str, token: &str) -> Request {
        Request::builder()
            .uri(uri)
            .header(AGENT_TOKEN_HEADER, token)
            .body(())
            .unwrap()
    }

    #[test]
    fn validates_channels_and_permissions_with_header_or_query_token() {
        let secret = "ide-agent-secret-token";
        assert_eq!(
            validate_handshake_request(&ws_request_with_header("/fs", secret), secret).unwrap(),
            (Channel::Fs, FsPermission::Read)
        );
        assert_eq!(
            validate_handshake_request(
                &ws_request(&format!("/fs?permission=write&token={secret}")),
                secret
            )
            .unwrap(),
            (Channel::Fs, FsPermission::Write)
        );
        assert_eq!(
            validate_handshake_request(
                &ws_request_with_header("/terminal?permission=write", secret),
                secret
            )
            .unwrap(),
            (Channel::Terminal, FsPermission::Write)
        );
    }

    #[test]
    fn rejects_missing_wrong_token_invalid_paths_and_read_only_terminal() {
        let secret = "ide-agent-secret-token";
        assert!(validate_handshake_request(&ws_request("/fs"), secret).is_err());
        assert!(validate_handshake_request(&ws_request("/fs?token=wrong"), secret).is_err());
        assert!(
            validate_handshake_request(&ws_request_with_header("/fs", "wrong"), secret).is_err()
        );
        assert!(
            validate_handshake_request(&ws_request_with_header("/unknown", secret), secret)
                .is_err()
        );
        assert!(
            validate_handshake_request(&ws_request_with_header("/terminal", secret), secret)
                .is_err()
        );
        assert!(
            validate_handshake_request(
                &ws_request_with_header("/terminal?permission=read", secret),
                secret
            )
            .is_err()
        );
        assert!(
            validate_handshake_request(
                &ws_request_with_header("/fs?permission=admin", secret),
                secret
            )
            .is_err()
        );
    }
}

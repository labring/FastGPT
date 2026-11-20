use futures_util::{SinkExt, StreamExt};
use tokio::sync::watch;
use tokio_tungstenite::tungstenite::Message;
use tokio_tungstenite::tungstenite::protocol::frame::{CloseFrame, coding::CloseCode};
use tracing::error;

mod bridge;

use crate::connection::{finish_or_abort, run_ws_send_loop, wait_for_shutdown};
use crate::disk;
use bridge::{PtyBridge, PtyCommand};

/// Rejects opening a terminal session with an explicit policy close frame when volume quota is exceeded.
async fn reject_terminal_disk_quota<S>(
    mut ws_stream: tokio_tungstenite::WebSocketStream<S>,
    used: u64,
    limit: u64,
) where
    S: tokio::io::AsyncRead + tokio::io::AsyncWrite + Unpin + Send + 'static,
{
    let reason =
        format!("Disk quota exceeded ({used} >= {limit} bytes); delete unused files first");
    let _ = ws_stream
        .send(Message::Close(Some(CloseFrame {
            code: CloseCode::Policy,
            reason: reason.into(),
        })))
        .await;
    let _ = ws_stream.close(None).await;
}

/// Bridges one terminal WebSocket session to a child shell running in a PTY.
pub async fn handle_terminal_session<S>(
    ws_stream: tokio_tungstenite::WebSocketStream<S>,
    shutdown_rx: watch::Receiver<bool>,
) where
    S: tokio::io::AsyncRead + tokio::io::AsyncWrite + Unpin + Send + 'static,
{
    if let Err(exceeded) = disk::check_workspace_writable().await {
        reject_terminal_disk_quota(ws_stream, exceeded.used, exceeded.limit).await;
        return;
    }

    let (outbound_tx, rx) = tokio::sync::mpsc::channel::<Message>(100);
    let bridge = match PtyBridge::spawn(outbound_tx.clone()) {
        Ok(bridge) => bridge,
        Err(error) => {
            error!("Failed to spawn PTY: {error}");
            return;
        }
    };
    handle_terminal_session_with_bridge(ws_stream, shutdown_rx, bridge, outbound_tx, rx).await;
}

async fn handle_terminal_session_with_bridge<S>(
    ws_stream: tokio_tungstenite::WebSocketStream<S>,
    mut shutdown_rx: watch::Receiver<bool>,
    bridge: PtyBridge,
    outbound_tx: tokio::sync::mpsc::Sender<Message>,
    rx: tokio::sync::mpsc::Receiver<Message>,
) where
    S: tokio::io::AsyncRead + tokio::io::AsyncWrite + Unpin + Send + 'static,
{
    let (ws_sink, mut ws_source) = ws_stream.split();
    let command_tx = bridge.command_sender();
    let (close_tx, close_rx) = tokio::sync::oneshot::channel::<Option<CloseFrame>>();

    let mut send_task = tokio::spawn(run_ws_send_loop(ws_sink, rx, close_rx));

    let mut close_tx = Some(close_tx);
    let mut recv_task = tokio::spawn(async move {
        while let Some(Ok(msg)) = ws_source.next().await {
            match msg {
                Message::Binary(data) if data.len() == 13 && data[0] == 0xFE => {
                    let cols =
                        u16::try_from(u32::from_be_bytes([data[1], data[2], data[3], data[4]]))
                            .unwrap_or(u16::MAX);
                    let rows =
                        u16::try_from(u32::from_be_bytes([data[5], data[6], data[7], data[8]]))
                            .unwrap_or(u16::MAX);
                    if rows > 0
                        && cols > 0
                        && command_tx
                            .send(PtyCommand::Resize { rows, cols })
                            .await
                            .is_err()
                    {
                        break;
                    }
                }
                Message::Binary(data) => {
                    if command_tx
                        .send(PtyCommand::Write(data.to_vec()))
                        .await
                        .is_err()
                    {
                        break;
                    }
                }
                Message::Text(text) => {
                    if command_tx
                        .send(PtyCommand::Write(text.as_bytes().to_vec()))
                        .await
                        .is_err()
                    {
                        break;
                    }
                }
                Message::Close(frame) => {
                    if let Some(tx) = close_tx.take() {
                        let _ = tx.send(frame);
                    }
                    break;
                }
                _ => {}
            }
        }
    });

    tokio::select! {
        _ = &mut send_task => {},
        _ = &mut recv_task => {},
        _ = wait_for_shutdown(&mut shutdown_rx) => {
            let _ = outbound_tx
                .send(Message::Close(Some(CloseFrame {
                    code: CloseCode::Away,
                    reason: "Server shutting down".into(),
                })))
                .await;
        }
    }

    finish_or_abort(&mut send_task).await;
    finish_or_abort(&mut recv_task).await;

    drop(outbound_tx);
    bridge.shutdown().await;
}

#[cfg(test)]
mod tests {
    use super::*;
    use pty_process::Command;
    use std::time::Duration;
    use tokio_tungstenite::WebSocketStream;
    use tokio_tungstenite::tungstenite::protocol::Role;

    #[cfg(unix)]
    async fn run_test_pty_session(script: &str, fsize_limit: Option<u64>) -> Option<CloseFrame> {
        let (server_io, client_io) = tokio::io::duplex(4096);
        let server_ws = WebSocketStream::from_raw_socket(server_io, Role::Server, None).await;
        let mut client_ws = WebSocketStream::from_raw_socket(client_io, Role::Client, None).await;

        let (outbound_tx, rx) = tokio::sync::mpsc::channel::<Message>(100);
        let cmd = Command::new("/bin/sh").args(["-c", script]);
        let bridge = PtyBridge::spawn_for_test(cmd, fsize_limit, outbound_tx.clone()).unwrap();
        let (_shutdown_tx, shutdown_rx) = watch::channel(false);
        let session_task = tokio::spawn(handle_terminal_session_with_bridge(
            server_ws,
            shutdown_rx,
            bridge,
            outbound_tx,
            rx,
        ));

        let received_close = tokio::time::timeout(Duration::from_secs(5), async {
            while let Some(msg) = client_ws.next().await {
                if let Ok(Message::Close(frame)) = msg {
                    return frame;
                }
            }
            panic!("expected Close message");
        })
        .await
        .expect("timed out waiting for close frame");

        tokio::time::timeout(Duration::from_secs(5), session_task)
            .await
            .expect("terminal session did not shut down")
            .unwrap();
        received_close
    }

    #[cfg(unix)]
    #[tokio::test]
    async fn shell_exit_closes_websocket_with_normal_close_frame() {
        let frame = run_test_pty_session("printf hi; exit 0", None)
            .await
            .expect("expected CloseFrame payload");
        assert_eq!(frame.code, CloseCode::Normal);
        assert_eq!(frame.reason.as_str(), "Shell exited");
    }

    #[cfg(unix)]
    #[tokio::test]
    async fn pty_pre_exec_enforces_rlimit_fsize_on_child_shell() {
        let temp_dir = tempfile::tempdir().unwrap();
        let target = temp_dir.path().join("capped.bin");
        let script = format!(
            "head -c 4096 /dev/zero > '{}' 2>/dev/null; exit 0",
            target.display()
        );
        run_test_pty_session(&script, Some(1024)).await;

        let written_len = std::fs::metadata(&target).unwrap().len();
        assert!(
            written_len <= 1024,
            "expected <= 1024 bytes, got {written_len}"
        );
    }

    #[tokio::test]
    async fn quota_rejection_sends_policy_close_frame() {
        let (server_io, client_io) = tokio::io::duplex(4096);
        let server_ws = WebSocketStream::from_raw_socket(server_io, Role::Server, None).await;
        let mut client_ws = WebSocketStream::from_raw_socket(client_io, Role::Client, None).await;

        let reject_task = tokio::spawn(reject_terminal_disk_quota(server_ws, 2048, 1024));
        let msg = tokio::time::timeout(Duration::from_secs(5), client_ws.next())
            .await
            .expect("timed out waiting for quota close frame")
            .unwrap()
            .unwrap();
        let Message::Close(Some(frame)) = msg else {
            panic!("expected Close frame, got {msg:?}");
        };
        assert_eq!(frame.code, CloseCode::Policy);
        assert!(frame.reason.contains("Disk quota exceeded"));
        reject_task.await.unwrap();
    }
}

use futures_util::StreamExt;
use tokio::sync::watch;
use tokio_tungstenite::tungstenite::Message;
use tokio_tungstenite::tungstenite::protocol::frame::{CloseFrame, coding::CloseCode};
use tracing::error;

mod bridge;

use crate::connection::{finish_or_abort, run_ws_send_loop, wait_for_shutdown};
use crate::disk;
use bridge::{PtyBridge, PtyCommand};

fn build_terminal_disk_quota_banner(used: u64, limit: u64) -> String {
    format!(
        "\r\n\x1b[33m[Disk Quota Exceeded]\x1b[0m Storage usage ({used} bytes) reached limit ({limit} bytes).\r\n\
         File creation/expansion is restricted (RLIMIT_FSIZE=0, HISTFILE=/dev/null).\r\n\
         Remove unused workspace files or clean $HOME caches (e.g. ~/.bun, ~/.npm, ~/.cache) to recover.\r\n\r\n"
    )
}

/// Bridges one terminal WebSocket session to a child shell running in a PTY.
pub async fn handle_terminal_session<S>(
    ws_stream: tokio_tungstenite::WebSocketStream<S>,
    shutdown_rx: watch::Receiver<bool>,
) where
    S: tokio::io::AsyncRead + tokio::io::AsyncWrite + Unpin + Send + 'static,
{
    let quota_exceeded = disk::check_workspace_writable().await.err();
    let (outbound_tx, rx) = tokio::sync::mpsc::channel::<Message>(100);
    if let Some(exceeded) = quota_exceeded {
        let banner = build_terminal_disk_quota_banner(exceeded.used, exceeded.limit);
        let _ = outbound_tx.try_send(Message::Binary(banner.into_bytes().into()));
    }

    let bridge = match PtyBridge::spawn(outbound_tx.clone(), quota_exceeded.is_some()) {
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
    async fn run_test_pty_session(
        script: &str,
        fsize_limit: Option<u64>,
        pre_banner: Option<String>,
    ) -> (Vec<u8>, Option<CloseFrame>) {
        let (server_io, client_io) = tokio::io::duplex(4096);
        let server_ws = WebSocketStream::from_raw_socket(server_io, Role::Server, None).await;
        let mut client_ws = WebSocketStream::from_raw_socket(client_io, Role::Client, None).await;

        let (outbound_tx, rx) = tokio::sync::mpsc::channel::<Message>(100);
        if let Some(banner) = pre_banner {
            let _ = outbound_tx.try_send(Message::Binary(banner.into_bytes().into()));
        }
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

        let mut received_bytes = Vec::new();
        let received_close = tokio::time::timeout(Duration::from_secs(5), async {
            while let Some(msg) = client_ws.next().await {
                match msg.unwrap() {
                    Message::Binary(data) => received_bytes.extend_from_slice(&data),
                    Message::Close(frame) => return frame,
                    _ => {}
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
        (received_bytes, received_close)
    }

    #[cfg(unix)]
    #[tokio::test]
    async fn shell_exit_closes_websocket_with_normal_close_frame() {
        let (_, frame) = run_test_pty_session("printf hi; exit 0", None, None).await;
        let frame = frame.expect("expected CloseFrame payload");
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
        run_test_pty_session(&script, Some(1024), None).await;

        let written_len = std::fs::metadata(&target).unwrap().len();
        assert!(
            written_len <= 1024,
            "expected <= 1024 bytes, got {written_len}"
        );
    }

    #[cfg(unix)]
    #[tokio::test]
    async fn over_quota_pty_enforces_zero_fsize_and_prepares_self_rescue_banner() {
        let temp_dir = tempfile::tempdir().unwrap();
        let target = temp_dir.path().join("blocked.bin");
        let banner = build_terminal_disk_quota_banner(2048, 1024);
        assert!(banner.contains("Disk Quota Exceeded"));
        assert!(banner.contains("RLIMIT_FSIZE=0"));
        assert!(banner.contains("HISTFILE=/dev/null"));

        let script = format!(
            "head -c 4096 /dev/zero > '{}' 2>/dev/null; exit 0",
            target.display()
        );
        let (received_text, _) = run_test_pty_session(&script, Some(0), Some(banner)).await;

        let output = String::from_utf8_lossy(&received_text);
        assert!(output.contains("Disk Quota Exceeded"));
        let written_len = std::fs::metadata(&target).map(|m| m.len()).unwrap_or(0);
        assert_eq!(
            written_len, 0,
            "RLIMIT_FSIZE=0 must block writing any bytes"
        );
    }
}

use std::time::Duration;

use futures_util::{SinkExt, StreamExt};
use tokio_tungstenite::tungstenite::Message;
use tokio_tungstenite::tungstenite::protocol::frame::CloseFrame;

mod bridge;

use bridge::{PtyBridge, PtyCommand};

/// Bridges one terminal WebSocket session to a child shell running in a PTY.
pub async fn handle_terminal_session<S>(ws_stream: tokio_tungstenite::WebSocketStream<S>)
where
    S: tokio::io::AsyncRead + tokio::io::AsyncWrite + Unpin + Send + 'static,
{
    let (mut ws_sink, mut ws_source) = ws_stream.split();

    let (outbound_tx, mut rx) = tokio::sync::mpsc::channel::<Message>(100);
    let bridge = match PtyBridge::spawn(outbound_tx.clone()).await {
        Ok(bridge) => bridge,
        Err(error) => {
            eprintln!("Failed to spawn PTY: {error}");
            return;
        }
    };
    let command_tx = bridge.command_sender();
    let (close_tx, mut close_rx) = tokio::sync::oneshot::channel::<Option<CloseFrame>>();

    let mut send_task = tokio::spawn(async move {
        loop {
            tokio::select! {
                biased;
                close_reason = &mut close_rx => {
                    if let Ok(frame) = close_reason {
                        let _ = ws_sink.send(Message::Close(frame)).await;
                    }
                    break;
                }
                message = rx.recv() => {
                    let Some(message) = message else {
                        break;
                    };
                    if ws_sink.send(message).await.is_err() {
                        break;
                    }
                }
            }
        }
    });

    let mut close_tx = Some(close_tx);
    let mut recv_task = tokio::spawn(async move {
        while let Some(Ok(msg)) = ws_source.next().await {
            match msg {
                Message::Binary(data) if data.len() == 13 && data[0] == 0xFE => {
                    let cols = u32::from_be_bytes([data[1], data[2], data[3], data[4]]);
                    let rows = u32::from_be_bytes([data[5], data[6], data[7], data[8]]);
                    if command_tx
                        .send(PtyCommand::Resize {
                            rows: rows as u16,
                            cols: cols as u16,
                        })
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
    }

    if !send_task.is_finished() {
        let _ = tokio::time::timeout(Duration::from_millis(200), &mut send_task).await;
    }
    if !recv_task.is_finished() {
        let _ = tokio::time::timeout(Duration::from_millis(200), &mut recv_task).await;
    }

    if !send_task.is_finished() {
        send_task.abort();
        let _ = send_task.await;
    }
    if !recv_task.is_finished() {
        recv_task.abort();
        let _ = recv_task.await;
    }

    drop(outbound_tx);
    if let Err(error) = bridge.shutdown().await {
        eprintln!("Failed to shut down PTY: {error}");
    }
}

use std::time::Duration;

use futures_util::{SinkExt, StreamExt};
use tokio::sync::mpsc;
use tokio_tungstenite::tungstenite::Message;
use tokio_tungstenite::tungstenite::protocol::frame::CloseFrame;

use crate::protocol::{JsonRpcRequest, JsonRpcResponse};

mod error;
mod handlers;
mod watcher;

use error::FsError;
use handlers::{
    handle_delete, handle_exec, handle_mkdir, handle_move, handle_read_dir,
    handle_read_dir_recursive, handle_read_file, handle_write_file,
};
use watcher::{forward_fs_change_batches, fs_watch_hub};

/// Access level attached to one filesystem WebSocket session.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum FsPermission {
    Read,
    Write,
}

impl FsPermission {
    /// Parses the permission value carried by the authenticated proxy request.
    pub fn parse(value: &str) -> Option<Self> {
        match value {
            "read" => Some(Self::Read),
            "write" => Some(Self::Write),
            _ => None,
        }
    }

    fn can_write(self) -> bool {
        matches!(self, Self::Write)
    }
}

fn is_write_fs_method(method: &str) -> bool {
    matches!(
        method,
        "fs/write_file" | "fs/mkdir" | "fs/delete" | "fs/move" | "fs/exec"
    )
}

async fn handle_fs_request(req: JsonRpcRequest, permission: FsPermission) -> JsonRpcResponse {
    if !permission.can_write() && is_write_fs_method(req.method.as_str()) {
        return JsonRpcResponse {
            jsonrpc: "2.0".to_string(),
            id: req.id,
            result: None,
            error: Some(FsError::PermissionDenied.into()),
        };
    }

    let result = match req.method.as_str() {
        "fs/read_dir" => handle_read_dir(req.params).await,
        "fs/read_dir_recursive" => handle_read_dir_recursive(req.params).await,
        "fs/read_file" => handle_read_file(req.params).await,
        "fs/write_file" => handle_write_file(req.params).await,
        "fs/mkdir" => handle_mkdir(req.params).await,
        "fs/delete" => handle_delete(req.params).await,
        "fs/move" => handle_move(req.params).await,
        "fs/exec" => handle_exec(req.params).await,
        _ => Err(FsError::MethodNotFound),
    };

    match result {
        Ok(res) => JsonRpcResponse {
            jsonrpc: "2.0".to_string(),
            id: req.id,
            result: Some(res),
            error: None,
        },
        Err(error) => JsonRpcResponse {
            jsonrpc: "2.0".to_string(),
            id: req.id,
            result: None,
            error: Some(error.into()),
        },
    }
}

/// Serves JSON-RPC filesystem requests and workspace change notifications over WebSocket.
pub async fn handle_fs_session<S>(
    ws_stream: tokio_tungstenite::WebSocketStream<S>,
    permission: FsPermission,
) where
    S: tokio::io::AsyncRead + tokio::io::AsyncWrite + Unpin + Send + 'static,
{
    let (mut ws_sink, mut ws_source) = ws_stream.split();
    let (outbound_tx, mut outbound_rx) = mpsc::channel::<Message>(100);
    let (close_tx, mut close_rx) = tokio::sync::oneshot::channel::<Option<CloseFrame>>();
    let mut fs_change_task = tokio::spawn(forward_fs_change_batches(
        fs_watch_hub().tx.subscribe(),
        outbound_tx.clone(),
    ));

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
                message = outbound_rx.recv() => {
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
            let text_opt = match msg {
                Message::Text(t) => Some(t.to_string()),
                Message::Binary(b) => String::from_utf8(b.to_vec()).ok(),
                Message::Close(frame) => {
                    if let Some(tx) = close_tx.take() {
                        let _ = tx.send(frame);
                    }
                    break;
                }
                _ => None,
            };

            let Some(text) = text_opt else {
                continue;
            };
            let Ok(req) = serde_json::from_str::<JsonRpcRequest>(&text) else {
                continue;
            };

            let response = handle_fs_request(req, permission).await;
            if let Ok(response_text) = serde_json::to_string(&response)
                && outbound_tx
                    .send(Message::Text(response_text.into()))
                    .await
                    .is_err()
            {
                break;
            }
        }
    });

    tokio::select! {
        _ = &mut send_task => {},
        _ = &mut recv_task => {},
        _ = &mut fs_change_task => {},
    }

    if !send_task.is_finished() {
        let _ = tokio::time::timeout(Duration::from_millis(200), &mut send_task).await;
    }
    if !recv_task.is_finished() {
        let _ = tokio::time::timeout(Duration::from_millis(200), &mut recv_task).await;
    }
    if !fs_change_task.is_finished() {
        let _ = tokio::time::timeout(Duration::from_millis(200), &mut fs_change_task).await;
    }

    if !send_task.is_finished() {
        send_task.abort();
        let _ = send_task.await;
    }
    if !recv_task.is_finished() {
        recv_task.abort();
        let _ = recv_task.await;
    }
    if !fs_change_task.is_finished() {
        fs_change_task.abort();
        let _ = fs_change_task.await;
    }
}

#[cfg(test)]
mod tests;

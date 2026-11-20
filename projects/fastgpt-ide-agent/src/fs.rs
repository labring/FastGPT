use futures_util::StreamExt;
use tokio::sync::{mpsc, watch};
use tokio_tungstenite::tungstenite::Message;
use tokio_tungstenite::tungstenite::protocol::frame::{CloseFrame, coding::CloseCode};

use crate::connection::{finish_or_abort, run_ws_send_loop, wait_for_shutdown};
use crate::disk;
use crate::protocol::{JsonRpcError, JsonRpcErrorCode, JsonRpcRequest, JsonRpcResponse};

mod error;
mod handlers;
mod watcher;

use error::FsError;
use handlers::{
    handle_delete, handle_mkdir, handle_move, handle_read_dir, handle_read_dir_recursive,
    handle_read_file, handle_write_file,
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
}

fn is_write_fs_method(method: &str) -> bool {
    matches!(
        method,
        "fs/write_file" | "fs/mkdir" | "fs/delete" | "fs/move"
    )
}

async fn handle_fs_request(req: JsonRpcRequest, permission: FsPermission) -> JsonRpcResponse {
    handle_fs_request_with_limit(req, permission, disk::disk_soft_limit_bytes()).await
}

async fn handle_fs_request_with_limit(
    req: JsonRpcRequest,
    permission: FsPermission,
    disk_limit: Option<u64>,
) -> JsonRpcResponse {
    let result = async {
        let method = req.method.as_str();
        if permission != FsPermission::Write && is_write_fs_method(method) {
            return Err(FsError::PermissionDenied);
        }
        if matches!(method, "fs/write_file" | "fs/mkdir")
            && let Err(exceeded) = disk::check_workspace_writable_with_limit(disk_limit).await
        {
            return Err(FsError::DiskQuotaExceeded {
                used: exceeded.used,
                limit: exceeded.limit,
            });
        }
        let value = match method {
            "fs/read_dir" => handle_read_dir(req.params).await,
            "fs/read_dir_recursive" => handle_read_dir_recursive(req.params).await,
            "fs/read_file" => handle_read_file(req.params).await,
            "fs/write_file" => handle_write_file(req.params).await,
            "fs/mkdir" => handle_mkdir(req.params).await,
            "fs/delete" => handle_delete(req.params).await,
            "fs/move" => handle_move(req.params).await,
            _ => Err(FsError::MethodNotFound),
        }?;
        if method == "fs/delete" {
            disk::invalidate_disk_usage_cache();
        }
        Ok(value)
    }
    .await;

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
    mut shutdown_rx: watch::Receiver<bool>,
) where
    S: tokio::io::AsyncRead + tokio::io::AsyncWrite + Unpin + Send + 'static,
{
    let (ws_sink, mut ws_source) = ws_stream.split();
    let (outbound_tx, outbound_rx) = mpsc::channel::<Message>(100);
    let (close_tx, close_rx) = tokio::sync::oneshot::channel::<Option<CloseFrame>>();
    let mut fs_change_task = tokio::spawn(forward_fs_change_batches(
        fs_watch_hub().tx.subscribe(),
        outbound_tx.clone(),
    ));

    let mut send_task = tokio::spawn(run_ws_send_loop(ws_sink, outbound_rx, close_rx));

    let mut close_tx = Some(close_tx);
    let outbound_tx_for_recv = outbound_tx.clone();
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
            let req = match serde_json::from_str::<JsonRpcRequest>(&text) {
                Ok(req) => req,
                Err(err) => {
                    let parse_err = JsonRpcResponse {
                        jsonrpc: "2.0".to_string(),
                        id: serde_json::Value::Null,
                        result: None,
                        error: Some(JsonRpcError {
                            code: JsonRpcErrorCode::ParseError,
                            message: format!("Parse error: {err}"),
                        }),
                    };
                    if let Ok(err_text) = serde_json::to_string(&parse_err)
                        && outbound_tx_for_recv
                            .send(Message::Text(err_text.into()))
                            .await
                            .is_err()
                    {
                        break;
                    }
                    continue;
                }
            };

            let response = handle_fs_request(req, permission).await;
            if let Ok(response_text) = serde_json::to_string(&response)
                && outbound_tx_for_recv
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
    finish_or_abort(&mut fs_change_task).await;
}

#[cfg(test)]
mod tests;

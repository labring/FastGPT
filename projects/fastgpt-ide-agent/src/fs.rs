use std::collections::{BTreeSet, HashSet};
use std::path::Path;
use std::sync::Arc;
use std::time::{Duration, SystemTime};

use base64::Engine;
use futures_util::{SinkExt, StreamExt};
use notify::event::ModifyKind;
use notify::{Event, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use serde::{Deserialize, Serialize};
use serde_json::json;
use tokio_tungstenite::tungstenite::Message;
use tokio_tungstenite::tungstenite::protocol::frame::CloseFrame;

use crate::protocol::{JsonRpcError, JsonRpcNotification, JsonRpcRequest, JsonRpcResponse};
use crate::workspace::{
    get_workspace_root, is_workspace_root_path, normalize_workspace_relative_path,
    sanitize_create_path, sanitize_path,
};

const DEFAULT_EXCLUDED_NAMES: &[&str] = &["node_modules", ".git", ".next", "dist", "build", ".bun"];
const FS_CHANGE_DEBOUNCE_MS: u64 = 500;
const FS_CHANGE_MAX_PATHS: usize = 200;
const DEFAULT_MAX_FILE_BYTES: u64 = 10 * 1024 * 1024;

fn max_file_bytes() -> u64 {
    std::env::var("FASTGPT_IDE_MAX_FILE_BYTES")
        .ok()
        .and_then(|value| value.parse::<u64>().ok())
        .filter(|value| *value > 0)
        .unwrap_or(DEFAULT_MAX_FILE_BYTES)
}

fn default_exclude_names() -> HashSet<String> {
    DEFAULT_EXCLUDED_NAMES
        .iter()
        .map(|name| (*name).to_string())
        .collect()
}

fn get_fs_event_kind(event_kind: &EventKind) -> Option<&'static str> {
    match event_kind {
        EventKind::Create(_) => Some("create"),
        EventKind::Remove(_) => Some("remove"),
        EventKind::Modify(ModifyKind::Name(_)) => Some("rename"),
        EventKind::Modify(_) => Some("modify"),
        _ => None,
    }
}

fn collect_fs_event_paths(event: &Event) -> Vec<String> {
    event
        .paths
        .iter()
        .filter_map(|path| normalize_workspace_relative_path(path))
        .collect()
}

fn build_fs_change_notification(
    paths: Vec<String>,
    kinds: Vec<String>,
    overflow: bool,
) -> JsonRpcNotification {
    JsonRpcNotification {
        jsonrpc: "2.0".to_string(),
        method: "fs/did_change".to_string(),
        params: json!({
            "paths": paths,
            "kinds": kinds,
            "overflow": overflow
        }),
    }
}

fn start_fs_watcher(outbound_tx: tokio::sync::mpsc::Sender<Message>) -> Option<RecommendedWatcher> {
    let root = get_workspace_root().to_path_buf();
    let (event_tx, mut event_rx) = tokio::sync::mpsc::channel::<notify::Result<Event>>(1000);

    let mut watcher = match notify::recommended_watcher(move |res| {
        let _ = event_tx.try_send(res);
    }) {
        Ok(watcher) => watcher,
        Err(err) => {
            eprintln!("Failed to create workspace watcher: {}", err);
            return None;
        }
    };

    if let Err(err) = watcher.watch(&root, RecursiveMode::Recursive) {
        eprintln!("Failed to watch workspace {:?}: {}", root, err);
        return None;
    }

    tokio::spawn(async move {
        let mut pending_paths = BTreeSet::<String>::new();
        let mut pending_kinds = BTreeSet::<String>::new();
        let mut overflow = false;
        let debounce = tokio::time::sleep(Duration::from_millis(FS_CHANGE_DEBOUNCE_MS));
        tokio::pin!(debounce);
        let mut timer_active = false;

        loop {
            tokio::select! {
                maybe_event = event_rx.recv() => {
                    let Some(event_res) = maybe_event else {
                        break;
                    };

                    let event = match event_res {
                        Ok(event) => event,
                        Err(err) => {
                            eprintln!("Workspace watcher event error: {}", err);
                            continue;
                        }
                    };

                    let Some(kind) = get_fs_event_kind(&event.kind) else {
                        continue;
                    };

                    let paths = collect_fs_event_paths(&event);
                    if paths.is_empty() {
                        continue;
                    }

                    pending_kinds.insert(kind.to_string());
                    for path in paths {
                        if pending_paths.len() >= FS_CHANGE_MAX_PATHS {
                            overflow = true;
                        } else {
                            pending_paths.insert(path);
                        }
                    }

                    debounce.as_mut().reset(tokio::time::Instant::now() + Duration::from_millis(FS_CHANGE_DEBOUNCE_MS));
                    timer_active = true;
                }

                _ = &mut debounce, if timer_active => {
                    if !pending_paths.is_empty() || overflow {
                        let notification = build_fs_change_notification(
                            pending_paths.iter().cloned().collect(),
                            pending_kinds.iter().cloned().collect(),
                            overflow,
                        );
                        if let Ok(text) = serde_json::to_string(&notification)
                            && outbound_tx.send(Message::Text(text.into())).await.is_err()
                        {
                            break;
                        }
                    }

                    pending_paths.clear();
                    pending_kinds.clear();
                    overflow = false;
                    timer_active = false;
                }
            }
        }
    });

    Some(watcher)
}

async fn handle_read_dir(params: Option<serde_json::Value>) -> Result<serde_json::Value, String> {
    let params = params.ok_or("Params required")?;
    let path_str = params
        .get("path")
        .and_then(|v| v.as_str())
        .ok_or("path param required")?;
    let clean_path = sanitize_path(path_str).await?;

    let mut entries = Vec::new();
    let mut dir = tokio::fs::read_dir(clean_path)
        .await
        .map_err(|e| e.to_string())?;

    while let Some(entry) = dir.next_entry().await.map_err(|e| e.to_string())? {
        let metadata = entry.metadata().await.map_err(|e| e.to_string())?;
        let name = entry.file_name().to_string_lossy().into_owned();
        let is_dir = metadata.is_dir();
        let size = metadata.len();
        let mtime = metadata
            .modified()
            .unwrap_or(SystemTime::UNIX_EPOCH)
            .duration_since(SystemTime::UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs();

        entries.push(json!({
            "name": name,
            "is_dir": is_dir,
            "size": size,
            "mtime": mtime
        }));
    }

    Ok(serde_json::Value::Array(entries))
}

async fn handle_read_file(params: Option<serde_json::Value>) -> Result<serde_json::Value, String> {
    let params = params.ok_or("Params required")?;
    let path_str = params
        .get("path")
        .and_then(|v| v.as_str())
        .ok_or("path param required")?;
    let clean_path = sanitize_path(path_str).await?;

    let mut file = tokio::fs::File::open(&clean_path)
        .await
        .map_err(|e| e.to_string())?;
    let metadata = file.metadata().await.map_err(|e| e.to_string())?;
    if metadata.is_dir() {
        return Err("Cannot read a directory as a file".to_string());
    }

    let file_size = metadata.len();
    let max_file_bytes = max_file_bytes();
    if file_size > max_file_bytes {
        return Err(format!(
            "File is too large to read ({} bytes > {} bytes)",
            file_size, max_file_bytes
        ));
    }

    let mut content_bytes = Vec::with_capacity(file_size as usize);
    use tokio::io::AsyncReadExt;
    file.read_to_end(&mut content_bytes)
        .await
        .map_err(|e| e.to_string())?;

    let mut content_b64 = String::with_capacity(content_bytes.len().div_ceil(3) * 4);
    base64::engine::general_purpose::STANDARD.encode_string(&content_bytes, &mut content_b64);
    let mtime = metadata
        .modified()
        .unwrap_or(SystemTime::UNIX_EPOCH)
        .duration_since(SystemTime::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();

    Ok(json!({
        "content": content_b64,
        "mtime": mtime
    }))
}

async fn handle_write_file(params: Option<serde_json::Value>) -> Result<serde_json::Value, String> {
    let params = params.ok_or("Params required")?;
    let path_str = params
        .get("path")
        .and_then(|v| v.as_str())
        .ok_or("path param required")?;
    let content_b64 = params
        .get("content")
        .and_then(|v| v.as_str())
        .ok_or("content param required")?;

    let clean_path = sanitize_create_path(path_str).await?;

    if clean_path.exists() {
        let metadata = tokio::fs::metadata(&clean_path)
            .await
            .map_err(|e| e.to_string())?;
        let actual_mtime = metadata
            .modified()
            .unwrap_or(SystemTime::UNIX_EPOCH)
            .duration_since(SystemTime::UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs();

        // 校验修改时间防冲突
        if params
            .get("old_mtime")
            .and_then(|v| v.as_u64())
            .is_some_and(|old_val| old_val != actual_mtime)
        {
            return Err("conflict".to_string());
        }
    }

    let raw_bytes = base64::engine::general_purpose::STANDARD
        .decode(content_b64)
        .map_err(|e| e.to_string())?;
    let max_file_bytes = max_file_bytes();
    if raw_bytes.len() as u64 > max_file_bytes {
        return Err(format!(
            "File is too large to write ({} bytes > {} bytes)",
            raw_bytes.len(),
            max_file_bytes
        ));
    }

    if let Some(parent) = clean_path.parent() {
        tokio::fs::create_dir_all(parent)
            .await
            .map_err(|e| e.to_string())?;
    }

    use tokio::io::AsyncWriteExt;
    let mut file = tokio::fs::OpenOptions::new()
        .write(true)
        .create(true)
        .truncate(true)
        .open(&clean_path)
        .await
        .map_err(|e| e.to_string())?;

    file.write_all(&raw_bytes)
        .await
        .map_err(|e| e.to_string())?;
    let metadata = file.metadata().await.map_err(|e| e.to_string())?;

    let new_mtime = metadata
        .modified()
        .unwrap_or(SystemTime::UNIX_EPOCH)
        .duration_since(SystemTime::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();

    Ok(json!({ "mtime": new_mtime }))
}

#[derive(Serialize, Deserialize, Debug, Clone)]
struct FsTreeNode {
    name: String,
    #[serde(rename = "type")]
    item_type: String,
    size: u64,
    mtime: u64,
    path: String,
    level: usize,
    #[serde(skip_serializing_if = "Option::is_none")]
    children: Option<Vec<FsTreeNode>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    loaded: Option<bool>,
}

async fn scan_dir_recursive(
    dir_path: &Path,
    rel_path: String,
    level: usize,
    max_depth: usize,
    exclude_names: Arc<HashSet<String>>,
) -> Result<Vec<FsTreeNode>, String> {
    let mut dir = match tokio::fs::read_dir(dir_path).await {
        Ok(d) => d,
        Err(_) => return Ok(Vec::new()),
    };

    use futures_util::stream::FuturesUnordered;
    let mut tasks = FuturesUnordered::new();

    while let Some(entry) = dir.next_entry().await.map_err(|e| e.to_string())? {
        let name = entry.file_name().to_string_lossy().into_owned();

        if exclude_names.contains(&name) {
            continue;
        }

        let child_path = entry.path();
        let child_rel_path = if rel_path.is_empty() {
            name.clone()
        } else {
            format!("{}/{}", rel_path, name)
        };

        // 优先使用轻量 file_type 判定类型，减少元数据系统调用
        let file_type = entry.file_type().await.map_err(|e| e.to_string())?;
        let is_dir = file_type.is_dir();

        let exclude_names_clone = exclude_names.clone();

        // 并发读取元数据并递归扫描子目录
        tasks.push(async move {
            let metadata = entry.metadata().await.map_err(|e| e.to_string())?;
            let size = metadata.len();
            let mtime = metadata
                .modified()
                .unwrap_or(SystemTime::UNIX_EPOCH)
                .duration_since(SystemTime::UNIX_EPOCH)
                .unwrap_or_default()
                .as_secs();

            let mut children = None;
            if is_dir && level < max_depth {
                let sub_children = Box::pin(scan_dir_recursive(
                    &child_path,
                    child_rel_path.clone(),
                    level + 1,
                    max_depth,
                    exclude_names_clone,
                ))
                .await?;
                children = Some(sub_children);
            }

            Ok::<FsTreeNode, String>(FsTreeNode {
                name,
                item_type: if is_dir {
                    "directory".to_string()
                } else {
                    "file".to_string()
                },
                size,
                mtime,
                path: child_rel_path,
                level,
                children,
                loaded: is_dir.then_some(level < max_depth),
            })
        });
    }

    let mut entries = Vec::new();
    while let Some(res) = tasks.next().await {
        entries.push(res?);
    }

    entries.sort_by(|a, b| {
        let a_is_dir = a.item_type == "directory";
        let b_is_dir = b.item_type == "directory";
        if a_is_dir != b_is_dir {
            b_is_dir.cmp(&a_is_dir)
        } else {
            a.name.to_lowercase().cmp(&b.name.to_lowercase())
        }
    });

    Ok(entries)
}

async fn handle_read_dir_recursive(
    params: Option<serde_json::Value>,
) -> Result<serde_json::Value, String> {
    let params = params.ok_or("Params required")?;
    let path_str = params.get("path").and_then(|v| v.as_str()).unwrap_or(".");
    let clean_path = sanitize_path(path_str).await?;
    let max_depth = params
        .get("maxDepth")
        .and_then(|v| v.as_u64())
        .map(|depth| depth.min(50) as usize)
        .unwrap_or(20);

    let exclude_set: HashSet<String> = params
        .get("excludeNames")
        .and_then(|v| v.as_array())
        .map(|items| {
            items
                .iter()
                .filter_map(|item| item.as_str())
                .map(str::to_string)
                .collect()
        })
        .unwrap_or_else(default_exclude_names);

    let exclude_names = Arc::new(exclude_set);
    let files = scan_dir_recursive(&clean_path, String::new(), 0, max_depth, exclude_names).await?;

    let mut expanded_paths = Vec::new();
    fn collect_expanded_paths(nodes: &[FsTreeNode], paths: &mut Vec<String>) {
        for node in nodes {
            if node.item_type == "directory" && node.level == 0 {
                paths.push(node.path.clone());
            }
        }
    }
    collect_expanded_paths(&files, &mut expanded_paths);

    Ok(json!({
        "files": files,
        "expandedPaths": expanded_paths
    }))
}

async fn handle_mkdir(params: Option<serde_json::Value>) -> Result<serde_json::Value, String> {
    let params = params.ok_or("Params required")?;
    let path_str = params
        .get("path")
        .and_then(|v| v.as_str())
        .ok_or("path param required")?;
    let clean_path = sanitize_create_path(path_str).await?;

    tokio::fs::create_dir_all(&clean_path)
        .await
        .map_err(|e| e.to_string())?;
    Ok(json!({ "success": true }))
}

async fn handle_delete(params: Option<serde_json::Value>) -> Result<serde_json::Value, String> {
    let params = params.ok_or("Params required")?;
    let path_str = params
        .get("path")
        .and_then(|v| v.as_str())
        .ok_or("path param required")?;
    let clean_path = sanitize_path(path_str).await?;
    if is_workspace_root_path(&clean_path) {
        return Err("Refusing to delete workspace root".to_string());
    }

    // 直接尝试删除文件，若报错（如目标是目录）则回退为目录递归删除
    if let Err(e) = tokio::fs::remove_file(&clean_path).await {
        if e.kind() == std::io::ErrorKind::NotFound {
            return Err("File or directory not found".to_string());
        }
        tokio::fs::remove_dir_all(&clean_path)
            .await
            .map_err(|err| err.to_string())?;
    }
    Ok(json!({ "success": true }))
}

async fn handle_move(params: Option<serde_json::Value>) -> Result<serde_json::Value, String> {
    let params = params.ok_or("Params required")?;
    let from_str = params
        .get("from")
        .and_then(|v| v.as_str())
        .ok_or("from param required")?;
    let to_str = params
        .get("to")
        .and_then(|v| v.as_str())
        .ok_or("to param required")?;

    let clean_from = sanitize_path(from_str).await?;
    let clean_to = sanitize_create_path(to_str).await?;
    if is_workspace_root_path(&clean_from) {
        return Err("Refusing to move workspace root".to_string());
    }

    // 检查源路径存在性，防止源路径不存在时残留空父目录
    if !clean_from.exists() {
        return Err("Source path does not exist".to_string());
    }

    if let Some(parent) = clean_to.parent() {
        tokio::fs::create_dir_all(parent)
            .await
            .map_err(|e| e.to_string())?;
    }

    tokio::fs::rename(&clean_from, &clean_to)
        .await
        .map_err(|e| e.to_string())?;
    Ok(json!({ "success": true }))
}

fn is_write_fs_method(method: &str) -> bool {
    matches!(
        method,
        "fs/write_file" | "fs/mkdir" | "fs/delete" | "fs/move"
    )
}

async fn handle_fs_request(req: JsonRpcRequest, permission: &str) -> JsonRpcResponse {
    if permission != "write" && is_write_fs_method(req.method.as_str()) {
        return JsonRpcResponse {
            jsonrpc: "2.0".to_string(),
            id: req.id,
            result: None,
            error: Some(JsonRpcError {
                code: -32003,
                message: "Forbidden: read-only sandbox ticket".to_string(),
            }),
        };
    }

    let result = match req.method.as_str() {
        "fs/read_dir" => handle_read_dir(req.params).await.map_err(|e| (-32603, e)),
        "fs/read_dir_recursive" => handle_read_dir_recursive(req.params)
            .await
            .map_err(|e| (-32603, e)),
        "fs/read_file" => handle_read_file(req.params).await.map_err(|e| (-32603, e)),
        "fs/write_file" => handle_write_file(req.params).await.map_err(|e| {
            if e == "conflict" {
                (
                    -32001,
                    "Data Conflict: The file has been modified elsewhere.".to_string(),
                )
            } else {
                (-32603, e)
            }
        }),
        "fs/mkdir" => handle_mkdir(req.params).await.map_err(|e| (-32603, e)),
        "fs/delete" => handle_delete(req.params).await.map_err(|e| (-32603, e)),
        "fs/move" => handle_move(req.params).await.map_err(|e| (-32603, e)),
        _ => Err((-32601, "Method not found".to_string())),
    };

    match result {
        Ok(res) => JsonRpcResponse {
            jsonrpc: "2.0".to_string(),
            id: req.id,
            result: Some(res),
            error: None,
        },
        Err((code, msg)) => JsonRpcResponse {
            jsonrpc: "2.0".to_string(),
            id: req.id,
            result: None,
            error: Some(JsonRpcError { code, message: msg }),
        },
    }
}

pub async fn handle_fs_session<S>(
    ws_stream: tokio_tungstenite::WebSocketStream<S>,
    permission: String,
) where
    S: tokio::io::AsyncRead + tokio::io::AsyncWrite + Unpin + Send + 'static,
{
    let (mut ws_sink, mut ws_source) = ws_stream.split();
    let (outbound_tx, mut outbound_rx) = tokio::sync::mpsc::channel::<Message>(100);
    let (close_tx, mut close_rx) = tokio::sync::oneshot::channel::<Option<CloseFrame>>();
    let _watcher = start_fs_watcher(outbound_tx.clone());

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

            let response = handle_fs_request(req, &permission).await;
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
    }

    if !send_task.is_finished() {
        let _ = tokio::time::timeout(Duration::from_millis(200), &mut send_task).await;
    }
    if !recv_task.is_finished() {
        let _ = tokio::time::timeout(Duration::from_millis(200), &mut recv_task).await;
    }

    if !send_task.is_finished() {
        send_task.abort();
    }
    if !recv_task.is_finished() {
        recv_task.abort();
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::workspace::init_test_workspace;
    use notify::event::{CreateKind, EventAttributes, EventKind};
    use serde_json::json;
    use std::fs;

    #[tokio::test]
    async fn test_handle_fs_request_jsonrpc_workflow() {
        let temp_workspace = init_test_workspace();
        let _ = fs::remove_dir_all(temp_workspace.join("src_test"));

        // 1. 测试创建目录 (fs/mkdir)
        let mkdir_req = JsonRpcRequest {
            jsonrpc: "2.0".to_string(),
            id: serde_json::Value::Number(1.into()),
            method: "fs/mkdir".to_string(),
            params: Some(json!({ "path": "src_test" })),
        };
        let resp = handle_fs_request(mkdir_req, "write").await;
        assert!(resp.error.is_none());
        assert_eq!(
            resp.result.unwrap().get("success").unwrap().as_bool(),
            Some(true)
        );

        // 2. 测试写入文件 (fs/write_file) - Base64 编码的 "Hello Rust!" 是 "SGVsbG8gUnVzdCE="
        let write_req = JsonRpcRequest {
            jsonrpc: "2.0".to_string(),
            id: serde_json::Value::Number(2.into()),
            method: "fs/write_file".to_string(),
            params: Some(json!({
                "path": "src_test/hello.txt",
                "content": "SGVsbG8gUnVzdCE="
            })),
        };
        let resp = handle_fs_request(write_req, "write").await;
        assert!(resp.error.is_none());
        let mtime = resp.result.unwrap().get("mtime").unwrap().as_u64();
        assert!(mtime.is_some());

        // 2.1 测试写入嵌套缺失父目录时会自动创建父目录
        let nested_write_req = JsonRpcRequest {
            jsonrpc: "2.0".to_string(),
            id: serde_json::Value::Number(21.into()),
            method: "fs/write_file".to_string(),
            params: Some(json!({
                "path": "missing_parent/a/hello.txt",
                "content": "SGVsbG8gUnVzdCE="
            })),
        };
        let resp = handle_fs_request(nested_write_req, "write").await;
        assert!(resp.error.is_none());
        assert!(temp_workspace.join("missing_parent/a/hello.txt").exists());

        // 3. 测试读取文件 (fs/read_file)
        let read_req = JsonRpcRequest {
            jsonrpc: "2.0".to_string(),
            id: serde_json::Value::Number(3.into()),
            method: "fs/read_file".to_string(),
            params: Some(json!({ "path": "src_test/hello.txt" })),
        };
        let resp = handle_fs_request(read_req, "write").await;
        assert!(resp.error.is_none());
        let result_obj = resp.result.unwrap();
        let content_b64 = result_obj.get("content").unwrap().as_str().unwrap();
        assert_eq!(content_b64, "SGVsbG8gUnVzdCE=");

        // 4. 测试递归读取文件树 (fs/read_dir_recursive)
        let read_tree_req = JsonRpcRequest {
            jsonrpc: "2.0".to_string(),
            id: serde_json::Value::Number(4.into()),
            method: "fs/read_dir_recursive".to_string(),
            params: Some(json!({ "path": "." })),
        };
        let resp = handle_fs_request(read_tree_req, "write").await;
        assert!(resp.error.is_none());
        let tree_res = resp.result.unwrap();
        let files = tree_res.get("files").unwrap().as_array().unwrap();
        assert!(!files.is_empty());
        let src_node = files
            .iter()
            .find(|node| node.get("name").and_then(|value| value.as_str()) == Some("src_test"))
            .expect("src_test node should be present");
        assert_eq!(src_node.get("type").unwrap().as_str(), Some("directory"));

        // 5. 测试非法方法名 (fs/invalid_method) - 应返回标准错误
        let invalid_req = JsonRpcRequest {
            jsonrpc: "2.0".to_string(),
            id: serde_json::Value::Number(5.into()),
            method: "fs/invalid_method".to_string(),
            params: None,
        };
        let resp = handle_fs_request(invalid_req, "write").await;
        assert!(resp.result.is_none());
        let err = resp.error.unwrap();
        assert_eq!(err.code, -32601);
        assert!(err.message.contains("Method not found"));
    }

    #[tokio::test]
    async fn test_create_and_move_to_nested_missing_parent() {
        let temp_workspace = init_test_workspace();
        let _ = fs::remove_dir_all(temp_workspace.join("nested_create_test"));

        let mkdir_req = JsonRpcRequest {
            jsonrpc: "2.0".to_string(),
            id: serde_json::Value::Number(1.into()),
            method: "fs/mkdir".to_string(),
            params: Some(json!({ "path": "nested_create_test/a/b" })),
        };
        let resp = handle_fs_request(mkdir_req, "write").await;
        assert!(resp.error.is_none());
        assert!(temp_workspace.join("nested_create_test/a/b").is_dir());

        fs::write(temp_workspace.join("nested_create_test/source.txt"), "move").unwrap();
        let move_req = JsonRpcRequest {
            jsonrpc: "2.0".to_string(),
            id: serde_json::Value::Number(2.into()),
            method: "fs/move".to_string(),
            params: Some(json!({
                "from": "nested_create_test/source.txt",
                "to": "nested_create_test/c/d/target.txt"
            })),
        };
        let resp = handle_fs_request(move_req, "write").await;
        assert!(resp.error.is_none());
        assert!(
            temp_workspace
                .join("nested_create_test/c/d/target.txt")
                .exists()
        );
    }

    #[tokio::test]
    async fn test_read_only_ticket_rejects_write_methods() {
        let _temp_workspace = init_test_workspace();

        let write_req = JsonRpcRequest {
            jsonrpc: "2.0".to_string(),
            id: serde_json::Value::Number(1.into()),
            method: "fs/write_file".to_string(),
            params: Some(json!({
                "path": "readonly.txt",
                "content": "SGVsbG8="
            })),
        };

        let resp = handle_fs_request(write_req, "read").await;
        assert!(resp.result.is_none());
        let err = resp.error.unwrap();
        assert_eq!(err.code, -32003);
        assert!(err.message.contains("read-only"));
    }

    #[tokio::test]
    async fn test_delete_and_move_reject_workspace_root() {
        let _temp_workspace = init_test_workspace();

        let delete_req = JsonRpcRequest {
            jsonrpc: "2.0".to_string(),
            id: serde_json::Value::Number(1.into()),
            method: "fs/delete".to_string(),
            params: Some(json!({ "path": "." })),
        };
        let resp = handle_fs_request(delete_req, "write").await;
        assert!(resp.result.is_none());
        assert!(resp.error.unwrap().message.contains("workspace root"));

        let move_req = JsonRpcRequest {
            jsonrpc: "2.0".to_string(),
            id: serde_json::Value::Number(2.into()),
            method: "fs/move".to_string(),
            params: Some(json!({ "from": ".", "to": "moved-root" })),
        };
        let resp = handle_fs_request(move_req, "write").await;
        assert!(resp.result.is_none());
        assert!(resp.error.unwrap().message.contains("workspace root"));
    }

    #[test]
    fn test_max_file_bytes_reads_positive_env() {
        unsafe {
            std::env::set_var("FASTGPT_IDE_MAX_FILE_BYTES", "2048");
        }
        assert_eq!(max_file_bytes(), 2048);
        unsafe {
            std::env::remove_var("FASTGPT_IDE_MAX_FILE_BYTES");
        }
    }

    #[test]
    fn test_collect_fs_event_paths_normalizes_paths() {
        let temp_workspace = init_test_workspace();
        let event = Event {
            kind: EventKind::Create(CreateKind::File),
            paths: vec![
                temp_workspace.join("src").join("index.ts"),
                temp_workspace.join("package.json"),
            ],
            attrs: EventAttributes::new(),
        };

        let paths = collect_fs_event_paths(&event);
        assert_eq!(paths, vec!["src/index.ts", "package.json"]);
    }

    #[test]
    fn test_collect_fs_event_paths_does_not_hardcode_common_build_dirs() {
        let temp_workspace = init_test_workspace();
        let event = Event {
            kind: EventKind::Create(CreateKind::File),
            paths: vec![
                temp_workspace
                    .join("node_modules")
                    .join("pkg")
                    .join("index.js"),
                temp_workspace.join(".git").join("HEAD"),
                temp_workspace.join("dist").join("index.js"),
                temp_workspace.join("build").join("index.js"),
            ],
            attrs: EventAttributes::new(),
        };

        let paths = collect_fs_event_paths(&event);
        assert_eq!(
            paths,
            vec![
                "node_modules/pkg/index.js",
                ".git/HEAD",
                "dist/index.js",
                "build/index.js"
            ]
        );
    }

    #[test]
    fn test_build_fs_change_notification_uses_jsonrpc_notification_shape() {
        let notification = build_fs_change_notification(
            vec!["src/index.ts".to_string()],
            vec!["create".to_string()],
            false,
        );
        let value = serde_json::to_value(notification).unwrap();

        assert_eq!(value.get("jsonrpc").and_then(|v| v.as_str()), Some("2.0"));
        assert_eq!(
            value.get("method").and_then(|v| v.as_str()),
            Some("fs/did_change")
        );
        assert!(value.get("id").is_none());
        assert_eq!(
            value.pointer("/params/paths/0").and_then(|v| v.as_str()),
            Some("src/index.ts")
        );
        assert_eq!(
            value.pointer("/params/kinds/0").and_then(|v| v.as_str()),
            Some("create")
        );
        assert_eq!(
            value.pointer("/params/overflow").and_then(|v| v.as_bool()),
            Some(false)
        );
    }
}

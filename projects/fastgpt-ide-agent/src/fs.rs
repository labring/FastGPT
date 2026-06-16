use std::collections::{BTreeSet, HashSet};
use std::path::Path;
use std::sync::{Arc, OnceLock};
use std::time::{Duration, SystemTime};

use base64::Engine;
use futures_util::{SinkExt, StreamExt};
use notify::event::ModifyKind;
use notify::{Config, Event, EventKind, EventKindMask, RecommendedWatcher, RecursiveMode};
use notify_debouncer_full::{
    DebounceEventResult, DebouncedEvent, RecommendedCache, new_debouncer_opt,
};
use serde::{Deserialize, Serialize};
use serde_json::json;
use tokio::sync::{broadcast, mpsc};
use tokio_tungstenite::tungstenite::Message;
use tokio_tungstenite::tungstenite::protocol::frame::CloseFrame;

use crate::protocol::{JsonRpcError, JsonRpcNotification, JsonRpcRequest, JsonRpcResponse};
use crate::workspace::{
    get_workspace_root, is_workspace_root_path, normalize_workspace_relative_path,
    sanitize_create_path, sanitize_existing_workspace_entry_path, sanitize_path,
};

const DEFAULT_EXCLUDED_NAMES: &[&str] = &[".DS_Store"];
const FS_CHANGE_DEBOUNCE_MS: u64 = 500;
const FS_CHANGE_MAX_PATHS: usize = 200;
const FS_WATCH_BROADCAST_CAPACITY: usize = 128;
const DEFAULT_MAX_FILE_BYTES: u64 = 10 * 1024 * 1024;

#[derive(Debug, Clone)]
struct FsChangeBatch {
    seq: u64,
    paths: Vec<String>,
    kinds: Vec<String>,
    overflow: bool,
}

struct FsWatchHub {
    tx: broadcast::Sender<FsChangeBatch>,
}

static FS_WATCH_HUB: OnceLock<FsWatchHub> = OnceLock::new();

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

fn collect_debounced_event_paths(events: &[DebouncedEvent]) -> (Vec<String>, bool) {
    let mut paths = BTreeSet::<String>::new();
    let mut overflow = false;

    for event in events {
        if get_fs_event_kind(&event.event.kind).is_none() {
            continue;
        }

        for path in collect_fs_event_paths(&event.event) {
            if !paths.contains(&path) && paths.len() >= FS_CHANGE_MAX_PATHS {
                overflow = true;
                continue;
            }
            paths.insert(path);
        }
    }

    (paths.into_iter().collect(), overflow)
}

fn collect_debounced_event_kinds(events: &[DebouncedEvent]) -> Vec<String> {
    let mut kinds = BTreeSet::<String>::new();
    for event in events {
        if let Some(kind) = get_fs_event_kind(&event.event.kind) {
            kinds.insert(kind.to_string());
        }
    }
    kinds.into_iter().collect()
}

fn debounced_events_need_rescan(events: &[DebouncedEvent]) -> bool {
    events.iter().any(|event| event.event.need_rescan())
}

fn build_fs_change_notification(
    paths: Vec<String>,
    kinds: Vec<String>,
    overflow: bool,
    seq: u64,
) -> JsonRpcNotification {
    JsonRpcNotification {
        jsonrpc: "2.0".to_string(),
        method: "fs/did_change".to_string(),
        params: json!({
            "seq": seq,
            "paths": paths,
            "kinds": kinds,
            "overflow": overflow
        }),
    }
}

fn publish_fs_change_batch(
    tx: &broadcast::Sender<FsChangeBatch>,
    next_seq: &mut u64,
    batch: FsChangeBatch,
) {
    if batch.paths.is_empty() && !batch.overflow {
        return;
    }

    *next_seq = next_seq.wrapping_add(1);
    let _ = tx.send(FsChangeBatch {
        seq: *next_seq,
        ..batch
    });
}

fn start_workspace_watcher(tx: broadcast::Sender<FsChangeBatch>) {
    let root = get_workspace_root().to_path_buf();
    let (event_tx, mut event_rx) = mpsc::unbounded_channel::<DebounceEventResult>();

    // 只订阅真实文件变更，避免 read_dir/read metadata 在 inotify 下触发 Access 事件后自激刷新。
    let watcher_config = Config::default().with_event_kinds(EventKindMask::CORE);
    let mut debouncer = match new_debouncer_opt::<_, RecommendedWatcher, _>(
        Duration::from_millis(FS_CHANGE_DEBOUNCE_MS),
        None,
        move |res| {
            let _ = event_tx.send(res);
        },
        RecommendedCache::new(),
        watcher_config,
    ) {
        Ok(debouncer) => debouncer,
        Err(err) => {
            eprintln!("Failed to create workspace watcher: {}", err);
            return;
        }
    };

    if let Err(err) = debouncer.watch(&root, RecursiveMode::Recursive) {
        eprintln!("Failed to watch workspace {:?}: {}", root, err);
        return;
    }

    tokio::spawn(async move {
        // 持有 debouncer，确保进程级监听器生命周期覆盖整个聚合任务。
        let _debouncer = debouncer;
        let mut next_seq = 0_u64;

        while let Some(event_res) = event_rx.recv().await {
            let batch = match event_res {
                Ok(events) => {
                    let (paths, path_overflow) = collect_debounced_event_paths(&events);
                    let overflow = debounced_events_need_rescan(&events) || path_overflow;
                    let kinds = collect_debounced_event_kinds(&events);

                    FsChangeBatch {
                        seq: 0,
                        paths,
                        kinds: if kinds.is_empty() && overflow {
                            vec!["overflow".to_string()]
                        } else {
                            kinds
                        },
                        overflow,
                    }
                }
                Err(errors) => {
                    for err in errors {
                        eprintln!("Workspace watcher event error: {}", err);
                    }
                    FsChangeBatch {
                        seq: 0,
                        paths: Vec::new(),
                        kinds: vec!["overflow".to_string()],
                        overflow: true,
                    }
                }
            };

            publish_fs_change_batch(&tx, &mut next_seq, batch);
        }
    });
}

fn fs_watch_hub() -> &'static FsWatchHub {
    FS_WATCH_HUB.get_or_init(|| {
        let (tx, _) = broadcast::channel(FS_WATCH_BROADCAST_CAPACITY);
        start_workspace_watcher(tx.clone());

        FsWatchHub { tx }
    })
}

async fn send_fs_change_batch(
    outbound_tx: &mpsc::Sender<Message>,
    batch: FsChangeBatch,
) -> Result<(), ()> {
    let notification =
        build_fs_change_notification(batch.paths, batch.kinds, batch.overflow, batch.seq);
    if let Ok(text) = serde_json::to_string(&notification) {
        outbound_tx
            .send(Message::Text(text.into()))
            .await
            .map_err(|_| ())?;
    }
    Ok(())
}

async fn forward_fs_change_batches(
    mut change_rx: broadcast::Receiver<FsChangeBatch>,
    outbound_tx: mpsc::Sender<Message>,
) {
    let mut last_forwarded_seq = 0_u64;

    loop {
        match change_rx.recv().await {
            Ok(batch) => {
                last_forwarded_seq = batch.seq;
                if send_fs_change_batch(&outbound_tx, batch).await.is_err() {
                    break;
                }
            }
            Err(broadcast::error::RecvError::Lagged(skipped)) => {
                last_forwarded_seq = last_forwarded_seq.wrapping_add(skipped);
                let overflow_batch = FsChangeBatch {
                    seq: last_forwarded_seq,
                    paths: Vec::new(),
                    kinds: vec!["overflow".to_string()],
                    overflow: true,
                };
                if send_fs_change_batch(&outbound_tx, overflow_batch)
                    .await
                    .is_err()
                {
                    break;
                }
            }
            Err(broadcast::error::RecvError::Closed) => break,
        }
    }
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

    let clean_from = sanitize_existing_workspace_entry_path(from_str).await?;
    let clean_to = sanitize_create_path(to_str).await?;
    if is_workspace_root_path(&clean_from) {
        return Err("Refusing to move workspace root".to_string());
    }

    // 检查源目录项存在性；这里不能用 exists()，否则会跟随最后一个 symlink。
    if tokio::fs::symlink_metadata(&clean_from).await.is_err() {
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
    }
    if !recv_task.is_finished() {
        recv_task.abort();
    }
    if !fs_change_task.is_finished() {
        fs_change_task.abort();
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::workspace::init_test_workspace;
    use notify::event::{CreateKind, EventAttributes, EventKind};
    use serde_json::json;
    use std::fs;
    use std::time::Instant;

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

    #[cfg(unix)]
    #[tokio::test]
    async fn test_move_renames_final_symlink_entry_without_following_target() {
        let temp_workspace = init_test_workspace();
        let outside = tempfile::tempdir().unwrap();
        let link_path = temp_workspace.join("move_symlink_source");
        let moved_link_path = temp_workspace.join("move_symlink_target");
        let _ = fs::remove_file(&link_path);
        let _ = fs::remove_file(&moved_link_path);
        let _ = fs::remove_dir_all(&moved_link_path);
        std::os::unix::fs::symlink(outside.path(), &link_path).unwrap();

        let move_req = JsonRpcRequest {
            jsonrpc: "2.0".to_string(),
            id: serde_json::Value::Number(1.into()),
            method: "fs/move".to_string(),
            params: Some(json!({
                "from": "move_symlink_source",
                "to": "move_symlink_target"
            })),
        };
        let resp = handle_fs_request(move_req, "write").await;

        assert!(resp.error.is_none());
        assert!(!link_path.exists());
        assert!(
            fs::symlink_metadata(&moved_link_path)
                .unwrap()
                .file_type()
                .is_symlink()
        );
        assert!(outside.path().exists());
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
    fn test_collect_debounced_event_paths_ignores_access_events() {
        let temp_workspace = init_test_workspace();
        let events = vec![DebouncedEvent::new(
            Event {
                kind: EventKind::Access(notify::event::AccessKind::Open(
                    notify::event::AccessMode::Read,
                )),
                paths: vec![temp_workspace.join("skills")],
                attrs: EventAttributes::new(),
            },
            Instant::now(),
        )];

        let (paths, overflow) = collect_debounced_event_paths(&events);

        assert!(paths.is_empty());
        assert!(!overflow);
    }

    #[test]
    fn test_build_fs_change_notification_uses_jsonrpc_notification_shape() {
        let notification = build_fs_change_notification(
            vec!["src/index.ts".to_string()],
            vec!["create".to_string()],
            false,
            42,
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
            value.pointer("/params/seq").and_then(|v| v.as_u64()),
            Some(42)
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

    #[test]
    fn test_publish_fs_change_batch_increments_seq() {
        let (tx, mut rx) = broadcast::channel(4);
        let mut next_seq = 0_u64;

        publish_fs_change_batch(
            &tx,
            &mut next_seq,
            FsChangeBatch {
                seq: 0,
                paths: vec!["src/index.ts".to_string()],
                kinds: vec!["modify".to_string()],
                overflow: false,
            },
        );

        let batch = rx.try_recv().unwrap();
        assert_eq!(batch.seq, 1);
        assert_eq!(batch.paths, vec!["src/index.ts"]);
        assert_eq!(batch.kinds, vec!["modify"]);
        assert!(!batch.overflow);
    }

    #[test]
    fn test_publish_fs_change_batch_can_emit_overflow_only_notification() {
        let (tx, mut rx) = broadcast::channel(4);
        let mut next_seq = 7_u64;

        publish_fs_change_batch(
            &tx,
            &mut next_seq,
            FsChangeBatch {
                seq: 0,
                paths: Vec::new(),
                kinds: vec!["overflow".to_string()],
                overflow: true,
            },
        );

        let batch = rx.try_recv().unwrap();
        assert_eq!(batch.seq, 8);
        assert!(batch.paths.is_empty());
        assert_eq!(batch.kinds, vec!["overflow"]);
        assert!(batch.overflow);
    }
}

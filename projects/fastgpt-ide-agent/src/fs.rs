use std::collections::{BTreeSet, HashSet};
use std::path::Path;
use std::process::Stdio;
use std::sync::{Arc, OnceLock};
use std::time::{Duration, SystemTime};

use base64::Engine;
use futures_util::{SinkExt, StreamExt};
use notify::event::ModifyKind;
use notify::{Config, Event, EventKind, EventKindMask, RecommendedWatcher, RecursiveMode};
use notify_debouncer_full::{
    DebounceEventResult, DebouncedEvent, RecommendedCache, new_debouncer_opt,
};
use serde::de::DeserializeOwned;
use serde::{Deserialize, Serialize};
use serde_json::json;
use sha2::{Digest, Sha256};
use tokio::io::{AsyncRead, AsyncReadExt};
use tokio::process::Command;
use tokio::sync::{broadcast, mpsc};
use tokio_tungstenite::tungstenite::Message;
use tokio_tungstenite::tungstenite::protocol::frame::CloseFrame;

use crate::protocol::{
    JsonRpcError, JsonRpcErrorCode, JsonRpcNotification, JsonRpcRequest, JsonRpcResponse,
};
use crate::workspace::{
    get_workspace_root, is_workspace_root_path, normalize_workspace_relative_path,
    sanitize_create_path, sanitize_existing_workspace_entry_path, sanitize_path,
};

const DEFAULT_EXCLUDED_NAMES: &[&str] = &[".DS_Store"];
const FS_CHANGE_DEBOUNCE_MS: u64 = 500;
const FS_CHANGE_MAX_PATHS: usize = 200;
const FS_WATCH_BROADCAST_CAPACITY: usize = 128;
const DEFAULT_MAX_FILE_BYTES: u64 = 10 * 1024 * 1024;
const EXEC_TIMEOUT_MS: u64 = 30_000;
const EXEC_MAX_OUTPUT_BYTES: usize = 1024 * 1024;
const DEFAULT_WORKSPACE_PATH: &str = ".";
const DEFAULT_MAX_DEPTH: u64 = 20;

// JSON-RPC 的 params 入口统一走强类型反序列化，避免各 handler 分散手写 Value 字段读取。
fn parse_params<T>(params: Option<serde_json::Value>) -> Result<T, String>
where
    T: DeserializeOwned,
{
    let params = params.ok_or_else(|| "Params required".to_string())?;
    serde_json::from_value(params).map_err(|err| err.to_string())
}

fn mtime_secs(metadata: &std::fs::Metadata) -> u64 {
    metadata
        .modified()
        .unwrap_or(SystemTime::UNIX_EPOCH)
        .duration_since(SystemTime::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}

fn file_etag(bytes: &[u8]) -> String {
    let digest = Sha256::digest(bytes);
    format!("sha256:{digest:x}")
}

#[derive(Debug, Deserialize)]
struct PathParams {
    path: String,
}

#[derive(Debug, Deserialize)]
struct WriteFileParams {
    path: String,
    content: String,
    #[serde(default)]
    old_etag: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(default, rename_all = "camelCase")]
struct ReadDirRecursiveParams {
    path: String,
    max_depth: u64,
    exclude_names: Option<Vec<String>>,
}

impl Default for ReadDirRecursiveParams {
    fn default() -> Self {
        Self {
            path: DEFAULT_WORKSPACE_PATH.to_string(),
            max_depth: DEFAULT_MAX_DEPTH,
            exclude_names: None,
        }
    }
}

#[derive(Debug, Deserialize)]
struct MoveParams {
    from: String,
    to: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ExecParams {
    command: String,
    #[serde(default)]
    timeout_ms: Option<u64>,
}

impl ExecParams {
    fn timeout_ms(&self) -> u64 {
        self.timeout_ms.unwrap_or(EXEC_TIMEOUT_MS)
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum FsPermission {
    Read,
    Write,
}

impl FsPermission {
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

fn parse_max_file_bytes(value: Option<&str>) -> u64 {
    value
        .and_then(|value| value.parse::<u64>().ok())
        .filter(|value| *value > 0)
        .unwrap_or(DEFAULT_MAX_FILE_BYTES)
}

fn max_file_bytes() -> u64 {
    let value = std::env::var("FASTGPT_IDE_MAX_FILE_BYTES").ok();
    parse_max_file_bytes(value.as_deref())
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
    let params: PathParams = parse_params(params)?;
    let clean_path = sanitize_path(&params.path).await?;

    let mut entries = Vec::new();
    let mut dir = tokio::fs::read_dir(clean_path)
        .await
        .map_err(|e| e.to_string())?;

    while let Some(entry) = dir.next_entry().await.map_err(|e| e.to_string())? {
        let metadata = entry.metadata().await.map_err(|e| e.to_string())?;
        let name = entry.file_name().to_string_lossy().into_owned();
        let is_dir = metadata.is_dir();
        let size = metadata.len();
        let mtime = mtime_secs(&metadata);

        entries.push(json!({
            "name": name,
            "is_dir": is_dir,
            "size": size,
            "mtime": mtime
        }));
    }

    Ok(serde_json::Value::Array(entries))
}

async fn handle_read_file(
    params: Option<serde_json::Value>,
) -> Result<serde_json::Value, (JsonRpcErrorCode, String)> {
    let internal_error = |message: String| (JsonRpcErrorCode::InternalError, message);

    let params: PathParams = parse_params(params).map_err(internal_error)?;
    let clean_path = sanitize_path(&params.path).await.map_err(internal_error)?;

    let mut file = tokio::fs::File::open(&clean_path)
        .await
        .map_err(|e| internal_error(e.to_string()))?;
    let metadata = file
        .metadata()
        .await
        .map_err(|e| internal_error(e.to_string()))?;
    if metadata.is_dir() {
        return Err(internal_error(
            "Cannot read a directory as a file".to_string(),
        ));
    }

    let file_size = metadata.len();
    let max_file_bytes = max_file_bytes();
    if file_size > max_file_bytes {
        return Err((
            JsonRpcErrorCode::FileTooLarge,
            format!(
                "File is too large to read ({} bytes > {} bytes)",
                file_size, max_file_bytes
            ),
        ));
    }

    let mut content_bytes = Vec::with_capacity(file_size as usize);
    file.read_to_end(&mut content_bytes)
        .await
        .map_err(|e| internal_error(e.to_string()))?;

    let mut content_b64 = String::with_capacity(content_bytes.len().div_ceil(3) * 4);
    base64::engine::general_purpose::STANDARD.encode_string(&content_bytes, &mut content_b64);
    let etag = file_etag(&content_bytes);

    Ok(json!({
        "content": content_b64,
        "etag": etag
    }))
}

async fn handle_write_file(params: Option<serde_json::Value>) -> Result<serde_json::Value, String> {
    let params: WriteFileParams = parse_params(params)?;

    let clean_path = sanitize_create_path(&params.path).await?;

    let raw_bytes = base64::engine::general_purpose::STANDARD
        .decode(&params.content)
        .map_err(|e| e.to_string())?;
    let max_file_bytes = max_file_bytes();
    if raw_bytes.len() as u64 > max_file_bytes {
        return Err(format!(
            "File is too large to write ({} bytes > {} bytes)",
            raw_bytes.len(),
            max_file_bytes
        ));
    }

    if clean_path.exists() {
        let current_bytes = tokio::fs::read(&clean_path)
            .await
            .map_err(|e| e.to_string())?;
        let actual_etag = file_etag(&current_bytes);

        // 写入基于 read_file 返回的内容版本；不同版本说明文件已被其他来源修改。
        if params.old_etag.as_ref() != Some(&actual_etag) {
            return Err("conflict".to_string());
        }
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
    let new_etag = file_etag(&raw_bytes);

    Ok(json!({ "etag": new_etag }))
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
            let mtime = mtime_secs(&metadata);

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
    let params: ReadDirRecursiveParams = parse_params(params)?;
    let clean_path = sanitize_path(&params.path).await?;
    let max_depth = params.max_depth.min(50) as usize;
    let exclude_set: HashSet<String> = params
        .exclude_names
        .map(|items| items.into_iter().collect())
        .unwrap_or_else(default_exclude_names);

    let exclude_names = Arc::new(exclude_set);
    let files = scan_dir_recursive(&clean_path, String::new(), 0, max_depth, exclude_names).await?;

    let expanded_paths = if files
        .iter()
        .any(|node| node.item_type == "directory" && node.level == 0 && node.path == "skills")
    {
        vec!["skills".to_string()]
    } else {
        Vec::new()
    };

    Ok(json!({
        "files": files,
        "expandedPaths": expanded_paths
    }))
}

async fn handle_mkdir(params: Option<serde_json::Value>) -> Result<serde_json::Value, String> {
    let params: PathParams = parse_params(params)?;
    let clean_path = sanitize_create_path(&params.path).await?;

    tokio::fs::create_dir_all(&clean_path)
        .await
        .map_err(|e| e.to_string())?;
    Ok(json!({ "success": true }))
}

async fn handle_delete(params: Option<serde_json::Value>) -> Result<serde_json::Value, String> {
    let params: PathParams = parse_params(params)?;
    let clean_path = sanitize_path(&params.path).await?;
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
    let params: MoveParams = parse_params(params)?;

    let clean_from = sanitize_existing_workspace_entry_path(&params.from).await?;
    let clean_to = sanitize_create_path(&params.to).await?;
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

async fn read_limited_output<R>(mut reader: R) -> Result<Vec<u8>, String>
where
    R: AsyncRead + Unpin,
{
    let mut output = Vec::new();
    let mut buffer = [0u8; 8192];

    loop {
        let read_len = reader.read(&mut buffer).await.map_err(|e| e.to_string())?;
        if read_len == 0 {
            break;
        }

        // 达到返回上限后继续 drain pipe，避免子进程因 stdout/stderr 写满而卡住。
        let remaining = EXEC_MAX_OUTPUT_BYTES.saturating_sub(output.len());
        if remaining > 0 {
            output.extend_from_slice(&buffer[..read_len.min(remaining)]);
        }
    }

    Ok(output)
}

async fn handle_exec(params: Option<serde_json::Value>) -> Result<serde_json::Value, String> {
    let params: ExecParams = parse_params(params)?;
    if params.command.trim().is_empty() {
        return Err("command param required".to_string());
    }
    let timeout_ms = params.timeout_ms();

    let mut child = Command::new("sh")
        .arg("-lc")
        .arg(params.command)
        .current_dir(get_workspace_root())
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true)
        .spawn()
        .map_err(|e| e.to_string())?;

    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| "Failed to capture command stdout".to_string())?;
    let stderr = child
        .stderr
        .take()
        .ok_or_else(|| "Failed to capture command stderr".to_string())?;

    let output = match tokio::time::timeout(Duration::from_millis(timeout_ms), async {
        let (status, stdout, stderr) = tokio::try_join!(
            async { child.wait().await.map_err(|e| e.to_string()) },
            read_limited_output(stdout),
            read_limited_output(stderr)
        )?;
        Ok::<_, String>((status, stdout, stderr))
    })
    .await
    {
        Ok(output) => output?,
        Err(_) => {
            return Ok(json!({
                "exitCode": -1,
                "stdout": "",
                "stderr": format!("Command timed out after {}ms", timeout_ms),
            }));
        }
    };

    let (status, stdout, stderr) = output;
    Ok(json!({
        "exitCode": status.code().unwrap_or(-1),
        "stdout": String::from_utf8_lossy(&stdout).to_string(),
        "stderr": String::from_utf8_lossy(&stderr).to_string(),
    }))
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
            error: Some(JsonRpcError {
                code: JsonRpcErrorCode::PermissionDenied,
                message: "Forbidden: read-only sandbox ticket".to_string(),
            }),
        };
    }

    let result = match req.method.as_str() {
        "fs/read_dir" => handle_read_dir(req.params)
            .await
            .map_err(|e| (JsonRpcErrorCode::InternalError, e)),
        "fs/read_dir_recursive" => handle_read_dir_recursive(req.params)
            .await
            .map_err(|e| (JsonRpcErrorCode::InternalError, e)),
        "fs/read_file" => handle_read_file(req.params).await,
        "fs/write_file" => handle_write_file(req.params).await.map_err(|e| {
            if e == "conflict" {
                (
                    JsonRpcErrorCode::FileConflict,
                    "Data Conflict: The file has been modified elsewhere.".to_string(),
                )
            } else {
                (JsonRpcErrorCode::InternalError, e)
            }
        }),
        "fs/mkdir" => handle_mkdir(req.params)
            .await
            .map_err(|e| (JsonRpcErrorCode::InternalError, e)),
        "fs/delete" => handle_delete(req.params)
            .await
            .map_err(|e| (JsonRpcErrorCode::InternalError, e)),
        "fs/move" => handle_move(req.params)
            .await
            .map_err(|e| (JsonRpcErrorCode::InternalError, e)),
        "fs/exec" => handle_exec(req.params)
            .await
            .map_err(|e| (JsonRpcErrorCode::InternalError, e)),
        _ => Err((
            JsonRpcErrorCode::MethodNotFound,
            "Method not found".to_string(),
        )),
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
    use serde_json::{Value, json};
    use std::fs;
    use std::path::PathBuf;
    use std::time::Instant;

    fn fs_request(method: &str, params: Option<Value>) -> JsonRpcRequest {
        JsonRpcRequest {
            jsonrpc: "2.0".to_string(),
            id: json!(1),
            method: method.to_string(),
            params,
        }
    }

    async fn fs_ok(method: &str, params: Value) -> Value {
        let resp = handle_fs_request(fs_request(method, Some(params)), FsPermission::Write).await;
        match (resp.result, resp.error) {
            (Some(result), None) => result,
            (_, Some(error)) => panic!("unexpected fs error for {method}: {error:?}"),
            (None, None) => panic!("missing fs result for {method}"),
        }
    }

    async fn fs_err(method: &str, params: Option<Value>, permission: FsPermission) -> JsonRpcError {
        let resp = handle_fs_request(fs_request(method, params), permission).await;
        match (resp.result, resp.error) {
            (None, Some(error)) => error,
            (Some(result), _) => panic!("unexpected fs result for {method}: {result:?}"),
            (None, None) => panic!("missing fs error for {method}"),
        }
    }

    fn notify_event(kind: EventKind, paths: Vec<PathBuf>) -> Event {
        Event {
            kind,
            paths,
            attrs: EventAttributes::new(),
        }
    }

    #[tokio::test]
    async fn test_fs_crud_and_tree_workflow() {
        let temp_workspace = init_test_workspace();
        let _ = fs::remove_dir_all(temp_workspace.join("src_test"));

        let mkdir_result = fs_ok("fs/mkdir", json!({ "path": "src_test" })).await;
        assert_eq!(mkdir_result["success"], json!(true));

        let write_result = fs_ok(
            "fs/write_file",
            json!({
                "path": "src_test/hello.txt",
                "content": "SGVsbG8gUnVzdCE="
            }),
        )
        .await;
        let initial_etag = write_result["etag"]
            .as_str()
            .expect("write_file should return etag");
        assert!(initial_etag.starts_with("sha256:"));

        fs_ok(
            "fs/write_file",
            json!({
                "path": "missing_parent/a/hello.txt",
                "content": "SGVsbG8gUnVzdCE="
            }),
        )
        .await;
        assert!(temp_workspace.join("missing_parent/a/hello.txt").exists());

        let read_result = fs_ok("fs/read_file", json!({ "path": "src_test/hello.txt" })).await;
        assert_eq!(read_result["content"], json!("SGVsbG8gUnVzdCE="));
        assert_eq!(read_result["etag"], json!(initial_etag));

        let tree_result = fs_ok("fs/read_dir_recursive", json!({ "path": "." })).await;
        let files = tree_result["files"].as_array().unwrap();
        assert!(!files.is_empty());
        let src_node = files
            .iter()
            .find(|node| node["name"] == json!("src_test"))
            .expect("src_test node should be present");
        assert_eq!(src_node["type"], json!("directory"));
    }

    #[tokio::test]
    async fn test_write_file_rejects_stale_etag() {
        let temp_workspace = init_test_workspace();
        let _ = fs::remove_file(temp_workspace.join("etag_conflict.txt"));

        let write_result = fs_ok(
            "fs/write_file",
            json!({
                "path": "etag_conflict.txt",
                "content": "b25l"
            }),
        )
        .await;
        let old_etag = write_result["etag"].as_str().unwrap();

        fs_ok(
            "fs/write_file",
            json!({
                "path": "etag_conflict.txt",
                "content": "dHdv",
                "old_etag": old_etag
            }),
        )
        .await;

        let conflict_err = fs_err(
            "fs/write_file",
            Some(json!({
                "path": "etag_conflict.txt",
                "content": "dGhyZWU=",
                "old_etag": old_etag
            })),
            FsPermission::Write,
        )
        .await;
        assert_eq!(conflict_err.code, JsonRpcErrorCode::FileConflict);
        assert!(conflict_err.message.contains("Data Conflict"));
    }

    #[tokio::test]
    async fn test_write_existing_file_requires_etag() {
        let temp_workspace = init_test_workspace();
        let file_path = temp_workspace.join("etag_required.txt");
        let _ = fs::remove_file(&file_path);
        fs::write(&file_path, "current").unwrap();

        let conflict_err = fs_err(
            "fs/write_file",
            Some(json!({
                "path": "etag_required.txt",
                "content": "bmV4dA=="
            })),
            FsPermission::Write,
        )
        .await;
        assert_eq!(conflict_err.code, JsonRpcErrorCode::FileConflict);
        assert!(conflict_err.message.contains("Data Conflict"));
    }

    #[tokio::test]
    async fn test_create_and_move_to_nested_missing_parent() {
        let temp_workspace = init_test_workspace();
        let _ = fs::remove_dir_all(temp_workspace.join("nested_create_test"));

        fs_ok("fs/mkdir", json!({ "path": "nested_create_test/a/b" })).await;
        assert!(temp_workspace.join("nested_create_test/a/b").is_dir());

        fs::write(temp_workspace.join("nested_create_test/source.txt"), "move").unwrap();
        fs_ok(
            "fs/move",
            json!({
                "from": "nested_create_test/source.txt",
                "to": "nested_create_test/c/d/target.txt"
            }),
        )
        .await;
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

        fs_ok(
            "fs/move",
            json!({
                "from": "move_symlink_source",
                "to": "move_symlink_target"
            }),
        )
        .await;

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

        let write_err = fs_err(
            "fs/write_file",
            Some(json!({
                "path": "readonly.txt",
                "content": "SGVsbG8="
            })),
            FsPermission::Read,
        )
        .await;
        assert_eq!(write_err.code, JsonRpcErrorCode::PermissionDenied);
        assert!(write_err.message.contains("read-only"));

        let exec_err = fs_err(
            "fs/exec",
            Some(json!({ "command": "echo denied" })),
            FsPermission::Read,
        )
        .await;
        assert_eq!(exec_err.code, JsonRpcErrorCode::PermissionDenied);
        assert!(exec_err.message.contains("read-only"));
    }

    #[tokio::test]
    async fn test_delete_and_move_reject_workspace_root() {
        let _temp_workspace = init_test_workspace();

        let delete_err = fs_err(
            "fs/delete",
            Some(json!({ "path": "." })),
            FsPermission::Write,
        )
        .await;
        assert!(delete_err.message.contains("workspace root"));

        let move_err = fs_err(
            "fs/move",
            Some(json!({ "from": ".", "to": "moved-root" })),
            FsPermission::Write,
        )
        .await;
        assert!(move_err.message.contains("workspace root"));
    }

    #[tokio::test]
    async fn test_unknown_fs_method_returns_jsonrpc_error() {
        let _temp_workspace = init_test_workspace();

        let err = fs_err("fs/invalid_method", None, FsPermission::Write).await;
        assert_eq!(err.code, JsonRpcErrorCode::MethodNotFound);
        assert!(err.message.contains("Method not found"));
    }

    #[test]
    fn test_parse_max_file_bytes() {
        assert_eq!(parse_max_file_bytes(Some("2048")), 2048);
        assert_eq!(parse_max_file_bytes(Some("0")), DEFAULT_MAX_FILE_BYTES);
        assert_eq!(parse_max_file_bytes(Some("bad")), DEFAULT_MAX_FILE_BYTES);
        assert_eq!(parse_max_file_bytes(None), DEFAULT_MAX_FILE_BYTES);
    }

    #[tokio::test]
    async fn test_exec_runs_in_workspace_and_returns_output() {
        let temp_workspace = init_test_workspace();

        let result = fs_ok("fs/exec", json!({ "command": "pwd && printf done" })).await;

        assert_eq!(result["exitCode"], json!(0));
        let stdout = result["stdout"].as_str().unwrap();
        assert!(stdout.contains(temp_workspace.to_str().unwrap()));
        assert!(stdout.contains("done"));
    }

    #[tokio::test]
    async fn test_exec_returns_non_zero_exit_code_and_stderr() {
        let _temp_workspace = init_test_workspace();

        let result = fs_ok("fs/exec", json!({ "command": "printf err >&2; exit 7" })).await;

        assert_eq!(result["exitCode"], json!(7));
        assert_eq!(result["stderr"], json!("err"));
    }

    #[tokio::test]
    async fn test_exec_respects_timeout_ms() {
        let _temp_workspace = init_test_workspace();

        let result = fs_ok("fs/exec", json!({ "command": "sleep 2", "timeoutMs": 1 })).await;

        assert_eq!(result["exitCode"], json!(-1));
        assert!(result["stderr"].as_str().unwrap().contains("timed out"));
    }

    #[test]
    fn test_collect_fs_event_paths_normalizes_paths() {
        let temp_workspace = init_test_workspace();
        let event = notify_event(
            EventKind::Create(CreateKind::File),
            vec![
                temp_workspace.join("src").join("index.ts"),
                temp_workspace.join("package.json"),
            ],
        );

        let paths = collect_fs_event_paths(&event);
        assert_eq!(paths, vec!["src/index.ts", "package.json"]);
    }

    #[test]
    fn test_collect_fs_event_paths_does_not_hardcode_common_build_dirs() {
        let temp_workspace = init_test_workspace();
        let event = notify_event(
            EventKind::Create(CreateKind::File),
            vec![
                temp_workspace
                    .join("node_modules")
                    .join("pkg")
                    .join("index.js"),
                temp_workspace.join(".git").join("HEAD"),
                temp_workspace.join("dist").join("index.js"),
                temp_workspace.join("build").join("index.js"),
            ],
        );

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
            notify_event(
                EventKind::Access(notify::event::AccessKind::Open(
                    notify::event::AccessMode::Read,
                )),
                vec![temp_workspace.join("skills")],
            ),
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

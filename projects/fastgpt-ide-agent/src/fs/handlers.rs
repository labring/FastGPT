use std::collections::HashSet;
use std::path::Path;
use std::process::Stdio;
use std::sync::Arc;
use std::time::{Duration, SystemTime};

use base64::Engine;
use futures_util::StreamExt;
use serde::de::DeserializeOwned;
use serde::{Deserialize, Serialize};
use serde_json::json;
use sha2::{Digest, Sha256};
use tokio::io::{AsyncRead, AsyncReadExt, AsyncWriteExt};
use tokio::process::Command;

use super::error::{FsError, FsResult};
use crate::workspace::{
    get_workspace_root, is_workspace_root_path, sanitize_create_path,
    sanitize_existing_workspace_entry_path, sanitize_path,
};

const DEFAULT_EXCLUDED_NAMES: &[&str] = &[".DS_Store"];
pub(super) const DEFAULT_MAX_FILE_BYTES: u64 = 10 * 1024 * 1024;
const EXEC_TIMEOUT_MS: u64 = 30_000;
const EXEC_MAX_OUTPUT_BYTES: usize = 1024 * 1024;
const DEFAULT_WORKSPACE_PATH: &str = ".";
const DEFAULT_MAX_DEPTH: u64 = 20;

// JSON-RPC 的 params 入口统一走强类型反序列化，避免各 handler 分散手写 Value 字段读取。
fn parse_params<T>(params: Option<serde_json::Value>) -> FsResult<T>
where
    T: DeserializeOwned,
{
    let params = params.ok_or(FsError::MissingParams)?;
    Ok(serde_json::from_value(params)?)
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

pub(super) fn parse_max_file_bytes(value: Option<&str>) -> u64 {
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

pub(super) async fn handle_read_dir(
    params: Option<serde_json::Value>,
) -> FsResult<serde_json::Value> {
    let params: PathParams = parse_params(params)?;
    let clean_path = sanitize_path(&params.path).await?;

    let mut entries = Vec::new();
    let mut dir = tokio::fs::read_dir(clean_path).await?;

    while let Some(entry) = dir.next_entry().await? {
        let metadata = entry.metadata().await?;
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

pub(super) async fn handle_read_file(
    params: Option<serde_json::Value>,
) -> FsResult<serde_json::Value> {
    let params: PathParams = parse_params(params)?;
    let clean_path = sanitize_path(&params.path).await?;

    let mut file = tokio::fs::File::open(&clean_path).await?;
    let metadata = file.metadata().await?;
    if metadata.is_dir() {
        return Err(FsError::message("Cannot read a directory as a file"));
    }

    let file_size = metadata.len();
    let max_file_bytes = max_file_bytes();
    if file_size > max_file_bytes {
        return Err(FsError::FileTooLarge {
            operation: "read",
            size: file_size,
            max_size: max_file_bytes,
        });
    }

    let mut content_bytes = Vec::with_capacity(file_size as usize);
    file.read_to_end(&mut content_bytes).await?;

    let mut content_b64 = String::with_capacity(content_bytes.len().div_ceil(3) * 4);
    base64::engine::general_purpose::STANDARD.encode_string(&content_bytes, &mut content_b64);
    let etag = file_etag(&content_bytes);

    Ok(json!({
        "content": content_b64,
        "etag": etag
    }))
}

pub(super) async fn handle_write_file(
    params: Option<serde_json::Value>,
) -> FsResult<serde_json::Value> {
    let params: WriteFileParams = parse_params(params)?;
    let clean_path = sanitize_create_path(&params.path).await?;
    let raw_bytes = base64::engine::general_purpose::STANDARD.decode(&params.content)?;
    let max_file_bytes = max_file_bytes();

    if raw_bytes.len() as u64 > max_file_bytes {
        return Err(FsError::FileTooLarge {
            operation: "write",
            size: raw_bytes.len() as u64,
            max_size: max_file_bytes,
        });
    }

    match tokio::fs::symlink_metadata(&clean_path).await {
        Ok(_) => {
            let current_bytes = tokio::fs::read(&clean_path).await?;
            let actual_etag = file_etag(&current_bytes);

            // 写入基于 read_file 返回的内容版本；不同版本说明文件已被其他来源修改。
            if params.old_etag.as_ref() != Some(&actual_etag) {
                return Err(FsError::FileConflict);
            }
        }
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
        Err(error) => return Err(error.into()),
    }

    if let Some(parent) = clean_path.parent() {
        tokio::fs::create_dir_all(parent).await?;
    }

    let mut file = tokio::fs::OpenOptions::new()
        .write(true)
        .create(true)
        .truncate(true)
        .open(&clean_path)
        .await?;
    file.write_all(&raw_bytes).await?;

    Ok(json!({ "etag": file_etag(&raw_bytes) }))
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
) -> FsResult<Vec<FsTreeNode>> {
    let mut dir = match tokio::fs::read_dir(dir_path).await {
        Ok(dir) => dir,
        Err(_) => return Ok(Vec::new()),
    };

    let mut tasks = futures_util::stream::FuturesUnordered::new();

    loop {
        let entry = match dir.next_entry().await {
            Ok(Some(entry)) => entry,
            Ok(None) => break,
            // 目录可能在扫描过程中被删除；返回已收集的快照，而不是让整个请求失败。
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => break,
            Err(error) => return Err(error.into()),
        };
        let name = entry.file_name().to_string_lossy().into_owned();

        if exclude_names.contains(&name) {
            continue;
        }

        let child_path = entry.path();
        let child_rel_path = if rel_path.is_empty() {
            name.clone()
        } else {
            format!("{rel_path}/{name}")
        };

        let file_type = match entry.file_type().await {
            Ok(file_type) => file_type,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => continue,
            Err(error) => return Err(error.into()),
        };
        let is_dir = file_type.is_dir();
        let exclude_names = Arc::clone(&exclude_names);

        tasks.push(async move {
            let metadata = match entry.metadata().await {
                Ok(metadata) => metadata,
                // entry 可能已在异步任务执行前被删除，不应使整个目录树读取失败。
                Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
                Err(error) => return Err(error.into()),
            };
            let mut children = None;
            if is_dir && level < max_depth {
                children = Some(
                    Box::pin(scan_dir_recursive(
                        &child_path,
                        child_rel_path.clone(),
                        level + 1,
                        max_depth,
                        exclude_names,
                    ))
                    .await?,
                );
            }

            Ok::<_, FsError>(Some(FsTreeNode {
                name,
                item_type: if is_dir {
                    "directory".to_string()
                } else {
                    "file".to_string()
                },
                size: metadata.len(),
                mtime: mtime_secs(&metadata),
                path: child_rel_path,
                level,
                children,
                loaded: is_dir.then_some(level < max_depth),
            }))
        });
    }

    let mut entries = Vec::new();
    while let Some(result) = tasks.next().await {
        if let Some(entry) = result? {
            entries.push(entry);
        }
    }
    entries.sort_by(|left, right| {
        let left_is_dir = left.item_type == "directory";
        let right_is_dir = right.item_type == "directory";
        if left_is_dir != right_is_dir {
            right_is_dir.cmp(&left_is_dir)
        } else {
            left.name.to_lowercase().cmp(&right.name.to_lowercase())
        }
    });
    Ok(entries)
}

pub(super) async fn handle_read_dir_recursive(
    params: Option<serde_json::Value>,
) -> FsResult<serde_json::Value> {
    let params: ReadDirRecursiveParams = parse_params(params)?;
    let clean_path = sanitize_path(&params.path).await?;
    let max_depth = params.max_depth.min(50) as usize;
    let exclude_names = Arc::new(
        params
            .exclude_names
            .map(|items| items.into_iter().collect())
            .unwrap_or_else(default_exclude_names),
    );
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

pub(super) async fn handle_mkdir(params: Option<serde_json::Value>) -> FsResult<serde_json::Value> {
    let params: PathParams = parse_params(params)?;
    let clean_path = sanitize_create_path(&params.path).await?;
    tokio::fs::create_dir_all(&clean_path).await?;
    Ok(json!({ "success": true }))
}

pub(super) async fn handle_delete(
    params: Option<serde_json::Value>,
) -> FsResult<serde_json::Value> {
    let params: PathParams = parse_params(params)?;
    let clean_path = sanitize_path(&params.path).await?;
    if is_workspace_root_path(&clean_path) {
        return Err(FsError::message("Refusing to delete workspace root"));
    }

    // 直接尝试删除文件，若报错（如目标是目录）则回退为目录递归删除。
    if let Err(error) = tokio::fs::remove_file(&clean_path).await {
        if error.kind() == std::io::ErrorKind::NotFound {
            return Err(FsError::message("File or directory not found"));
        }
        tokio::fs::remove_dir_all(&clean_path).await?;
    }
    Ok(json!({ "success": true }))
}

pub(super) async fn handle_move(params: Option<serde_json::Value>) -> FsResult<serde_json::Value> {
    let params: MoveParams = parse_params(params)?;
    let clean_from = sanitize_existing_workspace_entry_path(&params.from).await?;
    let clean_to = sanitize_create_path(&params.to).await?;
    if is_workspace_root_path(&clean_from) {
        return Err(FsError::message("Refusing to move workspace root"));
    }

    // 不能用 exists()，否则会跟随最后一个 symlink。
    if tokio::fs::symlink_metadata(&clean_from).await.is_err() {
        return Err(FsError::message("Source path does not exist"));
    }
    if let Some(parent) = clean_to.parent() {
        tokio::fs::create_dir_all(parent).await?;
    }
    tokio::fs::rename(&clean_from, &clean_to).await?;
    Ok(json!({ "success": true }))
}

async fn read_limited_output<R>(mut reader: R) -> FsResult<Vec<u8>>
where
    R: AsyncRead + Unpin,
{
    let mut output = Vec::new();
    let mut buffer = [0_u8; 8192];
    loop {
        let read_len = reader.read(&mut buffer).await?;
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

pub(super) async fn handle_exec(params: Option<serde_json::Value>) -> FsResult<serde_json::Value> {
    let params: ExecParams = parse_params(params)?;
    if params.command.trim().is_empty() {
        return Err(FsError::message("command param required"));
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
        .spawn()?;
    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| FsError::message("Failed to capture command stdout"))?;
    let stderr = child
        .stderr
        .take()
        .ok_or_else(|| FsError::message("Failed to capture command stderr"))?;

    let output = match tokio::time::timeout(Duration::from_millis(timeout_ms), async {
        let (status, stdout, stderr) = tokio::try_join!(
            async { Ok::<_, FsError>(child.wait().await?) },
            read_limited_output(stdout),
            read_limited_output(stderr)
        )?;
        Ok::<_, FsError>((status, stdout, stderr))
    })
    .await
    {
        Ok(output) => output?,
        Err(_) => {
            let _ = child.kill().await;
            let _ = child.wait().await;
            return Ok(json!({
                "exitCode": -1,
                "stdout": "",
                "stderr": format!("Command timed out after {timeout_ms}ms"),
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

use std::collections::HashSet;
use std::fs::{Metadata, OpenOptions};
use std::io::{Read, Write};
use std::path::Path;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::SystemTime;

use base64::Engine;
use serde::de::DeserializeOwned;
use serde::{Deserialize, Serialize};
use serde_json::json;
use sha2::{Digest, Sha256};

use super::error::{FsError, FsResult};
use crate::workspace::{
    is_atomic_tmp_file_name, is_reserved_workspace_root_entry, is_workspace_root_rel,
    resolve_workspace_path,
};

const DEFAULT_EXCLUDED_NAMES: &[&str] = &[".DS_Store"];
pub(super) const DEFAULT_MAX_FILE_BYTES: u64 = 10 * 1024 * 1024;
const DEFAULT_WORKSPACE_PATH: &str = ".";
const DEFAULT_MAX_DEPTH: u64 = 20;
const MAX_RECURSIVE_ENTRIES: usize = 50_000;
const HASH_CHUNK_BYTES: usize = 64 * 1024;

static TEMP_WRITE_SEQ: AtomicU64 = AtomicU64::new(0);

// JSON-RPC 的 params 入口统一走强类型反序列化，避免各 handler 分散手写 Value 字段读取。
fn parse_params<T>(params: Option<serde_json::Value>) -> FsResult<T>
where
    T: DeserializeOwned,
{
    let params = params.ok_or(FsError::MissingParams)?;
    Ok(serde_json::from_value(params)?)
}

fn mtime_secs(metadata: &Metadata) -> u64 {
    metadata
        .modified()
        .unwrap_or(SystemTime::UNIX_EPOCH)
        .duration_since(SystemTime::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}

fn format_sha256_etag(digest: impl AsRef<[u8]>) -> String {
    use std::fmt::Write;

    let bytes = digest.as_ref();
    let mut hex = String::with_capacity(bytes.len() * 2 + 7);
    hex.push_str("sha256:");
    for byte in bytes {
        let _ = write!(&mut hex, "{byte:02x}");
    }
    hex
}

fn file_etag(bytes: &[u8]) -> String {
    format_sha256_etag(Sha256::digest(bytes))
}

fn file_etag_from_reader<R: Read>(mut reader: R, max_bytes: u64) -> Result<String, FsError> {
    let mut hasher = Sha256::new();
    let mut buf = [0u8; HASH_CHUNK_BYTES];
    let mut total: u64 = 0;

    loop {
        let read_len = reader.read(&mut buf)?;
        if read_len == 0 {
            break;
        }
        total = total.saturating_add(read_len as u64);
        if total > max_bytes {
            return Err(FsError::FileTooLarge {
                operation: "write",
                size: total,
                max_size: max_bytes,
            });
        }
        hasher.update(&buf[..read_len]);
    }

    Ok(format_sha256_etag(hasher.finalize()))
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

pub(super) async fn handle_read_dir(
    params: Option<serde_json::Value>,
) -> FsResult<serde_json::Value> {
    let params: PathParams = parse_params(params)?;
    let (abs_path, rel_path) =
        resolve_workspace_path(&params.path, true).map_err(FsError::message)?;
    let is_root = is_workspace_root_rel(&rel_path);

    let entries = tokio::task::spawn_blocking(move || -> FsResult<Vec<serde_json::Value>> {
        let mut entries = Vec::new();
        for entry_res in std::fs::read_dir(&abs_path)? {
            let entry = match entry_res {
                Ok(entry) => entry,
                Err(error) if error.kind() == std::io::ErrorKind::NotFound => continue,
                Err(error) => return Err(error.into()),
            };
            let name = entry.file_name().to_string_lossy().into_owned();
            if (is_root && is_reserved_workspace_root_entry(&name))
                || is_atomic_tmp_file_name(&name)
            {
                continue;
            }
            let metadata = match std::fs::metadata(entry.path()) {
                Ok(metadata) => metadata,
                Err(error)
                    if matches!(
                        error.kind(),
                        std::io::ErrorKind::NotFound | std::io::ErrorKind::PermissionDenied
                    ) =>
                {
                    continue;
                }
                Err(error) => return Err(error.into()),
            };

            entries.push(json!({
                "name": name,
                "is_dir": metadata.is_dir(),
                "size": metadata.len(),
                "mtime": mtime_secs(&metadata)
            }));
        }

        Ok(entries)
    })
    .await
    .map_err(|e| FsError::message(format!("Read dir task failed: {e}")))??;

    Ok(serde_json::Value::Array(entries))
}

pub(super) async fn handle_read_file(
    params: Option<serde_json::Value>,
) -> FsResult<serde_json::Value> {
    let params: PathParams = parse_params(params)?;
    let (abs_path, _) = resolve_workspace_path(&params.path, false).map_err(FsError::message)?;
    let max_file_bytes = max_file_bytes();

    tokio::task::spawn_blocking(move || {
        let file = std::fs::File::open(&abs_path)?;
        let fd_meta = file.metadata()?;
        if fd_meta.is_dir() {
            return Err(FsError::message("Cannot read a directory as a file"));
        }
        if !fd_meta.is_file() {
            return Err(FsError::message("Cannot read non-regular file"));
        }
        if fd_meta.len() > max_file_bytes {
            return Err(FsError::FileTooLarge {
                operation: "read",
                size: fd_meta.len(),
                max_size: max_file_bytes,
            });
        }

        let mut content_bytes = Vec::with_capacity(fd_meta.len() as usize);
        file.take(max_file_bytes + 1)
            .read_to_end(&mut content_bytes)?;
        if content_bytes.len() as u64 > max_file_bytes {
            return Err(FsError::FileTooLarge {
                operation: "read",
                size: content_bytes.len() as u64,
                max_size: max_file_bytes,
            });
        }

        let mut content_b64 = String::with_capacity(content_bytes.len().div_ceil(3) * 4);
        base64::engine::general_purpose::STANDARD.encode_string(&content_bytes, &mut content_b64);
        let etag = file_etag(&content_bytes);

        Ok(json!({
            "content": content_b64,
            "etag": etag
        }))
    })
    .await
    .map_err(|e| FsError::message(format!("Read file task failed: {e}")))?
}

pub(super) async fn handle_write_file(
    params: Option<serde_json::Value>,
) -> FsResult<serde_json::Value> {
    let params: WriteFileParams = parse_params(params)?;
    let (abs_path, _) = resolve_workspace_path(&params.path, false).map_err(FsError::message)?;
    let raw_bytes = base64::engine::general_purpose::STANDARD.decode(&params.content)?;
    let max_file_bytes = max_file_bytes();

    if raw_bytes.len() as u64 > max_file_bytes {
        return Err(FsError::FileTooLarge {
            operation: "write",
            size: raw_bytes.len() as u64,
            max_size: max_file_bytes,
        });
    }

    let expected_old_etag = params.old_etag;
    tokio::task::spawn_blocking(move || {
        let mut existing_permissions = None;
        let mut is_symlink = false;
        match std::fs::symlink_metadata(&abs_path) {
            Ok(meta) => {
                if meta.is_dir() {
                    return Err(FsError::message("Cannot overwrite a directory"));
                }
                is_symlink = meta.file_type().is_symlink();
                let Some(ref expected) = expected_old_etag else {
                    // 写入已存在文件时必须提供匹配的 old_etag，避免未校验直接覆盖。
                    return Err(FsError::FileConflict);
                };

                let existing_file = std::fs::File::open(&abs_path)?;
                let fd_meta = existing_file.metadata()?;
                if fd_meta.is_dir() {
                    return Err(FsError::message("Cannot overwrite a directory"));
                }
                if fd_meta.len() > max_file_bytes {
                    return Err(FsError::FileTooLarge {
                        operation: "write",
                        size: fd_meta.len(),
                        max_size: max_file_bytes,
                    });
                }
                existing_permissions = Some(fd_meta.permissions());

                let actual_etag = file_etag_from_reader(existing_file, max_file_bytes)?;
                if expected != &actual_etag {
                    return Err(FsError::FileConflict);
                }
            }
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
            Err(error) => return Err(error.into()),
        }

        if let Some(parent) = abs_path.parent()
            && !parent.as_os_str().is_empty()
        {
            std::fs::create_dir_all(parent)?;
        }

        if is_symlink {
            let mut file = OpenOptions::new()
                .write(true)
                .create(true)
                .truncate(true)
                .open(&abs_path)?;
            file.write_all(&raw_bytes)?;
            file.flush()?;
        } else {
            // 经由同目录隐藏临时文件原子替换，避免中断写留下半成品；`watcher` 与列表会隐藏 `.fastgpt-tmp-*`。
            let seq = TEMP_WRITE_SEQ.fetch_add(1, Ordering::Relaxed);
            let file_name = abs_path
                .file_name()
                .and_then(|n| n.to_str())
                .ok_or_else(|| FsError::message("Invalid destination file name"))?;
            let tmp_name = format!(".{file_name}.fastgpt-tmp-{}-{seq}", std::process::id());
            let tmp_path = abs_path.with_file_name(&tmp_name);

            let mut tmp_file = OpenOptions::new()
                .write(true)
                .create_new(true)
                .open(&tmp_path)?;
            let write_result = (|| -> std::io::Result<()> {
                tmp_file.write_all(&raw_bytes)?;
                tmp_file.flush()?;
                if let Some(permissions) = existing_permissions {
                    let _ = tmp_file.set_permissions(permissions);
                }
                drop(tmp_file);
                std::fs::rename(&tmp_path, &abs_path)
            })();
            if let Err(err) = write_result {
                let _ = std::fs::remove_file(&tmp_path);
                return Err(err.into());
            }
        }

        Ok(json!({ "etag": file_etag(&raw_bytes) }))
    })
    .await
    .map_err(|e| FsError::message(format!("Write file task failed: {e}")))?
}

#[derive(Serialize, Debug, Clone)]
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

fn scan_dir_sync(
    dir_path: &Path,
    is_root: bool,
    rel_path: &str,
    level: usize,
    max_depth: usize,
    exclude_names: &HashSet<String>,
    total_entries: &mut usize,
) -> FsResult<Vec<FsTreeNode>> {
    let read_dir = match std::fs::read_dir(dir_path) {
        Ok(entries) => entries,
        Err(_) => return Ok(Vec::new()),
    };

    let mut nodes = Vec::new();
    for entry_res in read_dir {
        if *total_entries >= MAX_RECURSIVE_ENTRIES {
            break;
        }
        let entry = match entry_res {
            Ok(entry) => entry,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => continue,
            Err(error) => return Err(error.into()),
        };

        let name = entry.file_name().to_string_lossy().into_owned();
        if (is_root && is_reserved_workspace_root_entry(&name))
            || is_atomic_tmp_file_name(&name)
            || exclude_names.contains(&name)
        {
            continue;
        }

        let entry_path = entry.path();
        let metadata = match std::fs::symlink_metadata(&entry_path) {
            Ok(metadata) => metadata,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => continue,
            Err(error) => return Err(error.into()),
        };

        let is_dir = metadata.file_type().is_dir();
        let child_rel_path = if rel_path.is_empty() {
            name.clone()
        } else {
            format!("{rel_path}/{name}")
        };

        *total_entries += 1;

        let children = if is_dir && level < max_depth {
            Some(scan_dir_sync(
                &entry_path,
                false,
                &child_rel_path,
                level + 1,
                max_depth,
                exclude_names,
                total_entries,
            )?)
        } else {
            None
        };

        nodes.push(FsTreeNode {
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
        });
    }

    nodes.sort_by(|left, right| {
        let left_is_dir = left.item_type == "directory";
        let right_is_dir = right.item_type == "directory";
        if left_is_dir != right_is_dir {
            right_is_dir.cmp(&left_is_dir)
        } else {
            left.name.to_lowercase().cmp(&right.name.to_lowercase())
        }
    });

    Ok(nodes)
}

pub(super) async fn handle_read_dir_recursive(
    params: Option<serde_json::Value>,
) -> FsResult<serde_json::Value> {
    let params: ReadDirRecursiveParams = parse_params(params)?;
    let max_depth = params.max_depth.min(50) as usize;
    let exclude_names: HashSet<String> = params
        .exclude_names
        .map(|items| items.into_iter().collect())
        .unwrap_or_else(|| {
            DEFAULT_EXCLUDED_NAMES
                .iter()
                .map(|name| (*name).to_string())
                .collect()
        });
    let (abs_path, rel_path) =
        resolve_workspace_path(&params.path, true).map_err(FsError::message)?;
    let is_root = is_workspace_root_rel(&rel_path);

    let files = tokio::task::spawn_blocking(move || {
        if !abs_path.is_dir() {
            return Err(FsError::Io(std::io::Error::new(
                std::io::ErrorKind::NotFound,
                "Target directory not found",
            )));
        }
        let mut total_entries = 0;
        scan_dir_sync(
            &abs_path,
            is_root,
            "",
            0,
            max_depth,
            &exclude_names,
            &mut total_entries,
        )
    })
    .await
    .map_err(|e| FsError::message(format!("Recursive scan task failed: {e}")))??;

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
    let (abs_path, _) = resolve_workspace_path(&params.path, false).map_err(FsError::message)?;

    tokio::task::spawn_blocking(move || -> FsResult<()> {
        std::fs::create_dir_all(&abs_path)?;
        Ok(())
    })
    .await
    .map_err(|e| FsError::message(format!("Mkdir task failed: {e}")))??;

    Ok(json!({ "success": true }))
}

pub(super) async fn handle_delete(
    params: Option<serde_json::Value>,
) -> FsResult<serde_json::Value> {
    let params: PathParams = parse_params(params)?;
    let (abs_path, rel_path) =
        resolve_workspace_path(&params.path, true).map_err(FsError::message)?;
    if is_workspace_root_rel(&rel_path) {
        return Err(FsError::message("Refusing to delete workspace root"));
    }

    tokio::task::spawn_blocking(move || -> FsResult<()> {
        // 使用 symlink_metadata 不跟随目标软链，只删除链接本身。
        let meta = std::fs::symlink_metadata(&abs_path)?;
        if meta.file_type().is_dir() {
            std::fs::remove_dir_all(&abs_path)?;
        } else {
            std::fs::remove_file(&abs_path)?;
        }
        Ok(())
    })
    .await
    .map_err(|e| FsError::message(format!("Delete task failed: {e}")))??;

    Ok(json!({ "success": true }))
}

pub(super) async fn handle_move(params: Option<serde_json::Value>) -> FsResult<serde_json::Value> {
    let params: MoveParams = parse_params(params)?;
    let (from_abs, from_rel) =
        resolve_workspace_path(&params.from, true).map_err(FsError::message)?;
    if is_workspace_root_rel(&from_rel) {
        return Err(FsError::message("Refusing to move workspace root"));
    }
    let (to_abs, _) = resolve_workspace_path(&params.to, false).map_err(FsError::message)?;

    tokio::task::spawn_blocking(move || -> FsResult<()> {
        if let Some(parent) = to_abs.parent()
            && !parent.as_os_str().is_empty()
        {
            std::fs::create_dir_all(parent)?;
        }
        std::fs::rename(&from_abs, &to_abs)?;
        Ok(())
    })
    .await
    .map_err(|e| FsError::message(format!("Move task failed: {e}")))??;

    Ok(json!({ "success": true }))
}

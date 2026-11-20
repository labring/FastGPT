use std::collections::HashSet;
use std::env;
use std::fs;
use std::io;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::{Duration, Instant};

use axum::{
    body::Body,
    extract::Query,
    http::{
        HeaderValue, StatusCode,
        header::{CACHE_CONTROL, CONTENT_TYPE},
    },
    response::{IntoResponse, Response},
};
use serde::{Deserialize, Serialize};
use tracing::warn;

use crate::workspace::get_home_root;

pub const DISK_SOFT_LIMIT_ENV: &str = "FASTGPT_DISK_SOFT_LIMIT_BYTES";
const DISK_USAGE_CACHE_TTL: Duration = Duration::from_secs(15);

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct DiskQuotaExceeded {
    pub used: u64,
    pub limit: u64,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DiskUsageSnapshot {
    pub used_bytes: u64,
    pub limit_bytes: Option<u64>,
}

#[derive(Debug, Deserialize, Default)]
pub struct DiskUsageQuery {
    #[serde(default)]
    refresh: Option<String>,
}

struct UsageCache(Mutex<Option<(u64, Instant)>>);

impl UsageCache {
    const fn new() -> Self {
        Self(Mutex::new(None))
    }

    fn get_fresh(&self) -> Option<u64> {
        let guard = self.0.lock().unwrap_or_else(|e| e.into_inner());
        guard.and_then(|(used, at)| (at.elapsed() < DISK_USAGE_CACHE_TTL).then_some(used))
    }

    fn set(&self, used: u64) {
        *self.0.lock().unwrap_or_else(|e| e.into_inner()) = Some((used, Instant::now()));
    }

    fn invalidate(&self) {
        *self.0.lock().unwrap_or_else(|e| e.into_inner()) = None;
    }
}

static DISK_USAGE_CACHE: UsageCache = UsageCache::new();

/// 解析 Docker 注入的卷容量软限制字节数；未设置或非正整数（如 K8s 交由原生 PVC 控制）时返回 `None`。
pub fn disk_soft_limit_bytes() -> Option<u64> {
    env::var(DISK_SOFT_LIMIT_ENV)
        .ok()
        .and_then(|raw| raw.trim().parse::<u64>().ok())
        .filter(|value| *value > 0)
}

/// 递归统计单个挂载卷根目录的实际占盘字节数（`lstat` 不跟随软链，Unix 下按 `blocks * 512` 计量并对硬链接去重）。
pub fn measure_directory_bytes(root: &Path) -> io::Result<u64> {
    if let Err(err) = fs::symlink_metadata(root) {
        return if err.kind() == io::ErrorKind::NotFound {
            Ok(0)
        } else {
            Err(err)
        };
    }

    let mut total = 0_u64;
    #[cfg(unix)]
    let mut seen_inodes = HashSet::<(u64, u64)>::new();
    let mut stack = vec![root.to_path_buf()];

    while let Some(path) = stack.pop() {
        let Ok(meta) = fs::symlink_metadata(&path) else {
            continue;
        };

        #[cfg(unix)]
        {
            use std::os::unix::fs::MetadataExt;
            if !seen_inodes.insert((meta.dev(), meta.ino())) {
                continue;
            }
            total = total.saturating_add(meta.blocks().saturating_mul(512));
        }
        #[cfg(not(unix))]
        {
            total = total.saturating_add(meta.len());
        }

        if meta.file_type().is_dir()
            && let Ok(entries) = fs::read_dir(&path)
        {
            for entry in entries.flatten() {
                stack.push(entry.path());
            }
        }
    }

    Ok(total)
}

/// 统一读取持久卷占盘字节数：正常态命中 15s 缓存零盘扫描；处于超限态或显式 `refresh` 时实时重扫，确保删文件后立即解锁。
async fn measure_cached_usage(
    root: PathBuf,
    cache: &UsageCache,
    limit: Option<u64>,
    refresh: bool,
) -> io::Result<u64> {
    if !refresh
        && let Some(cached) = cache.get_fresh()
        && limit.is_none_or(|l| cached < l)
    {
        return Ok(cached);
    }

    let used = tokio::task::spawn_blocking(move || measure_directory_bytes(&root))
        .await
        .map_err(|err| io::Error::other(format!("disk usage scan task failed: {err}")))??;
    cache.set(used);
    Ok(used)
}

/// 在文件删除后立即失效本地缓存。
pub fn invalidate_disk_usage_cache() {
    DISK_USAGE_CACHE.invalidate();
}

async fn check_writable_at(
    root: PathBuf,
    cache: &UsageCache,
    limit: Option<u64>,
) -> Result<(), DiskQuotaExceeded> {
    let Some(limit) = limit else {
        return Ok(());
    };
    match measure_cached_usage(root, cache, Some(limit), false).await {
        Ok(used) if used >= limit => Err(DiskQuotaExceeded { used, limit }),
        Ok(_) => Ok(()),
        Err(err) => {
            warn!("Failed to inspect volume disk usage, failing open: {err}");
            Ok(())
        }
    }
}

/// 检查当前持久卷是否允许写入；未配置 `FASTGPT_DISK_SOFT_LIMIT_BYTES`（如 K8s）时直接放行。
pub async fn check_workspace_writable() -> Result<(), DiskQuotaExceeded> {
    check_workspace_writable_with_limit(disk_soft_limit_bytes()).await
}

/// 按显式配额上限检查当前持久卷是否允许写入（便于单测在不修改全局环境变量的情况下并发验证配额行为）。
pub async fn check_workspace_writable_with_limit(
    limit: Option<u64>,
) -> Result<(), DiskQuotaExceeded> {
    check_writable_at(get_home_root().to_path_buf(), &DISK_USAGE_CACHE, limit).await
}

/// `GET /disk-usage`（1319 HTTP，受 `x-fastgpt-agent-token` 保护），支持 `?refresh=1`。
pub async fn disk_usage_handler(Query(query): Query<DiskUsageQuery>) -> Response<Body> {
    let limit = disk_soft_limit_bytes();
    let refresh = matches!(query.refresh.as_deref(), Some("1" | "true"));
    match measure_cached_usage(
        get_home_root().to_path_buf(),
        &DISK_USAGE_CACHE,
        limit,
        refresh,
    )
    .await
    .and_then(|used_bytes| {
        serde_json::to_string(&DiskUsageSnapshot {
            used_bytes,
            limit_bytes: limit,
        })
        .map_err(io::Error::other)
    }) {
        Ok(payload) => (
            StatusCode::OK,
            [
                (
                    CONTENT_TYPE,
                    HeaderValue::from_static("application/json; charset=utf-8"),
                ),
                (CACHE_CONTROL, HeaderValue::from_static("no-store")),
            ],
            payload,
        )
            .into_response(),
        Err(err) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Failed to measure disk usage: {err}"),
        )
            .into_response(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs::File;
    use std::io::Write;

    fn write_sized_file(path: &Path, len: usize) {
        let mut file = File::create(path).unwrap();
        file.write_all(&vec![b'a'; len]).unwrap();
        file.sync_all().unwrap();
    }

    #[test]
    fn measures_nested_files_without_following_symlinks_and_dedups_hardlinks() {
        let dir = tempfile::tempdir().unwrap();
        let outside = tempfile::tempdir().unwrap();
        write_sized_file(&outside.path().join("huge.bin"), 256 * 1024);

        let nested = dir.path().join("workspace/sub");
        fs::create_dir_all(&nested).unwrap();
        let target = nested.join("data.bin");
        write_sized_file(&target, 64 * 1024);
        fs::hard_link(&target, nested.join("data-hardlink.bin")).unwrap();

        #[cfg(unix)]
        {
            use std::os::unix::fs::symlink;
            symlink(outside.path(), dir.path().join("outside-link")).unwrap();
            symlink(dir.path(), nested.join("loop-link")).unwrap();
        }

        let measured = measure_directory_bytes(dir.path()).unwrap();
        assert!((64 * 1024..160 * 1024).contains(&measured));
    }

    #[tokio::test]
    async fn check_writable_allows_when_disabled_and_refreshes_on_exceeded() {
        let cache = UsageCache::new();
        let dir = tempfile::tempdir().unwrap();
        let file = dir.path().join("big.bin");
        write_sized_file(&file, 64 * 1024);

        assert!(
            check_writable_at(dir.path().to_path_buf(), &cache, None)
                .await
                .is_ok()
        );

        let exceeded = check_writable_at(dir.path().to_path_buf(), &cache, Some(16 * 1024))
            .await
            .unwrap_err();
        assert!(exceeded.used >= 64 * 1024);
        assert_eq!(exceeded.limit, 16 * 1024);

        // 外部直接删除文件（不经 cache.invalidate）后，因上次已超限触发实时重扫，应立即恢复放行。
        fs::remove_file(&file).unwrap();
        assert!(
            check_writable_at(dir.path().to_path_buf(), &cache, Some(16 * 1024))
                .await
                .is_ok()
        );
    }
}

use std::env;
use std::path::{Path, PathBuf};
use std::sync::OnceLock;

static WORKSPACE_ROOT: OnceLock<PathBuf> = OnceLock::new();
static CANONICAL_WORKSPACE_ROOT: OnceLock<PathBuf> = OnceLock::new();
#[cfg(test)]
static TEST_WORKSPACE_ROOT: OnceLock<tempfile::TempDir> = OnceLock::new();

pub fn get_workspace_root() -> &'static Path {
    WORKSPACE_ROOT.get_or_init(|| {
        let dir = env::var("FASTGPT_WORKDIR").unwrap_or_else(|_| "/workspace".to_string());
        PathBuf::from(dir)
    })
}

fn get_canonical_workspace_root() -> &'static Path {
    CANONICAL_WORKSPACE_ROOT.get_or_init(|| {
        get_workspace_root()
            .canonicalize()
            .unwrap_or_else(|_| get_workspace_root().to_path_buf())
    })
}

pub async fn sanitize_path(input_path: &str) -> Result<PathBuf, String> {
    let base = get_workspace_root();

    if Path::new(input_path).is_absolute() {
        return Err("Absolute workspace paths are not allowed".to_string());
    }

    path_security::validate_path(Path::new(input_path), base).map_err(|e| e.to_string())
}

/**
 * 校验即将创建的 workspace 相对路径。
 *
 * path-security 的 validate_path 会 canonicalize 不存在路径的父目录，因此无法用于
 * a/b/file.txt 这类父目录尚未创建的写入场景。这里先逐段拒绝路径穿越和异常文件名，
 * 再只 canonicalize 已存在的最近祖先目录，确保后续 create_dir_all 仍被限制在 workspace 内。
 */
pub async fn sanitize_create_path(input_path: &str) -> Result<PathBuf, String> {
    let input = Path::new(input_path);
    if input.is_absolute() {
        return Err("Absolute workspace paths are not allowed".to_string());
    }

    let mut parts = Vec::new();
    for component in input.components() {
        match component {
            std::path::Component::CurDir => {}
            std::path::Component::Normal(name) => {
                let name = name
                    .to_str()
                    .ok_or_else(|| "Invalid path encoding".to_string())?;
                if name.is_empty()
                    || name == "."
                    || name == ".."
                    || name.contains('/')
                    || name.contains('\\')
                    || name.contains('\0')
                    || name.chars().any(char::is_control)
                {
                    return Err("Invalid workspace path component".to_string());
                }
                parts.push(name.to_string());
            }
            _ => return Err("Path traversal is not allowed".to_string()),
        }
    }

    if parts.is_empty() {
        return Err("Workspace target path is required".to_string());
    }

    let canonical_base = get_canonical_workspace_root();
    let mut current = if get_workspace_root().exists() {
        canonical_base.to_path_buf()
    } else {
        get_workspace_root().to_path_buf()
    };
    let mut first_missing_index = parts.len();

    for (index, part) in parts.iter().enumerate() {
        let candidate = current.join(part);
        if !candidate.exists() {
            first_missing_index = index;
            break;
        }

        current = candidate
            .canonicalize()
            .map_err(|e| format!("Failed to canonicalize existing path: {e}"))?;
        if !current.starts_with(canonical_base) {
            return Err("Path traversal detected".to_string());
        }
    }

    for part in parts.iter().skip(first_missing_index) {
        current = current.join(part);
    }

    Ok(current)
}

/**
 * 校验已存在的 workspace 路径，并保留最后一个路径项本身。
 *
 * fs/move 需要重命名用户在文件树中看到的目录项；如果最后一个路径项是 symlink，
 * 不能使用会跟随 symlink 的 canonicalize，否则会把“重命名 symlink”误变成
 * “移动 symlink 指向的真实目录”，在真实目录位于另一个挂载点时触发 EXDEV。
 * 因此这里复用 sanitize_path 校验父目录，只保留最后一级文件名原样参与 rename。
 */
pub async fn sanitize_existing_workspace_entry_path(input_path: &str) -> Result<PathBuf, String> {
    let input = Path::new(input_path);
    if input.is_absolute() {
        return Err("Absolute workspace paths are not allowed".to_string());
    }
    if input.as_os_str().is_empty() || input == Path::new(".") {
        return Ok(get_canonical_workspace_root().to_path_buf());
    }

    let file_name = input
        .file_name()
        .and_then(|name| name.to_str())
        .ok_or_else(|| "Workspace source path is required".to_string())?;
    let file_name = path_security::validate_filename(file_name).map_err(|e| e.to_string())?;
    let parent = input.parent().unwrap_or_else(|| Path::new("."));
    let parent = if parent.as_os_str().is_empty() {
        Path::new(".")
    } else {
        parent
    };
    let parent_str = parent
        .to_str()
        .ok_or_else(|| "Invalid path encoding".to_string())?;
    let clean_parent = sanitize_path(parent_str).await?;
    let path = clean_parent.join(file_name);
    tokio::fs::symlink_metadata(&path)
        .await
        .map_err(|e| e.to_string())?;

    Ok(path)
}

pub fn is_workspace_root_path(path: &Path) -> bool {
    path == get_workspace_root() || path == get_canonical_workspace_root()
}

pub fn normalize_workspace_relative_path(path: &Path) -> Option<String> {
    let root = get_workspace_root();
    let relative_path = path
        .strip_prefix(root)
        .or_else(|_| path.strip_prefix(get_canonical_workspace_root()))
        .ok()?;

    if relative_path.as_os_str().is_empty() {
        return Some(".".to_string());
    }

    let normalized = relative_path
        .components()
        .map(|component| component.as_os_str().to_string_lossy())
        .collect::<Vec<_>>()
        .join("/");

    if normalized.is_empty() {
        Some(".".to_string())
    } else {
        Some(normalized)
    }
}

#[cfg(test)]
pub fn init_test_workspace() -> &'static Path {
    let temp_dir = TEST_WORKSPACE_ROOT.get_or_init(|| {
        let temp_dir = tempfile::Builder::new()
            .prefix("fastgpt_ide_agent_test_")
            .tempdir()
            .expect("failed to create test workspace");
        let _ = WORKSPACE_ROOT.set(temp_dir.path().to_path_buf());
        temp_dir
    });

    temp_dir.path()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[tokio::test]
    async fn test_sanitize_path_success() {
        let temp_workspace = init_test_workspace();

        // 写入一个虚拟测试文件，以确保 validate_path 能正常通过
        let test_file = temp_workspace.join("dummy.txt");
        fs::write(&test_file, "dummy").unwrap();

        let res = sanitize_path("dummy.txt").await;
        assert!(res.is_ok());
        let path = res.unwrap();
        assert!(path.ends_with("dummy.txt"));

        let res = sanitize_path("./dummy.txt").await;
        assert!(res.is_ok());
        let path = res.unwrap();
        assert!(path.ends_with("dummy.txt"));
    }

    #[tokio::test]
    async fn test_sanitize_path_absolute_denied() {
        let _temp_workspace = init_test_workspace();

        let res = sanitize_path("/dummy.txt").await;
        assert!(res.is_err());
    }

    #[tokio::test]
    async fn test_sanitize_path_traversal_denied() {
        let _temp_workspace = init_test_workspace();

        let res = sanitize_path("../../../etc/passwd").await;
        assert!(res.is_err());
    }

    #[tokio::test]
    async fn test_sanitize_create_path_allows_nested_missing_parent() {
        let temp_workspace = init_test_workspace();
        let target = temp_workspace.join("nested_missing_parent");
        let _ = fs::remove_dir_all(&target);

        let res = sanitize_create_path("nested_missing_parent/a/file.txt").await;
        assert!(res.is_ok());
        assert!(res.unwrap().ends_with("nested_missing_parent/a/file.txt"));
    }

    #[tokio::test]
    async fn test_sanitize_create_path_traversal_denied() {
        let _temp_workspace = init_test_workspace();

        let res = sanitize_create_path("nested/../../../etc/passwd").await;
        assert!(res.is_err());
    }

    #[cfg(unix)]
    #[tokio::test]
    async fn test_sanitize_existing_workspace_entry_path_keeps_final_symlink() {
        let temp_workspace = init_test_workspace();
        let outside = tempfile::tempdir().unwrap();
        let link_path = temp_workspace.join("move_source_link");
        let _ = fs::remove_file(&link_path);
        std::os::unix::fs::symlink(outside.path(), &link_path).unwrap();

        let res = sanitize_existing_workspace_entry_path("move_source_link")
            .await
            .unwrap();

        assert_eq!(res.file_name(), link_path.file_name());
        assert_ne!(res, outside.path());
    }

    #[cfg(unix)]
    #[tokio::test]
    async fn test_sanitize_create_path_symlink_parent_outside_denied() {
        let temp_workspace = init_test_workspace();
        let outside = tempfile::tempdir().unwrap();
        let link_path = temp_workspace.join("outside_link_for_create");
        let _ = fs::remove_file(&link_path);
        std::os::unix::fs::symlink(outside.path(), &link_path).unwrap();

        let res = sanitize_create_path("outside_link_for_create/file.txt").await;
        assert!(res.is_err());
    }
}

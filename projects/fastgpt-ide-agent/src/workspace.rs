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
}

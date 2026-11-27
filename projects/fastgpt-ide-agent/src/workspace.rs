use cap_std::ambient_authority;
use cap_std::fs::Dir;
use std::env;
use std::io;
use std::path::{Component, Path, PathBuf};
use std::sync::OnceLock;

static WORKSPACE_ROOT: OnceLock<PathBuf> = OnceLock::new();
static CANONICAL_WORKSPACE_ROOT: OnceLock<PathBuf> = OnceLock::new();
static HOME_ROOT: OnceLock<PathBuf> = OnceLock::new();
#[cfg(test)]
static TEST_WORKSPACE_ROOT: OnceLock<tempfile::TempDir> = OnceLock::new();

pub fn get_workspace_root() -> &'static Path {
    WORKSPACE_ROOT.get_or_init(|| {
        let dir =
            env::var("FASTGPT_WORKDIR").unwrap_or_else(|_| "/home/sandbox/workspace".to_string());
        PathBuf::from(dir)
    })
}

pub fn get_home_root() -> &'static Path {
    HOME_ROOT.get_or_init(|| {
        let dir = env::var("HOME").unwrap_or_else(|_| "/home/sandbox".to_string());
        PathBuf::from(dir)
    })
}

pub fn get_canonical_workspace_root() -> &'static Path {
    CANONICAL_WORKSPACE_ROOT.get_or_init(|| {
        get_workspace_root()
            .canonicalize()
            .unwrap_or_else(|_| get_workspace_root().to_path_buf())
    })
}

/**
 * 打开基于 `cap-std` 能力约束（capability-based）的 workspace 根目录句柄。
 *
 * Linux 下底层利用 `openat2(RESOLVE_BENEATH)`、macOS/BSD 下通过逐级 `O_NOFOLLOW`/`openat`
 * 校验，从内核与系统调用边界杜绝符号链接越权和 TOCTOU 竞争。
 */
pub fn open_workspace_dir() -> io::Result<Dir> {
    Dir::open_ambient_dir(get_workspace_root(), ambient_authority())
}

/**
 * 校验并规范化 workspace 相对路径的各组成段。
 *
 * 与早期的字符黑名单 crate（如会误杀 `[...slug].tsx`、`$id.tsx`、`a..b.txt` 的 `path-security`）不同，
 * 这里仅拦截绝对路径、Windows 前缀、路径遍历段 `..` 以及控制字符/`\`/`\0`，合法的框架文件名一律放行，
 * 真正的越权与 symlink 逃逸由 `cap-std::fs::Dir` 在能力边界上强制拦截。
 */
pub fn parse_workspace_relative_parts(input_path: &str) -> Result<Vec<&str>, String> {
    if input_path.contains('\0') {
        return Err("Invalid workspace path component".to_string());
    }

    let input = Path::new(input_path);
    if input.is_absolute() {
        return Err("Absolute workspace paths are not allowed".to_string());
    }

    let mut parts = Vec::new();
    for component in input.components() {
        match component {
            Component::CurDir => {}
            Component::Normal(name) => {
                let name = name
                    .to_str()
                    .ok_or_else(|| "Invalid path encoding".to_string())?;
                if name.contains('\\') || name.chars().any(char::is_control) {
                    return Err("Invalid workspace path component".to_string());
                }
                parts.push(name);
            }
            Component::ParentDir => return Err("Path traversal is not allowed".to_string()),
            Component::RootDir | Component::Prefix(_) => {
                return Err("Absolute workspace paths are not allowed".to_string());
            }
        }
    }

    Ok(parts)
}

pub(crate) fn parts_to_rel_path(parts: &[&str]) -> PathBuf {
    if parts.is_empty() {
        PathBuf::from(".")
    } else {
        parts.iter().collect()
    }
}

pub fn is_workspace_root_rel(rel_path: &Path) -> bool {
    rel_path.as_os_str().is_empty() || rel_path == Path::new(".")
}

fn parse_non_reserved_parts(input_path: &str) -> Result<Vec<&str>, String> {
    let parts = parse_workspace_relative_parts(input_path)?;
    if parts
        .first()
        .copied()
        .is_some_and(is_reserved_workspace_root_entry)
    {
        return Err("Access to reserved workspace path is not allowed".to_string());
    }
    Ok(parts)
}

/// 解析 IDE 文件系统的工作区相对路径，返回 `(绝对路径, 相对路径)`。
///
/// IDE 文件系统操作仅服务于已鉴权的同容器用户（与 terminal / execute 同 uid），因此这里只阻止 `..`、
/// 绝对路径、控制字符与根 `lost+found` 越界操作，不再校验 symlink 目标是否在工作区外。
/// 对浏览器公开的 preview 路由仍通过 `open_workspace_dir()` 使用 `cap-std` 约束软链目标。
pub fn resolve_workspace_path(
    input_path: &str,
    allow_root: bool,
) -> Result<(PathBuf, PathBuf), String> {
    let parts = parse_non_reserved_parts(input_path)?;
    let rel_path = parts_to_rel_path(&parts);
    let is_root = is_workspace_root_rel(&rel_path);
    if !allow_root && is_root {
        return Err("Workspace target path is required".to_string());
    }
    let abs_path = if is_root {
        get_workspace_root().to_path_buf()
    } else {
        get_workspace_root().join(&rel_path)
    };
    Ok((abs_path, rel_path))
}

/// 隐藏工作区根目录下的文件系统保留目录 `lost+found`，避免文件树与事件流暴露挂载保留目录
pub fn is_reserved_workspace_root_entry(name: &str) -> bool {
    name == "lost+found"
}

/// 隐藏原子写入/解压过程中产生的临时文件，避免目录树与文件监听事件泄漏半成品文件名
pub fn is_atomic_tmp_file_name(name: &str) -> bool {
    name.starts_with('.') && name.contains(".fastgpt-tmp-")
}

/// 判断工作区相对路径的首个有效路径段是否指向根目录保留条目
pub fn is_reserved_workspace_path(rel_path: impl AsRef<Path>) -> bool {
    rel_path
        .as_ref()
        .components()
        .find(|comp| !matches!(comp, Component::CurDir))
        .and_then(|comp| comp.as_os_str().to_str())
        .is_some_and(is_reserved_workspace_root_entry)
}

/// 判断工作区相对路径是否包含原子写临时文件名段
pub fn is_atomic_tmp_workspace_path(rel_path: impl AsRef<Path>) -> bool {
    rel_path.as_ref().components().any(|comp| {
        matches!(comp, Component::Normal(_))
            && comp
                .as_os_str()
                .to_str()
                .is_some_and(is_atomic_tmp_file_name)
    })
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

    Some(
        relative_path
            .components()
            .map(|component| component.as_os_str().to_string_lossy())
            .collect::<Vec<_>>()
            .join("/"),
    )
}

#[cfg(test)]
pub fn init_test_workspace() -> &'static Path {
    let temp_dir = TEST_WORKSPACE_ROOT.get_or_init(|| {
        let temp_dir = tempfile::Builder::new()
            .prefix("fastgpt_ide_agent_test_")
            .tempdir()
            .expect("failed to create test workspace");
        let _ = WORKSPACE_ROOT.set(temp_dir.path().to_path_buf());
        let _ = HOME_ROOT.set(temp_dir.path().to_path_buf());
        temp_dir
    });

    temp_dir.path()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    fn assert_path_ok(result: Result<PathBuf, String>, expected_suffix: &str) -> PathBuf {
        let path = result.expect("path should be valid");
        assert!(path.ends_with(expected_suffix));
        path
    }

    #[test]
    fn test_resolve_workspace_path_checks_traversal_absolute_and_reserved() {
        let temp_workspace = init_test_workspace();

        assert_path_ok(
            resolve_workspace_path("dummy.txt", false).map(|(abs, _)| abs),
            "dummy.txt",
        );
        assert_path_ok(
            resolve_workspace_path("./dummy.txt", false).map(|(abs, _)| abs),
            "dummy.txt",
        );
        assert_eq!(resolve_workspace_path(".", true).unwrap().0, temp_workspace);
        for (input, allow_root) in [
            (".", false),
            ("/dummy.txt", false),
            ("../../../etc/passwd", false),
            ("nested/../../etc/passwd", false),
            ("lost+found", true),
            ("lost+found/secret.txt", false),
        ] {
            assert!(
                resolve_workspace_path(input, allow_root).is_err(),
                "expected error for ({input:?}, {allow_root})"
            );
        }
        assert_path_ok(
            resolve_workspace_path("nested/lost+found/ok.txt", false).map(|(abs, _)| abs),
            "nested/lost+found/ok.txt",
        );
    }

    #[test]
    fn test_allows_valid_framework_filenames() {
        let _temp_workspace = init_test_workspace();

        for rel in [
            "framework_names/routes/[...slug]/page.tsx",
            "framework_names/routes/$id.tsx",
            "framework_names/a..b.txt",
            "framework_names/backup~1",
        ] {
            let (abs, parsed_rel) = resolve_workspace_path(rel, false).unwrap();
            assert!(abs.ends_with(rel));
            assert_eq!(parsed_rel, PathBuf::from(rel));
        }
    }

    #[test]
    fn test_atomic_tmp_file_and_workspace_path_detection() {
        assert!(is_atomic_tmp_file_name(".foo.fastgpt-tmp-123"));
        assert!(!is_atomic_tmp_file_name(".env"));
        assert!(!is_atomic_tmp_file_name("foo.fastgpt-tmp-123"));

        assert!(is_atomic_tmp_workspace_path(".foo.fastgpt-tmp-123"));
        assert!(is_atomic_tmp_workspace_path("sub/.bar.fastgpt-tmp-9"));
        assert!(is_atomic_tmp_workspace_path(
            ".hidden.fastgpt-tmp-9/child.txt"
        ));
        assert!(!is_atomic_tmp_workspace_path("sub/.env"));
        assert!(!is_atomic_tmp_workspace_path("sub/foo.fastgpt-tmp-9"));
    }
}

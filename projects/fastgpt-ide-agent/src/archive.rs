//! Workspace `.tar.zst` streaming transport used by the FastGPT server (`/archive/pack`, `/archive/extract`).
//!
//! Boundary: the agent runs inside the user's own sandbox with the image user, and one PVC is mounted by
//! exactly one sandbox, so the agent is a transport tool, not a security boundary. It only guarantees
//! correct streaming; untrusted-input limits (size, entry count, path normalization) are enforced by the
//! FastGPT server wherever it consumes archive bytes. Extraction is delegated entirely to
//! `tar::Archive::unpack`, which already skips `..` entries, refuses to write through symlinked parents or
//! link hard links outside the target directory, and defers directory permissions until children exist.

use std::ffi::OsStr;
use std::fs::{self, File};
use std::io::{self, Read, Write};
use std::path::{Path, PathBuf};

use axum::{
    body::{Body, to_bytes},
    http::{
        HeaderMap, HeaderValue, StatusCode,
        header::{CACHE_CONTROL, CONTENT_TYPE},
    },
    response::{IntoResponse, Response},
};
use base64::Engine as _;
use futures_util::{StreamExt, TryStreamExt};
use ignore::gitignore::{Gitignore, GitignoreBuilder};
use serde::Deserialize;
use tokio::sync::oneshot;
use tokio_util::io::{ReaderStream, StreamReader, SyncIoBridge};
use tracing::error;

use crate::workspace::{
    get_home_root, is_atomic_tmp_file_name, is_reserved_workspace_root_entry,
    parse_workspace_relative_parts, parts_to_rel_path,
};

const STREAM_PIPE_CAPACITY: usize = 64 * 1024;
const MAX_PACK_REQUEST_BYTES: usize = 1024 * 1024;
const ZSTD_LEVEL: i32 = 1;
const TARGET_DIR_HEADER: &str = "x-fastgpt-archive-target-dir-b64";

#[derive(Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct PackRequest {
    #[serde(default)]
    target_dir: Option<String>,
    /// `.gitignore` syntax lines evaluated relative to the packed directory.
    #[serde(default)]
    exclude_patterns: Vec<String>,
}

fn text_response(status: StatusCode, message: impl Into<String>) -> Response<Body> {
    (
        status,
        [
            (
                CONTENT_TYPE,
                HeaderValue::from_static("text/plain; charset=utf-8"),
            ),
            (CACHE_CONTROL, HeaderValue::from_static("no-store")),
        ],
        message.into(),
    )
        .into_response()
}

fn no_content_response() -> Response<Body> {
    (
        StatusCode::NO_CONTENT,
        [(CACHE_CONTROL, HeaderValue::from_static("no-store"))],
    )
        .into_response()
}

/// Resolves a server-provided workspace-relative directory (empty means the workspace root).
fn resolve_target_dir(workspace_root: &Path, raw: Option<&str>) -> Result<PathBuf, String> {
    let parts = parse_workspace_relative_parts(raw.unwrap_or("").trim())?;
    Ok(workspace_root.join(parts_to_rel_path(&parts)))
}

/// Reads exactly `len` bytes: growth after the header was written is truncated and shrinkage is
/// zero-padded, so concurrent edits never corrupt the tar stream nor fail the whole archive.
fn exact_len_reader<R: Read>(reader: R, len: u64) -> impl Read {
    reader.take(len).chain(io::repeat(0)).take(len)
}

/**
 * Single-pass workspace walker that lazily opens the zstd/tar output on the first archivable entry,
 * signalling `ready` so the HTTP layer can answer `204` for empty trees and real error statuses for
 * failures that happen before any byte is streamed.
 */
struct Packer<W: Write> {
    excludes: Gitignore,
    skip_reserved_root_entries: bool,
    pending: Option<(W, oneshot::Sender<()>)>,
    builder: Option<tar::Builder<zstd::stream::write::Encoder<'static, W>>>,
}

impl<W: Write> Packer<W> {
    fn builder(
        &mut self,
    ) -> io::Result<&mut tar::Builder<zstd::stream::write::Encoder<'static, W>>> {
        if self.builder.is_none() {
            let (writer, ready) = self
                .pending
                .take()
                .expect("packer output is opened exactly once");
            let _ = ready.send(());
            let mut encoder = zstd::stream::write::Encoder::new(writer, ZSTD_LEVEL)?;
            encoder.include_checksum(true)?;
            self.builder = Some(tar::Builder::new(encoder));
        }
        Ok(self.builder.as_mut().expect("builder initialized above"))
    }

    fn is_excluded(&self, rel: &Path, name: &OsStr, is_dir: bool) -> bool {
        let name = name.to_string_lossy();
        // `lost+found` only exists at the PVC mount root and is unreadable for non-root images.
        (self.skip_reserved_root_entries
            && rel.parent() == Some(Path::new(""))
            && is_reserved_workspace_root_entry(&name))
            || is_atomic_tmp_file_name(&name)
            || self.excludes.matched(rel, is_dir).is_ignore()
    }

    fn walk(&mut self, dir: &Path, rel_dir: &Path) -> io::Result<()> {
        let mut entries = fs::read_dir(dir)?.collect::<io::Result<Vec<_>>>()?;
        entries.sort_by_key(|entry| entry.file_name());

        for entry in entries {
            let name = entry.file_name();
            let rel = rel_dir.join(&name);
            let path = entry.path();
            let result = entry.file_type().and_then(|file_type| {
                if self.is_excluded(&rel, &name, file_type.is_dir()) {
                    Ok(())
                } else if file_type.is_dir() {
                    self.append_dir(&path, &rel)
                        .and_then(|()| self.walk(&path, &rel))
                } else if file_type.is_file() {
                    self.append_file(&path, &rel)
                } else if file_type.is_symlink() {
                    self.append_symlink(&path, &rel)
                } else {
                    // Sockets, FIFOs and device nodes carry no restorable content.
                    Ok(())
                }
            });
            match result {
                // Entries removed while walking are simply absent from the snapshot.
                Err(error) if error.kind() == io::ErrorKind::NotFound => {}
                other => other?,
            }
        }
        Ok(())
    }

    fn append_dir(&mut self, path: &Path, rel: &Path) -> io::Result<()> {
        let mut header = tar::Header::new_gnu();
        header.set_metadata(&fs::symlink_metadata(path)?);
        self.builder()?.append_data(&mut header, rel, io::empty())
    }

    fn append_file(&mut self, path: &Path, rel: &Path) -> io::Result<()> {
        let file = File::open(path)?;
        let meta = file.metadata()?;
        if !meta.is_file() {
            return Ok(());
        }
        let mut header = tar::Header::new_gnu();
        header.set_metadata(&meta);
        let data = exact_len_reader(file, meta.len());
        self.builder()?.append_data(&mut header, rel, data)
    }

    /// Symlinks are archived verbatim (relative or absolute targets), matching `zip -y` semantics.
    fn append_symlink(&mut self, path: &Path, rel: &Path) -> io::Result<()> {
        let mut header = tar::Header::new_gnu();
        header.set_metadata(&fs::symlink_metadata(path)?);
        let target = fs::read_link(path)?;
        self.builder()?.append_link(&mut header, rel, target)
    }

    fn finish(self) -> io::Result<()> {
        if let Some(builder) = self.builder {
            builder.into_inner()?.finish()?.flush()?;
        }
        Ok(())
    }
}

fn build_excludes(root: &Path, patterns: &[String]) -> Result<Gitignore, String> {
    let mut builder = GitignoreBuilder::new(root);
    for line in patterns {
        builder
            .add_line(None, line)
            .map_err(|error| format!("Invalid exclude pattern {line:?}: {error}"))?;
    }
    builder.build().map_err(|error| error.to_string())
}

/**
 * `POST /archive/pack`: streams `targetDir` (default workspace root) as `.tar.zst`.
 *
 * - `204` when the directory is missing or has no archivable entry after exclusions.
 * - Errors before the first entry return `500`; errors after streaming started abort the chunked body
 *   so the consumer never commits a truncated archive.
 */
pub(crate) async fn pack_from_body(workspace_root: PathBuf, body: Body) -> Response<Body> {
    let request: PackRequest = match to_bytes(body, MAX_PACK_REQUEST_BYTES).await {
        Ok(bytes) if bytes.is_empty() => PackRequest::default(),
        Ok(bytes) => match serde_json::from_slice(&bytes) {
            Ok(request) => request,
            Err(error) => {
                return text_response(
                    StatusCode::BAD_REQUEST,
                    format!("Invalid pack request: {error}"),
                );
            }
        },
        Err(error) => {
            return text_response(
                StatusCode::BAD_REQUEST,
                format!("Failed to read pack request: {error}"),
            );
        }
    };

    let root = match resolve_target_dir(&workspace_root, request.target_dir.as_deref()) {
        Ok(root) => root,
        Err(message) => return text_response(StatusCode::BAD_REQUEST, message),
    };
    if !root.is_dir() {
        return no_content_response();
    }
    let excludes = match build_excludes(&root, &request.exclude_patterns) {
        Ok(excludes) => excludes,
        Err(message) => return text_response(StatusCode::BAD_REQUEST, message),
    };

    let (writer, reader) = tokio::io::duplex(STREAM_PIPE_CAPACITY);
    let (ready_tx, ready_rx) = oneshot::channel();
    let writer = SyncIoBridge::new(writer);
    let skip_reserved_root_entries = root == workspace_root;
    let producer = tokio::task::spawn_blocking(move || {
        let mut packer = Packer {
            excludes,
            skip_reserved_root_entries,
            pending: Some((writer, ready_tx)),
            builder: None,
        };
        packer.walk(&root, Path::new(""))?;
        packer.finish()
    });

    if ready_rx.await.is_err() {
        // The producer finished without opening the output: either empty or failed up front.
        return match producer.await {
            Ok(Ok(())) => no_content_response(),
            Ok(Err(error)) => {
                error!("Failed to pack workspace: {error}");
                text_response(StatusCode::INTERNAL_SERVER_ERROR, error.to_string())
            }
            Err(error) => text_response(StatusCode::INTERNAL_SERVER_ERROR, error.to_string()),
        };
    }

    let producer_result = futures_util::stream::once(async move {
        match producer.await {
            Ok(Ok(())) => None,
            Ok(Err(error)) => {
                error!("Workspace pack aborted while streaming: {error}");
                Some(Err(error))
            }
            Err(error) => Some(Err(io::Error::other(error))),
        }
    })
    .filter_map(std::future::ready);
    let stream = ReaderStream::new(reader).chain(producer_result);

    let mut response = Response::new(Body::from_stream(stream));
    let headers = response.headers_mut();
    headers.insert(CONTENT_TYPE, HeaderValue::from_static("application/zstd"));
    headers.insert(CACHE_CONTROL, HeaderValue::from_static("no-store"));
    response
}

pub(crate) async fn pack_handler(body: Body) -> Response<Body> {
    pack_from_body(get_home_root().to_path_buf(), body).await
}

fn parse_target_dir_header(headers: &HeaderMap) -> Result<Option<String>, String> {
    let Some(value) = headers.get(TARGET_DIR_HEADER) else {
        return Ok(None);
    };
    let decoded = value
        .to_str()
        .ok()
        .and_then(|raw| {
            base64::engine::general_purpose::STANDARD
                .decode(raw.trim())
                .ok()
        })
        .and_then(|bytes| String::from_utf8(bytes).ok())
        .ok_or_else(|| format!("Invalid {TARGET_DIR_HEADER} header"))?;
    Ok(Some(decoded))
}

fn unpack_tar_zst(reader: impl Read, target: &Path) -> io::Result<()> {
    fs::create_dir_all(target)?;
    let mut archive = tar::Archive::new(zstd::stream::read::Decoder::new(reader)?);
    archive.unpack(target)?;
    // Drain the zstd epilogue so the frame checksum is verified and truncated streams are rejected.
    io::copy(&mut archive.into_inner(), &mut io::sink())?;
    Ok(())
}

/**
 * `POST /archive/extract`: streams a `.tar.zst` body into the optional workspace-relative target dir
 * (`x-fastgpt-archive-target-dir-b64`), overwriting existing entries and leaving unrelated ones intact.
 */
pub(crate) async fn extract_from_body(
    workspace_root: PathBuf,
    headers: HeaderMap,
    body: Body,
) -> Response<Body> {
    let target = match parse_target_dir_header(&headers)
        .and_then(|raw| resolve_target_dir(&workspace_root, raw.as_deref()))
    {
        Ok(target) => target,
        Err(message) => return text_response(StatusCode::BAD_REQUEST, message),
    };

    let reader = SyncIoBridge::new(StreamReader::new(
        body.into_data_stream().map_err(io::Error::other),
    ));
    match tokio::task::spawn_blocking(move || unpack_tar_zst(reader, &target)).await {
        Ok(Ok(())) => no_content_response(),
        Ok(Err(error)) => {
            error!("Failed to extract archive: {error}");
            text_response(StatusCode::INTERNAL_SERVER_ERROR, error.to_string())
        }
        Err(error) => text_response(StatusCode::INTERNAL_SERVER_ERROR, error.to_string()),
    }
}

pub(crate) async fn extract_handler(headers: HeaderMap, body: Body) -> Response<Body> {
    extract_from_body(get_home_root().to_path_buf(), headers, body).await
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::os::unix::fs::{PermissionsExt, symlink};

    async fn pack(root: &Path, request: serde_json::Value) -> (StatusCode, Vec<u8>) {
        let response = pack_from_body(root.to_path_buf(), Body::from(request.to_string())).await;
        let status = response.status();
        let bytes = to_bytes(response.into_body(), usize::MAX).await.unwrap();
        (status, bytes.to_vec())
    }

    async fn extract(root: &Path, target_dir: Option<&str>, archive: Vec<u8>) -> Response<Body> {
        let mut headers = HeaderMap::new();
        if let Some(dir) = target_dir {
            let encoded = base64::engine::general_purpose::STANDARD.encode(dir);
            headers.insert(TARGET_DIR_HEADER, encoded.parse().unwrap());
        }
        extract_from_body(root.to_path_buf(), headers, Body::from(archive)).await
    }

    fn tar_zst(build: impl FnOnce(&mut tar::Builder<Vec<u8>>)) -> Vec<u8> {
        let mut builder = tar::Builder::new(Vec::new());
        build(&mut builder);
        zstd::encode_all(builder.into_inner().unwrap().as_slice(), 1).unwrap()
    }

    #[tokio::test]
    async fn round_trips_files_dirs_modes_and_verbatim_symlinks() {
        let src = tempfile::tempdir().unwrap();
        fs::create_dir_all(src.path().join("src/nested")).unwrap();
        fs::write(src.path().join("src/nested/hello.txt"), "hello").unwrap();
        fs::write(src.path().join("empty.txt"), "").unwrap();
        fs::write(src.path().join("run.sh"), "#!/bin/sh").unwrap();
        fs::set_permissions(src.path().join("run.sh"), fs::Permissions::from_mode(0o755)).unwrap();
        symlink("nested/hello.txt", src.path().join("src/hello.link")).unwrap();
        symlink("/usr/bin/python3", src.path().join("python")).unwrap();
        symlink("../../outside", src.path().join("src/upward.link")).unwrap();

        let (status, archive) = pack(src.path(), serde_json::json!({})).await;
        assert_eq!(status, StatusCode::OK);

        let dst = tempfile::tempdir().unwrap();
        assert_eq!(
            extract(dst.path(), None, archive).await.status(),
            StatusCode::NO_CONTENT
        );
        assert_eq!(
            fs::read_to_string(dst.path().join("src/nested/hello.txt")).unwrap(),
            "hello"
        );
        assert_eq!(fs::read(dst.path().join("empty.txt")).unwrap().len(), 0);
        let mode = fs::metadata(dst.path().join("run.sh"))
            .unwrap()
            .permissions()
            .mode();
        assert_eq!(mode & 0o777, 0o755);
        assert_eq!(
            fs::read_link(dst.path().join("src/hello.link")).unwrap(),
            PathBuf::from("nested/hello.txt")
        );
        assert_eq!(
            fs::read_link(dst.path().join("python")).unwrap(),
            PathBuf::from("/usr/bin/python3")
        );
        assert_eq!(
            fs::read_link(dst.path().join("src/upward.link")).unwrap(),
            PathBuf::from("../../outside")
        );
    }

    #[tokio::test]
    async fn pack_applies_gitignore_excludes_and_internal_skips() {
        let src = tempfile::tempdir().unwrap();
        fs::create_dir_all(src.path().join("lost+found")).unwrap();
        fs::create_dir_all(src.path().join("node_modules/pkg")).unwrap();
        fs::create_dir_all(src.path().join("app/node_modules")).unwrap();
        fs::create_dir_all(src.path().join("build")).unwrap();
        fs::create_dir_all(src.path().join("skills/demo/build")).unwrap();
        fs::write(src.path().join("node_modules/pkg/index.js"), "x").unwrap();
        fs::write(src.path().join("app/node_modules/a.js"), "x").unwrap();
        fs::write(src.path().join("build/out.js"), "x").unwrap();
        fs::write(src.path().join("skills/demo/build/keep.js"), "keep").unwrap();
        fs::write(src.path().join(".env"), "SECRET=1").unwrap();
        fs::write(src.path().join("keep.env"), "KEEP=1").unwrap();
        fs::write(src.path().join("debug.log"), "x").unwrap();
        fs::write(src.path().join("important.log"), "keep").unwrap();
        fs::write(src.path().join(".file.fastgpt-tmp-123"), "tmp").unwrap();
        let _socket =
            std::os::unix::net::UnixListener::bind(src.path().join("agent.sock")).unwrap();

        let (status, archive) = pack(
            src.path(),
            serde_json::json!({
                "excludePatterns": ["# comment", "node_modules/", "/build/", "/.env", "*.log", "!important.log"]
            }),
        )
        .await;
        assert_eq!(status, StatusCode::OK);

        let dst = tempfile::tempdir().unwrap();
        assert_eq!(
            extract(dst.path(), None, archive).await.status(),
            StatusCode::NO_CONTENT
        );
        for skipped in [
            "lost+found",
            "node_modules",
            "app/node_modules",
            "build",
            ".env",
            "debug.log",
            ".file.fastgpt-tmp-123",
            "agent.sock",
        ] {
            assert!(
                !dst.path().join(skipped).exists(),
                "{skipped} should be skipped"
            );
        }
        for kept in [
            "skills/demo/build/keep.js",
            "keep.env",
            "important.log",
            "app",
        ] {
            assert!(dst.path().join(kept).exists(), "{kept} should be kept");
        }
    }

    #[tokio::test]
    async fn pack_returns_no_content_for_empty_or_missing_target() {
        let src = tempfile::tempdir().unwrap();
        fs::create_dir_all(src.path().join("lost+found")).unwrap();
        fs::create_dir_all(src.path().join("skills")).unwrap();
        fs::write(src.path().join("skills/a.log"), "x").unwrap();

        let (status, _) = pack(src.path(), serde_json::json!({})).await;
        assert_eq!(
            status,
            StatusCode::OK,
            "empty directories are archivable entries"
        );

        let (status, _) = pack(
            src.path(),
            serde_json::json!({ "excludePatterns": ["skills/"] }),
        )
        .await;
        assert_eq!(status, StatusCode::NO_CONTENT);

        let (status, _) = pack(src.path(), serde_json::json!({ "targetDir": "missing" })).await;
        assert_eq!(status, StatusCode::NO_CONTENT);

        let (status, _) = pack(src.path(), serde_json::json!({ "targetDir": "../escape" })).await;
        assert_eq!(status, StatusCode::BAD_REQUEST);
    }

    #[tokio::test]
    async fn pack_target_dir_is_archived_relative_to_itself() {
        let src = tempfile::tempdir().unwrap();
        fs::create_dir_all(src.path().join("skills/demo")).unwrap();
        fs::write(src.path().join("skills/demo/SKILL.md"), "# demo").unwrap();
        fs::write(src.path().join("outside.txt"), "x").unwrap();

        let (status, archive) =
            pack(src.path(), serde_json::json!({ "targetDir": "skills" })).await;
        assert_eq!(status, StatusCode::OK);

        let dst = tempfile::tempdir().unwrap();
        assert_eq!(
            extract(dst.path(), Some("restored/skills"), archive)
                .await
                .status(),
            StatusCode::NO_CONTENT
        );
        assert!(dst.path().join("restored/skills/demo/SKILL.md").exists());
        assert!(!dst.path().join("restored/skills/outside.txt").exists());
    }

    #[test]
    fn exact_len_reader_truncates_growth_and_zero_pads_shrinkage() {
        let mut grown = Vec::new();
        exact_len_reader(&b"abcdef"[..], 4)
            .read_to_end(&mut grown)
            .unwrap();
        assert_eq!(grown, b"abcd");

        let mut shrunk = Vec::new();
        exact_len_reader(&b"ab"[..], 4)
            .read_to_end(&mut shrunk)
            .unwrap();
        assert_eq!(shrunk, b"ab\0\0");
    }

    #[tokio::test]
    async fn extract_never_writes_outside_target() {
        let workspace = tempfile::tempdir().unwrap();
        let outside = tempfile::tempdir().unwrap();
        let outside_path = outside.path().to_path_buf();

        let archive = tar_zst(|builder| {
            let mut link = tar::Header::new_gnu();
            link.set_entry_type(tar::EntryType::Symlink);
            link.set_size(0);
            builder
                .append_link(&mut link, "evil", &outside_path)
                .unwrap();

            let mut file = tar::Header::new_gnu();
            file.set_size(3);
            file.set_mode(0o644);
            builder
                .append_data(&mut file, "evil/pwn.txt", &b"pwn"[..])
                .unwrap();
        });
        assert_eq!(
            extract(workspace.path(), None, archive).await.status(),
            StatusCode::INTERNAL_SERVER_ERROR
        );
        assert!(!outside.path().join("pwn.txt").exists());

        let mut raw = tar::Builder::new(Vec::new());
        let mut header = tar::Header::new_gnu();
        header.set_size(3);
        header.set_mode(0o644);
        header.as_gnu_mut().unwrap().name[..9].copy_from_slice(b"../up.txt");
        header.set_cksum();
        raw.append(&header, &b"pwn"[..]).unwrap();
        let archive = zstd::encode_all(raw.into_inner().unwrap().as_slice(), 1).unwrap();
        let nested = workspace.path().join("nested");
        fs::create_dir_all(&nested).unwrap();
        extract(&nested, None, archive).await;
        assert!(!workspace.path().join("up.txt").exists());

        assert_eq!(
            extract(workspace.path(), Some("../escape"), Vec::new())
                .await
                .status(),
            StatusCode::BAD_REQUEST
        );
    }

    #[tokio::test]
    async fn extract_supports_hard_links_read_only_dirs_and_overwrites() {
        let dst = tempfile::tempdir().unwrap();
        fs::create_dir_all(dst.path().join("data")).unwrap();
        symlink("/etc/hosts", dst.path().join("data/a.txt")).unwrap();
        fs::write(dst.path().join("unrelated.txt"), "keep").unwrap();

        let archive = tar_zst(|builder| {
            let mut dir = tar::Header::new_gnu();
            dir.set_entry_type(tar::EntryType::Directory);
            dir.set_mode(0o555);
            dir.set_size(0);
            builder.append_data(&mut dir, "ro/", io::empty()).unwrap();

            let mut file = tar::Header::new_gnu();
            file.set_size(5);
            file.set_mode(0o644);
            builder
                .append_data(&mut file, "ro/child.txt", &b"child"[..])
                .unwrap();

            let mut data = tar::Header::new_gnu();
            data.set_size(3);
            data.set_mode(0o644);
            builder
                .append_data(&mut data, "data/a.txt", &b"new"[..])
                .unwrap();

            let mut hard = tar::Header::new_gnu();
            hard.set_entry_type(tar::EntryType::Link);
            hard.set_size(0);
            builder
                .append_link(&mut hard, "data/b.txt", "data/a.txt")
                .unwrap();
        });

        assert_eq!(
            extract(dst.path(), None, archive).await.status(),
            StatusCode::NO_CONTENT
        );
        assert_eq!(
            fs::read_to_string(dst.path().join("ro/child.txt")).unwrap(),
            "child"
        );
        let ro_mode = fs::metadata(dst.path().join("ro"))
            .unwrap()
            .permissions()
            .mode();
        assert_eq!(ro_mode & 0o777, 0o555);
        assert!(
            !fs::symlink_metadata(dst.path().join("data/a.txt"))
                .unwrap()
                .is_symlink()
        );
        assert_eq!(
            fs::read_to_string(dst.path().join("data/a.txt")).unwrap(),
            "new"
        );
        assert_eq!(
            fs::read_to_string(dst.path().join("data/b.txt")).unwrap(),
            "new"
        );
        assert_eq!(
            fs::read_to_string(dst.path().join("unrelated.txt")).unwrap(),
            "keep"
        );

        fs::set_permissions(dst.path().join("ro"), fs::Permissions::from_mode(0o755)).unwrap();
    }

    #[tokio::test]
    async fn extract_rejects_corrupted_or_truncated_streams() {
        let dst = tempfile::tempdir().unwrap();
        assert_eq!(
            extract(dst.path(), None, b"not zstd".to_vec())
                .await
                .status(),
            StatusCode::INTERNAL_SERVER_ERROR
        );

        let mut archive = tar_zst(|builder| {
            let mut file = tar::Header::new_gnu();
            file.set_size(4096);
            file.set_mode(0o644);
            builder
                .append_data(&mut file, "big.bin", &vec![7_u8; 4096][..])
                .unwrap();
        });
        archive.truncate(archive.len() - 6);
        assert_eq!(
            extract(dst.path(), None, archive).await.status(),
            StatusCode::INTERNAL_SERVER_ERROR
        );
    }
}

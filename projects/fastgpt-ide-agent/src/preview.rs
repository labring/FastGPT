use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};

use axum::{
    Router,
    body::Body,
    extract::Path,
    http::{
        HeaderMap, HeaderName, HeaderValue, Method, StatusCode,
        header::{
            ACCEPT_RANGES, CONTENT_LENGTH, CONTENT_RANGE, CONTENT_TYPE, ETAG, IF_NONE_MATCH, RANGE,
        },
    },
    response::Response,
    routing::get,
};
use tokio::{
    fs::File,
    io::{AsyncReadExt, AsyncSeekExt, SeekFrom},
};
use tokio_util::io::ReaderStream;

use crate::workspace::{
    is_reserved_workspace_path, open_workspace_dir, parse_workspace_relative_parts,
    parts_to_rel_path,
};

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
struct ByteRange {
    start: u64,
    end: u64,
}

const PREVIEW_METHOD_HEADER: &str = "x-fastgpt-preview-method";
const PREVIEW_CONTENT_LENGTH_HEADER: &str = "x-fastgpt-preview-content-length";
const PREVIEW_ORIGIN_HEADER: &str = "x-fastgpt-preview-origin";
const PREVIEW_ORIGIN_VALUE: &str = "ide-agent";

fn parse_byte_range(value: &str, file_size: u64) -> Result<ByteRange, ()> {
    if file_size == 0 || !value.starts_with("bytes=") {
        return Err(());
    }

    let raw_range = &value[6..];
    if raw_range.contains(',') {
        return Err(());
    }

    let (raw_start, raw_end) = raw_range.split_once('-').ok_or(())?;
    if raw_start.is_empty() {
        let suffix_length = raw_end.parse::<u64>().map_err(|_| ())?;
        if suffix_length == 0 {
            return Err(());
        }
        let length = suffix_length.min(file_size);
        return Ok(ByteRange {
            start: file_size - length,
            end: file_size - 1,
        });
    }

    let start = raw_start.parse::<u64>().map_err(|_| ())?;
    if start >= file_size {
        return Err(());
    }

    let end = if raw_end.is_empty() {
        file_size - 1
    } else {
        raw_end.parse::<u64>().map_err(|_| ())?.min(file_size - 1)
    };
    if end < start {
        return Err(());
    }

    Ok(ByteRange { start, end })
}

pub(crate) fn apply_preview_origin_header(headers: &mut HeaderMap) {
    headers.insert(
        HeaderName::from_static(PREVIEW_ORIGIN_HEADER),
        HeaderValue::from_static(PREVIEW_ORIGIN_VALUE),
    );
}

pub(crate) fn text_response(status: StatusCode, message: &'static str) -> Response<Body> {
    let mut response = Response::new(Body::from(message));
    *response.status_mut() = status;
    response.headers_mut().insert(
        CONTENT_TYPE,
        HeaderValue::from_static("text/plain; charset=utf-8"),
    );
    apply_preview_origin_header(response.headers_mut());
    response
}

fn build_etag(file_size: u64, modified_at: SystemTime) -> String {
    let modified_millis = modified_at
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis())
        .unwrap_or_default();
    format!("W/\"{file_size:x}-{modified_millis:x}\"")
}

fn content_type_for_path(path: &std::path::Path) -> String {
    let mime = mime_infer::from_path(path).first_or_octet_stream();
    if mime.type_() == mime_infer::mime::TEXT {
        format!("{}; charset=utf-8", mime.essence_str())
    } else {
        mime.essence_str().to_string()
    }
}

enum PreviewOpenError {
    Forbidden(&'static str),
    NotFound,
    Internal,
}

impl PreviewOpenError {
    fn into_response(self) -> Response<Body> {
        match self {
            Self::Forbidden(msg) => text_response(StatusCode::FORBIDDEN, msg),
            Self::NotFound => text_response(StatusCode::NOT_FOUND, "File not found"),
            Self::Internal => {
                text_response(StatusCode::INTERNAL_SERVER_ERROR, "Failed to read file")
            }
        }
    }
}

/// Resolves a workspace relative path and (when needed) opens its regular file via `cap-std`.
fn resolve_preview_entry_sync(
    dir: &cap_std::fs::Dir,
    rel_path: &std::path::Path,
) -> Result<(PathBuf, cap_std::fs::Metadata), PreviewOpenError> {
    if is_reserved_workspace_path(rel_path) {
        return Err(PreviewOpenError::NotFound);
    }

    if let Err(err) = dir.symlink_metadata(rel_path) {
        return Err(match err.kind() {
            std::io::ErrorKind::NotFound => PreviewOpenError::NotFound,
            _ => PreviewOpenError::Forbidden("Forbidden workspace path"),
        });
    }

    let canonical_rel = dir
        .canonicalize(rel_path)
        .map_err(|_| PreviewOpenError::Forbidden("Forbidden workspace path"))?;
    if is_reserved_workspace_path(&canonical_rel) {
        return Err(PreviewOpenError::NotFound);
    }
    let meta = dir
        .metadata(&canonical_rel)
        .map_err(|_| PreviewOpenError::Forbidden("Forbidden workspace path"))?;
    Ok((canonical_rel, meta))
}

async fn resolve_and_open_preview_file(
    raw_path: &str,
    need_body: bool,
) -> Result<(PathBuf, u64, SystemTime, Option<File>), PreviewOpenError> {
    let parts = parse_workspace_relative_parts(raw_path)
        .map_err(|_| PreviewOpenError::Forbidden("Forbidden workspace path"))?;
    if parts.is_empty() {
        return Err(PreviewOpenError::Forbidden("Directory listing is disabled"));
    }
    let rel_path = parts_to_rel_path(&parts);

    tokio::task::spawn_blocking(move || {
        let dir = open_workspace_dir().map_err(|_| PreviewOpenError::Internal)?;
        let (mut canonical_rel, mut meta) = resolve_preview_entry_sync(&dir, &rel_path)?;

        if meta.is_dir() {
            let index_rel = canonical_rel.join("index.html");
            let (resolved_index, index_meta) = resolve_preview_entry_sync(&dir, &index_rel)?;
            if index_meta.is_dir() {
                return Err(PreviewOpenError::Forbidden("Directory listing is disabled"));
            }
            canonical_rel = resolved_index;
            meta = index_meta;
        }

        if !meta.is_file() {
            return Err(PreviewOpenError::Forbidden("Unsupported workspace entry"));
        }

        let file_size = meta.len();
        let modified_at = meta
            .modified()
            .map(cap_std::time::SystemTime::into_std)
            .unwrap_or(SystemTime::UNIX_EPOCH);
        let opened_file = if need_body && file_size > 0 {
            let file = dir
                .open(&canonical_rel)
                .map_err(|_| PreviewOpenError::Internal)?;
            Some(File::from_std(file.into_std()))
        } else {
            None
        };

        Ok((canonical_rel, file_size, modified_at, opened_file))
    })
    .await
    .map_err(|_| PreviewOpenError::Internal)?
}

/**
 * Streams one workspace file over the internal HTTP listener (port 1319).
 *
 * Authentication is enforced by `x-fastgpt-agent-token` per-instance password middleware and
 * agent-sandbox-proxy before requests reach this listener. Every file lookup is strictly confined
 * inside FASTGPT_WORKDIR.
 */
async fn preview_file_handler(
    Path(path): Path<String>,
    method: Method,
    headers: HeaderMap,
) -> Response<Body> {
    let is_tunneled_head = method == Method::GET
        && headers
            .get(PREVIEW_METHOD_HEADER)
            .and_then(|value| value.to_str().ok())
            .is_some_and(|value| value.eq_ignore_ascii_case("HEAD"));
    let is_head = method == Method::HEAD || is_tunneled_head;

    let (clean_rel_path, file_size, modified_at, mut opened_file) =
        match resolve_and_open_preview_file(&path, !is_head).await {
            Ok(resolved) => resolved,
            Err(err) => return err.into_response(),
        };

    let etag = build_etag(file_size, modified_at);
    let etag_header = HeaderValue::from_str(&etag).expect("ETag format is always valid ASCII");
    if headers
        .get(IF_NONE_MATCH)
        .and_then(|value| value.to_str().ok())
        .is_some_and(|value| value == etag)
    {
        let mut response = Response::new(Body::empty());
        *response.status_mut() = StatusCode::NOT_MODIFIED;
        response.headers_mut().insert(ETAG, etag_header);
        apply_preview_origin_header(response.headers_mut());
        return response;
    }

    let requested_range = match headers.get(RANGE).and_then(|value| value.to_str().ok()) {
        Some(value) => match parse_byte_range(value, file_size) {
            Ok(range) => Some(range),
            Err(_) => {
                let mut response = text_response(
                    StatusCode::RANGE_NOT_SATISFIABLE,
                    "Requested range is not satisfiable",
                );
                if let Ok(range_header) = HeaderValue::from_str(&format!("bytes */{file_size}")) {
                    response.headers_mut().insert(CONTENT_RANGE, range_header);
                }
                return response;
            }
        },
        None => None,
    };
    let response_range = requested_range.unwrap_or(ByteRange {
        start: 0,
        end: file_size.saturating_sub(1),
    });
    let response_length = if file_size == 0 {
        0
    } else {
        response_range.end - response_range.start + 1
    };

    let body = match opened_file.take() {
        Some(mut file) if !is_head && response_length > 0 => {
            if response_range.start > 0
                && file
                    .seek(SeekFrom::Start(response_range.start))
                    .await
                    .is_err()
            {
                return text_response(StatusCode::INTERNAL_SERVER_ERROR, "Failed to seek file");
            }
            Body::from_stream(ReaderStream::new(file.take(response_length)))
        }
        _ => Body::empty(),
    };

    let mut response = Response::new(body);
    *response.status_mut() = if requested_range.is_some() {
        StatusCode::PARTIAL_CONTENT
    } else {
        StatusCode::OK
    };
    let response_headers = response.headers_mut();
    response_headers.insert(ACCEPT_RANGES, HeaderValue::from_static("bytes"));
    let content_type_header = HeaderValue::from_str(&content_type_for_path(&clean_rel_path))
        .unwrap_or_else(|_| HeaderValue::from_static("application/octet-stream"));
    response_headers.insert(CONTENT_TYPE, content_type_header);
    if is_tunneled_head {
        // 隧道 HEAD 响应通过 GET 承载，真实文件体积须经自定义头回传，同时将 HTTP Content-Length 设为 0 以符合 GET 空响应体帧规范。
        if let Ok(len_header) = HeaderValue::from_str(&response_length.to_string()) {
            response_headers.insert(
                HeaderName::from_static(PREVIEW_CONTENT_LENGTH_HEADER),
                len_header,
            );
        }
        response_headers.insert(CONTENT_LENGTH, HeaderValue::from_static("0"));
    } else if let Ok(len_header) = HeaderValue::from_str(&response_length.to_string()) {
        response_headers.insert(CONTENT_LENGTH, len_header);
    }
    response_headers.insert(ETAG, etag_header);
    if requested_range.is_some()
        && let Ok(range_header) = HeaderValue::from_str(&format!(
            "bytes {}-{}/{}",
            response_range.start, response_range.end, file_size
        ))
    {
        response_headers.insert(CONTENT_RANGE, range_header);
    }
    apply_preview_origin_header(response_headers);

    response
}

pub(crate) fn preview_router() -> Router {
    Router::new().route(
        "/preview/{*path}",
        get(preview_file_handler).head(preview_file_handler),
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::{
        body::to_bytes,
        http::{Request, header::CONTENT_RANGE},
    };
    use tower::ServiceExt;

    use crate::workspace::init_test_workspace;

    fn preview_request(uri: &str) -> Request<Body> {
        Request::builder().uri(uri).body(Body::empty()).unwrap()
    }

    #[test]
    fn parses_supported_single_byte_ranges() {
        assert_eq!(
            parse_byte_range("bytes=2-5", 10),
            Ok(ByteRange { start: 2, end: 5 })
        );
        assert_eq!(
            parse_byte_range("bytes=7-", 10),
            Ok(ByteRange { start: 7, end: 9 })
        );
        assert_eq!(
            parse_byte_range("bytes=-3", 10),
            Ok(ByteRange { start: 7, end: 9 })
        );
        assert_eq!(
            parse_byte_range("bytes=2-100", 10),
            Ok(ByteRange { start: 2, end: 9 })
        );
    }

    #[test]
    fn rejects_invalid_or_multiple_byte_ranges() {
        assert!(parse_byte_range("items=0-1", 10).is_err());
        assert!(parse_byte_range("bytes=10-11", 10).is_err());
        assert!(parse_byte_range("bytes=5-2", 10).is_err());
        assert!(parse_byte_range("bytes=0-1,3-4", 10).is_err());
        assert!(parse_byte_range("bytes=-0", 10).is_err());
        assert!(parse_byte_range("bytes=0-", 0).is_err());
    }

    #[tokio::test]
    async fn serves_files_with_content_and_origin_header() {
        let workspace = init_test_workspace();
        let file_path = workspace.join("preview_http_index.html");
        tokio::fs::write(&file_path, "<h1>preview</h1>")
            .await
            .unwrap();

        let response = preview_router()
            .oneshot(preview_request("/preview/preview_http_index.html"))
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::OK);
        assert_eq!(
            response.headers().get(CONTENT_TYPE).unwrap(),
            "text/html; charset=utf-8"
        );
        assert_eq!(
            response.headers().get(PREVIEW_ORIGIN_HEADER).unwrap(),
            PREVIEW_ORIGIN_VALUE
        );
        let body = to_bytes(response.into_body(), 1024).await.unwrap();
        assert_eq!(&body[..], b"<h1>preview</h1>");

        let subdir = workspace.join("preview_http_dir");
        tokio::fs::create_dir_all(&subdir).await.unwrap();
        tokio::fs::write(subdir.join("index.html"), "<h2>subdir index</h2>")
            .await
            .unwrap();
        for dir_uri in ["/preview/preview_http_dir", "/preview/preview_http_dir/"] {
            let dir_response = preview_router()
                .oneshot(preview_request(dir_uri))
                .await
                .unwrap();
            assert_eq!(dir_response.status(), StatusCode::OK);
            assert_eq!(
                dir_response.headers().get(CONTENT_TYPE).unwrap(),
                "text/html; charset=utf-8"
            );
            let dir_body = to_bytes(dir_response.into_body(), 1024).await.unwrap();
            assert_eq!(&dir_body[..], b"<h2>subdir index</h2>");
        }
    }

    #[tokio::test]
    async fn supports_head_etag_and_range_requests() {
        let workspace = init_test_workspace();
        let file_path = workspace.join("preview_http_range.txt");
        tokio::fs::write(&file_path, "0123456789").await.unwrap();
        let router = preview_router();

        let range_response = router
            .clone()
            .oneshot(
                Request::builder()
                    .uri("/preview/preview_http_range.txt")
                    .header(RANGE, "bytes=2-5")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(range_response.status(), StatusCode::PARTIAL_CONTENT);
        assert_eq!(
            range_response.headers().get(CONTENT_RANGE).unwrap(),
            "bytes 2-5/10"
        );
        let etag = range_response.headers().get(ETAG).unwrap().clone();
        let body = to_bytes(range_response.into_body(), 1024).await.unwrap();
        assert_eq!(&body[..], b"2345");

        let head_response = router
            .clone()
            .oneshot(
                Request::builder()
                    .method(Method::HEAD)
                    .uri("/preview/preview_http_range.txt")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(head_response.status(), StatusCode::OK);
        assert_eq!(head_response.headers().get(CONTENT_LENGTH).unwrap(), "10");
        assert!(
            to_bytes(head_response.into_body(), 1024)
                .await
                .unwrap()
                .is_empty()
        );

        let tunneled_head_response = router
            .clone()
            .oneshot(
                Request::builder()
                    .uri("/preview/preview_http_range.txt")
                    .header(PREVIEW_METHOD_HEADER, "HEAD")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(tunneled_head_response.status(), StatusCode::OK);
        assert_eq!(
            tunneled_head_response
                .headers()
                .get(CONTENT_LENGTH)
                .unwrap(),
            "0"
        );
        assert_eq!(
            tunneled_head_response
                .headers()
                .get(PREVIEW_CONTENT_LENGTH_HEADER)
                .unwrap(),
            "10"
        );
        assert!(
            to_bytes(tunneled_head_response.into_body(), 1024)
                .await
                .unwrap()
                .is_empty()
        );

        let tunneled_head_range_response = router
            .clone()
            .oneshot(
                Request::builder()
                    .uri("/preview/preview_http_range.txt")
                    .header(PREVIEW_METHOD_HEADER, "HEAD")
                    .header(RANGE, "bytes=2-5")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(
            tunneled_head_range_response.status(),
            StatusCode::PARTIAL_CONTENT
        );
        assert_eq!(
            tunneled_head_range_response
                .headers()
                .get(CONTENT_RANGE)
                .unwrap(),
            "bytes 2-5/10"
        );
        assert_eq!(
            tunneled_head_range_response
                .headers()
                .get(CONTENT_LENGTH)
                .unwrap(),
            "0"
        );
        assert_eq!(
            tunneled_head_range_response
                .headers()
                .get(PREVIEW_CONTENT_LENGTH_HEADER)
                .unwrap(),
            "4"
        );
        assert!(
            to_bytes(tunneled_head_range_response.into_body(), 1024)
                .await
                .unwrap()
                .is_empty()
        );

        let not_modified_response = router
            .oneshot(
                Request::builder()
                    .uri("/preview/preview_http_range.txt")
                    .header(IF_NONE_MATCH, etag)
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(not_modified_response.status(), StatusCode::NOT_MODIFIED);
    }

    #[tokio::test]
    async fn rejects_invalid_ranges() {
        let workspace = init_test_workspace();
        tokio::fs::write(workspace.join("preview_http_auth.txt"), "content")
            .await
            .unwrap();
        let router = preview_router();

        let invalid_range = router
            .oneshot(
                Request::builder()
                    .uri("/preview/preview_http_auth.txt")
                    .header(RANGE, "bytes=999-")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(invalid_range.status(), StatusCode::RANGE_NOT_SATISFIABLE);
        assert_eq!(
            invalid_range.headers().get(CONTENT_RANGE).unwrap(),
            "bytes */7"
        );
    }

    #[cfg(unix)]
    #[tokio::test]
    async fn rejects_directory_index_symlinks_outside_workspace() {
        let workspace = init_test_workspace();
        let directory = workspace.join("preview_http_outside_index");
        let _ = tokio::fs::remove_dir_all(&directory).await;
        tokio::fs::create_dir_all(&directory).await.unwrap();
        let outside = tempfile::NamedTempFile::new().unwrap();
        std::os::unix::fs::symlink(outside.path(), directory.join("index.html")).unwrap();

        let response = preview_router()
            .oneshot(preview_request("/preview/preview_http_outside_index"))
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::FORBIDDEN);
        assert_eq!(
            response.headers().get(PREVIEW_ORIGIN_HEADER).unwrap(),
            PREVIEW_ORIGIN_VALUE
        );
    }

    #[tokio::test]
    async fn hides_reserved_lost_and_found_and_sets_origin_header() {
        let temp_dir = tempfile::tempdir().unwrap();
        std::fs::create_dir_all(temp_dir.path().join("lost+found")).unwrap();
        std::fs::write(temp_dir.path().join("lost+found/index.html"), "secret").unwrap();
        #[cfg(unix)]
        std::os::unix::fs::symlink("lost+found/index.html", temp_dir.path().join("alias.html"))
            .unwrap();

        let dir = cap_std::fs::Dir::open_ambient_dir(temp_dir.path(), cap_std::ambient_authority())
            .unwrap();
        assert!(matches!(
            resolve_preview_entry_sync(&dir, std::path::Path::new("lost+found/index.html")),
            Err(PreviewOpenError::NotFound)
        ));
        #[cfg(unix)]
        assert!(matches!(
            resolve_preview_entry_sync(&dir, std::path::Path::new("alias.html")),
            Err(PreviewOpenError::NotFound)
        ));

        let _workspace = init_test_workspace();
        let response = preview_router()
            .oneshot(preview_request("/preview/lost+found/index.html"))
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::NOT_FOUND);
        assert_eq!(
            response.headers().get(PREVIEW_ORIGIN_HEADER).unwrap(),
            PREVIEW_ORIGIN_VALUE
        );
    }
}

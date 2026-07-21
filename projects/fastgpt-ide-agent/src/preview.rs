use std::{
    sync::Arc,
    time::{SystemTime, UNIX_EPOCH},
};

use axum::{
    Router,
    body::Body,
    extract::{Path, State},
    http::{
        HeaderMap, HeaderValue, Method, StatusCode,
        header::{
            ACCEPT_RANGES, CACHE_CONTROL, CONTENT_LENGTH, CONTENT_RANGE, CONTENT_TYPE, ETAG,
            IF_NONE_MATCH, RANGE, REFERRER_POLICY, X_CONTENT_TYPE_OPTIONS,
        },
    },
    response::Response,
    routing::get,
};
use tokio::{
    fs::File,
    io::{AsyncReadExt, AsyncSeekExt, SeekFrom},
    net::TcpListener,
};
use tokio_util::io::ReaderStream;

use crate::workspace::sanitize_path;

#[derive(Clone)]
struct PreviewState {
    password: Arc<String>,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
struct ByteRange {
    start: u64,
    end: u64,
}

const AGENT_TOKEN_HEADER: &str = "x-fastgpt-agent-token";
const PREVIEW_METHOD_HEADER: &str = "x-fastgpt-preview-method";

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

fn apply_security_headers(headers: &mut HeaderMap) {
    headers.insert(REFERRER_POLICY, HeaderValue::from_static("no-referrer"));
    headers.insert(X_CONTENT_TYPE_OPTIONS, HeaderValue::from_static("nosniff"));
    headers.insert(CACHE_CONTROL, HeaderValue::from_static("private, no-store"));
}

fn text_response(status: StatusCode, message: &'static str) -> Response<Body> {
    let mut response = Response::new(Body::from(message));
    *response.status_mut() = status;
    response.headers_mut().insert(
        CONTENT_TYPE,
        HeaderValue::from_static("text/plain; charset=utf-8"),
    );
    apply_security_headers(response.headers_mut());
    response
}

fn is_authorized(headers: &HeaderMap, password: &str) -> bool {
    headers
        .get(AGENT_TOKEN_HEADER)
        .and_then(|value| value.to_str().ok())
        .is_some_and(|value| value == password)
}

fn build_etag(file_size: u64, modified_at: SystemTime) -> String {
    let modified_millis = modified_at
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis())
        .unwrap_or_default();
    format!("W/\"{file_size:x}-{modified_millis:x}\"")
}

fn content_type_for_path(path: &std::path::Path) -> String {
    let mime = mime_guess::from_path(path).first_or_octet_stream();
    if mime.type_() == mime_guess::mime::TEXT {
        format!("{}; charset=utf-8", mime.essence_str())
    } else {
        mime.essence_str().to_string()
    }
}

/**
 * Streams one authenticated workspace file over HTTP.
 *
 * The public preview ticket is never accepted here. The sandbox-local listener only trusts the
 * IDE agent password supplied by agent-sandbox-proxy and confines every path to FASTGPT_WORKDIR.
 */
async fn preview_file_handler(
    State(state): State<PreviewState>,
    Path(path): Path<String>,
    method: Method,
    headers: HeaderMap,
) -> Response<Body> {
    if !is_authorized(&headers, &state.password) {
        return text_response(StatusCode::UNAUTHORIZED, "Unauthorized");
    }
    let is_head = method == Method::HEAD
        || (method == Method::GET
            && headers
                .get(PREVIEW_METHOD_HEADER)
                .and_then(|value| value.to_str().ok())
                .is_some_and(|value| value.eq_ignore_ascii_case("HEAD")));

    let mut clean_path = match sanitize_path(&path).await {
        Ok(path) => path,
        Err(_) => return text_response(StatusCode::FORBIDDEN, "Forbidden workspace path"),
    };
    let mut metadata = match tokio::fs::metadata(&clean_path).await {
        Ok(metadata) => metadata,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            return text_response(StatusCode::NOT_FOUND, "File not found");
        }
        Err(_) => return text_response(StatusCode::INTERNAL_SERVER_ERROR, "Failed to read file"),
    };

    if metadata.is_dir() {
        let index_path = format!("{}/index.html", path.trim_end_matches('/'));
        clean_path = match sanitize_path(&index_path).await {
            Ok(path) => path,
            Err(_) => return text_response(StatusCode::FORBIDDEN, "Forbidden workspace path"),
        };
        metadata = match tokio::fs::metadata(&clean_path).await {
            Ok(metadata) if metadata.is_file() => metadata,
            Ok(_) => return text_response(StatusCode::FORBIDDEN, "Directory listing is disabled"),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
                return text_response(StatusCode::NOT_FOUND, "File not found");
            }
            Err(_) => {
                return text_response(StatusCode::INTERNAL_SERVER_ERROR, "Failed to read file");
            }
        };
    }

    if !metadata.is_file() {
        return text_response(StatusCode::FORBIDDEN, "Unsupported workspace entry");
    }

    let file_size = metadata.len();
    let etag = build_etag(
        file_size,
        metadata.modified().unwrap_or(SystemTime::UNIX_EPOCH),
    );
    if headers
        .get(IF_NONE_MATCH)
        .and_then(|value| value.to_str().ok())
        .is_some_and(|value| value == etag)
    {
        let mut response = Response::new(Body::empty());
        *response.status_mut() = StatusCode::NOT_MODIFIED;
        response
            .headers_mut()
            .insert(ETAG, HeaderValue::from_str(&etag).unwrap());
        apply_security_headers(response.headers_mut());
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
                response.headers_mut().insert(
                    CONTENT_RANGE,
                    HeaderValue::from_str(&format!("bytes */{file_size}")).unwrap(),
                );
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

    let body = if is_head || response_length == 0 {
        Body::empty()
    } else {
        let mut file = match File::open(&clean_path).await {
            Ok(file) => file,
            Err(_) => {
                return text_response(StatusCode::INTERNAL_SERVER_ERROR, "Failed to open file");
            }
        };
        if response_range.start > 0
            && file
                .seek(SeekFrom::Start(response_range.start))
                .await
                .is_err()
        {
            return text_response(StatusCode::INTERNAL_SERVER_ERROR, "Failed to seek file");
        }
        Body::from_stream(ReaderStream::new(file.take(response_length)))
    };

    let mut response = Response::new(body);
    *response.status_mut() = if requested_range.is_some() {
        StatusCode::PARTIAL_CONTENT
    } else {
        StatusCode::OK
    };
    let response_headers = response.headers_mut();
    response_headers.insert(ACCEPT_RANGES, HeaderValue::from_static("bytes"));
    response_headers.insert(
        CONTENT_TYPE,
        HeaderValue::from_str(&content_type_for_path(&clean_path)).unwrap(),
    );
    response_headers.insert(
        CONTENT_LENGTH,
        HeaderValue::from_str(&response_length.to_string()).unwrap(),
    );
    response_headers.insert(ETAG, HeaderValue::from_str(&etag).unwrap());
    if requested_range.is_some() {
        response_headers.insert(
            CONTENT_RANGE,
            HeaderValue::from_str(&format!(
                "bytes {}-{}/{}",
                response_range.start, response_range.end, file_size
            ))
            .unwrap(),
        );
    }
    apply_security_headers(response_headers);

    response
}

fn preview_router(password: Arc<String>) -> Router {
    Router::new()
        .route(
            "/preview/{*path}",
            get(preview_file_handler).head(preview_file_handler),
        )
        .with_state(PreviewState { password })
}

pub async fn serve_preview(listener: TcpListener, password: Arc<String>) -> std::io::Result<()> {
    axum::serve(listener, preview_router(password)).await
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

    fn authorized_request(uri: &str) -> Request<Body> {
        Request::builder()
            .uri(uri)
            .header(AGENT_TOKEN_HEADER, "preview-password")
            .body(Body::empty())
            .unwrap()
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
    async fn serves_authenticated_files_with_content_headers() {
        let workspace = init_test_workspace();
        let file_path = workspace.join("preview_http_index.html");
        tokio::fs::write(&file_path, "<h1>preview</h1>")
            .await
            .unwrap();

        let response = preview_router(Arc::new("preview-password".to_string()))
            .oneshot(authorized_request("/preview/preview_http_index.html"))
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::OK);
        assert_eq!(
            response.headers().get(CONTENT_TYPE).unwrap(),
            "text/html; charset=utf-8"
        );
        assert_eq!(
            response.headers().get(REFERRER_POLICY).unwrap(),
            "no-referrer"
        );
        let body = to_bytes(response.into_body(), 1024).await.unwrap();
        assert_eq!(&body[..], b"<h1>preview</h1>");
    }

    #[tokio::test]
    async fn supports_head_etag_and_range_requests() {
        let workspace = init_test_workspace();
        let file_path = workspace.join("preview_http_range.txt");
        tokio::fs::write(&file_path, "0123456789").await.unwrap();
        let router = preview_router(Arc::new("preview-password".to_string()));

        let range_response = router
            .clone()
            .oneshot(
                Request::builder()
                    .uri("/preview/preview_http_range.txt")
                    .header(AGENT_TOKEN_HEADER, "preview-password")
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
                    .header(AGENT_TOKEN_HEADER, "preview-password")
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
                    .header(AGENT_TOKEN_HEADER, "preview-password")
                    .header(PREVIEW_METHOD_HEADER, "HEAD")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(tunneled_head_response.status(), StatusCode::OK);
        assert!(
            to_bytes(tunneled_head_response.into_body(), 1024)
                .await
                .unwrap()
                .is_empty()
        );

        let not_modified_response = router
            .oneshot(
                Request::builder()
                    .uri("/preview/preview_http_range.txt")
                    .header(AGENT_TOKEN_HEADER, "preview-password")
                    .header(IF_NONE_MATCH, etag)
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(not_modified_response.status(), StatusCode::NOT_MODIFIED);
    }

    #[tokio::test]
    async fn rejects_missing_auth_and_invalid_ranges() {
        let workspace = init_test_workspace();
        tokio::fs::write(workspace.join("preview_http_auth.txt"), "content")
            .await
            .unwrap();
        let router = preview_router(Arc::new("preview-password".to_string()));

        let unauthorized = router
            .clone()
            .oneshot(
                Request::builder()
                    .uri("/preview/preview_http_auth.txt")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(unauthorized.status(), StatusCode::UNAUTHORIZED);

        let invalid_range = router
            .oneshot(
                Request::builder()
                    .uri("/preview/preview_http_auth.txt")
                    .header(AGENT_TOKEN_HEADER, "preview-password")
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

        let response = preview_router(Arc::new("preview-password".to_string()))
            .oneshot(authorized_request("/preview/preview_http_outside_index"))
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::FORBIDDEN);
    }
}

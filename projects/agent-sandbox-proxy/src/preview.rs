use std::{sync::LazyLock, time::Duration};

use axum::{
    body::Body,
    http::{
        HeaderMap, HeaderName, Method, StatusCode,
        header::{
            ACCEPT_RANGES, CACHE_CONTROL, CONTENT_LENGTH, CONTENT_RANGE, CONTENT_TYPE, ETAG, HOST,
            IF_NONE_MATCH, RANGE, REFERRER_POLICY, X_CONTENT_TYPE_OPTIONS,
        },
    },
    response::Response,
};

use crate::{
    auth::{SandboxAddress, parse_upstream_headers},
    endpoint::build_http_preview_url,
    error::PreviewError,
};

static PREVIEW_CLIENT: LazyLock<reqwest::Client> = LazyLock::new(|| {
    reqwest::Client::builder()
        .connect_timeout(Duration::from_secs(10))
        // Guard against hung upstream preview streams without imposing a hard cap on valid slow downloads.
        .read_timeout(Duration::from_secs(30))
        .pool_idle_timeout(Duration::from_secs(90))
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .expect("Failed to initialize preview HTTP client")
});

const FORWARDED_REQUEST_HEADERS: [HeaderName; 2] = [RANGE, IF_NONE_MATCH];
const PREVIEW_METHOD_HEADER: &str = "x-fastgpt-preview-method";
const PREVIEW_ORIGIN_HEADER: &str = "x-fastgpt-preview-origin";
const PREVIEW_ORIGIN_IDE_AGENT: &str = "ide-agent";
const FORWARDED_RESPONSE_HEADERS: [HeaderName; 5] = [
    CONTENT_TYPE,
    CONTENT_LENGTH,
    CONTENT_RANGE,
    ACCEPT_RANGES,
    ETAG,
];

fn classify_upstream_preview_status(
    status: StatusCode,
    upstream_headers: &reqwest::header::HeaderMap,
) -> Result<(), PreviewError> {
    let from_ide_agent = upstream_headers
        .get(PREVIEW_ORIGIN_HEADER)
        .and_then(|value| value.to_str().ok())
        == Some(PREVIEW_ORIGIN_IDE_AGENT);

    if matches!(
        status,
        StatusCode::UNAUTHORIZED
            | StatusCode::BAD_GATEWAY
            | StatusCode::SERVICE_UNAVAILABLE
            | StatusCode::GATEWAY_TIMEOUT
    ) || (!from_ide_agent && matches!(status, StatusCode::FORBIDDEN | StatusCode::NOT_FOUND))
    {
        return Err(PreviewError::UpstreamStatus(status));
    }

    Ok(())
}

/** 仅校验随机 token 格式；来源、沙盒归属与有效期统一由主站根据 session 解析。 */
fn verify_preview_session_id(session_id: &str) -> Result<(), PreviewError> {
    let session_bytes = session_id.as_bytes();
    if session_bytes.len() != 24
        || !session_bytes[0].is_ascii_lowercase()
        || !session_bytes
            .iter()
            .all(|byte| byte.is_ascii_alphanumeric())
    {
        return Err(PreviewError::InvalidSessionId("invalid session format"));
    }
    Ok(())
}

/**
 * 解析新旧 Preview 路径，旧链接保留 sandboxId:sessionId 凭证交给主站校验。
 *
 * 两种格式共用通配路由，避免旧路径与新链接的多层资源路径冲突；新 token 不含连字符，
 * 旧 sandboxId 必须符合历史格式，不能根据客户端路径推断或授予 Sandbox 访问权限。
 */
pub(crate) fn resolve_preview_request<'a>(
    raw_session_id: &str,
    raw_path: &'a str,
) -> Result<(String, &'a str), PreviewError> {
    if verify_preview_session_id(raw_session_id).is_ok() {
        return Ok((raw_session_id.to_string(), raw_path));
    }

    // [4.18.0 legacy compat, remove in >= 4.19.0] 旧格式 `/preview/<sandboxId>/<sessionId>/<path>` 解析：
    // 待历史 Preview 会话 TTL 全部过期且前端不再持有旧链接后，整体删除下方 legacy 解析分支，只保留随机 sessionId 路由。
    let Some((source_prefix, sandbox_hash)) = raw_session_id.split_once('-') else {
        return Err(PreviewError::InvalidSessionId("invalid session format"));
    };
    if !matches!(source_prefix, "app" | "skilledit")
        || sandbox_hash.len() != 16
        || !sandbox_hash
            .bytes()
            .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
    {
        return Err(PreviewError::InvalidSessionId("invalid sandbox id format"));
    }

    let (session_id, path) = raw_path
        .split_once('/')
        .filter(|(_, path)| !path.is_empty())
        .ok_or_else(|| PreviewError::InvalidRequest("Preview file path is missing".to_string()))?;
    verify_preview_session_id(session_id)?;

    Ok((format!("{raw_session_id}:{session_id}"), path))
}

/**
 * Proxies one authenticated public preview request to the fixed IDE agent preview service.
 *
 * Only a small HTTP header allowlist crosses the trust boundary. The client cannot influence the
 * upstream host, port, authorization headers, or HTTP method beyond GET/HEAD.
 */
pub async fn proxy_preview_file(
    address: &SandboxAddress,
    path: &str,
    method: &Method,
    request_headers: &HeaderMap,
) -> Result<Response<Body>, PreviewError> {
    let sandbox_url = address
        .sandbox_url
        .as_deref()
        .filter(|url| !url.is_empty())
        .ok_or(PreviewError::MissingEndpoint("Sandbox endpoint is missing"))?;
    let target_url = build_http_preview_url(sandbox_url, path)
        .map_err(|err| PreviewError::InvalidRequest(err.to_string()))?;

    let is_head = method == Method::HEAD;
    let reqwest_method = Method::GET;
    let mut upstream_headers = HeaderMap::new();
    for (header_name, header_value) in parse_upstream_headers(&address.upstream_headers) {
        if header_name != HOST {
            upstream_headers.insert(header_name, header_value);
        }
    }
    if is_head {
        upstream_headers.insert(
            HeaderName::from_static(PREVIEW_METHOD_HEADER),
            axum::http::HeaderValue::from_static("HEAD"),
        );
    }
    for header_name in FORWARDED_REQUEST_HEADERS {
        if let Some(value) = request_headers.get(&header_name) {
            upstream_headers.insert(header_name, value.clone());
        }
    }
    let request = PREVIEW_CLIENT
        .request(reqwest_method, target_url)
        .headers(upstream_headers);

    let upstream = request
        .send()
        .await
        .map_err(|error| PreviewError::UpstreamConnect(error.to_string()))?;
    let status = upstream.status();
    classify_upstream_preview_status(status, upstream.headers())?;
    let upstream_headers = upstream.headers().clone();
    let body = if is_head {
        Body::empty()
    } else {
        Body::from_stream(upstream.bytes_stream())
    };
    let mut response = Response::new(body);
    *response.status_mut() = status;

    for header_name in FORWARDED_RESPONSE_HEADERS {
        if let Some(value) = upstream_headers.get(&header_name) {
            response.headers_mut().insert(header_name, value.clone());
        }
    }
    response.headers_mut().insert(
        REFERRER_POLICY,
        axum::http::HeaderValue::from_static("no-referrer"),
    );
    response.headers_mut().insert(
        X_CONTENT_TYPE_OPTIONS,
        axum::http::HeaderValue::from_static("nosniff"),
    );
    response.headers_mut().insert(
        CACHE_CONTROL,
        axum::http::HeaderValue::from_static("private, no-store"),
    );

    Ok(response)
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::{Router, body::to_bytes, extract::Path, http::HeaderValue, routing::get};
    use std::collections::HashMap;

    async fn upstream_handler(Path(path): Path<String>, headers: HeaderMap) -> Response<Body> {
        assert_eq!(headers.get(RANGE).unwrap(), "bytes=1-3");
        let mut response = Response::new(Body::from(path));
        response
            .headers_mut()
            .insert(CONTENT_TYPE, HeaderValue::from_static("text/plain"));
        response
            .headers_mut()
            .insert(CONTENT_RANGE, HeaderValue::from_static("bytes 1-3/10"));
        *response.status_mut() = StatusCode::PARTIAL_CONTENT;
        response
    }

    async fn head_upstream_handler(headers: HeaderMap) -> Response<Body> {
        assert_eq!(headers.get(PREVIEW_METHOD_HEADER).unwrap(), "HEAD");
        let mut response = Response::new(Body::from("body-must-not-be-forwarded"));
        response
            .headers_mut()
            .insert(CONTENT_LENGTH, HeaderValue::from_static("26"));
        response
    }

    async fn unavailable_upstream_handler() -> StatusCode {
        StatusCode::SERVICE_UNAVAILABLE
    }

    #[tokio::test]
    async fn streams_preview_response_and_forwards_safe_headers() {
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let address = listener.local_addr().unwrap();
        tokio::spawn(async move {
            axum::serve(
                listener,
                Router::new().route("/base/preview/{*path}", get(upstream_handler)),
            )
            .await
            .unwrap();
        });

        let mut request_headers = HeaderMap::new();
        request_headers.insert(RANGE, HeaderValue::from_static("bytes=1-3"));
        let response = proxy_preview_file(
            &SandboxAddress {
                sandbox_url: Some(format!("http://{address}/base")),
                upstream_headers: Default::default(),
                ws_limits: Default::default(),
            },
            "dir/file.txt",
            &Method::GET,
            &request_headers,
        )
        .await
        .unwrap();

        assert_eq!(response.status(), StatusCode::PARTIAL_CONTENT);
        assert_eq!(
            response.headers().get(CONTENT_RANGE).unwrap(),
            "bytes 1-3/10"
        );
        assert_eq!(
            response.headers().get(REFERRER_POLICY).unwrap(),
            "no-referrer"
        );
        let body = to_bytes(response.into_body(), 1024).await.unwrap();
        assert_eq!(&body[..], b"dir/file.txt");
    }

    #[tokio::test]
    async fn forwards_safe_upstream_headers_without_overriding_internal_headers() {
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let address = listener.local_addr().unwrap();
        tokio::spawn(async move {
            let app = Router::new().route(
                "/base/preview/{*path}",
                get(move |headers: HeaderMap| async move {
                    assert_eq!(headers.get(RANGE).unwrap(), "bytes=2-4");
                    assert_eq!(headers.get("open-sandbox-api-key").unwrap(), "osb-key");
                    assert_eq!(headers.get("x-sandbox-token").unwrap(), "ep-token");
                    assert_eq!(headers.get("host").unwrap(), &address.to_string());
                    Response::new(Body::from("ok"))
                }),
            );
            axum::serve(listener, app).await.unwrap();
        });

        let mut request_headers = HeaderMap::new();
        request_headers.insert(RANGE, HeaderValue::from_static("bytes=2-4"));
        let response = proxy_preview_file(
            &SandboxAddress {
                sandbox_url: Some(format!("http://{address}/base")),
                upstream_headers: HashMap::from([
                    ("OPEN-SANDBOX-API-KEY".to_string(), "osb-key".to_string()),
                    ("X-Sandbox-Token".to_string(), "ep-token".to_string()),
                    ("Host".to_string(), "evil.example.com".to_string()),
                    ("Range".to_string(), "bytes=0-1".to_string()),
                ]),
                ws_limits: Default::default(),
            },
            "dir/file.txt",
            &Method::GET,
            &request_headers,
        )
        .await
        .unwrap();

        assert_eq!(response.status(), StatusCode::OK);
    }

    #[tokio::test]
    async fn rejects_missing_upstream_credentials() {
        let response = proxy_preview_file(
            &SandboxAddress {
                sandbox_url: None,
                upstream_headers: Default::default(),
                ws_limits: Default::default(),
            },
            "file.txt",
            &Method::GET,
            &HeaderMap::new(),
        )
        .await;

        assert!(matches!(
            response,
            Err(PreviewError::MissingEndpoint("Sandbox endpoint is missing"))
        ));
    }

    #[tokio::test]
    async fn tunnels_head_through_get_without_forwarding_a_body() {
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let address = listener.local_addr().unwrap();
        tokio::spawn(async move {
            axum::serve(
                listener,
                Router::new().route("/base/preview/{*path}", get(head_upstream_handler)),
            )
            .await
            .unwrap();
        });

        let response = proxy_preview_file(
            &SandboxAddress {
                sandbox_url: Some(format!("http://{address}/base")),
                upstream_headers: Default::default(),
                ws_limits: Default::default(),
            },
            "dir/file.txt",
            &Method::HEAD,
            &HeaderMap::new(),
        )
        .await
        .unwrap();

        assert_eq!(response.status(), StatusCode::OK);
        assert_eq!(response.headers().get(CONTENT_LENGTH).unwrap(), "26");
        assert!(
            to_bytes(response.into_body(), usize::MAX)
                .await
                .unwrap()
                .is_empty()
        );
    }

    #[tokio::test]
    async fn surfaces_retryable_upstream_statuses_as_relay_errors() {
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let address = listener.local_addr().unwrap();
        tokio::spawn(async move {
            axum::serve(
                listener,
                Router::new().route("/base/preview/{*path}", get(unavailable_upstream_handler)),
            )
            .await
            .unwrap();
        });

        let error = proxy_preview_file(
            &SandboxAddress {
                sandbox_url: Some(format!("http://{address}/base")),
                upstream_headers: Default::default(),
                ws_limits: Default::default(),
            },
            "dir/file.txt",
            &Method::GET,
            &HeaderMap::new(),
        )
        .await
        .unwrap_err();

        assert!(matches!(
            error,
            PreviewError::UpstreamStatus(StatusCode::SERVICE_UNAVAILABLE)
        ));
    }

    #[test]
    fn accepts_preview_session_ids() {
        assert!(verify_preview_session_id("a12345678901234567890123").is_ok());
        assert!(verify_preview_session_id("zAbCdEfGhIjKlMnOpQrStUv9").is_ok());
    }

    #[test]
    fn rejects_invalid_preview_session_ids() {
        for session_id in [
            "",
            "a1234567890123456789012",
            "a123456789012345678901234",
            "A12345678901234567890123",
            "112345678901234567890123",
            "a1234567890123456789012-",
            "a1234567890123456789012_",
            "a1234567890123456789012é",
            "a1234567890123456789012\n",
            "app-0123456789abcdef:a12345678901234567890123",
        ] {
            assert!(matches!(
                verify_preview_session_id(session_id),
                Err(PreviewError::InvalidSessionId(_))
            ));
        }
    }

    #[test]
    fn resolves_current_preview_paths_without_consuming_file_segments() {
        for path in [
            "index.html",
            "dist/assets/app.js",
            "app-0123456789abcdef/index.html",
        ] {
            assert_eq!(
                resolve_preview_request("a12345678901234567890123", path).unwrap(),
                ("a12345678901234567890123".to_string(), path)
            );
        }
    }

    #[test]
    fn resolves_legacy_preview_paths_and_relative_assets() {
        for sandbox_id in ["app-0123456789abcdef", "skilledit-0123456789abcdef"] {
            for path in ["index.html", "dist/assets/app.js", "test dir/预览.html"] {
                let raw_path = format!("a12345678901234567890123/{path}");
                assert_eq!(
                    resolve_preview_request(sandbox_id, &raw_path).unwrap(),
                    (format!("{sandbox_id}:a12345678901234567890123"), path)
                );
            }
        }
    }

    #[test]
    fn rejects_malformed_legacy_preview_credentials() {
        for sandbox_id in [
            "other-0123456789abcdef",
            "app-0123456789abcdeG",
            "app-0123456789abcde",
            "app-0123456789abcdef0",
            "app-0123456789abcdef:extra",
        ] {
            assert!(matches!(
                resolve_preview_request(sandbox_id, "a12345678901234567890123/index.html"),
                Err(PreviewError::InvalidSessionId(_))
            ));
        }

        for session_id in [
            "invalid",
            "A12345678901234567890123",
            "a1234567890123456789012-",
        ] {
            let raw_path = format!("{session_id}/index.html");
            assert!(matches!(
                resolve_preview_request("app-0123456789abcdef", &raw_path),
                Err(PreviewError::InvalidSessionId(_))
            ));
        }
    }

    #[test]
    fn rejects_legacy_preview_paths_without_a_file() {
        for path in ["a12345678901234567890123", "a12345678901234567890123/"] {
            assert!(matches!(
                resolve_preview_request("app-0123456789abcdef", path),
                Err(PreviewError::InvalidRequest(_))
            ));
        }
    }

    #[tokio::test]
    async fn forwards_x_fastgpt_agent_token_and_maps_401_with_ide_origin_to_upstream_status() {
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let address = listener.local_addr().unwrap();
        tokio::spawn(async move {
            let app = Router::new().route(
                "/base/preview/{*path}",
                get(|headers: HeaderMap| async move {
                    if headers
                        .get("x-fastgpt-agent-token")
                        .and_then(|value| value.to_str().ok())
                        == Some("valid-agent-token")
                    {
                        Response::new(Body::from("authorized"))
                    } else {
                        let mut response = Response::new(Body::from("Unauthorized"));
                        *response.status_mut() = StatusCode::UNAUTHORIZED;
                        response.headers_mut().insert(
                            HeaderName::from_static(PREVIEW_ORIGIN_HEADER),
                            HeaderValue::from_static(PREVIEW_ORIGIN_IDE_AGENT),
                        );
                        response
                    }
                }),
            );
            axum::serve(listener, app).await.unwrap();
        });

        let ok_response = proxy_preview_file(
            &SandboxAddress {
                sandbox_url: Some(format!("http://{address}/base")),
                upstream_headers: HashMap::from([(
                    "x-fastgpt-agent-token".to_string(),
                    "valid-agent-token".to_string(),
                )]),
                ws_limits: Default::default(),
            },
            "index.html",
            &Method::GET,
            &HeaderMap::new(),
        )
        .await
        .unwrap();
        assert_eq!(ok_response.status(), StatusCode::OK);

        let err = proxy_preview_file(
            &SandboxAddress {
                sandbox_url: Some(format!("http://{address}/base")),
                upstream_headers: HashMap::from([(
                    "x-fastgpt-agent-token".to_string(),
                    "stale-token".to_string(),
                )]),
                ws_limits: Default::default(),
            },
            "index.html",
            &Method::GET,
            &HeaderMap::new(),
        )
        .await
        .unwrap_err();
        assert!(matches!(
            err,
            PreviewError::UpstreamStatus(StatusCode::UNAUTHORIZED)
        ));
    }

    #[test]
    fn classifies_403_and_404_based_on_ide_agent_origin_header() {
        let empty_headers = reqwest::header::HeaderMap::new();
        for status in [StatusCode::FORBIDDEN, StatusCode::NOT_FOUND] {
            assert!(matches!(
                classify_upstream_preview_status(status, &empty_headers),
                Err(PreviewError::UpstreamStatus(s)) if s == status
            ));
        }

        let mut ide_headers = reqwest::header::HeaderMap::new();
        ide_headers.insert(
            PREVIEW_ORIGIN_HEADER,
            reqwest::header::HeaderValue::from_static(PREVIEW_ORIGIN_IDE_AGENT),
        );
        for status in [StatusCode::FORBIDDEN, StatusCode::NOT_FOUND] {
            assert!(classify_upstream_preview_status(status, &ide_headers).is_ok());
        }
        assert!(matches!(
            classify_upstream_preview_status(StatusCode::UNAUTHORIZED, &ide_headers),
            Err(PreviewError::UpstreamStatus(StatusCode::UNAUTHORIZED))
        ));
    }
}

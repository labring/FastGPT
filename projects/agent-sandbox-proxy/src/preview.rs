use std::{sync::LazyLock, time::Duration};

use axum::{
    body::Body,
    http::{
        HeaderMap, HeaderName, Method, StatusCode,
        header::{
            ACCEPT_RANGES, CACHE_CONTROL, CONTENT_LENGTH, CONTENT_RANGE, CONTENT_TYPE, ETAG,
            IF_NONE_MATCH, RANGE, REFERRER_POLICY, X_CONTENT_TYPE_OPTIONS,
        },
    },
    response::Response,
};

use crate::{auth::SandboxAddress, relay::build_http_preview_url};

static PREVIEW_CLIENT: LazyLock<reqwest::Client> = LazyLock::new(|| {
    reqwest::Client::builder()
        .connect_timeout(Duration::from_secs(10))
        .pool_idle_timeout(Duration::from_secs(90))
        .build()
        .expect("Failed to initialize preview HTTP client")
});

const FORWARDED_REQUEST_HEADERS: [HeaderName; 2] = [RANGE, IF_NONE_MATCH];
const AGENT_TOKEN_HEADER: &str = "x-fastgpt-agent-token";
const PREVIEW_METHOD_HEADER: &str = "x-fastgpt-preview-method";
const FORWARDED_RESPONSE_HEADERS: [HeaderName; 5] = [
    CONTENT_TYPE,
    CONTENT_LENGTH,
    CONTENT_RANGE,
    ACCEPT_RANGES,
    ETAG,
];

pub fn preview_error_response(status: StatusCode, message: &'static str) -> Response<Body> {
    let mut response = Response::new(Body::from(message));
    *response.status_mut() = status;
    response.headers_mut().insert(
        CONTENT_TYPE,
        axum::http::HeaderValue::from_static("text/plain; charset=utf-8"),
    );
    response.headers_mut().insert(
        CACHE_CONTROL,
        axum::http::HeaderValue::from_static("private, no-store"),
    );
    response.headers_mut().insert(
        REFERRER_POLICY,
        axum::http::HeaderValue::from_static("no-referrer"),
    );
    response.headers_mut().insert(
        X_CONTENT_TYPE_OPTIONS,
        axum::http::HeaderValue::from_static("nosniff"),
    );
    response
}

/**
 * Proxies one authenticated public preview request to the fixed IDE agent preview service.
 *
 * Only a small HTTP header allowlist crosses the trust boundary. The client cannot influence the
 * upstream host, port, authorization token, or HTTP method beyond GET/HEAD.
 */
pub async fn proxy_preview_file(
    address: &SandboxAddress,
    path: &str,
    method: &Method,
    request_headers: &HeaderMap,
) -> Result<Response<Body>, String> {
    let sandbox_url = address
        .sandbox_url
        .as_deref()
        .filter(|url| !url.is_empty())
        .ok_or_else(|| "Sandbox endpoint is missing".to_string())?;
    let agent_token = address
        .agent_token
        .as_deref()
        .filter(|token| !token.is_empty())
        .ok_or_else(|| "Agent token is missing".to_string())?;
    let target_url = build_http_preview_url(sandbox_url, path)?;

    let is_head = method == Method::HEAD;
    let reqwest_method = if is_head {
        reqwest::Method::GET
    } else {
        reqwest::Method::from_bytes(method.as_str().as_bytes())
            .map_err(|error| format!("Invalid preview method: {error}"))?
    };
    let mut request = PREVIEW_CLIENT
        .request(reqwest_method, target_url)
        .header(AGENT_TOKEN_HEADER, agent_token);
    if is_head {
        request = request.header(PREVIEW_METHOD_HEADER, "HEAD");
    }
    for header_name in FORWARDED_REQUEST_HEADERS {
        if let Some(value) = request_headers.get(&header_name) {
            request = request.header(header_name, value);
        }
    }

    let upstream = request
        .send()
        .await
        .map_err(|error| format!("Failed to connect sandbox preview service: {error}"))?;
    let status = StatusCode::from_u16(upstream.status().as_u16())
        .map_err(|error| format!("Invalid upstream status: {error}"))?;
    if matches!(
        status,
        StatusCode::UNAUTHORIZED
            | StatusCode::BAD_GATEWAY
            | StatusCode::SERVICE_UNAVAILABLE
            | StatusCode::GATEWAY_TIMEOUT
    ) {
        return Err(format!("Sandbox preview upstream returned {status}"));
    }
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

pub fn bad_gateway_response() -> Response<Body> {
    preview_error_response(StatusCode::BAD_GATEWAY, "Sandbox preview is unavailable")
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::{Router, body::to_bytes, extract::Path, http::HeaderValue, routing::get};

    async fn upstream_handler(Path(path): Path<String>, headers: HeaderMap) -> Response<Body> {
        assert_eq!(headers.get(AGENT_TOKEN_HEADER).unwrap(), "agent-password");
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
        assert_eq!(headers.get(AGENT_TOKEN_HEADER).unwrap(), "agent-password");
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
                agent_token: Some("agent-password".to_string()),
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
    async fn rejects_missing_upstream_credentials() {
        let response = proxy_preview_file(
            &SandboxAddress {
                sandbox_url: None,
                agent_token: None,
                ws_limits: Default::default(),
            },
            "file.txt",
            &Method::GET,
            &HeaderMap::new(),
        )
        .await;

        assert!(
            response
                .unwrap_err()
                .contains("Sandbox endpoint is missing")
        );
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
                agent_token: Some("agent-password".to_string()),
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
                agent_token: Some("agent-password".to_string()),
                ws_limits: Default::default(),
            },
            "dir/file.txt",
            &Method::GET,
            &HeaderMap::new(),
        )
        .await
        .unwrap_err();

        assert!(error.contains("503 Service Unavailable"));
    }
}

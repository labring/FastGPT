use std::env;

use tracing::info;
use url::Url;

use super::error::{RelayError, RelayResult};

const LOOPBACK_REWRITE_HOST_ENV: &str = "AGENT_SANDBOX_PROXY_REWRITE_HOST";

fn configured_rewrite_host() -> Option<String> {
    env::var(LOOPBACK_REWRITE_HOST_ENV)
        .ok()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
}

/// Builds the WebSocket base URL used to connect to an IDE Agent endpoint.
pub(super) fn build_ws_upstream_base_url(raw_endpoint: &str) -> RelayResult<String> {
    build_ws_upstream_base_url_with_rewrite(raw_endpoint, configured_rewrite_host().as_deref())
}

fn build_ws_upstream_base_url_with_rewrite(
    raw_endpoint: &str,
    rewrite_host: Option<&str>,
) -> RelayResult<String> {
    let mut endpoint = parse_sandbox_endpoint(raw_endpoint)?;
    rewrite_loopback_host(&mut endpoint, rewrite_host)?;
    use_websocket_scheme(&mut endpoint)?;

    Ok(endpoint.as_str().trim_end_matches('/').to_string())
}

/// Builds a read-only preview URL and appends a validated workspace-relative path.
pub(crate) fn build_http_preview_url(raw_endpoint: &str, path: &str) -> Result<String, String> {
    build_http_preview_url_with_rewrite(raw_endpoint, path, configured_rewrite_host().as_deref())
        .map_err(|error| error.to_string())
}

fn build_http_preview_url_with_rewrite(
    raw_endpoint: &str,
    path: &str,
    rewrite_host: Option<&str>,
) -> RelayResult<String> {
    if path.is_empty() || path.starts_with('/') || path.contains('\\') || path.contains('\0') {
        return Err(RelayError::InvalidPreviewPath);
    }

    let path_segments = path.split('/').collect::<Vec<_>>();
    if path_segments
        .iter()
        .any(|segment| segment.is_empty() || *segment == "." || *segment == "..")
    {
        return Err(RelayError::InvalidPreviewPath);
    }

    let mut endpoint = parse_sandbox_endpoint(raw_endpoint)?;
    rewrite_loopback_host(&mut endpoint, rewrite_host)?;
    use_http_scheme(&mut endpoint)?;
    endpoint.set_fragment(None);

    {
        let mut segments = endpoint
            .path_segments_mut()
            .map_err(|_| RelayError::EndpointCannotBeBase)?;
        segments.pop_if_empty();
        segments.push("preview");
        segments.extend(path_segments);
    }

    Ok(endpoint.to_string())
}

fn parse_sandbox_endpoint(raw_endpoint: &str) -> RelayResult<Url> {
    let endpoint = raw_endpoint.trim().trim_end_matches('/');
    if endpoint.is_empty() {
        return Err(RelayError::EmptyEndpoint);
    }

    let endpoint = if endpoint.contains("://") {
        endpoint.to_string()
    } else {
        format!("http://{endpoint}")
    };

    Url::parse(&endpoint).map_err(|source| RelayError::InvalidEndpoint { source })
}

fn rewrite_loopback_host(endpoint: &mut Url, rewrite_host: Option<&str>) -> RelayResult<()> {
    let Some(rewrite_host) = rewrite_host else {
        return Ok(());
    };

    if !endpoint.host_str().is_some_and(is_loopback_host) {
        return Ok(());
    }

    endpoint
        .set_host(Some(rewrite_host))
        .map_err(|_| RelayError::InvalidRewriteHost {
            host: rewrite_host.to_string(),
        })?;

    info!("[WSProxy] Rewrote loopback sandbox endpoint host to {rewrite_host}.");
    Ok(())
}

fn is_loopback_host(host: &str) -> bool {
    host.eq_ignore_ascii_case("localhost") || host == "127.0.0.1" || host == "::1"
}

fn use_websocket_scheme(endpoint: &mut Url) -> RelayResult<()> {
    rewrite_scheme(endpoint, "ws", "wss")
}

fn use_http_scheme(endpoint: &mut Url) -> RelayResult<()> {
    rewrite_scheme(endpoint, "http", "https")
}

fn rewrite_scheme(
    endpoint: &mut Url,
    insecure: &'static str,
    secure: &'static str,
) -> RelayResult<()> {
    let scheme = match endpoint.scheme() {
        "http" | "ws" => insecure,
        "https" | "wss" => secure,
        scheme => {
            return Err(RelayError::UnsupportedEndpointScheme {
                scheme: scheme.to_string(),
            });
        }
    };

    endpoint
        .set_scheme(scheme)
        .map_err(|_| RelayError::EndpointSchemeRewrite { scheme })
}

/// Redacts credentials before an upstream URL is written to logs.
pub(super) fn redact_sensitive_query(url: &str) -> String {
    let Some((base, query)) = url.split_once('?') else {
        return url.to_string();
    };

    let redacted_query = query
        .split('&')
        .map(|pair| {
            let key = pair.split_once('=').map(|(key, _)| key).unwrap_or(pair);
            if key == "token" || key == "access_token" {
                format!("{key}=<redacted>")
            } else {
                pair.to_string()
            }
        })
        .collect::<Vec<_>>()
        .join("&");

    format!("{base}?{redacted_query}")
}

#[cfg(test)]
mod tests {
    use super::{build_http_preview_url_with_rewrite, build_ws_upstream_base_url_with_rewrite};

    #[test]
    fn rewrites_scheme_less_loopback_endpoint() {
        let url = build_ws_upstream_base_url_with_rewrite(
            "localhost:8090/sandboxes/demo/proxy/1318",
            Some("host.docker.internal"),
        )
        .unwrap();

        assert_eq!(
            url,
            "ws://host.docker.internal:8090/sandboxes/demo/proxy/1318"
        );
    }

    #[test]
    fn rewrites_http_loopback_endpoint() {
        let url = build_ws_upstream_base_url_with_rewrite(
            "http://127.0.0.1:8090/sandboxes/demo/proxy/1318/",
            Some("host.docker.internal"),
        )
        .unwrap();

        assert_eq!(
            url,
            "ws://host.docker.internal:8090/sandboxes/demo/proxy/1318"
        );
    }

    #[test]
    fn preserves_non_loopback_host() {
        let url = build_ws_upstream_base_url_with_rewrite(
            "http://opensandbox-server:8090/sandboxes/demo/proxy/1318",
            Some("host.docker.internal"),
        )
        .unwrap();

        assert_eq!(
            url,
            "ws://opensandbox-server:8090/sandboxes/demo/proxy/1318"
        );
    }

    #[test]
    fn preserves_secure_websocket_scheme() {
        let url = build_ws_upstream_base_url_with_rewrite(
            "https://sandbox.example.com/sandboxes/demo/proxy/1318",
            None,
        )
        .unwrap();

        assert_eq!(url, "wss://sandbox.example.com/sandboxes/demo/proxy/1318");
    }

    #[test]
    fn rejects_unsupported_scheme() {
        let error = build_ws_upstream_base_url_with_rewrite("ftp://localhost/sandboxes/demo", None)
            .unwrap_err();

        assert!(
            error
                .to_string()
                .contains("Unsupported sandbox endpoint scheme")
        );
    }

    #[test]
    fn builds_http_preview_url_with_encoded_workspace_segments() {
        let url = build_http_preview_url_with_rewrite(
            "http://127.0.0.1:8090/sandboxes/demo/proxy/1319",
            "test dir/预览.html",
            Some("host.docker.internal"),
        )
        .unwrap();

        assert_eq!(
            url,
            "http://host.docker.internal:8090/sandboxes/demo/proxy/1319/preview/test%20dir/%E9%A2%84%E8%A7%88.html"
        );
    }

    #[test]
    fn rejects_preview_path_traversal_and_unsupported_scheme() {
        assert!(build_http_preview_url_with_rewrite("http://sandbox", "../secret", None).is_err());
        assert!(build_http_preview_url_with_rewrite("http://sandbox", "dir//file", None).is_err());
        assert!(build_http_preview_url_with_rewrite("ftp://sandbox", "file.txt", None).is_err());
    }
}

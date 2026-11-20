use std::sync::OnceLock;

use thiserror::Error;
use tracing::info;
use url::Url;

static REWRITE_HOST_OVERRIDE: OnceLock<Option<String>> = OnceLock::new();

#[derive(Debug, Error)]
pub(crate) enum EndpointError {
    #[error("Sandbox endpoint URL is empty")]
    EmptyEndpoint,
    #[error("Invalid sandbox endpoint URL: {source}")]
    InvalidEndpoint {
        #[source]
        source: url::ParseError,
    },
    #[error("Invalid workspace preview path")]
    InvalidPreviewPath,
    #[error("Sandbox endpoint cannot be used as a base URL")]
    EndpointCannotBeBase,
    #[error("Invalid loopback rewrite host: {host}")]
    InvalidRewriteHost { host: String },
    #[error("Unsupported sandbox endpoint scheme: {scheme}")]
    UnsupportedScheme { scheme: String },
    #[error("Failed to set sandbox endpoint scheme to {scheme}")]
    SchemeRewrite { scheme: &'static str },
}

/// Records `AGENT_SANDBOX_PROXY_REWRITE_HOST` loaded from `.env` / process env at startup.
pub fn init_rewrite_host(host: Option<&str>) {
    let normalized = host
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToOwned::to_owned);
    let _ = REWRITE_HOST_OVERRIDE.set(normalized);
}

fn configured_rewrite_host() -> Option<String> {
    REWRITE_HOST_OVERRIDE.get().and_then(Clone::clone)
}

/// Builds the WebSocket base URL used to connect to an IDE Agent endpoint.
pub(crate) fn build_ws_upstream_base_url(raw_endpoint: &str) -> Result<String, EndpointError> {
    build_ws_upstream_base_url_with_rewrite(raw_endpoint, configured_rewrite_host().as_deref())
}

fn build_ws_upstream_base_url_with_rewrite(
    raw_endpoint: &str,
    rewrite_host: Option<&str>,
) -> Result<String, EndpointError> {
    let mut endpoint = parse_sandbox_endpoint(raw_endpoint)?;
    rewrite_loopback_host(&mut endpoint, rewrite_host)?;
    rewrite_scheme(&mut endpoint, "ws", "wss")?;
    endpoint.set_query(None);
    endpoint.set_fragment(None);

    Ok(endpoint.as_str().trim_end_matches('/').to_string())
}

/// Builds a read-only preview URL and appends a validated workspace-relative path.
pub(crate) fn build_http_preview_url(
    raw_endpoint: &str,
    path: &str,
) -> Result<String, EndpointError> {
    build_http_preview_url_with_rewrite(raw_endpoint, path, configured_rewrite_host().as_deref())
}

fn build_http_preview_url_with_rewrite(
    raw_endpoint: &str,
    path: &str,
    rewrite_host: Option<&str>,
) -> Result<String, EndpointError> {
    if path.is_empty() || path.starts_with('/') || path.contains('\\') || path.contains('\0') {
        return Err(EndpointError::InvalidPreviewPath);
    }

    let path_segments = path.split('/').collect::<Vec<_>>();
    if path_segments
        .iter()
        .any(|segment| segment.is_empty() || *segment == "." || *segment == "..")
    {
        return Err(EndpointError::InvalidPreviewPath);
    }

    let mut endpoint = parse_sandbox_endpoint(raw_endpoint)?;
    rewrite_loopback_host(&mut endpoint, rewrite_host)?;
    rewrite_scheme(&mut endpoint, "http", "https")?;
    endpoint.set_fragment(None);

    {
        let mut segments = endpoint
            .path_segments_mut()
            .map_err(|_| EndpointError::EndpointCannotBeBase)?;
        segments.pop_if_empty();
        segments.push("preview");
        segments.extend(path_segments);
    }

    Ok(endpoint.to_string())
}

fn parse_sandbox_endpoint(raw_endpoint: &str) -> Result<Url, EndpointError> {
    let endpoint = raw_endpoint.trim().trim_end_matches('/');
    if endpoint.is_empty() {
        return Err(EndpointError::EmptyEndpoint);
    }

    let endpoint = if endpoint.contains("://") {
        endpoint.to_string()
    } else {
        format!("http://{endpoint}")
    };

    Url::parse(&endpoint).map_err(|source| EndpointError::InvalidEndpoint { source })
}

fn rewrite_loopback_host(
    endpoint: &mut Url,
    rewrite_host: Option<&str>,
) -> Result<(), EndpointError> {
    let Some(rewrite_host) = rewrite_host else {
        return Ok(());
    };

    if !endpoint.host().is_some_and(is_loopback_url_host) {
        return Ok(());
    }

    endpoint
        .set_host(Some(rewrite_host))
        .map_err(|_| EndpointError::InvalidRewriteHost {
            host: rewrite_host.to_string(),
        })?;

    info!("[Endpoint] Rewrote loopback sandbox endpoint host to {rewrite_host}.");
    Ok(())
}

fn is_loopback_url_host(host: url::Host<&str>) -> bool {
    match host {
        url::Host::Domain(domain) => domain.eq_ignore_ascii_case("localhost"),
        url::Host::Ipv4(ip) => ip.is_loopback(),
        url::Host::Ipv6(ip) => ip.is_loopback(),
    }
}

fn rewrite_scheme(
    endpoint: &mut Url,
    insecure: &'static str,
    secure: &'static str,
) -> Result<(), EndpointError> {
    let scheme = match endpoint.scheme() {
        "http" | "ws" => insecure,
        "https" | "wss" => secure,
        scheme => {
            return Err(EndpointError::UnsupportedScheme {
                scheme: scheme.to_string(),
            });
        }
    };

    endpoint
        .set_scheme(scheme)
        .map_err(|_| EndpointError::SchemeRewrite { scheme })
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
    fn rewrites_ipv6_and_ipv4_range_loopback_endpoints() {
        for raw_endpoint in [
            "http://[::1]:8090/sandboxes/demo/proxy/1318",
            "[::1]:8090/sandboxes/demo/proxy/1318",
            "http://127.0.0.2:8090/sandboxes/demo/proxy/1318",
        ] {
            let url =
                build_ws_upstream_base_url_with_rewrite(raw_endpoint, Some("host.docker.internal"))
                    .unwrap();
            assert_eq!(
                url,
                "ws://host.docker.internal:8090/sandboxes/demo/proxy/1318"
            );
        }
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

    #[test]
    fn strips_query_and_fragment_from_ws_upstream_base_url() {
        let url = build_ws_upstream_base_url_with_rewrite(
            "http://127.0.0.1:8090/sandboxes/demo/proxy/1318/?token=ep-secret#frag",
            Some("host.docker.internal"),
        )
        .unwrap();

        assert_eq!(
            url,
            "ws://host.docker.internal:8090/sandboxes/demo/proxy/1318"
        );
    }
}

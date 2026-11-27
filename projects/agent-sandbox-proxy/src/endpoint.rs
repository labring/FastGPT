use std::sync::OnceLock;

use tracing::info;
use url::Url;

static REWRITE_HOST_OVERRIDE: OnceLock<Option<String>> = OnceLock::new();

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
pub(crate) fn build_ws_upstream_base_url(raw_endpoint: &str) -> Result<String, String> {
    build_ws_upstream_base_url_with_rewrite(raw_endpoint, configured_rewrite_host().as_deref())
}

fn build_ws_upstream_base_url_with_rewrite(
    raw_endpoint: &str,
    rewrite_host: Option<&str>,
) -> Result<String, String> {
    let mut endpoint = parse_sandbox_endpoint(raw_endpoint)?;
    rewrite_loopback_host(&mut endpoint, rewrite_host)?;
    rewrite_scheme(&mut endpoint, "ws", "wss")?;
    endpoint.set_query(None);
    endpoint.set_fragment(None);

    Ok(endpoint.as_str().trim_end_matches('/').to_string())
}

/// Builds a read-only preview URL and appends a validated workspace-relative path.
pub(crate) fn build_http_preview_url(raw_endpoint: &str, path: &str) -> Result<String, String> {
    build_http_preview_url_with_rewrite(raw_endpoint, path, configured_rewrite_host().as_deref())
}

fn build_http_preview_url_with_rewrite(
    raw_endpoint: &str,
    path: &str,
    rewrite_host: Option<&str>,
) -> Result<String, String> {
    if path.is_empty() || path.starts_with('/') || path.contains('\\') || path.contains('\0') {
        return Err("Invalid workspace preview path".to_string());
    }

    let trailing_slash = path.ends_with('/');
    let trimmed_path = path.strip_suffix('/').unwrap_or(path);
    if trimmed_path.is_empty() {
        return Err("Invalid workspace preview path".to_string());
    }

    let path_segments = trimmed_path.split('/').collect::<Vec<_>>();
    if path_segments
        .iter()
        .any(|segment| segment.is_empty() || *segment == "." || *segment == "..")
    {
        return Err("Invalid workspace preview path".to_string());
    }

    let mut endpoint = parse_sandbox_endpoint(raw_endpoint)?;
    rewrite_loopback_host(&mut endpoint, rewrite_host)?;
    rewrite_scheme(&mut endpoint, "http", "https")?;
    endpoint.set_query(None);
    endpoint.set_fragment(None);

    {
        let mut segments = endpoint
            .path_segments_mut()
            .map_err(|_| "Sandbox endpoint cannot be used as a base URL".to_string())?;
        segments.pop_if_empty();
        segments.push("preview");
        segments.extend(path_segments);
        if trailing_slash {
            segments.push("");
        }
    }

    Ok(endpoint.to_string())
}

fn parse_sandbox_endpoint(raw_endpoint: &str) -> Result<Url, String> {
    let endpoint = raw_endpoint.trim().trim_end_matches('/');
    if endpoint.is_empty() {
        return Err("Sandbox endpoint URL is empty".to_string());
    }

    let endpoint = if endpoint.contains("://") {
        endpoint.to_string()
    } else {
        format!("http://{endpoint}")
    };

    Url::parse(&endpoint).map_err(|err| format!("Invalid sandbox endpoint URL: {err}"))
}

fn rewrite_loopback_host(endpoint: &mut Url, rewrite_host: Option<&str>) -> Result<(), String> {
    let Some(rewrite_host) = rewrite_host else {
        return Ok(());
    };

    if !endpoint.host().is_some_and(is_loopback_url_host) {
        return Ok(());
    }

    endpoint
        .set_host(Some(rewrite_host))
        .map_err(|_| format!("Invalid loopback rewrite host: {rewrite_host}"))?;

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

fn rewrite_scheme(endpoint: &mut Url, insecure: &str, secure: &str) -> Result<(), String> {
    let scheme = match endpoint.scheme() {
        "http" | "ws" => insecure,
        "https" | "wss" => secure,
        other => return Err(format!("Unsupported sandbox endpoint scheme: {other}")),
    };

    endpoint
        .set_scheme(scheme)
        .map_err(|_| format!("Failed to set sandbox endpoint scheme to {scheme}"))
}

#[cfg(test)]
mod tests {
    use super::{build_http_preview_url_with_rewrite, build_ws_upstream_base_url_with_rewrite};

    #[test]
    fn builds_and_validates_ws_upstream_urls() {
        for (raw, rewrite, expected) in [
            (
                "localhost:8090/sandboxes/demo/proxy/1318",
                Some("host.docker.internal"),
                "ws://host.docker.internal:8090/sandboxes/demo/proxy/1318",
            ),
            (
                "http://127.0.0.1:8090/sandboxes/demo/proxy/1318/",
                Some("host.docker.internal"),
                "ws://host.docker.internal:8090/sandboxes/demo/proxy/1318",
            ),
            (
                "http://[::1]:8090/sandboxes/demo/proxy/1318",
                Some("host.docker.internal"),
                "ws://host.docker.internal:8090/sandboxes/demo/proxy/1318",
            ),
            (
                "[::1]:8090/sandboxes/demo/proxy/1318",
                Some("host.docker.internal"),
                "ws://host.docker.internal:8090/sandboxes/demo/proxy/1318",
            ),
            (
                "http://127.0.0.2:8090/sandboxes/demo/proxy/1318",
                Some("host.docker.internal"),
                "ws://host.docker.internal:8090/sandboxes/demo/proxy/1318",
            ),
            (
                "http://opensandbox-server:8090/sandboxes/demo/proxy/1318",
                Some("host.docker.internal"),
                "ws://opensandbox-server:8090/sandboxes/demo/proxy/1318",
            ),
            (
                "https://sandbox.example.com/sandboxes/demo/proxy/1318",
                None,
                "wss://sandbox.example.com/sandboxes/demo/proxy/1318",
            ),
            (
                "http://127.0.0.1:8090/sandboxes/demo/proxy/1318/?token=ep-secret#frag",
                Some("host.docker.internal"),
                "ws://host.docker.internal:8090/sandboxes/demo/proxy/1318",
            ),
        ] {
            assert_eq!(
                build_ws_upstream_base_url_with_rewrite(raw, rewrite).unwrap(),
                expected
            );
        }

        assert!(
            build_ws_upstream_base_url_with_rewrite("ftp://localhost/sandboxes/demo", None)
                .unwrap_err()
                .contains("Unsupported sandbox endpoint scheme")
        );
    }

    #[test]
    fn builds_and_validates_http_preview_urls() {
        for (raw, path, rewrite, expected) in [
            (
                "http://127.0.0.1:8090/sandboxes/demo/proxy/1319",
                "test dir/预览.html",
                Some("host.docker.internal"),
                "http://host.docker.internal:8090/sandboxes/demo/proxy/1319/preview/test%20dir/%E9%A2%84%E8%A7%88.html",
            ),
            (
                "http://127.0.0.1:8090/sandboxes/demo/proxy/1319/?token=ep-secret#frag",
                "docs/",
                Some("host.docker.internal"),
                "http://host.docker.internal:8090/sandboxes/demo/proxy/1319/preview/docs/",
            ),
        ] {
            assert_eq!(
                build_http_preview_url_with_rewrite(raw, path, rewrite).unwrap(),
                expected
            );
        }

        for (raw, path) in [
            ("http://sandbox", "../secret"),
            ("http://sandbox", "dir//file"),
            ("ftp://sandbox", "file.txt"),
            ("http://sandbox", "/"),
            ("http://sandbox", "docs//"),
        ] {
            assert!(build_http_preview_url_with_rewrite(raw, path, None).is_err());
        }
    }
}

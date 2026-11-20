use axum::http::header::{HeaderName, HeaderValue};
use dotenv::EnvMap;
use jsonwebtoken::{Algorithm, DecodingKey, Validation, decode};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::sync::{Arc, LazyLock, Mutex, OnceLock};
use std::time::{Duration, Instant};
use tokio::sync::{OnceCell, RwLock};
use tracing::{debug, error, warn};

use crate::error::AuthError;

#[derive(Debug, Clone, Copy, Deserialize)]
pub struct WsLimits {
    pub max_message_bytes: usize,
    pub max_frame_bytes: usize,
}

impl Default for WsLimits {
    fn default() -> Self {
        Self {
            max_message_bytes: 64 * 1024 * 1024,
            max_frame_bytes: 16 * 1024 * 1024,
        }
    }
}

#[derive(Debug, Clone, Deserialize)]
pub struct SandboxAddress {
    pub sandbox_url: Option<String>,
    #[serde(default)]
    pub upstream_headers: HashMap<String, String>,
    #[serde(default)]
    pub ws_limits: WsLimits,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Claims {
    pub source_type: String,
    pub source_id: String,
    pub user_id: String,
    pub chat_id: String,
    pub team_id: String,
    pub channel: String,
    pub permission: String,
    pub exp: u64,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppResponse<T> {
    pub code: u16,
    pub status_text: Option<String>,
    pub data: T,
}

struct AuthConfig {
    proxy_secret: String,
    decoding_key: DecodingKey,
    jwt_validation: Validation,
    verify_ticket_url: String,
    keepalive_url: String,
    address_cache_ttl: Duration,
    http_client: reqwest::Client,
}

type InflightLookupCell = Arc<OnceCell<Result<SandboxAddress, String>>>;

static AUTH_CONFIG: OnceLock<AuthConfig> = OnceLock::new();
static SANDBOX_ADDRESS_CACHE: LazyLock<RwLock<HashMap<[u8; 32], CachedSandboxAddress>>> =
    LazyLock::new(|| RwLock::new(HashMap::new()));
// Coalesce concurrent cold-cache misses per session so a burst of subresource loads triggers one lookup.
static INFLIGHT_PREVIEW_LOOKUPS: LazyLock<Mutex<HashMap<[u8; 32], InflightLookupCell>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));

const DEFAULT_APP_URL: &str = "http://localhost:3000";
const DEFAULT_APP_REQUEST_TIMEOUT_SECS: u64 = 10;
const DEFAULT_ADDRESS_CACHE_TTL_SECS: u64 = 30;
const MAX_ADDRESS_CACHE_ENTRIES: usize = 2_000;
const MIN_PROXY_SECRET_BYTES: usize = 32;
const SANDBOX_PREVIEW_SESSION_HEADER: &str = "X-Sandbox-Preview-Session";

#[derive(Clone)]
struct CachedSandboxAddress {
    address: SandboxAddress,
    expires_at: Instant,
}

enum VerifyTicketTarget<'a> {
    WebSocketTicket(&'a str),
    PreviewSession(&'a str),
}

struct InflightLookupGuard {
    cache_key: [u8; 32],
    cell: InflightLookupCell,
}

impl Drop for InflightLookupGuard {
    fn drop(&mut self) {
        if let Ok(mut inflight) = INFLIGHT_PREVIEW_LOOKUPS.lock()
            && inflight
                .get(&self.cache_key)
                .is_some_and(|current| Arc::ptr_eq(current, &self.cell))
        {
            inflight.remove(&self.cache_key);
        }
    }
}

fn parse_positive_u64(raw: Option<&str>, name: &str, default: u64) -> Result<u64, String> {
    let Some(raw) = raw.map(str::trim).filter(|value| !value.is_empty()) else {
        return Ok(default);
    };
    let parsed = raw
        .parse::<u64>()
        .map_err(|err| format!("Invalid {name}='{raw}': {err}"))?;
    if parsed == 0 {
        return Err(format!("{name} must be greater than 0"));
    }
    Ok(parsed)
}

fn build_auth_config(
    secret: String,
    app_url: &str,
    request_timeout_secs: u64,
    address_cache_ttl_secs: u64,
) -> Result<AuthConfig, String> {
    if secret.len() < MIN_PROXY_SECRET_BYTES {
        return Err(format!(
            "AGENT_SANDBOX_PROXY_SECRET must be at least {MIN_PROXY_SECRET_BYTES} bytes"
        ));
    }

    let parsed_url = reqwest::Url::parse(app_url.trim())
        .map_err(|err| format!("Invalid FASTGPT_APP_URL '{app_url}': {err}"))?;
    if !matches!(parsed_url.scheme(), "http" | "https") {
        return Err(format!(
            "FASTGPT_APP_URL must use http or https scheme, got '{}'",
            parsed_url.scheme()
        ));
    }
    let base_app_url = parsed_url.as_str().trim_end_matches('/');
    let verify_ticket_url = format!("{base_app_url}/api/core/ai/sandbox/verifyTicket");
    let keepalive_url = format!("{base_app_url}/api/core/ai/sandbox/keepalive");

    let decoding_key = DecodingKey::from_secret(secret.as_bytes())
        .map_err(|err| format!("Failed to initialize JWT decoding key: {err}"))?;
    let mut jwt_validation = Validation::new(Algorithm::HS256);
    jwt_validation.leeway = 5;

    let http_client = reqwest::Client::builder()
        .timeout(Duration::from_secs(request_timeout_secs))
        .pool_idle_timeout(Duration::from_secs(90))
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .map_err(|err| format!("Failed to initialize Auth HTTP client: {err}"))?;

    Ok(AuthConfig {
        proxy_secret: secret,
        decoding_key,
        jwt_validation,
        verify_ticket_url,
        keepalive_url,
        address_cache_ttl: Duration::from_secs(address_cache_ttl_secs),
        http_client,
    })
}

/**
 * Validates and initializes proxy auth/back-channel configuration at startup.
 *
 * Fails fast before binding listeners when required environment variables are missing or invalid.
 */
pub fn init_config(env_map: &EnvMap) -> Result<(), String> {
    let secret = env_map
        .get("AGENT_SANDBOX_PROXY_SECRET")
        .map(String::as_str)
        .filter(|value| !value.is_empty())
        .ok_or_else(|| "Missing AGENT_SANDBOX_PROXY_SECRET environment variable".to_string())?
        .to_string();
    let app_url = env_map
        .get("FASTGPT_APP_URL")
        .map(String::as_str)
        .filter(|value| !value.trim().is_empty())
        .unwrap_or(DEFAULT_APP_URL);
    let timeout_secs = parse_positive_u64(
        env_map
            .get("FASTGPT_APP_REQUEST_TIMEOUT_SECS")
            .map(String::as_str),
        "FASTGPT_APP_REQUEST_TIMEOUT_SECS",
        DEFAULT_APP_REQUEST_TIMEOUT_SECS,
    )?;
    let cache_ttl_secs = parse_positive_u64(
        env_map
            .get("AGENT_SANDBOX_PROXY_ADDRESS_CACHE_TTL_SECS")
            .map(String::as_str),
        "AGENT_SANDBOX_PROXY_ADDRESS_CACHE_TTL_SECS",
        DEFAULT_ADDRESS_CACHE_TTL_SECS,
    )?;

    let config = build_auth_config(secret, app_url, timeout_secs, cache_ttl_secs)?;
    let _ = AUTH_CONFIG.set(config);
    Ok(())
}

fn get_auth_config() -> &'static AuthConfig {
    AUTH_CONFIG
        .get()
        .expect("Proxy auth config must be initialized at startup via init_config")
}

pub(crate) enum KeepaliveOutcome {
    Ok,
    PermanentError,
    TransientError,
}

/// 向主站上报一次 sandbox 活跃心跳，封装代理密钥与控制面地址细节。
pub(crate) async fn send_keepalive(claims: &Claims) -> KeepaliveOutcome {
    let config = get_auth_config();
    debug!(
        "[KeepAlive] Sending heartbeat for sourceType: {}, sourceId: {}, chatId: {}",
        claims.source_type, claims.source_id, claims.chat_id
    );

    let body = serde_json::json!({
        "sourceType": claims.source_type,
        "sourceId": claims.source_id,
        "userId": claims.user_id,
        "chatId": claims.chat_id,
        "teamId": claims.team_id,
    });

    let request = config
        .http_client
        .post(&config.keepalive_url)
        .header("X-Proxy-Token", config.proxy_secret.as_str())
        .json(&body);

    match request.send().await {
        Ok(resp) => {
            let status = resp.status();
            if status.is_success() {
                debug!("[KeepAlive] Heartbeat succeeded.");
                KeepaliveOutcome::Ok
            } else {
                let err_text = resp.text().await.unwrap_or_else(|_| "Unknown".to_string());
                error!(
                    "[KeepAlive] Heartbeat rejected by App (status {}): {}",
                    status, err_text
                );
                if status.is_client_error() {
                    KeepaliveOutcome::PermanentError
                } else {
                    KeepaliveOutcome::TransientError
                }
            }
        }
        Err(err) => {
            error!("[KeepAlive] Failed to send heartbeat request: {}", err);
            KeepaliveOutcome::TransientError
        }
    }
}

/**
 * 在代理层边缘进行本地 JWT 验签防刷，直接在第一道闸口过滤非法请求。
 *
 * 返回底层 `jsonwebtoken::errors::Error`，由 `AuthError::Jwt` 承接，不在此处做字符串拼接。
 */
fn verify_jwt_ticket(ticket: &str) -> Result<Claims, jsonwebtoken::errors::Error> {
    let config = get_auth_config();
    let token_data = decode::<Claims>(ticket, &config.decoding_key, &config.jwt_validation)?;

    Ok(token_data.claims)
}

fn verify_ticket_for_channel(
    ticket: &str,
    expected_channel: &'static str,
) -> Result<Claims, AuthError> {
    let claims = verify_jwt_ticket(ticket)?;
    if claims.channel != expected_channel {
        return Err(AuthError::ChannelMismatch {
            expected: expected_channel,
            actual: claims.channel,
        });
    }
    if expected_channel == "terminal" && claims.permission != "write" {
        return Err(AuthError::PermissionDenied {
            channel: expected_channel,
        });
    }
    if expected_channel == "fs" && !matches!(claims.permission.as_str(), "read" | "write") {
        return Err(AuthError::PermissionDenied {
            channel: expected_channel,
        });
    }
    Ok(claims)
}

/// 统一校验 WebSocket ticket 并向 FastGPT 主站置换真实沙盒端点地址。
pub async fn authenticate_ws_ticket(
    ticket_opt: Option<String>,
    expected_channel: &'static str,
) -> Result<(SandboxAddress, Claims, String), AuthError> {
    let ticket = ticket_opt
        .filter(|t| !t.is_empty())
        .ok_or(AuthError::MissingTicket)?;

    let claims = verify_ticket_for_channel(&ticket, expected_channel)?;
    let address = request_verify_ticket(VerifyTicketTarget::WebSocketTicket(&ticket), false)
        .await
        .map_err(AuthError::ResolutionFailed)?;

    Ok((address, claims, ticket))
}

/// 当上游返回 401 时强制向 App 重新解析目标地址与密码（跳过 App 侧密码缓存）。
pub async fn refresh_ws_ticket_address(ticket: &str) -> Result<SandboxAddress, AuthError> {
    request_verify_ticket(VerifyTicketTarget::WebSocketTicket(ticket), true)
        .await
        .map_err(AuthError::ResolutionFailed)
}

async fn request_verify_ticket(
    target: VerifyTicketTarget<'_>,
    force_refresh: bool,
) -> Result<SandboxAddress, String> {
    request_verify_ticket_with_config(get_auth_config(), target, force_refresh).await
}

async fn request_verify_ticket_with_config(
    config: &AuthConfig,
    target: VerifyTicketTarget<'_>,
    force_refresh: bool,
) -> Result<SandboxAddress, String> {
    let (label, mut request) = match target {
        VerifyTicketTarget::WebSocketTicket(ticket) => (
            "ticket",
            config
                .http_client
                .get(&config.verify_ticket_url)
                .query(&[("ticket", ticket)]),
        ),
        VerifyTicketTarget::PreviewSession(session_id) => (
            "preview session",
            config
                .http_client
                .get(&config.verify_ticket_url)
                .header(SANDBOX_PREVIEW_SESSION_HEADER, session_id),
        ),
    };
    if force_refresh {
        request = request.query(&[("forceRefresh", "true")]);
    }

    debug!(
        "[Auth] Back-channel requesting App to resolve {label}. Target: {}",
        config.verify_ticket_url
    );

    request = request.header("X-Proxy-Token", config.proxy_secret.as_str());
    let response = request.send().await.map_err(|err| {
        format!(
            "HTTP request to App verifyTicket failed: {}",
            err.without_url()
        )
    })?;

    let status = response.status();
    if !status.is_success() {
        let err_text = response
            .text()
            .await
            .unwrap_or_else(|_| "Unknown error".to_string());
        error!(
            "[Auth] {} validation rejected by App (Status {}): {}",
            label, status, err_text
        );
        return Err(format!("{} rejected by App: {}", label, err_text));
    }

    let app_res = response
        .json::<AppResponse<SandboxAddress>>()
        .await
        .map_err(|err| {
            format!(
                "Failed to parse response JSON from App: {}",
                err.without_url()
            )
        })?;

    if app_res.code != 200 {
        return Err(format!(
            "App returned error code {}: {:?}",
            app_res.code,
            app_res
                .status_text
                .unwrap_or_else(|| "Unknown error".to_string())
        ));
    }

    debug!("[Auth] {label} resolved successfully.");
    Ok(app_res.data)
}

fn get_preview_session_cache_key(session_id: &str) -> [u8; 32] {
    Sha256::digest(session_id.as_bytes()).into()
}

async fn resolve_and_cache_preview_address(
    cache_key: [u8; 32],
    session_id: &str,
    force_refresh: bool,
) -> Result<SandboxAddress, String> {
    let address = request_verify_ticket(
        VerifyTicketTarget::PreviewSession(session_id),
        force_refresh,
    )
    .await?;
    let resolved_at = Instant::now();
    let ttl = get_auth_config().address_cache_ttl;

    let mut cache = SANDBOX_ADDRESS_CACHE.write().await;
    cache.retain(|_, cached| cached.expires_at > resolved_at);
    if cache.len() >= MAX_ADDRESS_CACHE_ENTRIES
        && let Some(oldest_key) = cache
            .iter()
            .min_by_key(|(_, cached)| cached.expires_at)
            .map(|(key, _)| *key)
    {
        cache.remove(&oldest_key);
    }
    cache.insert(
        cache_key,
        CachedSandboxAddress {
            address: address.clone(),
            expires_at: resolved_at + ttl,
        },
    );

    Ok(address)
}

/**
 * Resolves a preview session with a short address cache and per-session in-flight coalescing.
 *
 * Session validity is checked by FastGPT on cache misses. This cache avoids repeating the
 * back-channel lookup for each resource in one HTML page, and coalesces concurrent misses.
 */
pub async fn resolve_cached_preview_sandbox_address(
    session_id: &str,
) -> Result<(SandboxAddress, bool), String> {
    let now = Instant::now();
    let cache_key = get_preview_session_cache_key(session_id);
    if let Some(cached) = SANDBOX_ADDRESS_CACHE.read().await.get(&cache_key)
        && cached.expires_at > now
    {
        return Ok((cached.address.clone(), true));
    }

    let (cell, _guard) = {
        let mut inflight = INFLIGHT_PREVIEW_LOOKUPS
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        let cell = inflight
            .entry(cache_key)
            .or_insert_with(|| Arc::new(OnceCell::new()))
            .clone();
        let guard = InflightLookupGuard {
            cache_key,
            cell: cell.clone(),
        };
        (cell, guard)
    };

    let address = cell
        .get_or_init(|| resolve_and_cache_preview_address(cache_key, session_id, false))
        .await
        .clone()?;
    Ok((address, false))
}

/// 当 preview 上游返回 401 时使代理缓存失效，并要求 App 强制重新读取容器密码后回填缓存。
pub async fn refresh_preview_sandbox_address(session_id: &str) -> Result<SandboxAddress, String> {
    let cache_key = get_preview_session_cache_key(session_id);
    SANDBOX_ADDRESS_CACHE.write().await.remove(&cache_key);
    resolve_and_cache_preview_address(cache_key, session_id, true).await
}

/**
 * 解析控制面下发的上游数据面请求头，跳过非法 HTTP 头名或值。
 */
pub(crate) fn parse_upstream_headers(
    headers: &HashMap<String, String>,
) -> Vec<(HeaderName, HeaderValue)> {
    let mut parsed = Vec::new();
    for (raw_name, raw_value) in headers {
        let name = raw_name.trim();
        let Ok(parsed_name) = HeaderName::from_bytes(name.as_bytes()) else {
            warn!("[Auth] Skipping invalid upstream header name: {}", name);
            continue;
        };
        let Ok(parsed_value) = HeaderValue::from_str(raw_value) else {
            warn!(
                "[Auth] Skipping invalid upstream header value for {}",
                parsed_name
            );
            continue;
        };
        parsed.push((parsed_name, parsed_value));
    }
    parsed
}

pub async fn invalidate_cached_preview_sandbox_address(session_id: &str) {
    SANDBOX_ADDRESS_CACHE
        .write()
        .await
        .remove(&get_preview_session_cache_key(session_id));
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::http::StatusCode;
    use axum::response::IntoResponse;
    use jsonwebtoken::{EncodingKey, Header, encode};
    use std::time::{SystemTime, UNIX_EPOCH};
    fn init_test_secret(secret: &str) {
        if let Ok(config) = build_auth_config(
            secret.to_string(),
            DEFAULT_APP_URL,
            DEFAULT_APP_REQUEST_TIMEOUT_SECS,
            DEFAULT_ADDRESS_CACHE_TTL_SECS,
        ) {
            let _ = AUTH_CONFIG.set(config);
        }
    }

    fn sample_claims(exp: u64) -> Claims {
        Claims {
            source_type: "app".to_string(),
            source_id: "app-id-123".to_string(),
            user_id: "user-id-456".to_string(),
            chat_id: "chat-id-789".to_string(),
            team_id: "team-id-abc".to_string(),
            channel: "fs".to_string(),
            permission: "read".to_string(),
            exp,
        }
    }

    #[test]
    fn test_preview_session_cannot_be_used_as_websocket_ticket() {
        init_test_secret("test-secret-key-1234567890-very-long-32");
        assert!(verify_jwt_ticket("a12345678901234567890123").is_err());
    }

    #[test]
    fn test_verify_jwt_ticket_validation() {
        let secret = "test-secret-key-1234567890-very-long-32";
        let wrong_secret = "wrong-secret-key-1234567890-very-long-32";
        init_test_secret(secret);

        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_secs();

        let valid_token = encode(
            &Header::default(),
            &sample_claims(now + 60),
            &EncodingKey::from_secret(secret.as_bytes()).unwrap(),
        )
        .unwrap();
        let verified_claims = verify_jwt_ticket(&valid_token).unwrap();
        assert_eq!(verified_claims.source_type, "app");
        assert_eq!(verified_claims.source_id, "app-id-123");
        assert_eq!(verified_claims.user_id, "user-id-456");
        assert_eq!(verified_claims.chat_id, "chat-id-789");
        assert_eq!(verified_claims.team_id, "team-id-abc");
        assert_eq!(verified_claims.channel, "fs");
        assert_eq!(verified_claims.permission, "read");

        let wrong_sig_token = encode(
            &Header::default(),
            &sample_claims(now + 60),
            &EncodingKey::from_secret(wrong_secret.as_bytes()).unwrap(),
        )
        .unwrap();
        assert!(matches!(
            verify_jwt_ticket(&wrong_sig_token).unwrap_err().kind(),
            jsonwebtoken::errors::ErrorKind::InvalidSignature
        ));

        let expired_token = encode(
            &Header::default(),
            &sample_claims(now - 10),
            &EncodingKey::from_secret(secret.as_bytes()).unwrap(),
        )
        .unwrap();
        assert!(matches!(
            verify_jwt_ticket(&expired_token).unwrap_err().kind(),
            jsonwebtoken::errors::ErrorKind::ExpiredSignature
        ));
    }

    #[tokio::test]
    async fn test_auth_error_into_response_masks_details() {
        use axum::body::to_bytes;

        // 1. Missing ticket -> 401 Unauthorized
        let res = AuthError::MissingTicket.into_response();
        assert_eq!(res.status(), StatusCode::UNAUTHORIZED);
        assert_eq!(
            res.headers().get("x-content-type-options").unwrap(),
            "nosniff"
        );
        let body = to_bytes(res.into_body(), 1024).await.unwrap();
        assert_eq!(&body[..], b"Unauthorized");

        // 2. JWT validation error (e.g. invalid signature) -> 401 Unauthorized
        let decoding_key = DecodingKey::from_secret(b"secret-key-at-least-32-bytes-long").unwrap();
        let validation = Validation::new(Algorithm::HS256);
        let jwt_err =
            decode::<Claims>("invalid.jwt.token", &decoding_key, &validation).unwrap_err();
        let res = AuthError::Jwt(jwt_err).into_response();
        assert_eq!(res.status(), StatusCode::UNAUTHORIZED);
        let body = to_bytes(res.into_body(), 1024).await.unwrap();
        assert_eq!(&body[..], b"Unauthorized");

        // 3. Channel mismatch -> 401 Unauthorized
        let res = AuthError::ChannelMismatch {
            expected: "terminal",
            actual: "fs".to_string(),
        }
        .into_response();
        assert_eq!(res.status(), StatusCode::UNAUTHORIZED);
        let body = to_bytes(res.into_body(), 1024).await.unwrap();
        assert_eq!(&body[..], b"Unauthorized");

        // 4. Permission denied -> 401 Unauthorized
        let res = AuthError::PermissionDenied {
            channel: "terminal",
        }
        .into_response();
        assert_eq!(res.status(), StatusCode::UNAUTHORIZED);
        let body = to_bytes(res.into_body(), 1024).await.unwrap();
        assert_eq!(&body[..], b"Unauthorized");

        // 5. Resolution failed -> 403 Forbidden
        let res = AuthError::ResolutionFailed("Sensitive internal address details".to_string())
            .into_response();
        assert_eq!(res.status(), StatusCode::FORBIDDEN);
        let body = to_bytes(res.into_body(), 1024).await.unwrap();
        assert_eq!(&body[..], b"Forbidden");
    }

    #[test]
    fn test_preview_session_cache_key_is_stable_without_retaining_credential() {
        assert_eq!(
            get_preview_session_cache_key("session-a"),
            get_preview_session_cache_key("session-a")
        );
        assert_ne!(
            get_preview_session_cache_key("session-a"),
            get_preview_session_cache_key("session-b")
        );
    }

    #[test]
    fn test_parse_upstream_headers_skips_invalid_entries() {
        let headers = HashMap::from([
            ("OPEN-SANDBOX-API-KEY".to_string(), "osb-key".to_string()),
            ("X-Sandbox-Token".to_string(), "ep-token".to_string()),
            ("Bad Header".to_string(), "ok".to_string()),
            ("X-Crlf".to_string(), "bad\r\nvalue".to_string()),
        ]);

        let mut parsed = parse_upstream_headers(&headers);
        parsed.sort_by(|a, b| a.0.as_str().cmp(b.0.as_str()));

        assert_eq!(
            parsed,
            vec![
                (
                    HeaderName::from_static("open-sandbox-api-key"),
                    HeaderValue::from_static("osb-key"),
                ),
                (
                    HeaderName::from_static("x-sandbox-token"),
                    HeaderValue::from_static("ep-token"),
                ),
            ]
        );

        let decoded: SandboxAddress =
            serde_json::from_str(r#"{"sandbox_url":"http://127.0.0.1:1318"}"#).unwrap();
        assert!(decoded.upstream_headers.is_empty());
    }

    #[test]
    fn test_build_auth_config_validation() {
        let valid_secret = "test-secret-key-1234567890-very-long-32".to_string();
        assert!(build_auth_config("short".to_string(), "http://localhost:3000", 10, 30).is_err());
        assert!(build_auth_config(valid_secret.clone(), "ftp://localhost:3000", 10, 30).is_err());
        assert!(build_auth_config(valid_secret.clone(), "not a url", 10, 30).is_err());

        let config = build_auth_config(valid_secret, "https://app.example.com/", 10, 30).unwrap();
        assert_eq!(
            config.verify_ticket_url,
            "https://app.example.com/api/core/ai/sandbox/verifyTicket"
        );
        assert_eq!(
            config.keepalive_url,
            "https://app.example.com/api/core/ai/sandbox/keepalive"
        );
    }

    #[test]
    fn test_verify_ticket_for_channel_validates_fs_permissions() {
        let secret = "test-secret-key-1234567890-very-long-32";
        init_test_secret(secret);
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_secs();
        let sign = |permission: &str| {
            let mut claims = sample_claims(now + 60);
            claims.permission = permission.to_string();
            encode(
                &Header::default(),
                &claims,
                &EncodingKey::from_secret(secret.as_bytes()).unwrap(),
            )
            .unwrap()
        };

        assert_eq!(
            verify_ticket_for_channel(&sign("read"), "fs")
                .unwrap()
                .permission,
            "read"
        );
        assert_eq!(
            verify_ticket_for_channel(&sign("write"), "fs")
                .unwrap()
                .permission,
            "write"
        );
        assert!(matches!(
            verify_ticket_for_channel(&sign("admin"), "fs"),
            Err(AuthError::PermissionDenied { channel: "fs" })
        ));
        assert!(matches!(
            verify_ticket_for_channel(&sign(""), "fs"),
            Err(AuthError::PermissionDenied { channel: "fs" })
        ));
    }

    #[tokio::test]
    async fn test_request_verify_ticket_sends_force_refresh_query_param() {
        use axum::{Router, extract::RawQuery, routing::get};
        use std::sync::{Arc, Mutex};

        let seen_queries = Arc::new(Mutex::new(Vec::<String>::new()));
        let seen_queries_route = Arc::clone(&seen_queries);
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();

        tokio::spawn(async move {
            let app = Router::new().route(
                "/api/core/ai/sandbox/verifyTicket",
                get(move |RawQuery(query): RawQuery| {
                    let seen = Arc::clone(&seen_queries_route);
                    async move {
                        seen.lock().unwrap().push(query.unwrap_or_default());
                        (
                            [(axum::http::header::CONTENT_TYPE, "application/json")],
                            serde_json::json!({
                                "code": 200,
                                "data": {
                                    "sandbox_url": "http://127.0.0.1:1318",
                                    "upstream_headers": { "x-fastgpt-agent-token": "fresh-secret" }
                                }
                            })
                            .to_string(),
                        )
                    }
                }),
            );
            axum::serve(listener, app).await.unwrap();
        });

        let config = build_auth_config(
            "test-secret-key-1234567890-very-long-32".to_string(),
            &format!("http://{addr}"),
            5,
            30,
        )
        .unwrap();

        let ws_res = request_verify_ticket_with_config(
            &config,
            VerifyTicketTarget::WebSocketTicket("ws-ticket-1"),
            true,
        )
        .await
        .unwrap();
        assert_eq!(
            ws_res
                .upstream_headers
                .get("x-fastgpt-agent-token")
                .unwrap(),
            "fresh-secret"
        );

        let preview_res = request_verify_ticket_with_config(
            &config,
            VerifyTicketTarget::PreviewSession("preview-sess-1"),
            true,
        )
        .await
        .unwrap();
        assert_eq!(
            preview_res.sandbox_url.as_deref(),
            Some("http://127.0.0.1:1318")
        );

        let recorded = seen_queries.lock().unwrap().clone();
        assert_eq!(recorded.len(), 2);
        assert!(recorded[0].contains("ticket=ws-ticket-1"));
        assert!(recorded[0].contains("forceRefresh=true"));
        assert!(recorded[1].contains("forceRefresh=true"));
    }

    #[tokio::test]
    async fn test_request_verify_ticket_redacts_ticket_from_transport_and_json_errors() {
        use axum::{Router, routing::get};

        let secret_ticket = "secret-ws-jwt-ticket-value";

        // 1. Transport error on a closed port must not leak ?ticket=...
        let closed_listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let closed_addr = closed_listener.local_addr().unwrap();
        drop(closed_listener);

        let closed_config = build_auth_config(
            "test-secret-key-1234567890-very-long-32".to_string(),
            &format!("http://{closed_addr}"),
            5,
            30,
        )
        .unwrap();

        let transport_err = request_verify_ticket_with_config(
            &closed_config,
            VerifyTicketTarget::WebSocketTicket(secret_ticket),
            true,
        )
        .await
        .unwrap_err();
        assert!(transport_err.starts_with("HTTP request to App verifyTicket failed:"));
        assert!(!transport_err.contains(secret_ticket));

        // 2. Malformed JSON response must not leak ?ticket=...
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();
        tokio::spawn(async move {
            let app = Router::new().route(
                "/api/core/ai/sandbox/verifyTicket",
                get(|| async {
                    (
                        [(axum::http::header::CONTENT_TYPE, "application/json")],
                        "not-json",
                    )
                }),
            );
            axum::serve(listener, app).await.unwrap();
        });

        let bad_json_config = build_auth_config(
            "test-secret-key-1234567890-very-long-32".to_string(),
            &format!("http://{addr}"),
            5,
            30,
        )
        .unwrap();

        let json_err = request_verify_ticket_with_config(
            &bad_json_config,
            VerifyTicketTarget::WebSocketTicket(secret_ticket),
            false,
        )
        .await
        .unwrap_err();
        assert!(json_err.starts_with("Failed to parse response JSON from App:"));
        assert!(!json_err.contains(secret_ticket));
    }
}

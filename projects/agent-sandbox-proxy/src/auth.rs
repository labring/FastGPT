use jsonwebtoken::{Algorithm, DecodingKey, Validation, decode};
use serde::de::DeserializeOwned;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::env;
use std::sync::{LazyLock, OnceLock};
use std::time::{Duration, Instant};
use tokio::sync::RwLock;
use tracing::{debug, error};

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
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

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SandboxAddress {
    pub sandbox_url: Option<String>,
    pub agent_token: Option<String>,
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

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppResponse<T> {
    pub code: u16,
    pub status_text: Option<String>,
    pub data: T,
}

// 全局静态唯一的 HTTP 客户端连接池单例与共享秘钥
static HTTP_CLIENT: LazyLock<reqwest::Client> = LazyLock::new(|| {
    reqwest::Client::builder()
        .timeout(get_app_request_timeout()) // 覆盖主站冷启动校验、读取 agent password 与 endpoint 查询。
        .pool_idle_timeout(Duration::from_secs(90)) // 空闲连接在池中保留 90 秒
        .build()
        .expect("Failed to initialize global high-performance HTTP shared client pool")
});

static PROXY_SECRET: OnceLock<String> = OnceLock::new();
static SANDBOX_ADDRESS_CACHE: LazyLock<RwLock<HashMap<[u8; 32], CachedSandboxAddress>>> =
    LazyLock::new(|| RwLock::new(HashMap::new()));

const DEFAULT_APP_REQUEST_TIMEOUT_SECS: u64 = 10;
const DEFAULT_ADDRESS_CACHE_TTL_SECS: u64 = 30;
const MAX_ADDRESS_CACHE_ENTRIES: usize = 2_000;
const MIN_PROXY_SECRET_BYTES: usize = 32;
const SANDBOX_TICKET_HEADER: &str = "X-Sandbox-Ticket";
const SANDBOX_PREVIEW_SESSION_HEADER: &str = "X-Sandbox-Preview-Session";

#[derive(Clone)]
struct CachedSandboxAddress {
    address: SandboxAddress,
    expires_at: Instant,
}

fn get_app_request_timeout() -> Duration {
    let seconds = env::var("FASTGPT_APP_REQUEST_TIMEOUT_SECS")
        .ok()
        .and_then(|value| value.parse::<u64>().ok())
        .filter(|value| *value > 0)
        .unwrap_or(DEFAULT_APP_REQUEST_TIMEOUT_SECS);

    Duration::from_secs(seconds)
}

/// 获取全局共享的 reqwest Client，复用连接池并统一请求超时。
pub fn get_http_client() -> &'static reqwest::Client {
    &HTTP_CLIENT
}

pub fn get_proxy_secret() -> &'static str {
    PROXY_SECRET.get_or_init(|| {
        let secret = env::var("AGENT_SANDBOX_PROXY_SECRET")
            .expect("Missing AGENT_SANDBOX_PROXY_SECRET environment variable");
        if secret.len() < MIN_PROXY_SECRET_BYTES {
            panic!(
                "AGENT_SANDBOX_PROXY_SECRET must be at least {} bytes",
                MIN_PROXY_SECRET_BYTES
            );
        }
        secret
    })
}

fn decode_jwt_ticket<T: DeserializeOwned>(ticket: &str) -> Result<T, String> {
    let secret = get_proxy_secret();
    let decoding_key = DecodingKey::from_secret(secret.as_bytes());

    // JWT 默认使用 HS256 算法，配合 5 秒的时钟容差 (leeway)
    let mut validation = Validation::new(Algorithm::HS256);
    validation.leeway = 5;

    let token_data = decode::<T>(ticket, &decoding_key, &validation)
        .map_err(|err| format!("JWT signature validation failed: {}", err))?;

    Ok(token_data.claims)
}

/// 在代理层边缘校验既有 WebSocket ticket，保留上游 teamId claims 契约。
pub fn verify_jwt_ticket(ticket: &str) -> Result<Claims, String> {
    decode_jwt_ticket(ticket)
}

/// 反向请求 NextJS 主站验证凭证，并置换出真实的沙盒物理端点寻址信息。
async fn request_sandbox_address(
    credential: &str,
    credential_header: &'static str,
) -> Result<SandboxAddress, String> {
    // 1. 读取主站内网 API 基准地址 (默认 http://localhost:3000)
    let app_url =
        env::var("FASTGPT_APP_URL").unwrap_or_else(|_| "http://localhost:3000".to_string());
    let clean_app_url = app_url.trim_end_matches('/');

    let request_url = format!("{}/api/core/ai/sandbox/verifyTicket", clean_app_url);

    debug!(
        "[Auth] Back-channel requesting App to resolve credential. Target: {}",
        request_url
    );

    // 2. 凭证放在内网 header，避免主站 access log 记录 bearer token。
    let client = get_http_client();
    let request = client
        .get(&request_url)
        .header(credential_header, credential)
        // 3. 共享密钥只用于 proxy 到主站的反向通道认证。
        .header("X-Proxy-Token", get_proxy_secret());

    let response = request
        .send()
        .await
        .map_err(|err| format!("HTTP request to App verifyTicket failed: {}", err))?;

    let status = response.status();
    if !status.is_success() {
        let err_text = response
            .text()
            .await
            .unwrap_or_else(|_| "Unknown error".to_string());
        error!(
            "[Auth] Ticket validation rejected by App (Status {}): {}",
            status, err_text
        );
        return Err(format!("Ticket rejected by App: {}", err_text));
    }

    // 4. 反序列化 FastGPT 标准 API 响应包裹。
    let app_res = response
        .json::<AppResponse<SandboxAddress>>()
        .await
        .map_err(|err| format!("Failed to parse response JSON from App: {}", err))?;

    if app_res.code != 200 {
        return Err(format!(
            "App returned error code {}: {:?}",
            app_res.code,
            app_res
                .status_text
                .unwrap_or_else(|| "Unknown error".to_string())
        ));
    }

    let address = app_res.data;

    debug!("[Auth] Credential resolved successfully.");
    Ok(address)
}

/// 验证既有 WebSocket JWT ticket 并解析 sandbox 地址。
pub async fn resolve_sandbox_address(ticket: &str) -> Result<SandboxAddress, String> {
    request_sandbox_address(ticket, SANDBOX_TICKET_HEADER).await
}

/// 验证有状态 Preview session 并解析只读 HTTP sandbox 地址。
async fn resolve_preview_sandbox_address(session_id: &str) -> Result<SandboxAddress, String> {
    request_sandbox_address(session_id, SANDBOX_PREVIEW_SESSION_HEADER).await
}

fn get_address_cache_ttl() -> Duration {
    let seconds = env::var("AGENT_SANDBOX_PROXY_ADDRESS_CACHE_TTL_SECS")
        .ok()
        .and_then(|value| value.parse::<u64>().ok())
        .filter(|value| *value > 0)
        .unwrap_or(DEFAULT_ADDRESS_CACHE_TTL_SECS);
    Duration::from_secs(seconds)
}

fn get_ticket_cache_key(ticket: &str) -> [u8; 32] {
    Sha256::digest(ticket.as_bytes()).into()
}

/**
 * Resolves a preview session with a short address cache.
 *
 * Session validity is checked by FastGPT on cache misses. This cache avoids repeating the
 * back-channel lookup and sandbox password read for each resource in one HTML page.
 */
pub async fn resolve_cached_sandbox_address(session_id: &str) -> Result<SandboxAddress, String> {
    let now = Instant::now();
    let cache_key = get_ticket_cache_key(session_id);
    if let Some(cached) = SANDBOX_ADDRESS_CACHE.read().await.get(&cache_key)
        && cached.expires_at > now
    {
        return Ok(cached.address.clone());
    }

    let address = resolve_preview_sandbox_address(session_id).await?;
    let resolved_at = Instant::now();
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
            expires_at: resolved_at + get_address_cache_ttl(),
        },
    );

    Ok(address)
}

pub async fn invalidate_cached_sandbox_address(session_id: &str) {
    SANDBOX_ADDRESS_CACHE
        .write()
        .await
        .remove(&get_ticket_cache_key(session_id));
}

#[cfg(test)]
mod tests {
    use super::*;
    use jsonwebtoken::{EncodingKey, Header, encode};
    use std::time::{SystemTime, UNIX_EPOCH};
    fn init_test_secret(secret: &str) {
        let _ = PROXY_SECRET.set(secret.to_string());
    }

    #[test]
    fn test_verify_jwt_ticket_success() {
        let secret = "test-secret-key-1234567890-very-long-32";
        init_test_secret(secret);

        let exp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_secs()
            + 60; // 60 seconds validity

        let claims = Claims {
            source_type: "app".to_string(),
            source_id: "app-id-123".to_string(),
            user_id: "user-id-456".to_string(),
            chat_id: "chat-id-789".to_string(),
            team_id: "team-id-abc".to_string(),
            channel: "fs".to_string(),
            permission: "read".to_string(),
            exp,
        };

        let token = encode(
            &Header::default(),
            &claims,
            &EncodingKey::from_secret(secret.as_bytes()),
        )
        .unwrap();

        let verified_claims = verify_jwt_ticket(&token).unwrap();
        assert_eq!(verified_claims.source_type, "app");
        assert_eq!(verified_claims.source_id, "app-id-123");
        assert_eq!(verified_claims.user_id, "user-id-456");
        assert_eq!(verified_claims.chat_id, "chat-id-789");
        assert_eq!(verified_claims.team_id, "team-id-abc");
        assert_eq!(verified_claims.channel, "fs");
        assert_eq!(verified_claims.permission, "read");
    }

    #[test]
    fn test_verify_jwt_ticket_wrong_secret() {
        let secret = "test-secret-key-1234567890-very-long-32";
        let wrong_secret = "wrong-secret-key-1234567890-very-long-32";
        init_test_secret(secret);

        let exp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_secs()
            + 60;

        let claims = Claims {
            source_type: "app".to_string(),
            source_id: "app-id".to_string(),
            user_id: "user-id".to_string(),
            chat_id: "chat-id".to_string(),
            team_id: "team-id".to_string(),
            channel: "fs".to_string(),
            permission: "read".to_string(),
            exp,
        };

        let token = encode(
            &Header::default(),
            &claims,
            &EncodingKey::from_secret(wrong_secret.as_bytes()),
        )
        .unwrap();

        let res = verify_jwt_ticket(&token);
        assert!(res.is_err());
        assert!(res.unwrap_err().contains("JWT signature validation failed"));
    }

    #[test]
    fn test_verify_jwt_ticket_expired() {
        let secret = "test-secret-key-1234567890-very-long-32";
        init_test_secret(secret);

        let exp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_secs()
            - 10; // Expired 10 seconds ago

        let claims = Claims {
            source_type: "app".to_string(),
            source_id: "app-id".to_string(),
            user_id: "user-id".to_string(),
            chat_id: "chat-id".to_string(),
            team_id: "team-id".to_string(),
            channel: "fs".to_string(),
            permission: "read".to_string(),
            exp,
        };

        let token = encode(
            &Header::default(),
            &claims,
            &EncodingKey::from_secret(secret.as_bytes()),
        )
        .unwrap();

        let res = verify_jwt_ticket(&token);
        assert!(res.is_err());
        let err = res.unwrap_err();
        assert!(err.contains("ExpiredSignature") || err.contains("validation failed"));
    }

    #[test]
    fn test_ticket_cache_key_is_stable_without_retaining_token() {
        assert_eq!(
            get_ticket_cache_key("ticket-a"),
            get_ticket_cache_key("ticket-a")
        );
        assert_ne!(
            get_ticket_cache_key("ticket-a"),
            get_ticket_cache_key("ticket-b")
        );
    }
}

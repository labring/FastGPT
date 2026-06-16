use jsonwebtoken::{Algorithm, DecodingKey, Validation, decode};
use serde::{Deserialize, Serialize};
use std::env;
use std::sync::{LazyLock, OnceLock};
use std::time::Duration;
use tracing::{debug, error};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SandboxAddress {
    pub sandbox_url: Option<String>,
    pub agent_token: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Claims {
    pub app_id: String,
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

const DEFAULT_APP_REQUEST_TIMEOUT_SECS: u64 = 10;
const MIN_PROXY_SECRET_BYTES: usize = 32;

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

/// 在代理层边缘进行本地 JWT 验签防刷，直接在第一道闸口过滤非法请求
pub fn verify_jwt_ticket(ticket: &str) -> Result<Claims, String> {
    let secret = get_proxy_secret();
    let decoding_key = DecodingKey::from_secret(secret.as_bytes());

    // JWT 默认使用 HS256 算法，配合 5 秒的时钟容差 (leeway)
    let mut validation = Validation::new(Algorithm::HS256);
    validation.leeway = 5;

    let token_data = decode::<Claims>(ticket, &decoding_key, &validation)
        .map_err(|err| format!("JWT signature validation failed: {}", err))?;

    Ok(token_data.claims)
}

/// 反向请求 NextJS 主站进行 Ticket 验证，并置换出真实的沙盒物理端点寻址信息 (高安全有状态地址置换方案)
pub async fn resolve_sandbox_address(ticket: &str) -> Result<SandboxAddress, String> {
    // 1. 读取主站内网 API 基准地址 (默认 http://localhost:3000)
    let app_url =
        env::var("FASTGPT_APP_URL").unwrap_or_else(|_| "http://localhost:3000".to_string());
    let clean_app_url = app_url.trim_end_matches('/');

    let request_url = format!("{}/api/core/ai/sandbox/verifyTicket", clean_app_url);

    debug!(
        "[Auth] Back-channel requesting App to resolve ticket. Target: {}",
        request_url
    );

    // 2. 发起内网 HTTP GET 请求 (复用全局共享的 TCP 连接池，自动处理 Keep-Alive 与 URL 编码)
    let client = get_http_client();
    let mut request = client.get(&request_url).query(&[("ticket", ticket)]);

    // 3. 安全二次加固：必须携带正确的 AGENT_SANDBOX_PROXY_SECRET，在 Header 中注入安全防刷握手 Token
    request = request.header("X-Proxy-Token", get_proxy_secret());

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

    debug!("[Auth] Ticket resolved successfully.");
    Ok(address)
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
            app_id: "app-id-123".to_string(),
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
        assert_eq!(verified_claims.app_id, "app-id-123");
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
            app_id: "app-id".to_string(),
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
            app_id: "app-id".to_string(),
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
}

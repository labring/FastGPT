# MCP OAuth v2.4 测试夹具（RFC 9728 / 8414 / 7591 / 7592 / 7009）

仅用于测试的 OAuth 2.1 授权服务器 + Streamable HTTP MCP 服务，零第三方依赖
（Node 22 内置 `http` / `crypto` / `fetch`）。**不进入生产路径。**

## 启动

```bash
node test/fixtures/mcpOAuth/server.mjs
# 默认 http://127.0.0.1:18110
```

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `MCP_FIXTURE_HOST` | `127.0.0.1` | 监听地址 |
| `MCP_FIXTURE_PORT` | `18110` | 监听端口 |
| `MCP_FIXTURE_BASE_URL` | `http://<host>:<port>` | 对外 issuer（反向代理时显式指定） |
| `MCP_FIXTURE_MODE` | `all` | `cimd` / `dcr` / `manual` / `all`，控制元数据声明的 client 注册方式 |
| `MCP_FIXTURE_TTL` | `3600` | access token 有效期（秒） |
| `MCP_FIXTURE_SCOPE` | `mcp:tools` | 支持的 scope |
| `MCP_FIXTURE_ROTATE` | `1` | refresh token 是否轮换 |
| `MCP_FIXTURE_MANUAL_CLIENT_ID` | `manual-client` | manual 模式 client_id |
| `MCP_FIXTURE_MANUAL_CLIENT_SECRET` | 空 | manual 模式 secret（为空则 public client） |
| `MCP_FIXTURE_CIMD_INSECURE_TLS` | 空 | 允许 CIMD 回源使用自签证书（默认用 `NODE_EXTRA_CA_CERTS`） |
| `MCP_FIXTURE_FAILURES` | 空 | 逗号分隔的失败注入名 |
| `MCP_FIXTURE_PRM_SOURCE` | `header` | `header`（`WWW-Authenticate`）或 `well-known` |
| `MCP_FIXTURE_PRM_MODE` | `present` | `present` 正常返回 PRM；`missing` 让 PRM 一律 404，用于验证 v2.4「PRM 404 → MCP origin 根 AS metadata」回退 |
| `MCP_FIXTURE_CONSENT` | `auto` | `auto` 直接 302；`always` 渲染 HTML 同意页，等待 `POST /authorize/decision` |

## 端点

| 端点 | 说明 |
| --- | --- |
| `GET /.well-known/oauth-protected-resource` + `/mcp` 变体 | RFC 9728 PRM（根 + path-aware） |
| `GET /.well-known/oauth-authorization-server` | RFC 8414 AS 元数据 |
| `POST /register`、`GET/DELETE /register/:clientId` | RFC 7591 DCR / RFC 7592 注销 |
| `GET /authorize` | 自动同意，或 `prompt=consent` / `MCP_FIXTURE_CONSENT=always` 时渲染 HTML 同意页；校验 `response_type=code`、PKCE S256、`state`、`resource`，302 回 `code/state/iss` |
| `POST /authorize/decision` | 同意页提交（`approve` / `deny`），一次性 transaction |
| `POST /token` | `authorization_code`（校验 PKCE/redirect_uri/resource）与 `refresh_token`（轮换、重用检测） |
| `POST /revoke` | RFC 7009 |
| `POST/GET /mcp` | Streamable HTTP MCP；无/错 Bearer 返回 401 + `WWW-Authenticate`（含 `resource_metadata`、`scope`） |

工具：`whoami`、`echo`。

## 调试端点

- `GET /debug/bearer-fingerprints`：仅返回收到的 Bearer 的 `sha256` 前 16 位指纹与失效指纹集合。
- `GET /debug/stats`：授权/令牌/刷新/撤销/DCR/CIMD 计数（含 `refreshTokensRotated`），当前 client 列表（不含明文 secret）。
- `GET /debug/events`：最近 500 条请求事件（Authorization 只记指纹）。
- `POST /debug/inject`：`{ failures?: string[], rotate?: boolean, advertiseCimd?: boolean, advertiseDcr?: boolean, prmSource?: string, prmMode?: 'present'|'missing', consent?: 'auto'|'always', resetStats?: boolean }`。
- `POST /debug/expire-tokens`：让当前全部 access token 失效（触发运行时强制刷新）。
- `POST /debug/reset`：清空 client/code/token/CIMD 缓存/统计。

失败注入名：`authorize_denied`、`authorize_iss_mismatch`、`token_500`、`token_302`、
`token_timeout`、`prm_resource_mismatch`、`discovery_302`、`mcp_insufficient_scope`、
`dcr_disabled`、`pkce_plain`、`rotate_off`。

## 安全边界

- 夹具只打印指纹，不打印任何 token/secret；事件与指纹端点统一对 Bearer token 本体做 `sha256` 前 16 位，便于交叉比对。
- 仅绑定 `127.0.0.1`；生产构建不会引用该目录。

# MCP OAuth v2.4 真实 HTTP E2E（Stage I5b）

真实栈：`Next dev (HTTPS 自签) + Mongo rs0 + Redis + OAuth/MCP fixture`。
不使用 mock；脚本只通过 HTTP 驱动，Mongo/Redis 仅用于登录态预热与测试隔离。

## 启动真实栈

```bash
# 前置：plans/e2e-real-v24/env.fastgpt（600）、tls/{cert,key}.pem、lo 上的 203.0.113.10
bash test/e2e/mcpOAuth/runRealStack.sh start
bash test/e2e/mcpOAuth/runRealStack.sh status
bash test/e2e/mcpOAuth/runRealStack.sh stop
```

栈包含：

| 组件 | 地址 |
| --- | --- |
| FastGPT Next dev | `https://203.0.113.10:3005`（`FE_DOMAIN` 同值） |
| OAuth AS + MCP fixture | `http://127.0.0.1:18110`（`MCP_FIXTURE_MODE=all`） |
| 插件桩 | `http://127.0.0.1:3004` |
| Mongo / Redis / PG / MinIO | docker，端口 27017 / 6379 / 5432 / 9000 |

v2.4 环境变量：`MCP_OAUTH_ENABLED=true`、`MCP_OAUTH_RUNTIME_ENABLED=true`、
`MCP_OAUTH_ALLOW_INSECURE_HTTP=true`（fixture 走 loopback http 的既有开发开关），
不设置任何 scope allowlist / CIMD host allowlist。

## 运行 E2E

```bash
export NODE_EXTRA_CA_CERTS=$PWD/../../plans/e2e-real-v24/tls/cert.pem
E2E_PLANS_DIR=$PWD/../../plans/e2e-real-v24 node test/e2e/mcpOAuth/oauthRealE2E.mjs
```

证据写入 `plans/e2e-real-v24/{evidence,logs}/`：

- `oauth-real-e2e-<ts>.json`：结构化步骤/断言/HTTP 状态；
- `oauth-real-e2e-<ts>.log`：人可读日志；
- `fixture-{stats,events,bearer-fingerprints}-final.json`：fixture 计数与 Bearer 指纹。

## 覆盖

1. `create`（`authMode=oauth` + 空 `toolList`）→ appId/nodeId
2. `oauth/start`：PKCE S256、CIMD client_id、resource、绑定 Cookie
3. 授权 → callback → `app/detail?oauth=success`
4. `oauth/status`：authorized、token 布尔值、clientSource=cimd
5. `getTools` / `runTool`：fixture 收到 Bearer（仅指纹）
6. `update` 保存 toolList 后 token 保留
7. `disconnect`：撤销 + `reauth_required`
8. 重新 start：复用 CIMD client、旧 state 重放被拒
9. `expire-tokens` → 401 → refresh：新指纹、refreshes/rotation +1
10. 负向：state 重放 ×10、缺失/错误 Cookie、PRM resource 不匹配、iss 不匹配
11. PRM 404 → MCP origin 根 AS metadata 回退（完整授权链路）
12. HTML 同意页 `always`：展示 → POST approve → callback 成功

## 安全

- 不打印/不落盘 access token、refresh token、client secret、session cookie 明文；
  只记录 sha256 指纹与布尔值。
- 限流为真实逻辑；脚本仅在测试开始清理上一轮的
  `fastgpt:rate-limit:mcp-oauth:*` 计数（测试隔离），不放宽任何限额。
- fixture 仅测试使用，不进入生产路径。

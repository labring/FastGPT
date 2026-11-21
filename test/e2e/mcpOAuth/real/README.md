# MCP OAuth v2.4 —— 真实授权服务器 E2E（real）

用 desktop 106 上运行的上游 `wille/mcp-oauth-server` demo 作为真实 OAuth AS / MCP server，
FastGPT 侧仍是生产构建（`next start`）+ 真实 Mongo/Redis。它验证的是「第三方授权服务器」
这一真实边界，而不是进程内 fixture。

## 拓扑

```
desktop 109 (FastGPT, production)
  next start :13100 / :13101
    │  discovery / register / token / revoke / MCP
    ▼
  host.docker.internal:18200   (本机 /etc/hosts -> 172.17.0.34)
    │
  asProxy 172.17.0.34:18200 ──► 172.17.0.22:18200   (desktop 106 的真实 AS)
```

- `/etc/hosts` 只增加一行 `172.17.0.34 host.docker.internal`；`run.sh` 退出时从备份还原，
  并打印 `getent hosts host.docker.internal` 的结果。
- `asProxy` 是测试夹具（`lib/asProxy.mjs`），只记录 method + path + status（以及
  `/token`、`/revoke` 的 grant_type/token_type_hint），不记录 query/header/body。
  它让 109 侧可读地观察 AS 边界；106 上的进程/文件不受任何影响。
- 106 上的 AS 日志（`/workspace/outputs/mcp-oauth/e2e/logs/oauth-server.log`）无法从 109
  直接读取（无 ssh / 共享挂载），因此本套件用 `asProxy` 作为等价的上游边界证据。

## 一条命令

```bash
E2E_ENV_FILE=/tmp/mcp-oauth-e2e/app.env \
E2E_AS_MODE=real \
  ./test/e2e/mcpOAuth/real/run.sh
# 或走既有入口：
E2E_ENV_FILE=/tmp/mcp-oauth-e2e/app.env E2E_AS_MODE=real \
  ./test/e2e/mcpOAuth/v24/run.sh
```

退出码：`0` 全部断言通过，`1` 断言失败，`2` env 不满足，`3` 栈未就绪，`4` 端口被占用。

## 两个阶段（为什么必须两个进程）

CIMD 可用性是生产规则：`isMcpOAuthCimdAvailable` 要求 AS 声明
`client_id_metadata_document_supported` **且** `FE_DOMAIN` 是 https。因此：

| phase | 端口 | FE_DOMAIN | 结果 |
| --- | --- | --- | --- |
| `cimd` | 13101 | `https://172.17.0.34:13101` | `clientSource=cimd`，`/register` 0 次 |
| `dcr` | 13100 | `http://127.0.0.1:13100` | `clientSource=dcr`，完整授权链路 |

`run.sh` 依次启动两个 `next start` 进程，各自跑完即停；数据库在每阶段开始前重建。
两阶段证据合并到 `$E2E_STATE_DIR/evidence.json`。

## 必需环境变量（`E2E_ENV_FILE`，mode 600，不入库）

| 变量 | 说明 |
| --- | --- |
| `MONGODB_URI` / `MONGODB_LOG_URI` | 独立测试库（会被 drop） |
| `REDIS_URL` / `PG_URL` | 真实依赖 |
| `AES256_SECRET_KEY` 等密钥 | 本地随机值 |
| `MCP_OAUTH_ENABLED=true` / `MCP_OAUTH_RUNTIME_ENABLED=true` | 打开 OAuth |
| `MCP_OAUTH_ALLOW_INSECURE_HTTP=true` | 真实 AS 是 http（仓库既有开关，默认 false） |
| `CHECK_INTERNAL_IP=false` | 既有安全配置，默认 false；**本套件要求保持默认**，不新增放行开关 |
| `PLUGIN_BASE_URL` + `PLUGIN_TOKEN` | 插件桩 |

可选：`AS_UPSTREAM_HOST/PORT`、`AS_PROXY_HOST/PORT`、`E2E_DCR_PORT`、`E2E_CIMD_PORT`、
`E2E_KEEP_DB=1`。

## 覆盖

CIMD 阶段：创建 → `start`（CIMD）→ AS 行为探针（确认 CIMD 是回源抓取）→ 真实
`/authorize` 拒绝 CIMD client → `clientMode` 归一。

DCR 阶段：创建 → `start`（真实 `/register` 1 次）→ `/authorize` → `/consent` →
`/confirm` → callback → `status` → `getTools`（真实 `tools/list`）→ `runTool`（真实
`tools/call`）→ 主动刷新（真实 `refresh_token`）→ 401 单次刷新重试 → `disconnect`
（真实 `/revoke`）→ `client/reset`（AS 不支持 RFC 7592，如实记录）→ 重新注册 →
state 重放 / Cookie / iss / scope / SSRF / 归一化负向。

## 已知限制

- 106 的 AS 自身日志无法从 109 读取；用 `asProxy` 记录同样的 method/path/status 作为
  上游边界证据。
- 上游 AS 的 CIMD 元数据主机白名单只接受 loopback（`127.0.0.1` / `localhost`）。
  FastGPT 的 CIMD client_id 由 `FE_DOMAIN` 派生，而 `FE_DOMAIN` 不能是 loopback（SSRF
  预检会拒绝），因此在这个拓扑里 CIMD 必然在 AS 侧失败。FastGPT 当前**不会**在
  `/authorize` 被拒后静默回退 DCR；DCR 依赖 `FE_DOMAIN` 非 https 的既有条件。
  报告见 `docs/design/mcp-oauth-e2e-real-report.md`。

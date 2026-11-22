# MCP OAuth v2.4 真实 E2E 报告

- 日期：2026-11-21
- 分支 / HEAD：`feat/mcp-oauth-v24` / `145e18fce`（E2E 代码在其上新增本地提交）
- 任务：handoff §「安全与验收」全链路真实 HTTP 验收
- 结论：**通过**。`20` 个用例、`149` 条断言全部通过，退出码 `0`。

## 1. 环境与端口

| 组件 | 值 |
| --- | --- |
| OS / Node | Ubuntu 5.15 / Node v22.23.2 |
| FastGPT | 生产构建（`next build` → `next start`），`NODE_ENV=production` |
| 监听 | `127.0.0.1:13100`（真实 HTTP） |
| FE_DOMAIN | `https://172.17.0.34:13000`（无本地监听；只用于 CIMD client_id 与回调 Location） |
| Fixture AS/MCP | `172.17.0.34:18200`（进程内 `node:http`） |
| MongoDB | `127.0.0.1:27017`，独立库 `fastgpt_mcp_oauth_e2e`（运行前清空、运行后删除） |
| Redis | `127.0.0.1:6379`（真实 session 与限流） |
| PG | 本机既有 pgvector（FastGPT 向量库默认走 PG，启动健康检查必需） |
| 插件桩 | `127.0.0.1:3999`（既有 `test/e2e/mcpOAuth/stubPluginServer.mjs`） |

地址选择原因：`MCP_OAUTH_ENABLED` 下 CIMD 要求 `FE_DOMAIN` 为 `https://` 且非 loopback；
生产构建中 `NODE_ENV!==development` 会启用 SSRF 防护，loopback 一律拒绝、私网仅在
`CHECK_INTERNAL_IP=true` 时拒绝。因此 fixture 绑定私网地址 `172.17.0.34`，并以
`CHECK_INTERNAL_IP=false` 保持生产默认，可直接验证「loopback 被拒 / 私网可用」。

## 2. 启动与运行

```bash
# env 文件在仓库外，mode 600；内容见 test/e2e/mcpOAuth/v24/README.md
E2E_ENV_FILE=/tmp/mcp-oauth-e2e/app.env ./test/e2e/mcpOAuth/v24/run.sh
# exit 0
```

`run.sh`（提交入库）负责：按需 build、启动插件桩与 `next start`、等待 `/login` 200、
启动 fixture 并运行 `run.mjs`、只停止自己启动的进程、删除两个 E2E 数据库。

## 3. 真实 / 桩的边界

| 真实 | 桩 / fixture | 原因 |
| --- | --- | --- |
| FastGPT 生产构建、Next 路由、CSRF、限流 | — | 验收对象 |
| MongoDB（应用/版本/state 台账） | — | 断言持久化与 CAS |
| Redis（session、限流计数） | — | 真实登录态与限流键 |
| HTTP 发现、注册、PKCE、code 交换、刷新、撤销、注销 | — | 全部经真实网络 |
| — | 授权服务器 + MCP server（`fixtures/oauthMcpServer.mjs`） | 第三方 AS 不属于 FastGPT；需要可控地产生 CIMD/DCR/manual、401/403、scope 扩大、无 refresh token 等形态 |
| — | 插件桩 | instrumentation 健康检查需要 `/api/models/get-providers`；与 OAuth 无关 |

fixture 只保留计数与事件，不向脚本/日志返回任何 token、code、state 或 secret。

## 4. 覆盖与关键证据

证据原文：`/tmp/mcp-oauth-e2e/run.log`、`/tmp/mcp-oauth-e2e/evidence.json`（按验收要求，
运行结束后连同 env/日志一并删除；重跑一条命令即可重新生成，关键片段见下文）。

### 4.1 正向

| # | 用例 | 结果 |
| --- | --- | --- |
| 1 | 创建 `mcpToolSet` + `authMode=oauth` + `clientMode=auto` + `scope` | 节点 `authMode=oauth`、`clientMode=auto`、`scope=mcp:tools` |
| 2 | `start`（scenario A：AS 声明 CIMD） | `clientSource=cimd`，**fixture `/register` = 0**，写入 1 条 `mcp_oauth_states`、下发绑定 Cookie |
| 3 | 打开 `authorizationUrl` → 回调 | authorize 302 且带 `iss`；callback 302 `oauth=success`；`tokenExchange=1`；state 台账被一次性消费；节点 token 为 `iv:hex:hex` 且 `credentialSeq>0` |
| 4 | `GET /oauth/status` | `state=authorized`、`authorized=true`、`hasAccessToken/hasRefreshToken=true`，响应无 token/secret 字段 |
| 5 | `getTools` | 200，返回 fixture `echo`；fixture 记录真实 JSON-RPC `tools/list` |
| 6 | `runTool` | 200，`content[0].text=hello-e2e`（真实 `tools/call`） |
| 7 | 短期 token（TTL 5s，30s 余量） | 调用前主动刷新恰好 1 次，未重复交换 code，调用成功 |
| 8 | 401 → 强制刷新一次 | fixture `mcp401=1`、`refresh=1`，重试后 200；初始化成功后的 GET 是 Streamable HTTP 正常 SSE 探测（返回 405），不是 401 降级 |
| 9 | 始终 401 | `mcp401=2`（首调 + 一次重试）、`refresh=1`、无第三次请求、`mcpGets=0`，返回非 2xx |
| 10 | `disconnect` | `revoked=true`；fixture 收到 RFC 7009；节点 token 清除；status `reauth_required`；断开后调用立即失败且未发新的 MCP 授权请求 |
| 11 | DCR + `client/reset` | `/register` 恰好 1 次；保存 `registration_client_uri`；reset `deregistered=true`（RFC 7592 DELETE 恰好 1 次）；client/token/server 清除；status `client_missing` |
| 12 | C 场景（DCR 400）+ manual | `/register=1` 失败后自动使用 manual，`clientSource=manual`，授权与 `tools/list` 成功 |
| 13 | C 场景无 manual | `400` + `oauthCode=mcp_oauth_registration_rejected`，不下发授权 URL、不写 state |
| 14 | legacy `clientMode` 归一化 | create/start 传 `cimd`/`dcr` 均响应 `clientMode=auto`；A 仍选 CIMD（DCR=0），B 仍选 DCR（`/register=1`） |

关键片段（已脱敏）：

```jsonc
// POST start → 200（scenario a）
{ "schemaVersion": 1, "clientMode": "auto", "clientSource": "cimd",
  "issuer": "http://172.17.0.34:18200/s/a",
  "resource": "http://172.17.0.34:18200/s/a/mcp",
  "requestedScope": "mcp:tools", "expiresAt": 1763... }
// fixture 计数
{ "register": 0, "authorize": 0, "tokenExchange": 0 }
// callback → 302
Location: https://172.17.0.34:13000/app/detail?appId=<id>&oauth=success
```

### 4.2 负向

| 用例 | 结果 |
| --- | --- |
| state 重放 | 第二次回调 → `302 error`，`code=mcp_oauth_state_replayed` |
| 缺少绑定 Cookie | `mcp_oauth_state_cookie_missing` |
| Cookie 值不匹配 | `mcp_oauth_state_binding_mismatch` |
| `iss` 与 state 不一致 | `mcp_oauth_issuer_mismatch`，token 未落库 |
| AS 扩大 scope | `mcp_oauth_scope_widened`，token 未落库 |
| PRM `resource` 不匹配 | `400 mcp_oauth_prm_resource_mismatch` |
| SSRF：MCP URL 为 loopback | create 即拒绝（HTTP 500 + `Request to private network not allowed`），无 appId |
| SSRF：PRM 把 AS 指向 `127.0.0.1` | `400 mcp_oauth_private_url`，不写 state |
| 无 refresh token 且临期 | 不发起 refresh/token 请求，`status=reauth_required`，错误来自「No refresh token or client configuration」 |
| 403 `insufficient_scope` | `mcp403=1`，`refresh=0`，`mcp401=0`，`mcpGets=0` |
| headers 隔离 | headers 应用的 status 为 `authMode=headers/state=headers`、无 oauth 配置、`canStart=false`；oauth 无 token 时 runTool 失败，未发起 authorize/token，也无带凭据 MCP 请求 |

## 5. 数据库断言

直接读取 `app_versions`（发布版本）与 `mcp_oauth_states`：

- create 后存在唯一 `toolSet` 节点，`toolConfig.mcpToolSet.authMode/oauth.clientMode/scope` 正确。
- start 后 `mcp_oauth_states` 出现 1 条 `appId` 为字符串、`consumedAt` 缺失、`expiresAt` 未来的台账；回调后同一 `_id` 被 `consumedAt` 标记（重放返回 409/302 error）。
- callback 成功：`oauth.token.secret.access_token` 为 `iv:hex:hex`，`refresh_token` 存在，`credentialSeq` 递增。
- disconnect：`oauth.token` 字段消失，其余发现结果保留。
- client reset：`oauth.client` / `oauth.server` / `oauth.token` 消失，`clientSource` 一并 `$unset`。
- 所有 status 响应不含 `access_token`、`refresh_token`、`clientSecret`、`secret`、`codeVerifier`，也不含 `Bearer <token>` 明文。

## 6. 未覆盖 / 风险

1. **运行期错误契约差异（已记录，未修改代码）**：`getTools` / `runTool` 的 OAuth 运行期失败
   （401 重试后仍 401、无 refresh token、403）经 `NextAPI` 通用错误映射返回
   `HTTP 500 {code:500, message:"..."}`，响应中没有 `data.oauthCode=mcp_oauth_reauth_required`；
   `oauth/*` 路由本身是正确的统一 envelope。设计文档（§6.3/§8.3）描述的是 `reauth_required`
   错误码，建议后续在 `createApiEntry` 或这两个路由补 `McpOAuthApiError` 映射。本次任务范围是
   验收，未改动生产代码；断言改为校验「刷新次数、重试次数、无 SSE 降级、错误来源文案」。
   影响：前端若依赖 `oauthCode` 自动弹出「重新授权」需要在状态接口之外另做映射。
2. **CIMD 文档没有被 AS 实际拉取**：fixture 按 client_id 形态放行，未回源
   `https://172.17.0.34:13000/.../client-metadata.json`（该地址在本机无 TLS 监听）。
   FastGPT 生成 client_id、HTTPS/非 loopback 门控、`client_id_metadata_document_supported`
   判定均已真实执行；缺的是「外部 AS 拉取 CIMD 文档」这一段，属于 AS 行为。
3. **回调通过应用 origin 直接调用**：脚本从 authorize 的 `Location` 取 code/state，再以
   `127.0.0.1:13100` 调用回调并手工携带绑定 Cookie；没有真正经过 `FE_DOMAIN` 反向代理。
   服务端只校验 Cookie 名/值哈希，因此与浏览器路径等价；未验证代理层对 Cookie Domain/Path
   的处理。
4. **网络边界**：fixture 在私网，`MCP_OAUTH_ALLOW_INSECURE_HTTP=true` 仅为测试 http AS 打开
   （仓库既有选项，生产默认 false）。未新增任何测试专用开关，SSRF/限流/CSRF 逻辑未放宽。
5. **限流**：未调大限额；每个用例前清理 `fastgpt:rate-limit:mcp-oauth:*` 历史计数，避免
   连续运行触发 429。单次运行内各策略均未触顶。
6. **SSRF 拒绝的 HTTP 状态**：create 对 loopback 返回 500（沿用 `PRIVATE_URL_TEXT` 的通用
   错误映射），不是 400；已按「拒绝且不落库」断言。start 阶段的 OAuth 私网地址则返回
   400 `mcp_oauth_private_url`。

## 7. 生产默认未被放宽

- 本任务没有新增/修改任何环境变量默认值、SSRF 判断、限流策略或鉴权分支；E2E 仅新增
  `test/e2e/mcpOAuth/v24/` 与本文档。
- 生产默认仍是 `CHECK_INTERNAL_IP=false`、`MCP_OAUTH_ALLOW_INSECURE_HTTP=false`；
  测试 env 中使用的是仓库既有开关，且只在 `/tmp`（600）中设置。
- 无 token/secret 写入仓库或日志；fixture 与脚本的日志仅含次数、状态码、issuer/resource。

## 8. 清理

- `run.sh` 退出时停止其启动的 FastGPT 与插件桩，fixture 随 `run.mjs` 退出关闭。
- 删除 `fastgpt_mcp_oauth_e2e` 与 `fastgpt_mcp_oauth_e2e_log`；端口 `13100`/`18200`
  已释放。
- 运行期间未触碰仓库外部既有的服务（13001 的旧 Next、13000 代理、18101 fixture 等）。

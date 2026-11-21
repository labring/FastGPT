# MCP OAuth 真实授权服务器 E2E 验收报告

- 分支：`feat/mcp-oauth-v24`（实现提交 `c37a99226`，上一轮基线 `126927f2f`）
- 日期：2026-11-21
- 结论：**completed**——真实 AS + 真实 FastGPT 生产构建的 25 个用例 / 212 条断言全部通过（exit 0），
  覆盖「CIMD 首次被拒 → 下一次 start 自动降级 DCR → 完整真实授权」链路。

## 1. 拓扑

```
desktop 109 ─ FastGPT production (next start)
  :13100  FE_DOMAIN=http://127.0.0.1:13100   （DCR 阶段）
  :13101  FE_DOMAIN=https://172.17.0.34:13101（CIMD 阶段）
        │
        │  discovery / DCR / authorize / token / revoke / MCP
        ▼
  host.docker.internal:18200
        │  /etc/hosts 临时项：172.17.0.34 host.docker.internal
        ▼
  asProxy 172.17.0.34:18200 ──HTTP──► 172.17.0.22:18200
                                           desktop 106 上的
                                           wille/mcp-oauth-server
```

- 106 上的进程、容器、文件均未改动；本套件只以 HTTP 客户端身份访问其 AS / MCP 端点。
- 109 上新增的进程只有：两个短生命周期的 `next start`、插件桩（3999）、`asProxy`（18200）。
  `run.sh` 退出时按 PID 组清理，并把 `/etc/hosts` 从备份还原。
- `asProxy` 是测试夹具，仅记录 `{ts, method, path, status, durationMs, grantType?, tokenTypeHint?}`；
  不记录 query、header、body，因此没有 code / token / state / secret 落盘。

## 2. 一条命令与退出码

```bash
export PATH=/config/.nvm/versions/node/v22.23.2/bin:$PATH
E2E_ENV_FILE=/tmp/mcp-oauth-e2e/app.env \
E2E_AS_MODE=real \
  ./test/e2e/mcpOAuth/real/run.sh
# 既有入口同样可用：
E2E_ENV_FILE=/tmp/mcp-oauth-e2e/app.env E2E_AS_MODE=real \
  ./test/e2e/mcpOAuth/v24/run.sh
```

实测（本轮 `run.log`，证据目录 `real-e2e/`）：

```
EXIT=0
real-as E2E: cases=25 assertions=212 passed=212 failed=0
  phase=cimd cases=10 assertions=85  failed=0
  phase=dcr  cases=15 assertions=127 failed=0
[e2e-real] PASS
[e2e-real] /etc/hosts restored; getent: no entry
```

- 退出码约定：`0` 全通过；`1` 断言失败；`2` env 不满足；`3` 栈未就绪；`4` 端口被占用。
- 实际耗时约 41 秒（12:02:06 → 12:02:47，使用本次前台构建产物，无构建等待）。

必需 env（`mode 600`，不入库）：Mongo/Redis/PG/Mongo-log 连接串、`AES256_SECRET_KEY`、
`FILE_TOKEN_KEY`、`INVOKE_TOKEN_SECRET`、`ROOT_KEY`、`AIPROXY_API_ENDPOINT`/`AIPROXY_API_TOKEN`、
MinIO 的 `STORAGE_*`（生产 instrumentation 会检查 public/private bucket，缺省会按
`bucket.localhost` 虚拟主机解析失败，需 `STORAGE_S3_ENDPOINT=http://127.0.0.1:9000` +
`STORAGE_S3_FORCE_PATH_STYLE=true`）、插件桩配置，以及
`MCP_OAUTH_ENABLED=true`、`MCP_OAUTH_RUNTIME_ENABLED=true`、`MCP_OAUTH_ALLOW_INSECURE_HTTP=true`
（真实 AS 是 http，仓库既有开关，默认 false）、`CHECK_INTERNAL_IP=false`（既有默认值）。

## 3. 每个步骤的真实 / 工作区边界

| 用例 | 真实上游（106 AS / MCP） | FastGPT 工作区（109） |
| --- | --- | --- |
| `real-cimd-01-create` | 无调用 | 建应用、保存 OAuth 配置；断言 authMode/clientMode/url/尚未生成 client |
| `real-cimd-02-start` | `/register` delta = 0，`/authorize` delta = 0 | 由 `FE_DOMAIN` 派生 CIMD `client_id`，写 state 台账与绑定 Cookie |
| `real-cimd-03-as-cimd-behavior` | 真实 `/authorize` 收到 loopback CIMD → `400 invalid_client`，描述为“抓取元数据文档失败” | 探针由测试直接发起，验证 AS 是回源抓取而非按形态放行 |
| `real-cimd-04-authorize-rejected` | `/authorize` → `400`，描述“CIMD 元数据主机不允许”；无 `/consent`、无 code | 单次失败不改写节点：`clientSource` 仍为 `cimd`，`/register` 仍为 0，未写 token；台账保留未消费的 CIMD attempt |
| `real-cimd-05-downgrade-start` | `/register` delta 恰好 1（真实 DCR），`/authorize` delta 0 | 下一次 start 检测到未消费 CIMD 台账 → 强制 DCR；旧台账写 `consumedAt`+`downgradedAt`，节点写 `clientSource=dcr`+`autoDcrFallback=true` |
| `real-cimd-06-sticky-dcr` | `/register` delta = 0 | 连续第三次 start 仍为 DCR（粘性标记），授权 URL 复用已保存 DCR client，不回到 CIMD |
| `real-cimd-07-authorize-callback` | 真实 `/authorize` → `/consent` → `/confirm` → `302 callback`；真实 `/token` code 交换 1 次 | 校验 `iss`、消费 state、AES-GCM 加密落库、`credentialSeq>0`、scope=`mcp:tools`；成功后清除 `autoDcrFallback` |
| `real-cimd-08-status-db` | 无调用 | status=authorized、`clientSource=dcr`；响应不含 token/secret；DB token 为密文且无 `autoDcrFallback` |
| `real-cimd-09-get-tools` | 降级后的真实 Bearer 调 `tools/list`（`/mcp` 2xx） | 返回 `echo`/`whoami` |
| `real-cimd-10-run-tool` | 真实 `tools/call`：`echo` 返回 `hello-e2e` | 响应不含 Bearer/refresh_token |
| `real-dcr-01-create` | 无调用 | 同上 |
| `real-dcr-02-start` | 真实 `/register` 恰好 1 次（`201`），分配 clientId | 持久化 client、`token_endpoint_auth_method=none` |
| `real-dcr-03-authorize-callback` | 真实 `/authorize` → `/consent` → `/confirm` → `302 callback`；真实 `/token` code 交换 1 次 | 校验 `iss`、消费 state、AES-GCM 加密落库、`credentialSeq=1`、scope/expiresAt |
| `real-dcr-04-status` | 无调用 | status=authorized；响应不含 access/refresh token、clientSecret、Bearer |
| `real-dcr-05-get-tools` | 真实 Bearer 调 `tools/list`（`/mcp` 2xx），返回 `whoami`/`echo` | 解析工具数组、description、inputSchema |
| `real-dcr-06-run-tool` | 真实 `tools/call`：`echo` 返回 `hello-e2e`，`whoami` 可调用 | 响应不含 Bearer/refresh_token |
| `real-dcr-07-proactive-refresh` | 真实 `/token` refresh 1 次，AT/RT 轮换 | 把 `expiresAt` 压进刷新窗口（仅改测试库记录），确认 `credentialSeq` 1→2 |
| `real-dcr-08-401-single-refresh` | 用内存中的 AT 调真实 `/revoke` → `/mcp` 401；真实 refresh 1 次后重试 2xx | 单次刷新、重试使用新 AT、RT 同步轮换 |
| `real-dcr-09-disconnect` | 真实 `/revoke` 2 次（AT + RT） | 清 token、status=reauth_required、运行期立即失败且不再发 MCP 请求 |
| `real-dcr-10-client-reset` | AS 未提供 `registration_client_uri` → 无 RFC 7592 DELETE（`deregistered=false`） | 清 client/server/token，status=client_missing |
| `real-dcr-11-reregister` | 真实 `/register` 新增 1 次，生成新 clientId | 重新持久化 client |
| `real-dcr-12-negative-state-cookie-issuer` | 真实 code 交换 1 次 | state 重放 / 缺 Cookie / Cookie 不匹配 / `iss` 不一致分别被拒，且重放不改写 token |
| `real-dcr-13-negative-scope` | 真实 `/authorize` 以 `error=invalid_scope` 重定向 | callback 返回 error，不落 token，status 非 authorized |
| `real-dcr-14-ssrf` | 无调用 | loopback MCP URL 在 create 即 `500 private_url`，未生成 appId |
| `real-dcr-15-normalize` | `/register` delta = 0 两次 | `clientMode=cimd|dcr` 均归一为 `auto`，复用已保存 client |

## 4. AS 边界证据（脱敏摘录）

来自 `as-proxy.log`，只含 method/path/status：

```json
{"method":"GET","path":"/.well-known/oauth-authorization-server","status":200}
{"method":"GET","path":"/.well-known/oauth-protected-resource/mcp","status":200}
{"method":"GET","path":"/authorize","status":302}
{"method":"GET","path":"/consent","status":200}
{"method":"POST","path":"/confirm","status":302}
{"method":"POST","path":"/register","status":201}
{"method":"POST","path":"/token","status":200,"grantType":"authorization_code"}
{"method":"POST","path":"/token","status":200,"grantType":"refresh_token"}
{"method":"POST","path":"/revoke","status":200,"tokenTypeHint":"access_token"}
{"method":"POST","path":"/revoke","status":200,"tokenTypeHint":"refresh_token"}
{"method":"POST","path":"/mcp","status":200}
{"method":"POST","path":"/mcp","status":401}
```

汇总（本轮，97 次边界请求）：

```
GET  /.well-known/oauth-authorization-server : 11 {"200":11}
GET  /.well-known/oauth-protected-resource/mcp: 11 {"200":11}
GET  /authorize                              : 9  {"302":7,"400":2}
GET  /consent                                : 6  {"200":6}
GET  /health                                 : 2  {"200":2}
GET  /mcp                                    : 7  {"404":7}   ← SSE 探测被上游拒绝
POST /confirm                                : 6  {"302":6}
POST /mcp                                    : 33 {"200":14,"202":7,"401":12}
POST /register                               : 4  {"201":4}   ← CIMD 降级 1 + DCR 3
POST /revoke                                 : 3  {"200":3}
POST /token (authorization_code)             : 3  {"200":3}
POST /token (refresh_token)                  : 2  {"200":2}
```

降级链关键原始输出（`run.log`）：

```
real-cimd-02: clientSource=cimd        AS /register delta = 0
real-cimd-04: /authorize 400 "client_id metadata document host is not allowed"; /register delta = 0
real-cimd-05: clientSource=dcr         AS /register delta = 1
real-cimd-06: clientSource=dcr         AS /register delta = 0
```

## 5. 数据库断言（测试库，跑完 drop）

测试直连 Mongo，读取最新已发布 `app_versions` 的 `toolSet` 节点：

- state 台账 `mcp_oauth_states`：start 后未消费 1 条；callback 后已消费，重放被拒。
  降级链路额外断言：旧 CIMD 台账同时有 `consumedAt` 与 `downgradedAt`；新的 DCR 台账
  `clientSource=dcr` 且未消费；成功授权后节点 `autoDcrFallback` 被 `$unset`。
- `toolConfig.mcpToolSet.oauth.client`：CIMD 阶段为本站公开文档 URL；DCR 阶段为真实分配的 clientId，
  且 `token_endpoint_auth_method=none`、无 client secret。
- `oauth.token.secret.access_token` / `refresh_token`：形如 `iv:hex:tag`，由 AES-256-GCM 加密；
  断言不存在明文字段。
- `oauth.token.expiresAt`：来自真实 AS 的 `expires_in=3600`（> now）；主动刷新与 401 刷新后前移。
- `oauth.credentialSeq`：code 交换后为 1，每次 refresh 递增（实测 1→2）。
- `oauth.scope`：`mcp:tools`；`issuer`：`http://host.docker.internal:18200/`；
  `resource`：`http://host.docker.internal:18200/mcp`。
- 解密只发生在内存中，仅用于“主动让 AT 失效以制造真实 401”和“disconnect 后指纹对比”；
  指纹为 `sha256` 前 12 位，不写日志、不入库。

## 6. CIMD 结论（自动降级 D8）

实测结论：**真实 `/authorize` 失败 → 下一次 start 自动降级 DCR → 完整授权成功**，且“无抓取”假设被证伪：

1. **不回源、仅形态校验**——被证伪。对 loopback CIMD `client_id`，AS 返回
   `invalid_client` + `Failed to fetch client_id metadata document`，说明它确实发起抓取。
2. **真实抓取成功**——在本拓扑不可达。上游 AS 的 CIMD 元数据主机白名单只接受 loopback
   （`127.0.0.1` / `localhost`），而 FastGPT 的 CIMD `client_id` 由 `FE_DOMAIN` 派生；
   `FE_DOMAIN` 不能是 loopback（SSRF 预检拒绝），因此跨主机部署下 AS 必然返回
   `client_id metadata document host is not allowed`（实测 `400`）。
3. **失败 + 一次性降级**——本轮验证通过。首次 start 选 CIMD、`/register` delta 0；
   `/authorize` 被 AS 400 拒绝且无回调。第二次 start 因台账存在未消费、未降级的
   CIMD attempt 而强制 DCR：真实 `/register` 恰好 +1，节点写 `clientSource=dcr` 与
   `autoDcrFallback=true`。第三次 start 继续 DCR 且 `/register` 不再增加；随后真实
   `/authorize`→`/consent`→`/confirm`→callback→`/token`→`tools/list`→`tools/call`
   全部成功，授权成功后 `autoDcrFallback` 被清除。该链路同时证明“同一条授权链只降级一次”，
   不会在 CIMD/DCR 之间抖动。

因此本套件对 CIMD 的断言是：**FastGPT 侧正确声明并持久化 CIMD 客户端、首次失败不即时改写状态、
下一次 start 一次性降级 DCR 并走通完整真实授权**；“CIMD 在 AS 侧成功授权”这一跳仍需要一台把
`FE_DOMAIN` 列入 CIMD 白名单（或允许公网抓取）的 AS，当前环境不具备。

## 7. 与 fixture 版的差异

| 维度 | v24 fixture（进程内） | real（本套件） |
| --- | --- | --- |
| AS 实现 | `fixtures/oauthMcpServer.mjs`，可控场景 | 真实 `wille/mcp-oauth-server`，不可控 |
| CIMD | AS 声明支持即放行，`start` 后可直接授权 | AS 真实回源抓取，白名单仅 loopback → 首次授权被拒；下一次 start 自动降级 DCR 后走通 |
| RFC 7592 | `/register` 返回 `registration_client_uri`，DELETE 可测 | 未返回该字段，`client/reset` 如实记录 `deregistered=false` |
| 故障注入 | `expireAccessTokens` / `always401` 直接构造 | 通过真实 `/revoke` 让 AT 失效来制造 401 |
| 限流 | 无 | `/register` 20 次/小时、`/authorize` 100 次/15 分钟；套件每轮消耗 4 次 register（CIMD 降级 1 + DCR 3） |
| 观测 | 内存计数器 | 透明代理记录 AS 边界 method/path/status |
| 断言规模 | 20 用例 / 149 断言 | 25 用例 / 212 断言（覆盖更细，如 URL 参数、状态字段、轮换、SSRF 文案、降级台账） |

## 8. 剩余风险与假设

- **CIMD 成功授权未端到端验证**：只验证了 CIMD 声明/持久化、AS 拒绝原因，以及拒绝后的
  一次性自动降级与 DCR 成功授权；需要 CIMD 白名单匹配部署域名的 AS 才能验证 CIMD 直接成功。
  属环境限制，不是代码缺陷。
- **AS 限流**：连续重复跑会消耗 `/register` 配额（20/小时）；本轮每轮 4 次（CIMD 阶段降级 1 +
  DCR 阶段 3）。建议串行、间隔运行。
- **AS 日志**：106 的 `/workspace/outputs/mcp-oauth/e2e/logs/oauth-server.log` 在 109 不可读，
  证据改用透明代理；代理不记录 body，因此只能证明端点/状态，不能证明 AS 内部处理细节。
- **`/etc/hosts`**：仅在 `run.sh` 生命周期内增加一行，退出时从备份恢复；本轮已确认
  `getent hosts host.docker.internal` 无条目。若进程被 `SIGKILL`，需手工还原备份。
- **明文 token 的瞬时存在**：仅测试进程内存，用于主动撤销与指纹比对；未写日志/仓库。
- **错误码粒度**：真实 AS 的 `invalid_scope` 到达 FastGPT callback 后被归为
  `mcp_oauth_access_denied`（通用），UI 无法区分 scope 违规；属既有行为，未改动。
- **SSRF 默认值未放宽**：依赖既有 `CHECK_INTERNAL_IP=false`（默认）放行 RFC1918；
  loopback / 云元数据仍拒绝。新增单测 `packages/global/test/common/system/network.test.ts`
  锁定该边界（6/6 通过），未新增任何生产开关。

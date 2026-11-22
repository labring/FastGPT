# MCP OAuth v2.4 真实 E2E（v24）

真实 FastGPT 生产构建 + 真实 HTTP + 真实 MongoDB/Redis 的验收套件，覆盖 handoff
§「安全与验收」的 1–10 正向链路与关键负向断言。

只有「第三方授权服务器 / MCP server」是进程内 fixture：它模拟 CIMD、DCR、manual
三种 AS 形态以及 JSON-RPC `initialize/tools/list/tools/call`，因此 FastGPT 侧的发现、
注册、PKCE、回调、刷新、401/403 处理全部走真实网络与真实数据库。

## 一条命令

```bash
E2E_ENV_FILE=/tmp/mcp-oauth-e2e/app.env \
  ./test/e2e/mcpOAuth/v24/run.sh
```

`run.sh` 会：

1. 读取 env 文件（mode 600，位于仓库之外）；
2. 若 `.next/BUILD_ID` 不存在则执行 `pnpm --filter @fastgpt/app build`；
3. 按需启动插件桩（3999）与 FastGPT 生产服务（默认 `127.0.0.1:13100`）；
4. 运行 `run.mjs`（fixture 监听 `172.17.0.34:18200`）；
5. 仅停止自己启动的进程，并删除专用测试库
   `fastgpt_mcp_oauth_e2e` / `fastgpt_mcp_oauth_e2e_log`。

退出码：0 = 全部断言通过，1 = 有断言失败（证据里带每条失败明细），2/3 = 缺少 env
或服务未就绪。

## 必需环境变量（写在 E2E_ENV_FILE，不入库）

| 变量 | 说明 |
| --- | --- |
| `MONGODB_URI` | 指向独立测试库，例如 `.../fastgpt_mcp_oauth_e2e?replicaSet=rs0` |
| `MONGODB_LOG_URI` | 独立日志库 |
| `REDIS_URL` | 真实 Redis |
| `PG_URL` | FastGPT 向量库默认使用 PG，启动健康检查会连接 |
| `AES256_SECRET_KEY` / `FILE_TOKEN_KEY` / `INVOKE_TOKEN_SECRET` / `ROOT_KEY` | 本地随机值 |
| `FE_DOMAIN` | 必须是 `https://` 且非 loopback；CIMD 可用性由此判定 |
| `MCP_OAUTH_ENABLED=true` / `MCP_OAUTH_RUNTIME_ENABLED=true` | 打开 OAuth |
| `MCP_OAUTH_ALLOW_INSECURE_HTTP=true` | 仅测试：fixture AS 是 http；生产默认 false |
| `PLUGIN_BASE_URL` + `PLUGIN_TOKEN` | 插件桩，满足 instrumentation 健康检查 |

可选：`E2E_APP_BASE_URL`、`E2E_FIXTURE_HOST/PORT`、`E2E_KEEP_DB=1`、
`E2E_MANAGE_STACK=0`（复用已启动服务）、`E2E_EVIDENCE_PATH`。

## 目录

```
test/e2e/mcpOAuth/v24/
├── run.sh                     # 一条命令入口 + 启停/清理
├── run.mjs                    # 真实 HTTP 驱动与断言
├── lib/respClient.mjs         # 零依赖 RESP 客户端（只用于播种 session / 清限流）
└── fixtures/oauthMcpServer.mjs# 进程内 AS + MCP server（CIMD/DCR/manual/负向场景）
```

登录态不通过 UI：脚本直接写入 `users/teams/team_members`，并向 Redis 写入
`fastgpt:session:<userId>:<sid>`，后续请求使用 `token` 头（避免 CSRF）。

## 场景

| scenario | 形态 | 用途 |
| --- | --- | --- |
| `a` | CIMD=DCR 都声明 | 必须选 CIMD，`/register` 必须为 0 |
| `b` | 无 CIMD，DCR 可用 | `/register` 恰好 1 次 |
| `c` | DCR 返回 400 | auto 自动降级 manual（传入 manualClient 时） |
| `short` | AT 5s | 主动刷新路径 |
| `norefresh` | 无 refresh_token | reauth 路径，不得发无效请求 |
| `widen` | token 响应扩大 scope | `scope_widened` |
| `prm` | PRM resource 不匹配 | `prm_resource_mismatch` |
| `ssrf` | PRM 指向 127.0.0.1 | `private_url` |

fixture 的统计只暴露次数与状态码，不返回任何 token/code/secret。

## 说明

- 未新增任何生产测试开关；SSRF、CIMD 可用性、限流均按生产逻辑执行。
- `MCP_OAUTH_ALLOW_INSECURE_HTTP` 是仓库既有选项（默认关闭），仅在测试 env 中打开。
- 限流不被放宽；每个用例前只清理 Redis 中 `fastgpt:rate-limit:mcp-oauth:*` 的历史计数，
  保证多次运行可复现。

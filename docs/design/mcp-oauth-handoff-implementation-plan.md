# MCP OAuth v2.4 Hand-off 落地计划（调研 + 差距 + 文件级改动）

- 分支：`feat/mcp-oauth-v24`
- 基线 HEAD：`ab2b1c94d fix(mcp-oauth): tolerate null optional oauth fields`
- 权威输入：
  1. `/tmp/handoff-peek/mcp-oauth-handoff.md`（交互与接口 hand-off）
  2. `/tmp/handoff-peek/mcp-oauth-v2.4-design-baseline.md`（v2.4 设计基线）
  3. `/tmp/handoff-peek/mcp-oauth-slices/03..12-*.png`（01/02 仅视觉参考）

> 本文先于代码改动提交，用于评审「现状 → 差距 → 文件级计划 → 验收方式」。
> 实施完成后如有取舍变化，追加到文末「决策记录」。

---

## 1. 调研结论（现状）

### 1.1 已经满足契约的部分（不为改而改）

| 契约域 | 现状落点 | 结论 |
|---|---|---|
| 两套 Schema 隔离 | `packages/global/core/workflow/type/node.ts`：`McpToolSetRuntimeConfigSchema` 含 `authMode/oauth`；`McpToolSetNodeConfigSchema.strict()` 不含 | 满足；工作流内联节点仍 headers-only |
| 唯一新增集合 | `packages/service/core/app/mcpOAuth/schema.ts`（`mcp_oauth_states`、TTL/查询索引） | 满足 |
| state 加密 + 一次性台账 + Cookie 绑定 | `state.ts`；`state.test.ts` 覆盖并发消费、重放、过期 | 满足 |
| 发现顺序 / 跨源端点 / SSRF / 不跟随重定向 | `discovery.ts` + `httpRuntime.ts`；`discovery.test.ts` 覆盖 | 满足 |
| CIMD → DCR → manual | `registration.ts`；CIMD Host 仅 `FE_DOMAIN`，ETag/304 | 满足 |
| start 契约 | `oauth/start.ts`：先发现/择 client/写回，再写台账，返回裸 schema | 满足 |
| callback 契约 | `oauth/callback.ts`：`csrf:false`、Origin 校验、原子消费、二次鉴权、固定跳转 | 满足 |
| disconnect / client-reset | 幂等、二次确认入参 `confirm:true`、尽力撤销/注销 | 满足 |
| token 生命周期 / 懒刷新 / 租约 + seq CAS | `token.ts`、`runtime.ts`、`credential.ts` | 满足 |
| 401 单次重试、403 insufficient_scope、401/403 不进 SSE | `runtime.ts`、`mcp.ts` 的 `shouldFallbackToSSE` | 满足 |
| update/getTools/runTool 分支 | `update.ts`（oauth 合并 + nodeFence）、`getTools.ts`/`runTool.ts`（`appId` 分支） | 满足 |
| detail/copy/export 脱敏 | `clearToolCredentials` + copy 删除 `oauth` | 满足 |
| 23/22 字段 status 投影 | `deriveMcpOAuthStatus` + `McpOAuthStatusResponseSchema` | 字段集满足，见 §2.1 |
| i18n 四语言 | `packages/web/i18n/{en,zh-CN,zh-Hant,ko-KR}/common.json` 各 156 个 `mcpOAuth.*` key；46 个错误码均有文案 | 基本满足，见 §2.4 |

### 1.2 现存前端（详情页）能力

- `MCPTools/index.tsx`：解析唯一 toolSet 节点、初始化 `authMode/clientMode/scope`、回调 query 处理（success → `getTools` → 保存 toolList → 刷 status；error → 固定文案）。
- `MCPTools/oauth/McpOAuthConfig.tsx`：认证模式、clientMode（仅 auto/manual）、auto 协商说明、scope、状态卡、manual 表单、错误 Banner、断开/重置二次确认、高级操作。
- `MCPTools/oauth/useMcpOAuthStatus.ts`：status 查询 + 轮询。
- `MCPTools/oauth/utils.ts`：scope、错误码、manual 校验、轮询判定、回调解析。
- `MCPTools/oauth/errorCodes.ts`：直接复用全局错误码枚举。

---

## 2. 差距分析（以 handoff 为准）

### 2.1 status 字段集（验收硬指标）

handoff §「status 响应字段」枚举 23 个名字，但逐项清点为 **22 个顶层字段**：

`schemaVersion, state, authMode, clientMode, clientSource, issuer, resource, scope,
requestedScope, authorized, hasAccessToken, hasRefreshToken, hasClientSecret, expiresAt,
refreshDueAt, authorizedAt, authorizedBy, lastError, canStart, canDisconnect,
canResetClient, updatedAt`

- 现有 `McpOAuthStatusResponseSchema` 恰好 22 个，无 token/secret 字段。
- **差距**：没有「字段集完全一致 + 任何 token/secret 键都不存在」的契约测试。
- **决策**：以 handoff 枚举的 22 个顶层字段为准（任务描述中的“23”按逐项枚举理解，避免为了数字新增契约外字段）；补测试锁定字段集。

### 2.2 轮询规则（差距最大）

| 规则（handoff §9.3 / 状态机） | 现状 | 处置 |
|---|---|---|
| 间隔 **2000ms** | `MCP_OAUTH_POLL_INTERVAL_MS = 5000` | 改为 2000 |
| 仅 `pending_authorization`、`refreshing` 轮询 | 还包含 `refresh_due`、`revoking`（后者不是服务端状态） | 收敛为 2 个状态 |
| 进入页面/回调后立即查一次 | 已实现 | 保留 |
| 最长 5 分钟 | 已实现 | 保留 |
| 终态/卸载停止 | 已实现 | 保留 |
| 同一时刻仅一个在途请求 | `inFlightRef` 去重 | 保留 |
| 页面可见性 | 额外加入 `visibilitychange` 暂停 | 契约未要求；为便于精确验收，移除可见性维度，严格按 2s 规则 |

### 2.3 8 态渲染

- 现状：状态卡只显示 `state` 文案；按钮文案只在 `reauth_required`/回调错误时变「重新授权」；`client_missing` 依赖 `autoStepStates` 与 manual 表单，`refresh_due` 无明确“可解析工具”提示。
- **差距**：缺少一份显式的「8 态 → 展示/动作」映射，无法用单测锁定。
- **处置**：在 `utils.ts` 新增 `MCP_OAUTH_STATE_PRESENTATION`（hintKey / tone / showStart / showDisconnect / showReset / manualForm / parseEnabled / startActionKey），供 `McpOAuthConfig` 渲染；为 8 态各补一条四语言 hint。

### 2.4 i18n

- 46 个错误码四语言均有 `mcpOAuth.error.*`；`errorSuggestion.*` 缺 21 个（有 `unknown` 兜底）。
- **差距**：新增的 8 条状态 hint 需要四语言；缺一份「四语言 key 完全一致 + 状态/错误 key 齐全」的自动化测试证据（现有 `scripts/mcp-oauth-i18n-check.mjs` 只校验错误码与键集一致）。
- **处置**：补 8 条 `mcpOAuth.state_hint.*` × 4 语言；测试覆盖四语言 key 集与 8 态 hint。

### 2.5 回调 query 清理与 getTools 回写

- 现状已实现，但清理逻辑内联在 `index.tsx`，只有源码字符串断言。
- **处置**：抽出纯函数 `stripMcpOAuthCallbackQuery(query)` 并在页面使用，单测覆盖「只删 `oauth`/`code`，保留其它 query」。

### 2.6 后端状态派生顺序（记录取舍，不阻塞）

- handoff §8.2 派生表把 `client_missing` 排在最后。若逐字实现，`reauth_required`（无 token）会先命中，导致 `client_missing` 在“首次启用 OAuth”时永远不可达，UI 无法提示“未配置 Client / 展开 manual 表单”。
- **决策**：保留现有顺序（`client_missing` 与不可重试 `lastError` 优先于 token 可用性），并在测试注释中说明；其余相对顺序（pending → refreshing → authorized → refresh_due → reauth_required）与契约一致。
- 交付说明中列为已知偏差，若评审要求逐字契约，可单点调整 `deriveMcpOAuthStatus`。

### 2.7 其它已核对、无需改动

- `McpToolSetNodeConfigSchema` 未加 OAuth；`NodeToolSet.tsx` 无任何 OAuth 引用。
- `authMode=headers` 运行期不读 `oauth`；`authMode=oauth` 不回落 `headerSecret`。
- redirect URI 服务端固定；回调跳转白名单固定详情页。
- `client-metadata.json` 仅允许 `FE_DOMAIN` Host，`csrf:false`。
- 日志/错误 envelope 只含 `oauthCode/requestId/retryable/retryAfterMs`。

---

## 3. 文件级改动计划

### 3.1 前端

| 文件 | 改动 |
|---|---|
| `projects/app/src/pageComponents/app/detail/Edit/MCPTools/oauth/utils.ts` | 轮询间隔 5000→2000；轮询状态收敛为 `pending_authorization`/`refreshing`；`shouldPollMcpOAuthStatus` 去掉可见性参数；新增 `MCP_OAUTH_STATE_PRESENTATION` + `getMcpOAuthStatePresentation`；新增 `stripMcpOAuthCallbackQuery` |
| `.../oauth/useMcpOAuthStatus.ts` | 去掉 `visibilitychange` 依赖；按新判定轮询；保持 in-flight 去重、5 分钟上限、终态停止 |
| `.../oauth/McpOAuthConfig.tsx` | 按 8 态映射渲染状态徽标/提示/按钮：`headers` 不渲染 OAuth 区块；`config_error` 禁用连接；`client_missing` 展开 manual；`pending/refreshing` 轮询提示；`authorized` 显示过期时间 + 断开；`refresh_due` 提示可解析工具；`reauth_required` 主按钮「重新授权」+ 最近错误 |
| `.../MCPTools/index.tsx` | 使用 `stripMcpOAuthCallbackQuery` 清理 query；回调成功顺序保持 getTools → 保存 toolList → refresh status |
| `projects/app/src/pages/dashboard/create/index.tsx` | 创建页 `authMode/clientMode/scope`；clientMode 只保留 auto/manual（按追加需求移除 CIMD/DCR 选项） |
| `packages/web/i18n/{en,zh-CN,zh-Hant,ko-KR}/common.json` | 新增 8 条 `mcpOAuth.state_hint.*` |

### 3.2 测试

| 文件 | 改动 |
|---|---|
| `packages/service/test/core/app/mcpOAuth/statusContract.test.ts`（新增） | status 22 字段集完全一致；JSON 序列化后不存在 `token/secret/access_token/refresh_token/registrationAccessToken/...`；8 态全覆盖 |
| `projects/app/test/pageComponents/app/mcpToolsOAuth.test.ts` | 轮询 2s/2 态；8 态 presentation；query 清理；四语言 i18n key 集（含 state hint） |
| 既有 service 测试 | 保持全绿；如状态派生顺序调整则同步更新 |

### 3.3 后端

- 本轮不改运行逻辑（已满足契约）；仅补契约测试并记录 §2.6 取舍。
- 若测试暴露字段/顺序问题，再单点修改 `deriveMcpOAuthStatus`。

---

## 4. 验收方式

1. 类型检查：
   - `cd packages/service && npx tsc --noEmit -p tsconfig.json`
   - `cd projects/app && npx tsc --noEmit -p tsconfig.json`
2. 单测：
   - `cd packages/service && npx vitest run -c vitest.config.ts test/core/app/mcpOAuth`
   - `cd projects/app && npx vitest run -c vitest.config.ts test/pageComponents/app/mcpToolsOAuth.test.ts`
   - 本机无外网下载 MongoDB 时使用 `FASTGPT_TEST_MONGODB_URI=mongodb://127.0.0.1:27017`
3. i18n：`node scripts/mcp-oauth-i18n-check.mjs`（missing=0）
4. 只对改动文件跑 eslint（若仓库脚本可用）。
5. `git diff --stat` 限于 MCP OAuth 相关文件；`git status` 不含本任务以外的改动。

---

## 5. 决策记录

| # | 决策 | 理由 |
|---|---|---|
| D1 | status 采用 handoff 枚举的 22 个顶层字段，不新增第 23 个 | handoff 是唯一权威，逐项枚举为 22；新增字段反而破坏契约 |
| D2 | 轮询严格 2s、仅 `pending_authorization`/`refreshing`，移除页面可见性维度 | handoff §9.3 未定义可见性规则，严格化便于验收 |
| D3 | 保留 `client_missing` 在状态派生中的较高优先级 | 否则首次启用 OAuth 时状态不可达，manual 表单无法按截图展开；列为已知偏差 |
| D4 | 不恢复 `backup/pre-drop-9c1bc69` 的 modal 结构 | 用户明确要求丢弃；handoff §9.2 采用详情页内联配置 |
| D5 | 创建页只保留 `authMode/clientMode/scope`，不提交 manual client | 设计 §8.4：创建后不自动 start，manual 在详情页 start 时提交 |
| D6 | `client_missing/pending/authorized/refresh_due/refreshing/reauth_required` 展示重置，但是否可点仍以服务端 `canResetClient` 为准（断开同理） | 状态表只规定部分按钮的显隐；服务端 `can*` 字段是权限与可用性权威，前端 presentation 只负责布局提示 |
| D7 | 前端 clientMode 只暴露 `auto`/`manual`，不提供 CIMD/DCR 选项；auto 固定由服务端按 CIMD → DCR → manual 协商；存量 `cimd`/`dcr` 读侧归一为 `auto`，`clientSource` 仅作诊断展示 | 用户追加需求优先于 handoff 中「可选 auto/CIMD/DCR/manual」的表述：协议顺序必须自动协商，不能让用户选协议。为兼容旧数据仅做读取归一，不迁移、不新增存储字段 |
| D8 | 增加「CIMD 单次自动降级 DCR」：仅 `clientMode=auto`；触发条件为 ① 同一 `appId+nodeId+tmbId` 的 state 台账存在 `clientSource=cimd`、未消费、未 `downgradedAt` 的上一次尝试（不要求未过期：过期只代表无法再回调，仍属未走完的尝试），或 ② 节点已有粘性标记 `oauth.autoDcrFallback=true`。触发后本次 start 强制 `forceDcr`，并在旧台账写 `downgradedAt`、在节点写粘性标记；同一授权链后续 start 持续 DCR，不再回到 CIMD。真实授权成功（token 落库）或 `client/reset` 时清除粘性标记。callback 仅在 `clientSource=cimd` 且错误属于 `invalid_client`/`invalid_request`/`unauthorized_client` 时自动重新 start + 302；`access_denied` 与 DCR/manual 不降级，返回固定错误码 | 真实 AS 的 CIMD 失败发生在 `/authorize` 并直接 400，不产生回调，因此 callback-only 回退是死代码；降级依据必须落在「上一次 CIMD 尝试未完成」的台账上，并由下一次 start 执行。台账是 v2.4 新增集合可自由扩展；`autoDcrFallback` 与 `downgradedAt` 均为可选字段，不做迁移、不加必填字段、不进 status 22 字段契约；manual 永不降级，前端仍无 CIMD/DCR 选项 |
| D9 | 「CIMD 直接成功」的验收使用**测试专用 AS 启动器 + TLS 反代**，不修改 desktop 106，也不改 FastGPT 生产代码：启动器复用上游 `wille/mcp-oauth-server@8035903`，通过 `clientIdMetadataDocuments.validateClientIdUrl` 白名单 `fastgpt-e2e.internal`；TLS 反代把 `https://fastgpt-e2e.internal:18443/*` 转到应用 HTTP 端口并透传 Host | 上游 CIMD 在调用白名单钩子**之前**就拒绝 IP 字面量/localhost，所以 `FE_DOMAIN` 必须是域名；本套件用 `/etc/hosts` 把该域名指向 109 自身，并用自签 CA（`NODE_EXTRA_CA_CERTS`，仅测试进程）打通「AS 回源 FastGPT 文档」与「FastGPT 访问 AS」两条 https 链路。生产默认不变：`FE_DOMAIN` 仍是真实 https 域名，CIMD 可用性判定、Host 白名单、SSRF/HTTPS 校验均未放宽；测试夹具只在 `/tmp` 与本仓库 `test/e2e/**` 中，不进入发布产物 |

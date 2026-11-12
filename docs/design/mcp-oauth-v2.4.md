# FastGPT MCP 工具集 OAuth 授权设计（精简版 v2.4）

- 版本：v2.4（实施基线）
- 日期：2026-11-11
- 上游基线：`aipaas/labring/FastGPT` `main` @ `80c3dc3f046ad2662f726eda88974f5209c76d0c`
- 状态：approved-for-implementation（取代 v2.3；v2.3 保留只读，不再作为实施依据）
- 对应任务：Stage I1；输入为 `plans/I0-UPSTREAM-ALIGNMENT.md` 与 7 条批注

> 本文只描述**要做什么**。历史争议、v2.0→v2.3 的演进过程与已废弃机制不再复述；差异见
> `plans/mcp-oauth-v2.4-changelog.md`，文件级落点见 `plans/I1-IMPLEMENTATION-DELTA.md`。

---

## 0. 相对 v2.3 的删除与简化

### 0.1 删除/简化清单

| # | 删除/简化项 | 处置 | 原因与依据 |
|---|---|---|---|
| D1 | 迁移 M1 `nodes_revision` | 删除 | 上游 `app_versions` 无 `nodesRevision` 字段、应用核心无 `$inc`。写路径 `$inc` 天然生成 1，读路径 `?? 0`。批注 4；I0 §4.6 |
| D2 | 迁移 M2 `state_indexes` | 删除 | `defineIndex` 声明 + `getMongoModel` 在 `SYNC_INDEX=true` 时启动同步（`packages/service/common/mongo/index.ts:238-250`）。批注 4 |
| D3 | 迁移 M3 `oauth_naming` | 删除 | 线上 0 存量，没有 `mode` 需要回填。批注 4 |
| D4 | 迁移 M4 `validate_nodes` | 删除 | 只读巡检；0 存量无需产出报告，异常由 CI 契约测试覆盖。批注 4 |
| D5 | 迁移 M5 `drop_legacy_mode` | 删除 | 无别名即无需清理。批注 4 |
| D6 | 迁移 M6 `credential_seq` | 删除 | `credentialSeq` 缺省按 0 处理，不写迁移。批注 4 |
| D7 | 别名 `mode` / `oauthMode` / `oauthScope` 与 `resolveMcpOAuthClientMode` | 删除 | 0 存量；上游没有任何 MCP OAuth 读取方。批注 4、6 |
| D8 | `MCP_OAUTH_SCOPE_ALLOWLIST` 及 `scope_not_allowed` / `scope_not_configured` / `scope_escalation` | 删除 | scope 仅由管理员 UI 显式选择，按 RFC 6749 字符集校验；AS 授权结果只做“不得扩大”校验。批注 3 |
| D9 | `mcp_oauth_rotation_journal` 集合、`refreshStore.ts`、写前/结果日志 | 删除 | 崩溃窗口明确接受（§6.5）；重授权兜底。批注 4 |
| D10 | `mcp_oauth_header_verifications` 集合、三态 `fallbackCapability` | 删除 | 不做 headers 回滚探针。批注 7 |
| D11 | `mcp_oauth_rollback_audit`、`rollback.ts`、`rollbackCapability.ts` | 删除 | 砍掉探针回滚子系统。批注 7 |
| D12 | 回滚 CLI/审计脚本、`refs.lock` 与锁脚本 | 删除/不引用 | 无回滚子系统；`docs/design/mcp-oauth-refs.lock.json` 属只读 docs，仅不再被代码引用。批注 4 |
| D13 | `mcp_oauth_rate_limits` 集合、`mcpOAuth/rateLimit.ts` | 删除 | 改用 `defineRateLimitInterface` + Redis。批注 4；I0 §4.3 |
| D14 | `app_versions.nodesRevision` 字段、controller 里的 CAS/回填 | 删除 | 上游无该字段；只在 OAuth 写路径 `$inc`，不做读写 CAS。I0 §4.6 |
| D15 | detail 返回未脱敏 `oauth.token/clientSecret` | 修正 | `clearToolCredentials` 增加 OAuth 脱敏。批注 1；I0 §4.2 |
| D16 | `MCP_OAUTH_CIMD_HOSTS` / `TENANT_ALLOWLIST` / `ROLLOUT_PERCENT` / `REFRESH_LEASE_MS` / `STATE_TTL_MS` env | 删除 | 只用 `FE_DOMAIN`；租约/TTL 为常量；灰度只用两个开关。批注 2、4 |
| D17 | 全局 `response/index.ts` 错误 envelope 改造 | 收敛 | 改为 OAuth 路由内部 wrapper，不污染全局错误处理 |
| D18 | 泛化清洗器 `sanitizeMcpOAuthForTransfer`（export/copy 通用） | 简化 | 持久化 OpenAPI schema 已是摘要，凭据无法经 import/export 出站；只保留 detail strip + copy strip 两个小函数 |
| D19 | `MCPClient` 异步 header provider | 简化 | 401 后强制刷新并用新 token 重建 client；构造签名不变。I0 §4.4 |
| D20 | AS 端点同源限制 `endpoint_origin_mismatch` | 删除限制 | 允许跨源端点，但逐端点 SSRF/协议校验。批注 2 |
| D21 | PRM 探活 `GET mcpUrl` | 修正 | 改为**无令牌 MCP `initialize` POST**；PRM 404 再探根 AS metadata。批注 2 |
| D22 | 12 态状态机、约 70 个错误码 | 精简 | 8 态 + 约 40 个错误码（§8.3） |
| D23 | `MCP_OAUTH_DEFAULT_SCOPE` | 删除 | 默认空 scope，仅 UI 显式选择 |

### 0.2 章节映射（v2.3 → v2.4）

| v2.3 | v2.4 | 处置 |
|---|---|---|
| §0–§2 修订摘要/变更史 | §0 | 压缩为删除/简化表 |
| §3 目标与非目标 | §1 | 重写 |
| §4 场景与用户故事 | §1.3 | 压缩为约束条目 |
| §5 现状调研 | §1.4、§10.3 | 只保留与实现有关的结论 |
| §6 方案总览 | §1.1、§2 | 合并 |
| §7.1 配置模型 | §2 | 重写（去掉别名/rollback/credentialVersion/refreshBackoff） |
| §7.2 生命周期 | §3.4 | 合并到存储与生命周期 |
| §7.3 授权流程 | §4 | 保留，删 serverHash/configHash |
| §7.4 客户端注册与发现 | §5 | 重写探活与跨源策略 |
| §7.5 令牌与刷新 | §6 | 保留租约 + seq CAS，删 journal |
| §7.6 写入一致性 | §7 | 简化为单条 `updateOne` + 保存合并 + 脱敏 |
| §7.7 运行时集成 | §6.5、§7.5 | 合并 |
| §7.8 API | §8 | 重写并精简错误码 |
| §7.9 安全 | §11 | 合并 |
| §7.10 前端 | §9 | 重写为闭环规则 |
| §7.11 指标 | §11.6 | 压缩 |
| §8 兼容与迁移 | §10 | 删除迁移，只留灰度 |
| §9 测试计划 | §12 | 删旧用例 |
| §10 交付计划 | §13 | 与 I1 delta 的阶段对齐 |
| §11 风险 | §14 | 精简 |
| §12 refs.lock | — | 删除 |

### 0.3 批注落实索引

| 批注 | 落点 |
|---|---|
| 1 两套 Schema 隔离 + `.strict()` + detail 脱敏 | §2.1、§7.4 |
| 2 清理优先级、initialize 探活、根 AS 回退、跨源端点 | §5.1–§5.3 |
| 3 废除 scope allowlist | §5.5、§8.3 |
| 4 0 存量：删迁移/别名/journal/自建限流/锁 | §0.1、§3 |
| 5 `shouldFallbackToSSE` 排除 401/403 | §6.3 |
| 6 create/编辑闭环、start schema manual | §8.2、§8.4、§9.3 |
| 7 砍探针回滚，仅两开关灰度 | §10.2 |

---

## 1. 目标、非目标与约束

### 1.1 目标

1. 管理员在**独立 MCP 工具集应用**（`AppTypeEnum.mcpToolSet`）中，用 OAuth 2.1 + PKCE 连接需要授权的远程 MCP Server。
2. 支持三种客户端注册方式，固定优先级 **CIMD → DCR → manual**；`start` 返回实际使用的 `clientSource`。
3. 令牌加密存储于节点配置，运行期懒刷新；401 只重试一次，不循环。
4. 不改动既有 headers 模式行为；OAuth 关闭时零影响。
5. 无数据迁移、无别名兼容层、无可回滚探针，灰度仅靠两个环境开关。

### 1.2 非目标

- 工作流**内联** `NodeToolSet` 节点不支持 OAuth，仅支持 `headerSecret`。
- 不支持 `client_credentials`、设备码、JWT bearer、DPoP、mTLS。
- 不做跨实例刷新结果日志/崩溃恢复日志。
- 不做 scope 全局白名单、租户白名单、按比例灰度。
- 不把 OAuth 状态写入应用详情响应；状态只走 `oauth/status`。
- 不支持在导出/导入/复制中携带令牌。

### 1.3 关键约束

- 一个 MCP 工具集应用只有一个 `toolSet` 根节点；多节点/缺节点一律拒绝 OAuth 操作。
- `redirect_uri` 由服务端固定生成，绝不接受请求参数。
- `state` 一次性；Cookie 绑定到发起浏览器；回调做二次鉴权。
- 任何日志、错误响应、详情响应不得出现 access/refresh token、client secret、state 原文、PKCE verifier。

### 1.4 新基线事实（实现必须遵守）

| 事实 | 位置 |
|---|---|
| 根工具集完整配置用 `McpToolSetRuntimeConfigSchema`；内联节点用 `.strict()` 的 `McpToolSetNodeConfigSchema` | `packages/global/core/workflow/type/node.ts:17-44` |
| legacy 边界 `LegacyMcpToolSetRuntimeConfigSchema = ... McpToolSetRuntimeConfigSchema.strict()` | `packages/global/core/workflow/migration/legacy/schema.ts:26-31` |
| `normalizeAppWorkflow` 先 strict 解析根配置、摘要化迁移、再回填完整配置 | `packages/service/core/app/version/controller.ts:46-169` |
| 详情接口 `GetAppDetailResponseSchema` 用 `OpenAPIStoreNodeItemTypeSchema`（union 含 RuntimeConfig.strict） | `packages/global/openapi/core/workflow/node.ts:102`、`packages/global/openapi/core/app/common/api.ts:537` |
| 持久化/版本入参 `PersistedOpenAPIStoreNodeItemTypeSchema` 的 `mcpToolSet` 只接受摘要 | `packages/global/openapi/core/workflow/node.ts:210-235` |
| `clearToolCredentials` 只处理 `headerSecret` | `packages/service/core/app/utils.ts:670-703` |
| `shouldFallbackToSSE` 对 400–499（除 429）全回退，含 401/403 | `packages/service/core/app/mcp.ts:364-372` |
| 限流框架 `defineRateLimitInterface` | `packages/service/common/rateLimit/core.ts:16` |
| 索引启动同步 `SYNC_INDEX` | `packages/service/common/mongo/index.ts:238-250` |

---

## 2. 配置模型

### 2.1 两套 Schema 隔离（批注 1）

**只有 `McpToolSetRuntimeConfigSchema` 增加字段**；`McpToolSetNodeConfigSchema` 保持上游原样。

```ts
// packages/global/core/workflow/type/node.ts
export const McpToolSetRuntimeConfigSchema = z.object({
  url: z.string(),
  authMode: z.enum(['headers', 'oauth']).default('headers'),
  headerSecret: StoreSecretValueTypeSchema.nullish(),
  oauth: McpToolSetOAuthConfigSchema.optional(),
  toolList: z.array(McpToolConfigSchema)
});

// 不改：内联节点只允许摘要
export const McpToolSetNodeConfigSchema = z
  .object({
    url: z.string(),
    headerSecret: StoreSecretValueTypeSchema.nullish(),
    toolList: z.array(ToolSetToolSummarySchema.strict())
  })
  .strict();
```

为什么必须这样：

1. `LegacyMcpToolSetRuntimeConfigSchema` 对 `McpToolSetRuntimeConfigSchema` 套了 `.strict()`。**未声明字段不是被剥离，而是 `unrecognized_keys` 导致整个 workflow 解析失败**（`legacy/workflow.ts:203`），创建/发布/详情全部 500。
2. 反向：`McpToolSetNodeConfigSchema` 也是 `.strict()`。给内联节点添加 `oauth` 会让含该节点的工作流整体解析失败，而不是“字段消失”。
3. `normalizeAppWorkflow` 先用 legacy strict schema 解析根配置（`controller.ts:109`），摘要化后再回填 `parsed.data`（`153-167`）。字段只要在 RuntimeConfig 中声明，就会完整往返；不声明则会在摘要前被丢弃。
4. `PersistedOpenAPIStoreNodeItemTypeSchema` 的 `mcpToolSet` 只接受 `McpToolSetNodeConfigSchema`，因此 OAuth 不会经工作流保存/导入/导出出站；工具集自身的保存走 `mcpTools/update.ts` 的专用路径。

**护栏测试（必须存在）**：

```ts
expect(McpToolSetNodeConfigSchema.safeParse({ url, headerSecret, toolList: [], authMode: 'oauth' }).success)
  .toBe(false); // .strict() 拒绝内联 OAuth
expect(McpToolSetRuntimeConfigSchema.strict().safeParse({ url, toolList: [], authMode: 'oauth', oauth: {} }).success)
  .toBe(true);
```

### 2.2 字段定义（唯一来源）

```ts
// packages/global/core/app/tool/mcpTool/oauthConfig.ts
export const McpOAuthServerMetadataSchema = z.object({
  issuer: z.string().max(2048),
  authorizationEndpoint: z.string().max(2048),
  tokenEndpoint: z.string().max(2048),
  registrationEndpoint: z.string().max(2048).optional(),
  revocationEndpoint: z.string().max(2048).optional(),
  tokenEndpointAuthMethodsSupported: z.array(z.string().max(64)).max(16).optional(),
  codeChallengeMethodsSupported: z.array(z.string().max(32)).max(16).optional(),
  clientIdMetadataDocumentSupported: z.boolean().optional(),
  scopesSupported: z.array(z.string().max(256)).max(64).optional(),
  source: z.enum(['discovered', 'manual']).default('discovered'),
  fetchedAt: z.number()
});

export const McpOAuthClientSchema = z.object({
  clientId: z.string().min(1).max(2048),
  clientSecret: SecretValueTypeSchema.optional(),          // 加密
  tokenEndpointAuthMethod: z.enum(['none', 'client_secret_post', 'client_secret_basic']),
  registeredAt: z.number().optional(),
  registrationClientUri: z.string().max(2048).optional(),  // RFC 7592
  registrationAccessToken: SecretValueTypeSchema.optional() // 加密
});

export const McpOAuthTokenSchema = z.object({
  secret: StoreSecretValueTypeSchema,   // { access_token: {secret}, refresh_token?: {secret} }
  tokenType: z.string().max(32).optional(),
  scope: z.string().max(1024).optional(), // AS 实际授予
  expiresAt: z.number(),                  // epoch ms；0 = AS 未给 expires_in
  obtainedAt: z.number()
});

export const McpOAuthLastErrorSchema = z.object({
  code: z.string().max(64),
  at: z.number(),
  retryable: z.boolean(),
  retryAfterMs: z.number().max(86_400_000).optional()
});

export const McpOAuthLeaseSchema = z.object({
  owner: z.string().max(64),
  expiresAt: z.number()
});

export const McpToolSetOAuthConfigSchema = z.object({
  schemaVersion: z.literal(1).default(1),
  clientMode: z.enum(['auto', 'cimd', 'dcr', 'manual']).default('auto'),
  clientSource: z.enum(['cimd', 'dcr', 'manual']).optional(),
  issuer: z.string().max(2048).optional(),
  resource: z.string().max(2048).optional(),
  scope: z.string().max(1024).optional(),   // 请求值；默认未设置
  server: McpOAuthServerMetadataSchema.optional(),
  client: McpOAuthClientSchema.optional(),
  token: McpOAuthTokenSchema.optional(),
  credentialSeq: z.number().int().nonnegative().default(0),
  refreshLease: McpOAuthLeaseSchema.nullish(),
  revokeLease: McpOAuthLeaseSchema.nullish(),
  lastError: McpOAuthLastErrorSchema.nullish(),
  authorizedAt: z.number().optional(),
  authorizedBy: z.string().max(64).optional()
});
```

**明确不存在**：`mode`、`rollback`、`credentialVersion`、`refreshBackoff`、`server.configHash`、`scopeAllowlist`。任何代码不得读取或写入这些键。

### 2.3 字段语义

| 字段 | 说明 |
|---|---|
| `authMode` | `headers`（默认）或 `oauth`；`oauth` 时运行期忽略 `headerSecret` |
| `clientMode` | 用户偏好；`auto` 固定 CIMD → DCR → manual；显式模式**不静默降级** |
| `clientSource` | `start` 成功写入实际来源；后续只读 |
| `issuer` | AS metadata 的 `issuer`，逐字符比较；变更需重新授权 |
| `resource` | RFC 8707 resource；来自 PRM 或规范化 MCP URL |
| `scope` | 请求 scope；仅 UI 显式选择；可为空 |
| `server` | 发现结果缓存（端点与能力），非密 |
| `client` | clientId、加密 secret、认证方式、RFC 7592 凭据 |
| `token` | 加密 access/refresh token；`expiresAt/obtainedAt/granted scope` 非密 |
| `credentialSeq` | 唯一 fencing token；每次凭证变更 +1；缺省 0 |
| `refreshLease` / `revokeLease` | 短租约，仅用于串行化；崩溃后自然过期 |
| `lastError` | 最近错误摘要，供 status 派生 |
| `authorizedAt/By` | 最近成功授权时间与 `tmbId`，非密 |

### 2.4 header 注入优先级

- `authMode === 'headers'`：`getSecretValue({ storeSecret: headerSecret })`，完全不读 `oauth`。
- `authMode === 'oauth'`：
  1. 有可用 access token → `{ Authorization: 'Bearer <token>' }`；
  2. 过期但可刷新 → 刷新后注入；
  3. 无法获得 token → 抛 `mcp_oauth_reauth_required`，**不**回退到 `headerSecret`。
- 不新增 `McpToolSetDataTypeSchema` 字段（该类型只用于历史内联 `toolData`，保持 headers-only）。

---

## 3. 存储与生命周期

### 3.1 存储位置

- **节点内存储**：`app_versions.nodes[].toolConfig.mcpToolSet = { url, authMode, headerSecret, oauth, toolList }`。
- **唯一新增集合**：`mcp_oauth_states`（一次性 state 台账，§4.2）。
- 不新增凭据集合、限流集合、日志集合、审计集合。

```ts
// packages/service/core/app/mcpOAuth/schema.ts
const McpOAuthStateSchema = new Schema<McpOAuthStateRecordType>({
  _id: { type: String, required: true },      // sha256(nonce)
  v: { type: Number, default: 1 },
  appId: { type: String, required: true },
  teamId: { type: String, required: true },
  nodeId: { type: String, required: true },
  tmbId: { type: String, required: true },
  bindCookieHash: { type: String, required: true },
  issuer: { type: String, required: true },
  resource: { type: String, required: true },
  clientIdHash: { type: String, required: true },
  redirectUri: { type: String, required: true },
  createdAt: { type: Date, required: true },
  expiresAt: { type: Date, required: true },
  purgeAt: { type: Date, required: true },
  consumedAt: { type: Date }
}, { minimize: false, collection: 'mcp_oauth_states' });

defineIndex(McpOAuthStateSchema, { key: { purgeAt: 1 }, options: { expireAfterSeconds: 0 } });
defineIndex(McpOAuthStateSchema, { key: { appId: 1, createdAt: -1 } });
defineIndex(McpOAuthStateSchema, { key: { appId: 1, nodeId: 1, expiresAt: 1 } });
```

索引无需迁移：`getMongoModel` 在 `SYNC_INDEX=true` 时调用 `MongoIndexManager.syncModelIndexes`。业务有效期始终用 `expiresAt` 显式比较，不依赖 TTL 精度。

常量：

```ts
export const MCP_OAUTH_STATE_TTL_MS = 10 * 60 * 1000;
export const MCP_OAUTH_STATE_PURGE_MS = 24 * 60 * 60 * 1000;
export const MCP_OAUTH_CLOCK_SKEW_MS = 30 * 1000;
export const MCP_OAUTH_REFRESH_LEASE_MS = 45 * 1000;
export const MCP_OAUTH_OAUTH_MAX_BYTES = 16 * 1024;
```

### 3.2 `credentialSeq` 初始化

- 节点首次启用 OAuth（用户保存 `authMode:'oauth'`）时写入 `credentialSeq: 0`。
- 任何读取用 `oauth?.credentialSeq ?? 0`；**不因缺失而拒绝**（删除 `schema_unmigrated`）。
- 首次写 filter 同时接受“字段为 0”与“字段不存在”：

```ts
const seqMatch = (seq: number) =>
  seq === 0
    ? {
        $or: [
          { 'toolConfig.mcpToolSet.oauth.credentialSeq': 0 },
          { 'toolConfig.mcpToolSet.oauth.credentialSeq': { $exists: false } }
        ]
      }
    : { 'toolConfig.mcpToolSet.oauth.credentialSeq': seq };
```

### 3.3 限流（Redis，批注 4）

```ts
// packages/service/common/rateLimit/type.ts
export const RateLimitSceneEnum = {
  /* ...existing */
  McpOAuth: 'mcp-oauth'
} as const;

// packages/service/common/rateLimit/interface/mcpOAuth.ts
const startByApp = defineRateLimitInterface<{ appId: string }>({
  scene: RateLimitSceneEnum.McpOAuth,
  policy: 'start-app',
  failureMode: 'closed',
  getKeySegments: ({ appId }) => ['app', appId],
  getLimit: () => 5,
  getWindowSeconds: () => 60,
  createError: () => ERROR_ENUM.tooManyRequest
});
export const assertMcpOAuthStartByAppRateLimit = startByApp.assert;
```

| policy | key | limit / window | failureMode |
|---|---|---|---|
| `start-app` | `app/<appId>` | 5 / 60s | closed |
| `start-user` | `user/<tmbId>` | 20 / 60s | closed |
| `callback-ip` | `ip/<sha256(ip)>` | 30 / 60s | open |
| `callback-app` | `app/<appId>` | 60 / 60s | closed |
| `disconnect-app` | `app/<appId>` | 5 / 60s | closed |
| `client-reset-app` | `app/<appId>` | 5 / 60s | closed |
| `client-metadata-ip` | `ip/<sha256(ip)>` | 60 / 60s | open |

Redis 故障：`closed` 场景直接 429/503，避免绕过；`callback`/`metadata` 放行，因为有 state/一次性台账与静态文档兜底。

### 3.4 生命周期

| 事件 | 行为 |
|---|---|
| 创建工具集（`authMode=oauth`） | 写 `oauth: {schemaVersion:1, clientMode, scope?, credentialSeq:0}`，无 token/client |
| 用户保存 | 见 §7.3；URL 变更清空 token/server，seq+1 |
| 断开（disconnect） | 本地清空 token（seq+1），随后尽力 RFC 7009 撤销 |
| 重置 client | 清空 client/token/server（seq+1），尽力 RFC 7592 注销 |
| 删除应用 | 删除前尽力撤销 token；失败不阻塞 |
| 复制应用 | 不复制 `oauth`（含 token/client），保留 `authMode`；复制后需重新授权 |
| 成员权限变化 | 回调二次鉴权失败即拒绝；已有 token 不因成员离职自动删除 |

---

## 4. 授权流程

### 4.1 state 结构

`state` = AES-256-GCM 加密 JSON → base64url。加密复用 `encryptSecret`（`packages/service/common/secret/aes256gcm.ts`）。

```ts
export const McpOAuthStatePayloadSchema = z.object({
  v: z.literal(1),
  n: z.string().regex(/^[A-Za-z0-9_-]{43}$/),   // 32B random；台账 _id = sha256(n)
  appId: z.string().regex(/^[a-f0-9]{24}$/i),
  nodeId: z.string().min(1).max(64),
  teamId: z.string().regex(/^[a-f0-9]{24}$/i),
  tmbId: z.string().regex(/^[a-f0-9]{24}$/i),
  redirectUri: z.string().max(2048),
  codeVerifier: z.string().regex(/^[A-Za-z0-9\-._~]{43,128}$/),
  issuer: z.string().max(2048),
  resource: z.string().max(2048),
  scope: z.string().max(1024).optional(),
  clientIdHash: z.string().regex(/^[a-f0-9]{64}$/),
  exp: z.number()
});
```

`state` 不保存 token、client secret、Cookie 原文。`n`、`state` 原文禁止进日志。

### 4.2 一次性台账

- `_id = sha256Hex(nonce)`；`bindCookieHash = sha256Hex(cookieValue)`。
- **先写台账、再返回授权 URL**；写失败返回 `state_storage_failed`（503），不返回 URL。
- 原子消费：

```ts
const consumed = await MongoMcpOAuthState.findOneAndUpdate(
  { _id: stateHash, consumedAt: { $exists: false }, expiresAt: { $gt: new Date(now) } },
  { $set: { consumedAt: new Date(now) } },
  { new: false }
).lean();
```

未命中时：无记录 → `state_invalid`；已消费 → `state_replayed`；过期 → `state_expired`。

- 同一 `appId+nodeId+tmbId` 的新 start 先作废旧的未消费行：

```ts
await MongoMcpOAuthState.updateMany(
  { appId, nodeId, tmbId, consumedAt: { $exists: false } },
  { $set: { consumedAt: new Date(now), purgeAt: new Date(now) } }
);
```

### 4.3 Cookie 绑定

| 属性 | 值 |
|---|---|
| name | `mcp_oauth_bind_<appId>` |
| value | 32B random base64url（明文只在浏览器） |
| HttpOnly | true |
| SameSite | Lax |
| Path | `/api/core/app/mcpTools/oauth` |
| Max-Age | 600 |
| Secure | `FE_DOMAIN` 为 https 时 true |

回调必须 `sha256(cookie) === ledger.bindCookieHash`，否则 `state_binding_mismatch`。缺失 cookie → `state_cookie_missing`。成功后立即 Set-Cookie 清空。

### 4.4 start 顺序（POST）

1. `authApp({appId, per: ManagePermissionVal})`；校验 `app.type === mcpToolSet`。
2. 限流：`start-app`、`start-user`。
3. `resolveMcpOAuthNode(appId, nodeId?)`：唯一 `toolSet` 节点；0 个 → `node_not_found`；≥2 个 → `node_ambiguous`。
4. 校验 `authMode === 'oauth'`、`url` 存在、节点大小 ≤16KB。
5. 解析目标版本文档（§7.1），读取 `oauth.credentialSeq ?? 0`。
6. 发现（§5）：MCP 探活 → PRM → AS metadata；`issuer` 与此前保存值不一致 → `issuer_changed`。
7. 选择/复用 client（§5.4）；写回 client（CAS `credentialSeq`，不触碰 token）。
8. 生成 PKCE S256；校验 scope；计算 `resource`。
9. 写 state 台账（§4.2），必要时先作废旧 state。
10. 设置绑定 Cookie，`Cache-Control: no-store`。
11. 返回：

```ts
McpOAuthStartResponseSchema = z.object({
  schemaVersion: z.literal(1),
  authorizationUrl: z.string(),
  clientMode: McpOAuthClientModeSchema,
  clientSource: McpOAuthClientSourceSchema,
  issuer: z.string(),
  resource: z.string(),
  requestedScope: z.string().optional(),
  expiresAt: z.number()
});
```

12. 授权 URL 参数：`response_type=code`、`client_id`、`redirect_uri`、可选 `scope`、`state`、`code_challenge`、`code_challenge_method=S256`、`resource`。

### 4.5 callback 顺序（GET）

路由必须 `NextAPI(handler, { csrf: false })`：授权服务器 302 回来的 GET 带登录 Cookie，但不带 `fastgpt-web-request` 头，默认 CSRF 会 403。

1. 仅允许 GET；否则 405。
2. 限流：`callback-ip`（在 state 解析前）、`callback-app`（appId 只来自已解密 state）。
3. 解析并解密 state；失败 → 400 JSON（此时没有可信 appId）。
4. 校验 `Origin`（若存在）等于 `FE_DOMAIN` origin。
5. 原子消费台账；校验 Cookie 绑定；失败 → 302 固定详情页 `oauth=error&code=...`。
6. **二次鉴权**：`authAppByTmbId({tmbId, appId, per: ManagePermissionVal})`；校验 `app.type`、team 一致。
7. 校验节点仍存在、`url` 未变、`authMode==='oauth'`、`clientIdHash` 与当前 client 一致；否则 `state_context_changed`。
8. AS 返回 `error` → `access_denied`（或映射后的错误码），不换 token。
9. `iss`（若返回）与 state `issuer` 精确一致。
10. `exchangeAuthorizationCode({ tokenEndpoint, clientId, clientSecret, authMethod, code, redirectUri, codeVerifier, resource, requestedScope })`。
11. 校验 token 响应：`token_type` 必须是 Bearer（不区分大小写）；`scope` 不得超出请求值。
12. 加密 token；`updateMcpOAuthNodeFields({expectedCredentialSeq, set:{token, client, lastError:null, authorizedAt, authorizedBy}, incSeq:true})`。
13. 清空 Cookie；302 到 `${FE_DOMAIN}/app/detail?appId=<appId>&oauth=success`。
14. 写回失败（seq 变化）→ `state_context_changed`；不得重试覆盖。

### 4.6 重定向白名单

- OAuth `redirect_uri` 服务端生成：`${FE_DOMAIN}${BASE_PATH}/api/core/app/mcpTools/oauth/callback`。
- 回调成功/失败后的浏览器跳转只允许 `${FE_DOMAIN}/app/detail?appId=...`；`appId` 只能来自已解密 state，禁止使用 query 中的任意 URL。
- 不实现“登录后返回任意 path”。

---

## 5. 客户端注册与发现

### 5.1 MCP 探活（批注 2）

用**无令牌**的 MCP `initialize` POST 触发 401 challenge：

```ts
const res = await fetch(mcpUrl, {
  method: 'POST',
  redirect: 'manual',
  headers: {
    'content-type': 'application/json',
    accept: 'application/json, text/event-stream'
  },
  body: JSON.stringify({
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
      protocolVersion: '2025-06-18',
      capabilities: {},
      clientInfo: { name: 'FastGPT', version: '1.0.0' }
    }
  })
});
```

| 结果 | 处理 |
|---|---|
| 401（或 403）带 `WWW-Authenticate: Bearer resource_metadata="..."` | 使用该 URL 拉 PRM |
| 401/403 无 challenge | 走 well-known 候选 |
| 2xx（服务端允许匿名 initialize） | 仍走 well-known 候选；找不到则 `discovery_failed` |
| 3xx | 不跟随，`discovery_failed`（防重定向 SSRF） |
| 其他 | `discovery_failed` |

探活与所有发现请求统一走 `createMcpSafeFetch`（`redirect:'manual'`、DNS pin、拒绝代理、鉴权头跨 host 移除）。

### 5.2 PRM 与 AS 元数据

PRM 候选（依次）：

1. challenge 中的 `resource_metadata` URL（任意 https 主机，只要通过 SSRF 校验）。
2. `https://<origin>/.well-known/oauth-protected-resource<path>`
3. `https://<origin>/.well-known/oauth-protected-resource`

校验：

- `resource` 必须与规范化后的 MCP URL 相等，否则 `prm_resource_mismatch`。
- `authorization_servers` 非空；每项是合法 https URL（开发开关允许 http）。
- `bearer_methods_supported` 若存在，必须包含 `header`。

**PRM 404/不可用时的旧版回退**（MCP 2025-03-26）：

- 以 MCP URL 的 origin 作为 issuer；
- 拉 `https://<origin>/.well-known/oauth-authorization-server`；
- 若失败再试 `/.well-known/openid-configuration`；
- 返回的 `issuer` 必须精确等于该 origin，否则 `issuer_mismatch`。

AS metadata 候选（RFC 8414）：

```ts
`${origin}/.well-known/oauth-authorization-server${path}`
`${origin}/.well-known/openid-configuration${path}`
`${origin}${path}/.well-known/openid-configuration`
```

跨源策略（批注 2）：

- `authorization_endpoint` / `token_endpoint` / `registration_endpoint` / `revocation_endpoint` **允许与 issuer 不同源**。
- 每个端点独立校验：https（或开发开关）、无 userinfo/fragment、长度 ≤2048、`assertMCPUrlNotInternal`。
- 每次请求都重新解析并校验（DNS pin 由 safe fetch 保证），禁止跟随重定向。
- 删除 `endpoint_origin_mismatch` 错误与同源判断。

### 5.3 issuer / resource / scope

```ts
export const normalizeIssuer = (issuer: string) => new URL(issuer).toString(); // 仅规范化
export const normalizeMcpResource = (resource: string) => {
  const url = new URL(resource);
  url.hash = '';
  return url.toString().replace(/\/$/, '');
};
```

- issuer 必须**逐字符**相等（规范化后）；不比较前缀、不做大小写放宽。
- `resource` 优先 PRM `resource`；否则规范化 MCP URL；授权/换 token/刷新都带同一个 `resource`。
- scope 语法（RFC 6749 §3.3）：按空格切分，每个 token 匹配 `/^[\x21\x23-\x5B\x5D-\x7E]+$/`，最多 32 个、每个 ≤512 字符。空字符串视为未请求。
- **无全局 allowlist**。UI 可把 AS `scopes_supported` 作为候选展示，但只有用户显式勾选/填写的值才发送。
- AS 返回的 scope 必须是请求 scope 的子集；扩大 → `scope_widened`，不保存新 token。

### 5.4 客户端注册：CIMD → DCR → manual

| 模式 | 前置条件 | 结果 |
|---|---|---|
| `cimd` | AS `client_id_metadata_document_supported === true`；`FE_DOMAIN` 公网可达 | `clientId = ${FE_DOMAIN}${BASE_PATH}/api/core/app/mcpTools/oauth/client-metadata.json`；无 secret |
| `dcr` | AS 有 `registration_endpoint` | RFC 7591 注册；保存 clientId/secret/authMethod；有 RFC 7592 凭据则加密保存 |
| `manual` | 用户提供 clientId/secret/authMethod，或节点已保存 manual client | 直接使用 |

- `auto`：严格按 CIMD → DCR → manual 尝试；前一步“不支持/不可用”才进入下一步。
- 显式 `clientMode`：只尝试该方式；失败即返回错误，不降级。
- 已保存 client 复用：CIMD 幂等；DCR 有 `clientId` 且 issuer/resource 未变则复用；manual 复用已保存值。
- DCR 并发重复注册：未胜出的 client 尽力注销（RFC 7592），失败忽略。
- CIMD 文档端点（公开 GET/HEAD）：
  - Host 必须等于 `FE_DOMAIN`（不再使用 `MCP_OAUTH_CIMD_HOSTS`）；不匹配 404。
  - 支持 `If-None-Match` → 304；`Cache-Control: public, max-age=300, must-revalidate`。
  - 文档：`{client_id, client_name:'FastGPT', redirect_uris:[callback], grant_types:['authorization_code','refresh_token'], response_types:['code'], token_endpoint_auth_method:'none', code_challenge_method:'S256'}`。
  - 路由同样 `csrf: false`、无 Cookie、无限流以外副作用。

### 5.5 PKCE

- 必须 `S256`；verifier 43–128 个 `[A-Za-z0-9-._~]`；challenge = `base64url(sha256(verifier))`。
- AS `code_challenge_methods_supported` 存在且不含 `S256` → `pkce_unsupported`；缺省视为支持。
- 授权与换 token 必须使用同一 verifier；verifier 只存在加密 state 中。

---

## 6. 令牌与刷新

### 6.1 存储

- `oauth.token.secret` = `{ access_token: {secret}, refresh_token?: {secret} }`，写入前 `encryptSecretValue`。
- `expiresAt = now + expires_in*1000`；无 `expires_in` 时为 0（按 401 处理）。
- `scope` 保存 AS 实际授予值；`obtainedAt` 便于诊断。
- `token_type` 非 Bearer → `exchange_failed`。

### 6.2 懒刷新

- 可用条件：`token.access_token` 存在且 `expiresAt === 0 || expiresAt - now > 30s`。
- 过期且存在 refresh token → 刷新；无 refresh token → `reauth_required`。
- 刷新请求：`grant_type=refresh_token`、`refresh_token`、`client_id`、可选 `resource`；不发送 `scope`。
- AS 未返回新 refresh token → 保留旧密文。
- `invalid_grant` → 清空 token + `reauth_required`；`invalid_client` → 清空 token + `client_rejected`；5xx/429/网络 → `refresh_transient`，保留旧 token（若仍未过期可继续用）。

### 6.3 运行时 401（批注 5）

```ts
const shouldFallbackToSSE = (error: unknown): boolean =>
  error instanceof StreamableHTTPError &&
  typeof error.code === 'number' &&
  error.code >= 400 &&
  error.code < 500 &&
  error.code !== 429 &&
  error.code !== 401 &&
  error.code !== 403;
```

- 新增 `McpAuthRequiredError extends Error { code: 401 | 403 }`，在 `doConnect` 与 `toolCall` 捕获 401/403 时抛出，不进入 SSE 回退，不包装成 `UserConfigError`。
- 运行期收到 401：
  1. 强制刷新一次（忽略 30s 余量）；
  2. 用新 token **重建** `MCPClient`（构造签名不变），重试一次；
  3. 仍 401 → `reauth_required`，不循环。
- 403 + `WWW-Authenticate: Bearer error="insufficient_scope"` → `insufficient_scope`，不刷新。
- 运行时不解析 challenge 做发现；发现只在 start 发生。

### 6.4 并发刷新：租约 + `credentialSeq` CAS

三层：

1. **进程内 single-flight**：`Map<`${appId}:${nodeId}:${seq}`, Promise>`；同 key 共享；finally 清理。
2. **Mongo 短租约**（跨实例）：`refreshLease = {owner, expiresAt: now+45s}`。
3. **单调查写回**：filter 同时匹配 `credentialSeq` 与租约 owner；成功 `$inc credentialSeq:1`。

获取租约（注意两个 `$or` 必须放在 `$and` 里，Mongo 不允许重复键）：

```ts
const leaseFilter = {
  _id: version._id,
  appId,
  nodes: {
    $elemMatch: {
      nodeId,
      'toolConfig.mcpToolSet.authMode': 'oauth',
      $and: [
        seqMatch(expectedSeq),
        {
          $or: [
            { 'toolConfig.mcpToolSet.oauth.refreshLease': null },
            { 'toolConfig.mcpToolSet.oauth.refreshLease.expiresAt': { $lte: now } }
          ]
        }
      ]
    }
  }
};

await MongoAppVersion.updateOne(
  leaseFilter,
  { $set: { 'nodes.$[n].toolConfig.mcpToolSet.oauth.refreshLease': { owner, expiresAt: now + 45_000 } } },
  { arrayFilters: [{ 'n.nodeId': nodeId }] }
);
```

未获得租约：每 100ms 重读，最多 1.5s；若已有可用 token 则复用；否则 `refresh_transient`。

写回：

```ts
const result = await MongoAppVersion.updateOne(
  {
    _id: version._id,
    appId,
    nodes: {
      $elemMatch: {
        nodeId,
        'toolConfig.mcpToolSet.authMode': 'oauth',
        $and: [
          seqMatch(expectedSeq),
          { 'toolConfig.mcpToolSet.oauth.refreshLease.owner': owner }
        ]
      }
    }
  },
  {
    $set: {
      'nodes.$[n].toolConfig.mcpToolSet.oauth.token': nextToken,
      'nodes.$[n].toolConfig.mcpToolSet.oauth.lastError': null,
      'nodes.$[n].toolConfig.mcpToolSet.oauth.refreshLease': null,
      'nodes.$[n].toolConfig.mcpToolSet.oauth.authorizedAt': now
    },
    $inc: {
      nodesRevision: 1,
      'nodes.$[n].toolConfig.mcpToolSet.oauth.credentialSeq': 1
    }
  },
  { arrayFilters: [{ 'n.nodeId': nodeId }] }
);
```

未命中：重读节点；`seq > expected` 则使用胜出者 token；`seq === expected` 且租约过期则重新抢租约再刷新一次；否则 `refresh_transient`。

释放自己的租约（仅当 owner 仍是自己）：

```ts
await MongoAppVersion.updateOne(
  { _id, appId, 'nodes': { $elemMatch: { nodeId, 'toolConfig.mcpToolSet.oauth.refreshLease.owner': owner } } },
  { $set: { 'nodes.$[n].toolConfig.mcpToolSet.oauth.refreshLease': null } },
  { arrayFilters: [{ 'n.nodeId': nodeId }] }
);
```

`revokeLease` 同结构，串行化 disconnect/client-reset 与刷新。

### 6.5 崩溃窗口（明确取舍）

删除 rotation journal 后存在一个不可消除窗口：

- AS 已轮换 refresh token，但本进程在写回前崩溃 → 旧 refresh token 已被 AS 作废。
- 下次刷新收到 `invalid_grant` → 清空 token → 用户重新授权。
- 取舍：用“重授权”换取零额外集合、零恢复任务、零后台清理；OAuth 授权是低频人工操作，可接受。
- 禁止的“修复”：用旧 RT 再试、跨实例共享内存、把 token 写日志。

---

## 7. 写入一致性

### 7.1 目标版本文档

```ts
export const getMcpToolSetVersionDoc = async (appId: string) => {
  const app = await MongoApp.findById(appId, 'type publishedVersionId').lean();
  if (!app) throw new McpOAuthError('mcp_oauth_app_missing');
  if (app.type !== AppTypeEnum.mcpToolSet) throw new McpOAuthError('mcp_oauth_not_toolset');

  if (app.publishedVersionId) {
    const version = await MongoAppVersion.findOne({ _id: app.publishedVersionId, appId }).lean();
    if (version) return version;
  }
  const fallback = await MongoAppVersion.findOne({ appId, isPublish: true })
    .sort({ time: -1, _id: -1 })
    .lean();
  if (!fallback) throw new McpOAuthError('mcp_oauth_app_missing');
  return fallback;
};
```

- OAuth 字段写、用户保存、status 都使用同一个解析函数，保证写读一致。
- MCP 工具集没有草稿生命周期；`mcpTools/update.ts` 原地更新已发布版本。
- 读取不缓存版本对象：每次写都重新解析，避免指针变化后写旧文档。

### 7.2 OAuth 字段写：单条 `updateOne`

唯一写入口，禁止调用方自行拼 update：

```ts
export const updateMcpOAuthNodeFields = async ({
  appId,
  nodeId,
  expectedCredentialSeq,
  set,
  unset,
  incrementSeq = false,
  leaseOwner
}: {
  appId: string;
  nodeId: string;
  expectedCredentialSeq: number;
  set?: Record<string, unknown>;   // 键为 oauth 下的相对路径，如 'token'
  unset?: string[];
  incrementSeq?: boolean;
  leaseOwner?: string;
}): Promise<{ matched: boolean }> => {
  const version = await getMcpToolSetVersionDoc(appId);

  const filter = {
    _id: version._id,
    appId,
    nodes: {
      $elemMatch: {
        nodeId,
        'toolConfig.mcpToolSet.authMode': 'oauth',
        $and: [
          seqMatch(expectedCredentialSeq),
          ...(leaseOwner
            ? [{ 'toolConfig.mcpToolSet.oauth.refreshLease.owner': leaseOwner }]
            : [])
        ]
      }
    }
  };

  const prefix = 'nodes.$[n].toolConfig.mcpToolSet.oauth';
  const $set = Object.fromEntries(
    Object.entries(set ?? {}).map(([key, value]) => [`${prefix}.${key}`, value])
  );
  const $unset = Object.fromEntries((unset ?? []).map((key) => [`${prefix}.${key}`, '']));

  const result = await MongoAppVersion.updateOne(
    filter,
    {
      ...(Object.keys($set).length ? { $set } : {}),
      ...(Object.keys($unset).length ? { $unset } : {}),
      $inc: {
        nodesRevision: 1,
        ...(incrementSeq ? { [`${prefix}.credentialSeq`]: 1 } : {})
      }
    },
    { arrayFilters: [{ 'n.nodeId': nodeId }] }
  );

  return { matched: result.matchedCount === 1 };
};
```

调用约定：

| 调用 | set | unset | incrementSeq | 说明 |
|---|---|---|---|---|
| start 写 client/server/issuer/resource/scope | `client, clientMode, clientSource, issuer, resource, scope, server` | — | false | 不清 token |
| callback 写 token | `token, client, lastError:null, authorizedAt, authorizedBy` | — | true | |
| 刷新写 token | `token, lastError:null, authorizedAt` | — | true | 带 `leaseOwner` |
| 刷新失败 | `lastError` | — | false | 带 `leaseOwner`，随后释放租约 |
| disconnect | — | `token, lastError, refreshLease, revokeLease` | true | 带 `revokeLease` owner |
| client-reset | `clientSource:null` | `client, token, server, lastError` | true | |

- 永不写整个 `nodes`，永不重建版本。
- `nodesRevision` 只 `$inc`，缺失时 Mongo 自动建为 1；读取 `?? 0`。
- 不写 `MongoApp.updateTime`（与用户保存区分）。

### 7.3 用户保存（`mcpTools/update.ts`）

请求体新增可选 `authMode`、`clientMode`、`scope`；未传时保留节点现值。流程：

1. 读取版本与唯一节点（§7.1），记录 `expectedCredentialSeq`。
2. 复用旧 `nodeId`（`getMCPToolSetRuntimeNode` 支持传入 `nodeId`）。
3. 合并 `oauth`：

| 场景 | 合并结果 | seq |
|---|---|---|
| URL 未变 + `authMode=oauth` | 保留 server/client/token/authorizedAt/By；更新 clientMode/scope | 不变 |
| URL 变更 + `authMode=oauth` | 清 token/server/lastError/leases；保留 client（issuer 变化则清）；保留 clientMode/scope | +1 |
| 切到 `headers` | 清 token/clientSecret/registrationAccessToken/leases/lastError；保留 clientId/issuer/resource/server/clientMode/scope | +1 |
| 首次启用 oauth | `{schemaVersion:1, clientMode, scope?, credentialSeq:0}` | 0 |
| 保存不传 authMode | 保持节点现值 | 不变 |

4. `headerSecret` 按现有逻辑 `storeSecretValue`；`oauth.client.clientSecret`、`registrationAccessToken` 已是密文，不重复加密。
5. 以 `nodeFence = {nodeId, credentialSeq: expectedSeq}` 调用扩展后的 `updateAppPublishedVersion`：

```ts
export const updateAppPublishedVersion = async ({
  appId, nodes, resources, session, nodeFence
}: {
  appId: string;
  nodes: AppVersionSchemaType['nodes'];
  resources: AppResourcesType;
  session: ClientSession;
  nodeFence?: { nodeId: string; credentialSeq: number };
}) => {
  // ...原逻辑
  const versionUpdateResult = await MongoAppVersion.updateOne(
    {
      _id: version._id,
      appId,
      ...(nodeFence
        ? {
            nodes: {
              $elemMatch: {
                nodeId: nodeFence.nodeId,
                'toolConfig.mcpToolSet.authMode': 'oauth',
                ...seqMatch(nodeFence.credentialSeq)
              }
            }
          }
        : {})
    },
    { $set: { nodes, resources }, $inc: { nodesRevision: 1 } },
    { session }
  );
  // matchedCount !== 1 -> MongoTransactionConflictError
};
```

6. 冲突（刷新抢先写 token）→ 重读、重新合并、重试最多 3 次；仍失败 → `mcp_oauth_conflict`。
7. `beforeUpdateAppFormat` 与 `encodeMcpToolSetNodesForStorage` 保持现有调用顺序。

### 7.4 detail 脱敏（批注 1）

`packages/service/core/app/utils.ts` 的 `clearToolCredentials` 增加：

```ts
const stripMcpOAuthSecrets = (toolSet: Record<string, unknown>) => {
  const oauth = toolSet.oauth;
  if (!isRecord(oauth)) return;
  delete oauth.token;
  delete oauth.refreshLease;
  delete oauth.revokeLease;
  if (isRecord(oauth.client)) {
    delete oauth.client.clientSecret;
    delete oauth.client.registrationAccessToken;
  }
};
```

调用点：`clearToolCredentials` 的 `mcpToolSet` 分支，在 `sanitizedToolSet` 上执行。

保留：`authMode`、`issuer`、`resource`、`scope`、`server`、`client.clientId/source`、`credentialSeq`、`authorizedAt/By`、`lastError`。

`GetAppDetailResponseSchema` 不新增字段；状态一律走 `oauth/status`。前端不得从 detail 的 `oauth.token` 判断授权状态（那里永远没有 token）。

### 7.5 复制与删除

- 复制（`copy.ts`）：工具集分支在 `encodeMcpToolSetNodesForStorage` 前对每个节点执行 `delete toolConfig.mcpToolSet.oauth`（保留 `authMode`）。复制后必须重新授权。
- 删除（`delete.ts`）：删除前 best-effort 调用 `revokeMcpOAuthToken({appId, teamId, timeoutMs:3000})`；读取节点 token → RFC 7009 撤销；失败只记日志。
- 导出/导入：`PersistedOpenAPIStoreNodeItemTypeSchema` 只接受摘要，无需额外清洗；不得为导出放开 RuntimeConfig。

---

## 8. API

### 8.1 路由总表

| 路由 | 方法 | 鉴权 | CSRF | 限流 | 说明 |
|---|---|---|---|---|---|
| `/api/core/app/mcpTools/create` | POST | 创建权限 | 默认 | — | 支持 `authMode=oauth`、空 `toolList` |
| `/api/core/app/mcpTools/update` | PUT | Manage | 默认 | — | 保存 + oauth 合并 (§7.3) |
| `/api/core/app/mcpTools/getTools` | POST | Read | 默认 | — | 支持 `appId/nodeId` |
| `/api/core/app/mcpTools/runTool` | POST | Read | 默认 | — | 支持 `appId/nodeId` |
| `/api/core/app/mcpTools/oauth/start` | POST | Manage | 默认 | start-app/user | §4.4 |
| `/api/core/app/mcpTools/oauth/callback` | GET | state + tmbId | **false** | callback-ip/app | §4.5 |
| `/api/core/app/mcpTools/oauth/status` | GET | Read | 默认 | — | §8.3 |
| `/api/core/app/mcpTools/oauth/disconnect` | POST | Manage | 默认 | disconnect-app | §8.4 |
| `/api/core/app/mcpTools/oauth/client/reset` | POST | Manage | 默认 | client-reset-app | §8.4 |
| `/api/core/app/mcpTools/oauth/client-metadata.json` | GET/HEAD | 公开 | **false** | metadata-ip | CIMD |

### 8.2 请求/响应 schema

```ts
// packages/global/openapi/core/app/mcpTools/oauth.ts
export const McpOAuthStartBodySchema = z.object({
  appId: ObjectIdSchema,
  nodeId: z.string().min(1).max(64).optional(),
  clientMode: z.enum(['auto', 'cimd', 'dcr', 'manual']).default('auto'),
  scope: z.string().max(1024).optional(),
  manualClient: z.object({
    clientId: z.string().min(1).max(2048),
    clientSecret: z.string().min(1).max(4096).optional(),
    tokenEndpointAuthMethod: z.enum(['none', 'client_secret_post', 'client_secret_basic'])
      .default('client_secret_basic')
  }).optional()
});
```

- **不再有** `mode`/`oauthMode`/`oauthScope`。
- `clientMode` 显式包含 `manual`（批注 6）。
- `manualClient` 只允许 `clientMode=manual` 或 `auto` 的最后一步使用。

`CreateMcpToolsBodySchema` 扩展：

```ts
.extend({
  authMode: z.enum(['headers', 'oauth']).default('headers'),
  clientMode: z.enum(['auto', 'cimd', 'dcr', 'manual']).optional(),
  scope: z.string().max(1024).optional(),
  toolList: z.array(McpToolConfigSchema).default([])   // 允许空
})
```

`UpdateMcpToolsBodySchema` 扩展：`authMode?`、`clientMode?`、`scope?`。

`GetMcpToolsBodySchema` / `RunMcpToolBodySchema` 扩展：

```ts
{
  appId: ObjectIdSchema.optional(),
  nodeId: z.string().min(1).max(64).optional(),
  url: z.string().optional(),          // appId 存在时可选
  headerSecret: StoreSecretValueTypeApiInputSchema.optional()
}
```

分支规则：

- `appId` 存在：`authApp(ReadPermission)` → 校验类型 → 解析节点 → `authMode=oauth` 用 `resolveMcpToolSetHeaders`（可能刷新）；401 刷新后重试一次。
- `appId` 不存在：保持现有 `url + headerSecret` 行为。

`status` 响应：

```ts
export const McpOAuthStatusResponseSchema = z.object({
  schemaVersion: z.literal(1),
  state: z.enum([
    'headers', 'config_error', 'client_missing', 'pending_authorization',
    'authorized', 'refresh_due', 'refreshing', 'reauth_required'
  ]),
  authMode: z.enum(['headers', 'oauth']),
  clientMode: z.enum(['auto', 'cimd', 'dcr', 'manual']),
  clientSource: z.enum(['cimd', 'dcr', 'manual']).nullable(),
  issuer: z.string().nullable(),
  resource: z.string().nullable(),
  scope: z.string().nullable(),          // 已授予
  requestedScope: z.string().nullable(),
  authorized: z.boolean(),
  hasAccessToken: z.boolean(),
  hasRefreshToken: z.boolean(),
  hasClientSecret: z.boolean(),
  expiresAt: z.number().nullable(),
  refreshDueAt: z.number().nullable(),
  authorizedAt: z.number().nullable(),
  authorizedBy: z.string().nullable(),
  lastError: z.object({
    code: z.string(), message: z.string().max(256), retryable: z.boolean(),
    at: z.number(), nextRetryAt: z.number().optional()
  }).nullable(),
  canStart: z.boolean(),
  canDisconnect: z.boolean(),
  canResetClient: z.boolean(),
  updatedAt: z.number()
});
```

状态派生优先级（自上而下，命中即停）：

| 状态 | 条件 |
|---|---|
| `headers` | `authMode === 'headers'` |
| `config_error` | `schemaVersion !== 1`，或缺 issuer/server 且无法开始 |
| `pending_authorization` | 存在未消费且未过期的 state 行 |
| `refreshing` | `refreshLease.expiresAt > now` |
| `authorized` | access token 可用 |
| `refresh_due` | token 存在且 `expiresAt - now <= 30s`，且有 refresh token |
| `reauth_required` | 无 token，或 `lastError` 不可重试 |
| `client_missing` | 有 url 但无 client（manual 未填写 / 注册未完成） |

`disconnect` / `client/reset` 请求体均为 `{appId, nodeId, confirm: true}`；响应固定：

```ts
{ schemaVersion: 1, disconnected: boolean, revoked: boolean, revokeError: string | null }
{ schemaVersion: 1, reset: boolean, deregistered: boolean }
```

### 8.3 错误码

OAuth 路由统一由 `createMcpOAuthApiHandler` 捕获 `McpOAuthApiError`，直接输出：

```json
{ "code": 409, "statusText": "error", "message": "<i18n 文案>",
  "data": { "oauthCode": "mcp_oauth_conflict", "requestId": "…", "retryable": false, "retryAfterMs": null } }
```

| oauthCode | HTTP | 可重试 | 场景 |
|---|---|---|---|
| `mcp_oauth_disabled` | 403 | 否 | 开关关闭 |
| `mcp_oauth_not_toolset` | 400 | 否 | 非工具集 App |
| `mcp_oauth_app_missing` | 404 | 否 | App/版本不存在 |
| `mcp_oauth_node_not_found` | 400 | 否 | 无 toolSet 节点 |
| `mcp_oauth_node_ambiguous` | 400 | 否 | 多个 toolSet 节点 |
| `mcp_oauth_node_too_large` | 413 | 否 | oauth > 16KB |
| `mcp_oauth_not_oauth_mode` | 400 | 否 | `authMode=headers` |
| `mcp_oauth_url_mismatch` | 400 | 否 | URL 缺失或与 state 不一致 |
| `mcp_oauth_state_missing` | 400 | 否 | 回调缺 state |
| `mcp_oauth_state_invalid` | 400 | 否 | 解密/格式失败 |
| `mcp_oauth_state_expired` | 400 | 否 | 超过 10 分钟 |
| `mcp_oauth_state_replayed` | 409 | 否 | 已消费 |
| `mcp_oauth_state_cookie_missing` | 400 | 否 | 无绑定 Cookie |
| `mcp_oauth_state_binding_mismatch` | 400 | 否 | Cookie 不匹配 |
| `mcp_oauth_state_context_changed` | 409 | 否 | 节点/URL/client 改变 |
| `mcp_oauth_state_storage_failed` | 503 | 是 | 台账写失败 |
| `mcp_oauth_discovery_failed` | 502 | 是 | 探活/元数据失败 |
| `mcp_oauth_prm_resource_mismatch` | 400 | 否 | PRM resource 不符 |
| `mcp_oauth_issuer_mismatch` | 400 | 否 | AS issuer 不符 |
| `mcp_oauth_issuer_changed` | 409 | 否 | 与已保存 issuer 不同 |
| `mcp_oauth_endpoint_insecure` | 400 | 否 | 非 https（开发开关除外） |
| `mcp_oauth_private_url` | 400 | 否 | 命中内网地址 |
| `mcp_oauth_proxy_forbidden` | 400 | 否 | 配置了代理 |
| `mcp_oauth_response_too_large` | 502 | 否 | 响应 > 64KB |
| `mcp_oauth_unsupported_flow` | 400 | 否 | 不支持 code/PKCE/header |
| `mcp_oauth_cimd_unsupported` | 400 | 否 | AS 不支持 CIMD |
| `mcp_oauth_cimd_unavailable` | 502 | 是 | 元数据端点不可达 |
| `mcp_oauth_registration_unsupported` | 400 | 否 | 无注册端点 |
| `mcp_oauth_registration_rejected` | 400 | 否 | 注册 4xx |
| `mcp_oauth_registration_failed` | 502 | 是 | 注册 5xx/网络 |
| `mcp_oauth_client_missing` | 400 | 否 | 无可用 client |
| `mcp_oauth_client_required` | 400 | 否 | manual 缺 secret |
| `mcp_oauth_client_rejected` | 401 | 否 | `invalid_client` |
| `mcp_oauth_pkce_unsupported` | 400 | 否 | 不支持 S256 |
| `mcp_oauth_scope_invalid` | 400 | 否 | scope 语法非法 |
| `mcp_oauth_scope_widened` | 400 | 否 | AS 扩权 |
| `mcp_oauth_access_denied` | 400 | 否 | 用户拒绝/AS error |
| `mcp_oauth_exchange_failed` | 502 | 是 | 换 token 失败 |
| `mcp_oauth_token_persist_failed` | 503 | 是 | 写回失败 |
| `mcp_oauth_reauth_required` | 401 | 否 | 需重新授权 |
| `mcp_oauth_insufficient_scope` | 403 | 否 | 403 + insufficient_scope |
| `mcp_oauth_refresh_transient` | 503 | 是 | 刷新临时失败 |
| `mcp_oauth_client_reset_failed` | 502 | 是 | 注销失败 |
| `mcp_oauth_conflict` | 409 | 是 | seq/CAS 冲突 |
| `mcp_oauth_rate_limited` | 429 | 是 | 限流 |
| `mcp_oauth_internal_error` | 500 | 是 | 兜底 |

删除：`rollback_blocked`、`scope_not_allowed`、`scope_not_configured`、`scope_escalation`、`schema_unmigrated`、`endpoint_origin_mismatch`、`prm_origin_mismatch`、`version_conflict`、`credential_superseded`、`state_inconsistent`、`runtime_forbidden`、`runtime_unavailable`。

### 8.4 disconnect / client-reset / create

- disconnect：幂等。无 token → `{disconnected:true, revoked:false}` 且不递增 seq。有 token → 清空本地（seq+1）→ 尽力撤销 → 返回 `revoked/revokeError`。
- client-reset：清空 client/token/server（seq+1）；若保存了 RFC 7592 凭据则尽力注销；幂等。
- create：`authMode=oauth` 时构造 `oauth:{schemaVersion:1, clientMode: clientMode??'auto', scope?, credentialSeq:0}`，`toolList` 可为空；`headerSecret` 可省略。创建后不自动 start，由编辑页触发。

---

## 9. 前端

### 9.1 显示范围

- **仅** `appDetail.type === AppTypeEnum.mcpToolSet` 的编辑页显示 OAuth 配置。
- 工作流内联 `NodeToolSet` 不显示任何 OAuth 入口，继续只用 `HeaderAuthConfig`。
- 详情页从 `oauth/status` 取状态，不从 detail 节点取。

### 9.2 交互

| 动作 | 行为 |
|---|---|
| 切换 `authMode` | 本地状态；保存后生效 |
| 点击“连接” | 先 `postUpdateMCPTools` 保存 url/headerSecret/authMode/clientMode/scope；成功后 `start`；`window.location.href = authorizationUrl` |
| 回调返回 `oauth=success` | 移除 query 参数；调 `getTools({appId,nodeId})`；成功后 `postUpdateMCPTools` 落库 toolList；刷新 status |
| 回调返回 `oauth=error&code=` | 展示错误码文案；不自动重试 |
| 断开 | 二次确认 → `oauth/disconnect` → 刷新 status |
| 重置 client | 二次确认 → `oauth/client/reset` → 刷新 status |
| manual 模式 | 展示 clientId/clientSecret/authMethod 表单；secret 只提交给后端，前端不回显 |

### 9.3 轮询

- 进入页面/回调后立即查一次 status。
- 仅当 `state ∈ {pending_authorization, refreshing}` 时每 2000ms 轮询。
- 最长 5 分钟；到 `authorized`、`reauth_required`、`config_error` 或组件卸载即停止。
- 轮询请求不得并发叠加（in-flight 去重）。

### 9.4 i18n

只新增实际使用的 key：连接/断开/重置、8 个状态、约 40 个错误码文案、manual 表单标签。四个 locale（`en/zh-CN/zh-Hant/ko-KR`）必须同时补齐；不新增 `system_migration.json` key。

---

## 10. 兼容与灰度

### 10.1 headers 零影响

- `authMode` 缺省 `headers`，解析后运行时路径与上游完全一致。
- 不读 `oauth`、不触发网络发现、不写额外字段。
- 内联节点、旧工作流、旧版本解析行为不变。

### 10.2 开关（批注 7）

```ts
MCP_OAUTH_ENABLED: BoolSchema.default(false).meta({ description: '启用 MCP OAuth API 与前端入口' }),
MCP_OAUTH_RUNTIME_ENABLED: BoolSchema.default(false).meta({ description: '运行时允许使用 OAuth 令牌' }),
MCP_OAUTH_ALLOW_INSECURE_HTTP: BoolSchema.default(false).meta({ description: '仅开发环境允许 http' })
```

| 开关 | 关闭时行为 |
|---|---|
| `MCP_OAUTH_ENABLED=false` | 所有 `/oauth/*` 返回 404 或 `mcp_oauth_disabled`；前端不显示入口；保存仍可保留已有 `oauth` 配置 |
| `MCP_OAUTH_RUNTIME_ENABLED=false` | `authMode=oauth` 的节点运行时直接 `mcp_oauth_disabled`，**不回退 headers**；管理员要回退需把节点切回 `headers` |

### 10.3 无迁移、无别名

- 不注册任何 `projects/app/src/migration` 任务。
- 不读取 `mode/oauthMode/oauthScope`；出现这些键按未知字段处理（RuntimeConfig 未声明 → strict 失败，故升级前必须没有任何存量数据）。
- 旧应用（`authMode` 缺省）无需任何操作。

---

## 11. 安全

### 11.1 出站请求

- 所有 OAuth 请求（发现、PRM、AS、token、revoke、注册、CIMD 拉取）使用 `createMcpSafeFetch` 或同等的 `redirect:'manual'` + DNS pin 实现。
- 配置了 HTTP(S) 代理则直接拒绝（`proxy_forbidden`）：代理会二次解析域名，进程内 DNS pin 失效。
- 重定向一律不跟随（发现/令牌端点均返回 `endpoint_redirect` → `discovery_failed`）；MCP 工具请求沿用上游最多 5 跳且逐跳校验。
- 每跳都执行 `assertMCPUrlNotInternal`；AS 端点允许跨源但**每个端点**单独校验。
- 响应体上限 64KB；超时 10s；错误体截断 4KB 后再脱敏。
- 仅 https；`MCP_OAUTH_ALLOW_INSECURE_HTTP` 只允许 loopback/测试域名，生产启动时若为 true 打 warn。

### 11.2 流程

- PKCE S256 强制；state 一次性和 Cookie 绑定；回调二次鉴权（`authAppByTmbId`）。
- `issuer` 精确匹配；`resource` 规范化匹配；scope 不得扩大。
- `redirect_uri` 服务端固定；回调跳转白名单为固定详情页。
- client secret / token / registration token 全部 `SecretValueType` 加密。
- CIMD Host 只认 `FE_DOMAIN`；CIMD 文档不含秘密。

### 11.3 日志与错误

- 禁止记录：`Authorization`、token/secret、`state`、`code_verifier`、Cookie、完整 URL query。
- 允许记录：`appId`、`nodeId`、`tmbId`、`clientSource`、`issuer` 的 host、错误码、requestId、耗时。
- 错误响应不透传 AS 原文；`message` 来自固定 i18n 表，`data` 只含 `oauthCode/requestId/retryable/retryAfterMs`。
- `lastError` 只存错误码与时间，不存 AS 描述。

### 11.4 限流与滥用

- 见 §3.3；start 5/min/app + 20/min/user；callback 30/min/IP + 60/min/app。
- DCR 注册只在 `start` 内发生，受 start 限流约束；重复注册尝试复用已保存 client。
- state 台账 24h 后 TTL 清理；查询始终显式比较 `expiresAt`。

### 11.5 权限

- start/disconnect/reset 需 `ManagePermissionVal`；status/getTools/runTool 需 `ReadPermissionVal`；callback 以 state 中的 `tmbId` 做 `ManagePermissionVal` 二次鉴权。
- 团队不一致 → 拒绝。
- 跨团队复制不带凭据。

### 11.6 可观测性

仅保留必要日志与三个计数器（进程内/可选 OTel）：`oauth_start_total{result}`、`oauth_callback_total{result,code}`、`oauth_refresh_total{result}`。不引入新指标后端。

---

## 12. 测试计划

### 12.1 单元/契约（packages/global）

| 文件 | 覆盖 |
|---|---|
| `test/core/app/tool/mcpTool/oauthSchema.test.ts`（新增） | 字段默认值、`schemaVersion` fail closed、无 `mode` 键、scope 校验 |
| `test/core/app/tool/mcpTool/schemaIsolation.test.ts`（新增） | RuntimeConfig 接受 `authMode/oauth`；NodeConfig `.strict()` 拒绝；`LegacyMcpToolSetRuntimeConfigSchema` 接受 |
| `test/core/workflow/type/node.test.ts`（保留） | 现有断言不回归 |

### 12.2 服务层（packages/service）

| 文件 | 处置 | 覆盖 |
|---|---|---|
| `test/core/app/mcp.test.ts` | 修改 | 401/403 不回退 SSE；404/405 回退；429 不回退；`McpAuthRequiredError` |
| `test/core/app/mcpOAuth/discovery.test.ts` | 新增 | initialize POST 探活、challenge、PRM 404 → 根 AS、跨源端点、重定向拒绝、SSRF |
| `.../cimd.test.ts` | 新增 | 文档生成、Host 校验、304、去 allowlist |
| `.../dcr.test.ts` | 新增 | 注册、auth method、复用、注销 |
| `.../pkceScope.test.ts` | 新增 | S256、字符集、32 token 上限、扩权拒绝 |
| `.../state.test.ts` | 新增 | 加密/解密、一次性消费、过期、Cookie 绑定 |
| `.../token.test.ts` | 新增 | 换取、刷新、RT 轮换保留、错误映射 |
| `.../refresh.test.ts` | 新增 | 30s 余量、single-flight、租约、seq CAS、401 单次重试 |
| `.../credential.test.ts` | 新增 | seq=0 缺省匹配、单条 updateOne、$inc nodesRevision |
| `.../status.test.ts` | 新增 | 8 态派生 |
| `.../sanitize.test.ts` | 新增 | detail strip 不残留 token/secret |
| `.../errors.test.ts` | 新增 | 错误码 → HTTP/retryable |
| `test/core/app/version/controller.test.ts` | 修改 | `nodeFence` 过滤、保存冲突重试 |
| `test/core/workflow/dispatch/tools/runTool.test.ts` | 修改 | oauth 注入、401 刷新重试一次、insufficient_scope |
| `test/core/workflow/dispatch/ai/agent/sub/tool/index.test.ts` | 修改 | 同上 |

### 12.3 API（projects/app）

| 文件 | 覆盖 |
|---|---|
| `test/api/core/app/mcpTools/oauth/start.test.ts` | manual、auto 顺序、issuer 变更、限流 |
| `.../callback.test.ts` | 重放、Cookie、二次鉴权、扩权、CSRF 豁免 |
| `.../status.test.ts` | 投影、pending |
| `.../disconnect.test.ts` | 幂等、撤销失败不阻塞 |
| `.../clientReset.test.ts` | 幂等、注销 |
| `.../clientMetadata.test.ts` | Host/304/404 |
| `test/api/core/app/mcpTools/createOauth.test.ts` | `authMode=oauth` + 空 toolList |
| `test/api/core/app/mcpTools/getToolsOauth.test.ts` | appId 分支、401 刷新 |
| `test/api/core/app/toolSet/update.test.ts` | 合并保留、URL 变更清 token、切 headers |
| `test/api/core/app/detail.test.ts` | detail 无 token/clientSecret |
| `test/api/core/app/copy.test.ts` | 复制不带 oauth |
| `test/api/core/app/delete.test.ts` | 删除前撤销（best effort） |

### 12.4 E2E

`test/fixtures/mcpOAuth/server.mjs` 覆盖：无鉴权、headers、401+PRM、401 无 PRM、PRM 404 根 AS、CIMD、DCR、manual、401 后刷新。`test/e2e/mcpOAuth/runRealStack.sh` 串起：创建 → 连接 → 回调 → 自动拉工具 → 调用 → 断开 → 撤销。

### 12.5 删除的旧测试

`rollbackCapability`、`rollbackDrill`、`refreshConcurrency`、`refreshRateLimit`、`stateLedger.integration`、`oauthConcurrency`、`oauthWriteContract`（旧 nodesRevision 语义）、全部 `test/migration/tasks/4180/20261111_mcp_oauth_*`、`test/scripts/mcpOAuth/refsLock`。

### 12.6 命令

```bash
# global
cd packages/global && npx vitest run -c vitest.config.ts \
  test/core/app/tool/mcpTool test/core/workflow/type/node.test.ts
# service
cd packages/service && npx vitest run -c vitest.config.ts \
  test/core/app/mcp.test.ts test/core/app/mcpOAuth \
  test/core/app/version/controller.test.ts \
  test/core/workflow/dispatch/tools/runTool.test.ts \
  test/core/workflow/dispatch/ai/agent/sub/tool/index.test.ts
# app
cd projects/app && npx vitest run -c vitest.config.ts \
  test/api/core/app/mcpTools test/api/core/app/toolSet/update.test.ts \
  test/api/core/app/detail.test.ts test/api/core/app/copy.test.ts \
  test/api/core/app/delete.test.ts
```

---

## 13. 交付阶段

| 阶段 | 内容 | 验收 |
|---|---|---|
| I2 | global schema/enum/API schema、env、限流 interface、state 集合、errors、护栏测试 | `packages/global` 目标测试通过；NodeConfig strict 拒绝测试绿 |
| I3 | discovery/cimd/dcr/pkceScope/token/state/refresh/credential/headers/status + oauth 路由 | service `mcpOAuth` + app `oauth/*` 测试通过 |
| I4 | `mcp.ts` 401 修复、runTool/agent 注入、update 合并、detail 脱敏、copy/delete | service 运行时 + app update/detail/copy/delete 测试通过 |
| I5 | 前端、i18n、e2e stub/真实栈 | `projects/app` 目标测试 + E2E 清单全绿 |

---

## 14. 风险与未决

| # | 风险 | 缓解 |
|---|---|---|
| R1 | 内联节点误加 `oauth` 导致整个工作流 500 | 护栏测试；code review 检查 NodeConfig 未变 |
| R2 | 版本指针与编辑器读取文档不一致（历史/导入应用） | OAuth 读写统一走 `getMcpToolSetVersionDoc`；status 报 `node_not_found`，保存一次即修复 |
| R3 | AS 跨源端点被滥用为 SSRF | 每端点 https + `assertMCPUrlNotInternal` + DNS pin + 不跟随重定向 |
| R4 | 刷新轮换崩溃窗口导致需重新授权 | 明示取舍；`invalid_grant` → 清 token → reauth |
| R5 | 保存与刷新并发覆盖 token | `nodeFence` seq CAS + 重试 3 次；失败提示重试 |
| R6 | CIMD 在反代域名下不可用 | 只认 `FE_DOMAIN`；不可用时 auto 落到 DCR/manual |
| R7 | `runTool` 权限选择 | 采用 `ReadPermissionVal`（与旧实现一致）；若产品要求写权限，仅改一处常量 |

---

## 15. 参考

- MCP Authorization (2025-06-18)、RFC 9728、RFC 8414、RFC 7591、RFC 7592、RFC 8707、RFC 6749 §3.3、RFC 7009、RFC 7636。
- 上游代码位置见 §1.4。

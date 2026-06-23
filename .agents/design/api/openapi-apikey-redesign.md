# OpenAPI APIKey 管理重新设计方案

## 背景

当前 OpenAPI APIKey 同时存在团队级 key 和带 `appId` 绑定的旧 key：

- `openapi` 集合通过 `appId` 是否存在区分 key 类型。
- `authOpenApiKey` 通过 `authApiKey` / `authAppApiKey` 判断当前接口是否允许不同来源的 key。
- 部分应用对话接口会从 APIKey 记录里的 `appId` 推导应用上下文。
- 应用发布页按 `appId` 创建和列出 key，拥有应用管理权限的人可以看到该应用下所有 key。

这使 APIKey 身份凭证和业务资源上下文耦合在一起。新方案将 APIKey 统一为团队成员身份凭证；应用上下文由 handler 显式传入，只有 v1/v2 completions 为兼容 OpenAI SDK 保留 appId 兜底来源。

## 已确认决策

1. 新创建的 APIKey 只作为系统 key，不再绑定 `appId`。
2. 旧应用 key 按系统 key 处理，只是多了一个 deprecated 的内置默认 `appId`。
3. `authAppApiKey` 完全移除，只保留 `authApiKey`。
4. `authAppByApiKeyTeam` 删除，所有应用资源回到现有 `tmbId` 权限链路。
5. 除 `/api/v1/chat/completions` 和 `/api/v2/chat/completions` 外，所有需要应用上下文的开放接口必须显式传 `appId`。
6. v1/v2 completions 正式推荐 `body.appId`；`apiKey-appId` 只作为 OpenAI SDK 兼容格式。
7. appId 解析优先级固定为 `handlerAppId > parsedAppId > legacyAppId`。
8. APIKey 管理页只展示登录成员本人创建的 key，不因 team owner、app owner 或管理权限扩大读取范围。
9. 旧 `openapi.appId` 不做批量迁移，字段标记 deprecated。
10. 删除应用时不删除 APIKey，只 unset 匹配旧记录上的 `appId` 字段。

## 目标模型

### APIKey 语义

APIKey 只表示“某个团队成员的开放接口调用凭证”。鉴权成功后只提供：

- `teamId`
- `tmbId`
- 真实 `apikey`
- 限额状态
- `authProxy` 配置
- 兼容字段 `legacyAppId` / `parsedAppId`

后续资源鉴权沿用现有 token 路径的 `tmbId` 权限链路，不新增 APIKey 专属权限模型。

### appId 语义

`appId` 表示本次请求操作哪个应用，由 handler 在 API 边界解析后显式传给鉴权服务。

- 非 completions 接口：schema 中 `appId` 必填，handler 必须传入。
- v1/v2 completions：schema 允许 `body.appId` 为空，handler 仍把解析结果传入；为空时鉴权服务再按兼容来源兜底。
- auth service 不主动读取 `req.body`、`req.query` 或 `req.params` 中的 `appId`，也不关心具体路由。

## APIKey CRUD 规则

### 创建

`POST /api/support/openapi/create`

- 入参不再接收 `appId`。
- 创建记录固定不写入 `appId`。
- 创建权限使用 `TeamApikeyCreatePermissionVal`。
- `authProxy` 仅团队 owner 可开启。
- 数量限制按 `tmbId` 统计。
- 旧客户端继续传 `appId` 时忽略该字段并创建系统 key；OpenAPI 文档标记该字段废弃或移除。

### 列表

`GET /api/support/openapi/list`

- 入参不再需要 `appId`。
- 返回当前登录 `tmbId` 创建的 key。
- `canCopy` 对返回列表恒为 `true`。
- 旧客户端继续传 `appId` 时忽略该字段并返回本人系统 key；OpenAPI 文档标记该字段废弃或移除。

### 更新、复制、删除

`PUT /api/support/openapi/update`

- 只能操作 `openapi.tmbId === 当前登录 tmbId` 的 key。
- team owner 不拥有跨成员编辑 APIKey 的特权。
- `authProxy` 开关仍要求当前登录成员是 team owner。

`POST /api/support/openapi/copy`

- 只能复制本人 key。
- 返回真实 key 明文，不返回 `apiKey-appId` 拼接值。
- 应用发布页需要兼容格式时，由前端用真实 key 和当前应用 `appId` 拼接。

`DELETE /api/support/openapi/delete`

- 只能删除本人 key。

### 健康检查

`GET /api/support/openapi/health`

- 校验真实 APIKey 是否存在和可用。
- 如果凭证末尾符合 `-<24位ObjectId>`，先拆出真实 key 和 `parsedAppId`，再用真实 key 查库。
- 旧 DB 绑定 `appId` 的 key 继续返回 deprecated 的 `legacyAppId`。

## 鉴权设计

### 参数收敛

保留：

- `authApiKey`

移除：

- `authAppApiKey`

所有历史 `authAppApiKey: true` 调用点改为 `authApiKey: true`，并由 handler 显式传入 `appId`。

### authOpenApiKey 职责

`authOpenApiKey` 只负责：

1. 校验真实 APIKey 存在。
2. 校验限额。
3. 更新 lastUsedTime。
4. 返回调用者身份和兼容字段。

返回建议：

```ts
{
  apikey: string;              // 真实 APIKey，不包含 -appId 后缀
  teamId: string;
  tmbId: string;
  legacyAppId: string;         // 旧 DB appId，仅用于 completions 兜底
  authProxy: boolean;
  sourceName: string;
  parsedAppId?: string;        // 从 Bearer apiKey-appId 解析出来的 appId
}
```

不再返回或依赖：

- `keyType: 'team' | 'app'`
- `appId` 作为常规鉴权结果

### Authorization 解析

为兼容 `Bearer apiKey-appId`，统一封装凭证解析：

```ts
resolveOpenApiCredential(authorization)
```

解析策略：

1. 从 `Authorization: Bearer xxx` 取出 `rawCredential`。
2. 如果 `rawCredential` 命中 `^(.+)-([a-fA-F0-9]{24})$`，拆为真实 `apiKey` 和 `parsedAppId`。
3. 如果不命中兼容格式，`rawCredential` 本身就是真实 `apiKey`，`parsedAppId` 为空。
4. 用真实 `apiKey` 查询记录。
5. 真实 key 不存在则拒绝。

`apiKey-appId` 是传输层兼容格式，不会入库，因此命中兼容格式时不需要再用完整 `rawCredential` 查库。

### appId 解析优先级

对 v1/v2 completions，兼容期存在 3 个 appId 来源：

1. `handlerAppId`：handler 传入的 appId；对 completions 来自 `body.appId`。
2. `parsedAppId`：从 `Authorization: Bearer apiKey-appId` 解析。
3. `legacyAppId`：旧 DB 记录 `openapi.appId`。

固定优先级：

```text
handlerAppId > parsedAppId > legacyAppId
```

规则：

- 按固定优先级选择第一个存在的 appId。
- 高优先级来源存在时，不因低优先级来源不一致而报冲突。
- 被选中的 appId 格式非法、应用不存在或不属于 key 的 team 时，直接拒绝，不 fallback 到低优先级来源。
- 旧应用 key 按系统 key 处理，只是多了 `legacyAppId` 兜底值；显式传入其他 appId 时仍按 key 所属 `tmbId` 校验权限。

## 应用权限模型

APIKey 鉴权本质上只拿到 key 记录上的 `teamId`、`tmbId` 和限额状态。后续资源鉴权沿用现有 token 路径的 `tmbId` 权限链路。

需要删除旧兼容捷径：

- 删除 `authAppByApiKeyTeam` helper。
- 删除所有 `authAppByApiKeyTeam` 引用。
- 旧应用 key 不再触发“只校验同 team”的路径。
- 应用、知识库、会话、文件等资源继续按现有权限函数校验 `tmbId`。

## authProxy 语义

团队 owner 创建的系统 APIKey 可以开启 `authProxy`。该选项只影响 v1/v2 completions 中解析出的实际调用成员，不改变真实 APIKey 的校验、限额和开关判断。

- `authProxy` 只能由 team owner 在本人系统 key 上开启或关闭。
- 旧应用 key 不能使用 `authProxy`。
- APIKey 鉴权只负责确认真实 key 可用、key 所属 team、key 所属 `tmbId`、限额状态和是否允许 `authProxy`。
- completions 阶段允许通过 `authProxy.username` 或 `authProxy.tmbId` 把 effective `tmbId` 切换为同 team 的另一个成员。
- 后续应用和会话资源鉴权必须使用 effective `tmbId` 继续走 `authApp`、`authChat` 等现有权限链路。
- `authProxy` 不能绕过 app/chat 权限；代理成员无权访问目标应用或目标会话时必须拒绝。
- 代理后的 `tmbId` 用于应用鉴权、会话鉴权、对话归属、运行用户信息、用量来源等运行上下文。
- 代理成员必须属于同 team 且未离开 team。
- `authProxy.username` 和 `authProxy.tmbId` 同时传入时必须指向同一个成员。

## completions 规则

覆盖接口：

- `POST /api/v1/chat/completions`
- `POST /api/v2/chat/completions`

规则：

- 推荐通过 `body.appId` 指定应用。
- 允许 body 不传 `appId`，但只用于兼容。
- 支持 `Authorization: Bearer apiKey-appId`。
- 支持旧 DB 绑定 appId 的 APIKey。
- 非 share/team space 调用最终必须解析到一个 appId。
- APIKey 用量更新必须使用真实 key。
- `authProxy` 只允许未绑定 legacy app 且开启 `authProxy` 的系统 key 使用。
- `apiKey-appId` 不应导致 `authProxy` 被禁用；判断依据是真实 key 是否为新系统 key 且开启 `authProxy`，不是本次请求是否解析出了 `parsedAppId`。
- `authProxy` 不跳过资源鉴权；解析 effective `tmbId` 后，必须用该 `tmbId` 校验目标 app 和 chat 权限。
- v1 和 v2 必须保持同一套 appId 解析规则。

## 非 completions 接口规则

除 v1/v2 completions 外，凡是需要应用上下文的开放接口都必须显式传 `appId`。

重点关注：

- `/api/core/chat/init`
- `/api/core/chat/history/**`
- `/api/core/chat/record/**`
- `/api/core/chat/feedback/**`
- `/api/core/chat/file/**`
- `/api/core/app/logs/**`

改造原则：

- schema 中 `appId` 必填。
- API 边界使用 `parseApiInput`。
- handler 内使用显式 `appId` 调用鉴权。
- 不再使用 `apiKeyAppId` 作为 `matchAppId` 或查询条件兜底。

## 删除应用规则

删除应用时：

- 不删除 APIKey。
- 将匹配旧记录的 `appId` 字段 unset。
- 原旧应用 key 保留为系统 key。
- unset 后，如果 completions 不传 `body.appId` 且不使用 `apiKey-appId`，应因无法解析 appId 而拒绝。

## 前端与文档

### 账号 APIKey 页

- 展示本人 key。
- 支持创建、编辑、复制、删除本人系统 key。
- 不展示应用维度。
- 文案不再区分 APIKey 类型。

### 应用发布 API 页

- 不再按 `appId` 创建或筛选 key。
- 仍可传入当前应用 `appId`，仅用于展示调用示例和兼容复制。
- 默认示例使用 `Authorization: Bearer apiKey` + `body.appId`。
- OpenAI SDK 兼容入口才展示或复制 `apiKey-appId`。
- 创建弹窗不再把 `appId` 写入 API 请求。
- `authProxy` 开关不再因为 `defaultData.appId` 隐藏；它只根据用户是否 team owner 和是否系统 key 判断。

### OpenAPI 文档

- System OpenAPI security 描述统一为 API Key。
- 所有非 completions 应用接口标注 `appId` 必填。
- v1/v2 completions 主示例使用 `body.appId`。
- `apiKey-appId` 只出现在 OpenAI SDK 兼容说明中。
- 不再暗示存在多种新建 APIKey 类型。

## 兼容矩阵

| 场景 | 是否允许 | appId 来源 | 说明 |
| --- | --- | --- | --- |
| 新系统 key + 普通应用接口 + 显式 appId | 允许 | body/query | 继续校验 tmbId 权限 |
| 新系统 key + 普通应用接口 + 不传 appId | 拒绝 | 无 | 除 completions 外必须显式传 |
| 新系统 key + completions + body.appId | 允许 | handlerAppId | 推荐方式 |
| 新系统 key + completions + `apiKey-appId` | 允许 | parsedAppId | OpenAI SDK 兼容 |
| 新系统 key + completions + 无 appId | 拒绝 | 无 | 无法确定应用 |
| 旧应用 key + completions + 无 appId | 允许 | legacyAppId | 历史兼容 |
| 旧应用 key + 普通应用接口 + 显式 appId | 允许 | body/query | 旧 key 按系统 key 处理，继续校验 tmbId 权限 |
| 旧应用 key + 普通应用接口 + 不传 appId | 拒绝 | 无 | 防止继续扩散隐式 appId |
| completions + body.appId 与 parsedAppId 不一致 | 允许 | handlerAppId | 高优先级覆盖低优先级 |

## 实施 TODO

- [ ] 更新 `packages/global/openapi/support/openapi/api.ts`
  - [ ] `CreateApiKeyBodySchema` 移除或废弃 `appId`
  - [ ] `GetApiKeyListQuerySchema` 移除或废弃 `appId`
  - [ ] 文案从区分 key 类型改为统一 APIKey

- [ ] 更新 APIKey CRUD 路由
  - [ ] `create` 不再写入 `appId`
  - [ ] `create` 数量限制改为按 `tmbId`
  - [ ] `list` 只查询当前 `tmbId`
  - [ ] `update/copy/delete` 只允许当前 `tmbId` 操作
  - [ ] `authProxy` 保留 team owner 限制

- [ ] 重构 OpenAPI APIKey 鉴权
  - [ ] 新增真实 key 与 `apiKey-appId` 解析 helper
  - [ ] `authOpenApiKey` 不再按 `appId` 区分 keyType
  - [ ] `parseHeaderCert` 返回真实 key、`legacyAppId`、`parsedAppId`
  - [ ] 从类型、实现和调用点中完全移除 `authAppApiKey`
  - [ ] auth service 接收 handler 显式传入的 `appId`
  - [ ] appId 解析顺序固定为 `handlerAppId > parsedAppId > legacyAppId`

- [ ] 删除旧应用 key 特殊鉴权路径
  - [ ] 删除 `authAppByApiKeyTeam` helper
  - [ ] 删除所有 `authAppByApiKeyTeam` 引用
  - [ ] APIKey 调用应用资源时沿用现有 `tmbId` 权限校验链路

- [ ] 改造 v1/v2 completions
  - [ ] handler 从 body 解析 `appId` 并传给 auth service
  - [ ] appId 解析优先级：`handlerAppId > parsedAppId > legacyAppId`
  - [ ] 高优先级 appId 覆盖低优先级 appId，不做冲突报错
  - [ ] 用真实 key 更新用量
  - [ ] `authProxy` 判断改用 legacy key 状态，而不是解析出的本次 appId
  - [ ] `authProxy` 解析 effective `tmbId` 后，用 effective `tmbId` 执行 `authApp` 和 `authChat` 鉴权
  - [ ] `/api/v1/chat/completions` 和 `/api/v2/chat/completions` 保持同一套 appId 解析规则

- [ ] 改造其他应用对话接口
  - [ ] 移除 `authAppApiKey`
  - [ ] 所有非 completions 的应用接口 schema 要求 `appId`
  - [ ] 不再用 `apiKeyAppId` 兜底 `appId`

- [ ] 更新删除应用逻辑
  - [ ] 不再 `MongoOpenApi.deleteMany({ appId })`
  - [ ] 改为 unset 匹配 APIKey 记录的 `appId` 字段

- [ ] 更新前端
  - [ ] `ApiKeyTable` 创建/list 不再传 `appId`
  - [ ] 应用发布页默认展示 `Authorization: Bearer apiKey` + `body.appId`
  - [ ] OpenAI SDK 兼容入口展示或复制 `apiKey-appId`
  - [ ] 调整 APIKey 说明文案

- [ ] 更新 OpenAPI 文档
  - [ ] System OpenAPI security 统一描述为 API Key
  - [ ] 所有非 completions 应用接口文档标注 `appId` 必填
  - [ ] completions 文档主示例使用 `body.appId`
  - [ ] completions 文档在兼容章节补充 `apiKey-appId`

## 全面测试标准

### 测试分层

本次改造必须同时覆盖以下层级：

- `packages/service` 单元测试：覆盖 APIKey 解析、鉴权结果、限额调用、lastUsedTime 更新、用量更新 key 选择。
- `projects/app` API 路由测试或集成测试：覆盖 APIKey CRUD、v1/v2 completions、典型非 completions 应用接口。
- 本地环境集成测试：启动本地依赖和 app 服务，以真实 HTTP 请求覆盖 systemopenapi 中每个对话相关接口。
- OpenAPI schema 测试：覆盖入参/出参 schema、文档示例和必填字段。
- 前端行为测试或人工验收：覆盖账号 APIKey 页、应用发布 API 页、复制值和文案。
- 回归测试：覆盖旧应用 key、旧调用方传 `appId`、`apiKey-appId` 兼容格式。

### 本地集成测试环境

除单元测试外，必须准备一套可重复执行的本地集成测试环境：

- 启动本地 MongoDB、PostgreSQL/向量库、Redis 等 app 运行所需依赖。
- 启动 `projects/app` 本地服务，测试通过 HTTP 调用真实 Next.js API 路由。
- 测试前自动创建独立 team、user、team member、app、chat、chat item、APIKey、旧应用 key 等夹具数据。
- 测试数据使用独立前缀或独立数据库，测试结束后清理。
- 集成测试不得依赖线上环境、线上配置或真实第三方模型；对模型调用、工作流执行、语音生成等外部能力使用测试模型、mock provider 或最小可运行工作流。
- 每个测试用例都要明确使用的鉴权方式：登录 token、系统 APIKey、`apiKey-appId`、旧应用 key。
- 对需要 SSE 的接口，至少校验 HTTP 状态、关键 event、结束标记和错误 event；不只校验请求能发出。
- 本地集成测试失败时，应能定位到具体接口、鉴权方式和 appId 来源。

建议新增独立集成测试目录，例如：

```text
projects/app/test/integration/openapi-apikey/
```

如果仓库已有更合适的集成测试目录，应沿用现有目录，但测试名称必须能看出属于 OpenAPI APIKey 改造。

### systemopenapi 对话接口覆盖

对话相关开放接口覆盖范围以生成后的 `systemopenapi` 为准，不能只手写挑选几个接口。测试应从 `packages/global/openapi/provider/systemopenapi.ts` 生成结果或对应 path/tag 源文件中提取以下 tag：

- `SystemOpenApiTagMap.chatHistory`
- `SystemOpenApiTagMap.chat`
- `SystemOpenApiTagMap.chatFeedback`
- `SystemOpenApiTagMap.chatController`

当前必须覆盖的 systemopenapi 对话接口清单如下；后续新增 systemopenapi 对话接口时，测试清单必须同步更新。

#### 会话操作

- `POST /api/v1/chat/completions`
- `POST /api/v2/chat/completions`
- `POST /api/v2/chat/stop`

#### 会话管理

- `GET /api/core/chat/init`
- `POST /api/core/chat/history/getHistories`
- `POST /api/core/chat/history/getHistoryStatus`
- `POST /api/core/chat/history/markRead`
- `PUT /api/core/chat/history/updateHistory`
- `DELETE /api/core/chat/history/delHistory`
- `DELETE /api/core/chat/history/clearHistories`
- `POST /api/core/chat/history/batchDelete`

#### 对话管理

- `POST /api/core/chat/record/getPaginationRecords`
- `POST /api/core/chat/record/getRecords_v2`
- `GET /api/core/chat/record/getResData`
- `DELETE /api/core/chat/record/delete`

#### 反馈管理

- `POST /api/core/chat/feedback/updateUserFeedback`

最低集成覆盖标准：

- 每个接口至少有 1 个系统 APIKey 成功用例。
- 每个需要 `appId` 的非 completions 接口至少有 1 个缺少 `appId` 的拒绝用例。
- 每个接口至少有 1 个跨 team 或无权限拒绝用例；如果接口本身只读，也必须确认不能读到其他 team 数据。
- v1/v2 completions 必须分别覆盖 `body.appId`、`apiKey-appId`、旧应用 key 3 条兼容路径。
- 对会产生或依赖 chat 数据的接口，应通过 completions 或夹具创建真实 chat/chat item 后再验证读取、更新、删除行为。
- `systemopenapi` 中有 tag 但暂时无法跑通的接口，必须在测试文件中显式 `todo/skip` 并写明阻塞原因，不能遗漏。

建议增加一个覆盖校验测试：

- 读取生成后的 `systemopenapi` paths。
- 过滤 chat 相关 tag。
- 与集成测试维护的接口清单比对。
- 如果 systemopenapi 新增对话接口但测试清单未覆盖，测试失败。

### APIKey 凭证解析测试

必须覆盖：

- `Authorization: Bearer <apiKey>` 能按真实 key 鉴权成功，返回真实 `apikey`、`teamId`、`tmbId`。
- `Authorization: Bearer <apiKey>-<appId>` 能拆出真实 key 和 `parsedAppId`。
- `apiKey-appId` 拆分只匹配末尾 `-<24位ObjectId>`。
- `apiKey-非ObjectId` 不拆分，按真实 key 查询；不存在则拒绝。
- 拆出的真实 key 不存在时拒绝。
- `authOpenApiHandler` 只在真实 key 鉴权成功后调用。
- `lastUsedTime` 只更新真实 key 记录。
- 用量更新只使用真实 key，不使用 `apiKey-appId` 拼接值。
- 返回结果不再包含 `keyType` 作为业务判断依据。

### authAppApiKey 移除测试

必须覆盖：

- 类型层不再存在 `authAppApiKey` 入参。
- `parseHeaderCert`、`authCert`、`authOpenApiKey` 不再接收或传递 `authAppApiKey`。
- 历史传 `authAppApiKey` 的调用点全部改为 `authApiKey`。
- 非 completions 接口不会因为旧 DB `openapi.appId` 自动获得应用上下文。
- CI 中 `rg "authAppApiKey"` 只能出现在迁移说明或测试快照允许范围内；业务代码中应为 0。

### completions appId 解析测试

针对 `/api/v1/chat/completions` 和 `/api/v2/chat/completions` 都必须覆盖同一组用例：

- 新系统 key + `body.appId`：成功，使用 `handlerAppId`。
- 新系统 key + `apiKey-appId` + 无 `body.appId`：成功，使用 `parsedAppId`。
- 新系统 key + 无 `body.appId` + 无 `parsedAppId`：拒绝。
- 旧应用 key + 无 `body.appId` + 无 `parsedAppId`：成功，使用 `legacyAppId`。
- `handlerAppId`、`parsedAppId`、`legacyAppId` 同时存在且互不相同：成功使用 `handlerAppId`，不做冲突报错。
- `parsedAppId` 和 `legacyAppId` 不同且无 `handlerAppId`：成功使用 `parsedAppId`。
- 被选中的 appId 格式非法：拒绝，不 fallback 到低优先级来源。
- 被选中的 appId 不存在：拒绝，不 fallback 到低优先级来源。
- 被选中的 appId 不属于 key 的 team：拒绝。
- v1 和 v2 对同一输入的鉴权结果一致。
- auth service 不直接读取 `req.body.appId`；测试应通过 handler 传入的 `appId` 断言优先级。

### 非 completions 应用接口测试

至少选择以下接口类别做代表测试：

- `/api/core/chat/init`
- `/api/core/chat/history/**`
- `/api/core/chat/record/**`
- `/api/core/chat/feedback/**`
- `/api/core/chat/file/**`
- `/api/core/app/logs/**`

必须覆盖：

- 新系统 key + 显式 `appId`：按 key 所属 `tmbId` 权限成功或拒绝。
- 新系统 key + 缺少 `appId`：拒绝。
- 新系统 key + `apiKey-appId` + 缺少业务入参 `appId`：拒绝。
- 旧应用 key + 缺少业务入参 `appId`：拒绝。
- 旧应用 key + 显式 `appId`：允许进入资源鉴权，但必须按 key 所属 `tmbId` 校验目标 app 权限。
- auth service 不应自动读取 body/query/params 中的 `appId`；必须由 handler schema 解析后显式传入。
- `apiKeyAppId` 不再作为 `matchAppId` 或查询条件兜底。

### APIKey CRUD 测试

必须覆盖：

- 创建 APIKey 不写入 `appId`。
- 创建时即使请求体带旧 `appId`，也不写入 `appId`。
- 创建数量限制按 `tmbId` 统计。
- list 只返回当前登录 `tmbId` 的 key。
- team owner 不能通过 list 看到其他成员 key。
- app owner 或应用管理者不能通过 `appId` 获取其他成员 key。
- update 只能更新本人 key。
- copy 只能复制本人 key，返回真实 key，不返回 `apiKey-appId`。
- delete 只能删除本人 key。
- `authProxy` 只能 team owner 开启或关闭。
- 非 owner 更新 `authProxy` 拒绝，但仍可更新本人 key 的普通字段。

### 旧数据兼容测试

必须覆盖：

- DB 中已有 `appId` 的旧 APIKey 仍能用于 v1/v2 completions。
- 旧 APIKey 在 completions 无 `body.appId` 时使用 `legacyAppId`。
- 旧 APIKey 在 completions 有 `body.appId` 时使用 `handlerAppId`。
- 旧 APIKey 在 completions 有 `apiKey-appId` 且无 `body.appId` 时使用 `parsedAppId`。
- 旧 APIKey 的限额、lastUsedTime、usagePoints 仍更新到旧 key 记录。
- 旧 APIKey 不再被新建、复制或列表接口当作应用级 key 展示。
- 删除应用时，不删除 APIKey；旧的 `MongoOpenApi.deleteMany({ appId })` 应改为 unset 匹配记录的 `appId` 字段。
- 删除应用后，原旧应用 key 仍保留为系统 key；无 `body.appId` / `apiKey-appId` 的 completions 调用应因无法解析 appId 而拒绝。

### authProxy 测试

必须覆盖：

- team owner 的新系统 key 可以开启 `authProxy`。
- 非 team owner 不能开启 `authProxy`。
- 新系统 key + 开启 `authProxy` + `body.appId`：允许代理团队成员。
- 新系统 key + 开启 `authProxy` + `apiKey-appId`：允许代理团队成员。
- 新系统 key + 未开启 `authProxy`：拒绝代理。
- 旧应用 key + `authProxy`：拒绝代理。
- `authProxy.username` 和 `authProxy.tmbId` 同时传入且指向不同成员：拒绝。
- 代理成员不属于当前 team 或已离开 team：拒绝。
- 代理成员没有目标 app 权限时拒绝，即使 APIKey 创建者有权限。
- 代理成员没有目标 chat 权限时拒绝，即使 APIKey 创建者有权限。
- 代理成员拥有目标 app/chat 权限时，按代理成员身份继续运行。
- 代理成功时，chat 归属、用量来源、运行用户信息使用代理后的 `tmbId`。

### 权限与安全测试

必须覆盖：

- APIKey 不能跨 team 访问 app。
- APIKey 不能跨 team 访问 dataset、chat、file 等资源。
- 管理类接口不能因为系统 key 改造扩大普通成员权限。
- app owner 不能读取、复制、更新、删除其他成员 APIKey。
- team manager 不能读取、复制、更新、删除其他成员 APIKey，除非后续另行设计授权。
- root、token、APIKey 三种鉴权路径互不影响。
- `authOpenApiHandler` 限额失败时，不更新 lastUsedTime，不进入业务逻辑。
- 缺少 Authorization、Bearer 格式错误、空 key、未知 key 都返回统一未授权错误。

### OpenAPI 与文档测试

必须覆盖：

- `packages/global/openapi/support/openapi/api.ts` 不再把 `appId` 描述为新建应用 key 的字段。
- System OpenAPI security 描述为 API Key。
- v1/v2 completions 主示例使用 `body.appId`。
- `apiKey-appId` 只出现在兼容说明中。
- 非 completions 应用接口文档中 `appId` 必填。
- 生成的 `systemopenapi.json` 不出现多种 APIKey 类型的旧描述。
- schema parse 与 OpenAPI 文档字段保持一致。

### 前端验收测试

必须覆盖：

- 账号 APIKey 页展示本人 key。
- 应用发布 API 页展示本人 key，不按 app 筛选。
- 应用发布 API 页默认复制或展示 `Authorization: Bearer apiKey` + `body.appId`。
- OpenAI SDK 兼容入口才展示或复制 `apiKey-appId`。
- 新建 key 后弹窗展示真实 key。
- 复制普通 key 返回真实 key。
- 页面文案不再区分 APIKey 类型。
- 非本人 key 不出现在列表中，也不能通过直接调用 copy/update/delete 操作。

### 回归命令建议

开发中优先跑局部测试：

```bash
pnpm test packages/service/test/support/openapi/auth.test.ts
pnpm test projects/app/test/support/openapi
pnpm test projects/app/test/core/chat/completions
```

如果实际测试文件路径不同，应以最终新增或修改的测试文件为准。完成全部实现后再运行全量测试：

```bash
pnpm test
```

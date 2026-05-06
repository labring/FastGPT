# projects/app 潜在 Bug 分析

## 范围

分析范围包括 `projects/app` 的 NextJS API 路由、页面组件、应用/聊天/知识库/MCP 相关服务逻辑。重点关注权限校验、事务一致性、外部副作用和参数错误处理。

## Findings

### 严重：MCP key 应用权限过滤失效，可能越权列出和调用应用

- 位置：
  - `projects/app/src/service/support/mcp/utils.ts:116`
  - `projects/app/src/service/support/mcp/utils.ts:133`
  - `projects/app/src/service/support/mcp/utils.ts:172`
- 相关入口：
  - `projects/app/src/pages/api/support/mcp/server/toolList.ts:16`
  - `projects/app/src/pages/api/support/mcp/server/toolCall.ts:16`

#### 问题

`getMcpServerTools` 查询 MCP key 时只投影了 `apps`：

```ts
const mcp = await MongoMcpKey.findOne({ key }, { apps: 1 }).lean();
```

但后续权限校验使用了 `mcp.tmbId`：

```ts
await authAppByTmbId({ tmbId: mcp.tmbId, appId: app._id, per: ReadPermissionVal });
```

由于 `tmbId` 没有被查出，鉴权上下文不可靠。同时权限过滤使用了 `appList.filter(async ...)`，`Array.prototype.filter` 不会等待异步回调，Promise 会被当作 truthy，实际不会过滤任何 app。

另外 `callMcpServerTool` 根据 key 和 toolName 调用应用时没有重新 `authAppByTmbId`，即使列表阶段修复，调用阶段仍缺少防线。

#### 触发场景

MCP key 创建后，团队成员权限发生变化，或 key 中关联的应用已经不再对该 tmb 有读取权限。外部 MCP Client 仍可能通过 key 获取工具列表或直接调用工具。

#### 影响

无权限应用可能被列出并调用，导致越权执行、数据泄露和计费归属风险。

#### 建议修复

- 查询 MCP key 时包含 `tmbId`、`teamId` 等鉴权字段。
- 用 `Promise.all(appList.map(...))` 先完成异步鉴权，再同步过滤。
- `callMcpServerTool` 在 dispatch 前对命中的 app 再做一次 `authAppByTmbId`。
- 为“权限变更后 MCP key 不再能访问旧应用”增加回归测试。

### 高：MCP Server 创建/更新只要求应用读权限，却会把应用作为外部工具按 owner 身份执行

- 位置：
  - `projects/app/src/pages/api/support/mcp/create.ts:18`
  - `projects/app/src/pages/api/support/mcp/create.ts:24`
  - `projects/app/src/pages/api/support/mcp/create.ts:46`
  - `projects/app/src/pages/api/support/mcp/create.ts:49`
  - `projects/app/src/pages/api/support/mcp/create.ts:57`
  - `projects/app/src/pages/api/support/mcp/update.ts:18`
  - `projects/app/src/pages/api/support/mcp/update.ts:36`
  - `projects/app/src/pages/api/support/mcp/update.ts:39`
  - `projects/app/src/pages/api/support/mcp/update.ts:47`
  - `projects/app/src/service/support/mcp/utils.ts:172`
  - `projects/app/src/service/support/mcp/utils.ts:225`
  - `projects/app/src/service/support/mcp/utils.ts:229`
  - `projects/app/src/service/support/mcp/utils.ts:235`
  - `projects/app/src/service/support/mcp/utils.ts:255`
  - `packages/global/openapi/support/mcpServer/api.ts:58`
  - `packages/global/openapi/support/mcpServer/api.ts:72`

#### 问题

MCP Server 创建入口只要求成员具备团队 `hasApikeyCreatePer`，随后对每个要暴露的应用只校验读权限：

```ts
await Promise.all(
  uniqueApps.map((app) =>
    authAppByTmbId({
      tmbId,
      appId: app.appId,
      per: ReadPermissionVal
    })
  )
);
```

更新入口同样只用 `ReadPermissionVal` 校验新 app 列表。可是 MCP Server key 暴露出去后，`callMcpServerTool` 会直接执行被关联应用的工作流，并使用应用 owner 身份作为运行上下文：

```ts
await dispatchWorkFlow({
  usageSource: UsageSourceEnum.mcp,
  runningAppInfo: { tmbId: String(app.tmbId), ... },
  runningUserInfo: await getRunningUserInfoByTmbId(app.tmbId),
  uid: String(app.tmbId),
  ...
});
```

这不是普通“读取应用配置”，而是把应用发布成可被外部 MCP Client 调用的工具入口，且会写入聊天记录和产生用量。仅凭读权限即可创建或更新这种外部执行入口，权限强度明显低于能力强度。

#### 触发场景

团队成员拥有“创建 API key/MCP key”类权限，并对某个应用只有读权限，没有应用管理/写权限。该成员创建 MCP Server，把该应用加入 `apps`。外部 MCP Client 拿到 key 后即可反复调用该应用工具。

如果成员本来拥有某个 MCP Server 的管理权，也可以在更新时把自己只有读权限的应用加入已有 key。

#### 影响

低权限成员可以把只读应用变成外部可调用工具，绕过应用发布/管理权限边界。执行时使用 app owner 身份，可能访问 owner 可见的数据集、工具、变量和模型配置，并把成本记到团队。该问题与“调用阶段权限过滤失效”不同：即使修复调用阶段的 `tmbId` 投影和异步 filter，创建阶段仍会允许读权限应用被合法写入 MCP key。

#### 建议修复

- 创建/更新 MCP Server 关联应用时至少要求 `WritePermissionVal`，更合理的是 `ManagePermissionVal` 或专门的“发布为 MCP 工具”权限。
- 对 `hasApikeyCreatePer` 和应用权限做组合校验：团队有创建 key 权限不等于可以发布任意只读应用。
- `callMcpServerTool` 运行身份应绑定 MCP key 创建者/调用者可授权范围，或在执行前重新校验 key 对应成员仍具备足够应用权限。
- MCP Server 创建、更新和调用都应写审计日志，记录关联 app、toolName、调用来源和用量归属。

### 严重：发布链接微信渠道管理接口只按公开 shareId 鉴权，外部可触发登录态修改或退出

- 位置：
  - `packages/service/support/permission/publish/authLink.ts:57`
  - `projects/app/src/pages/api/support/outLink/wechat/qrcode/generate.ts:13`
  - `projects/app/src/pages/api/support/outLink/wechat/qrcode/status.ts:21`
  - `projects/app/src/pages/api/support/outLink/wechat/logout.ts:10`

#### 问题

`authOutLinkValid` 只按 `shareId` 查询发布链接是否存在，不校验当前用户、团队或应用管理权限：

```ts
const outLinkConfig = await MongoOutLink.findOne({ shareId }).lean();
```

但微信渠道二维码生成、二维码状态确认和退出登录都使用这个公开校验。尤其 `logout` 会直接清空发布渠道的微信 token 并置为 offline；`status` 在二维码确认后会写入 `app.token`、`accountId`、`status` 等字段。

#### 触发场景

`shareId` 本身是发布链接的一部分，外部访问者可能知道。知道 `shareId` 后，可直接调用微信渠道退出登录接口，或反复生成二维码覆盖 Redis 中的待确认二维码状态。

#### 影响

公开访问者可影响渠道登录态，导致微信发布渠道掉线、轮询异常，或把渠道管理操作暴露给非管理员。

#### 建议修复

- 管理态接口如 `logout`、`qrcode/generate`、`qrcode/status` 应使用 `authOutLinkCrud` 并要求 `ManagePermissionVal`。
- 如确需公开二维码回调，使用一次性 nonce 或服务端 session 绑定，而不是只依赖 `shareId`。
- 状态写入条件中同时带上 outLink `_id`、teamId，并校验渠道类型。

### 高：聊天文件下载签名只校验 app 访问，不校验 key 归属

- 位置：
  - `projects/app/src/pages/api/core/chat/file/presignChatFileGetUrl.ts:8`
  - `projects/app/src/pages/api/core/chat/file/presignChatFileGetUrl.ts:18`
  - `packages/service/common/s3/sources/chat/index.ts:51`

#### 问题

接口解析 `key` 和 `appId` 后只调用 `authChatCrud({ appId })`，没有校验该 S3 key 是否属于当前用户、外链用户或指定 chat：

```ts
await authChatCrud({ req, authToken: true, authApiKey: true, appId, ...outLinkAuthData });
const { url } = await getS3ChatSource().createGetChatFileURL({ key, external: true, mode });
```

S3 chat 文件 key 的格式包含 `chat/{appId}/{uId}/{chatId}/...`，但当前请求 schema 没有 `chatId`，也没有对 `uId/chatId` 前缀做绑定校验。

#### 触发场景

攻击者对同一 app 有聊天访问权限，并知道另一个用户或会话的 chat 文件 key，即可请求该接口换取外部下载 URL。

#### 影响

可能越权下载同一应用下其他用户/外链会话上传或生成的聊天文件。

#### 建议修复

- 请求入参增加 `chatId`，鉴权后校验 key 必须以 `chat/${appId}/${uid}/${chatId}/` 开头。
- 对 outLink 场景校验 `outLinkUid` 与 key 中的 uid 一致。
- 至少先校验 `isS3ObjectKey(key, 'chat')` 和 appId 边界，避免任意 key 签名。

### 中：聊天文件上传签名允许 Home App 调试态覆盖文件选择配置

- 位置：
  - `projects/app/src/pages/api/core/chat/file/presignChatFilePostUrl.ts:34`
  - `projects/app/src/pages/api/core/chat/file/presignChatFilePostUrl.ts:36`

#### 问题

上传签名接口允许请求体传入 `fileSelectConfig`。当 app 被判断为 Home App 时，接口不会要求应用写权限，直接采用调用方传入的文件选择配置：

```ts
const isHomeApp = await MongoChatSetting.exists({ teamId, appId });
if (!isHomeApp) {
  await authApp({ ..., per: WritePermissionVal });
}
return fileSelectConfig;
```

但 `fileSelectConfig` 决定允许上传的文件类型，调用方可以把调试态配置改成更宽松的扩展名列表。

#### 触发场景

普通可聊天用户针对 Home App 调用上传签名接口，在请求体中传入 `fileSelectConfig`，开启原 app 配置不允许的文件类型。

#### 影响

可能绕过应用配置的上传类型限制，扩大后续文件解析、模型输入或存储风险。文件大小和频率限制仍存在，因此主要是配置绕过。

#### 建议修复

- 仅应用编辑/调试态接口允许传入 `fileSelectConfig`，并统一要求写权限。
- 普通聊天态始终从服务端 app 配置读取 `chatConfig.fileSelectConfig`。
- 对 Home App 的特殊分支增加明确注释和测试。

### 高：用 fileId 创建知识库 collection 时未校验文件属于当前知识库

- 位置：
  - `projects/app/src/pages/api/core/dataset/collection/create/fileId.ts:27`
  - `packages/service/common/s3/utils.ts:214`

#### 问题

接口要求调用者对 `body.datasetId` 有写权限，但对传入 `fileId` 只校验它是 `dataset/` 类型 S3 key：

```ts
if (!isS3ObjectKey(fileId, 'dataset')) {
  return Promise.reject('Invalid dataset file key');
}
```

dataset 文件 key 的格式是 `dataset/{datasetId}/{filename}`。当前逻辑没有校验 `fileId` 前缀中的 datasetId 是否等于正在写入的 `body.datasetId`。

#### 触发场景

用户对知识库 A 有写权限，并知道知识库 B 的 dataset 文件 key。调用 `create/fileId` 时传 A 的 `datasetId` 和 B 的 `fileId`，即可在 A 下创建引用 B 文件的 collection。

#### 影响

跨知识库引用文件，可能造成数据归属混乱、权限边界绕过和删除/训练时的副作用错误。

#### 建议修复

- 校验 `fileId.startsWith(\`dataset/${body.datasetId}/\`)`。
- 更稳妥的方式是从文件元数据或 collection 记录反查 teamId/datasetId 归属。
- 增加“不能用其他 dataset 的 fileId 创建 collection”的测试。

### 高：sandbox proxy session 只按 sandboxId 放行，无凭证请求可复用已认证代理会话

- 位置：
  - `projects/app/src/service/core/sandbox/proxy.ts:37`
  - `projects/app/src/service/core/sandbox/proxyUtils.ts:61`
  - `projects/app/src/service/core/sandbox/proxyUtils.ts:106`

#### 问题

sandbox proxy 在 cookie/API key 鉴权失败时，会回退检查内存中的 `proxySession`：

```ts
const session = getProxySession(sandboxId);
if (session) {
  return `${session.protocol}://${session.host}:${targetPort}`;
}
```

`proxySession` 只以 `sandboxId` 为 key，TTL 为 2 小时。`sandboxId` 是 `appId-userId-chatId` 的 16 位 hash，用于标识资源，不是访问密钥。

#### 触发场景

合法用户先访问某个 `/proxy/{sandboxId}/{port}` 或子域代理地址，触发 `upsertProxySession`。随后无登录 cookie 的浏览器或脚本访问同一 sandboxId 代理地址，只要 session 未过期，也会被转发到 sandbox。

#### 影响

代理访问权限从“持有有效用户凭证”退化为“知道 sandboxId 且内存 session 未过期”。如果 sandbox URL 被分享、记录到日志或被前端页面泄露，会扩大 sandbox 内服务暴露面。

#### 建议修复

- 无凭证请求不要只按 sandboxId 放行。
- 为 iframe 子请求发放短期、不可预测、绑定 team/user/session 的 proxy access token，并逐请求校验。
- proxy session 至少绑定原用户 session、UA/IP 或一次性 relay nonce，并缩短 TTL。

### 高：内置 MCP HTTP endpoint 未按 tool inputSchema 校验参数

- 位置：
  - `projects/app/src/pages/api/mcp/app/[key]/mcp.ts:54`
  - `projects/app/src/pages/api/mcp/app/[key]/mcp.ts:74`

#### 问题

内置 MCP endpoint 的工具列表会声明 `inputSchema`，但 `tools/call` 时直接把客户端传入的 `arguments` 作为 `inputs` 调用：

```ts
return handleToolCall(request.params.name, request.params.arguments ?? {});
```

schema 只对客户端有提示作用，不能作为可信边界。服务端未校验参数类型、必填字段、字符串长度、对象深度和额外字段。

#### 触发场景

MCP Client 绕过 schema，传入缺失字段、错误类型、超大对象或深层对象。

#### 影响

后端工作流可能进入异常路径，或被异常输入拖垮资源。该问题会与 MCP key 权限过滤失效叠加。

#### 建议修复

- 在 `callMcpServerTool` 前按当前 tool 的 `inputSchema` 使用 Ajv/Zod 校验。
- 限制 body 大小、字段数量、字符串长度和对象深度。
- 校验失败时返回标准 MCP error content。

### 中：内置 MCP HTTP endpoint 未配置 body size limit，大请求会先被 Next 默认解析

- 位置：`projects/app/src/pages/api/mcp/app/[key]/mcp.ts:116`

#### 问题

内置 MCP endpoint 直接导出 `handler`，没有使用 `NextAPI`，也没有声明 `config.api.bodyParser.sizeLimit`。与 v1/v2 chat completions 这类大请求接口不同，它会走 Next 默认 body parser 限制和错误处理。

#### 触发场景

MCP Client 调用工具时传入较大的 JSON-RPC `arguments`，例如较长文本、文件列表或嵌套对象。

#### 影响

合法大请求可能被 Next 默认 1MB 限制拒绝；恶意请求也无法进入统一的应用层请求大小、日志和错误处理策略，行为与其他 API 不一致。

#### 建议修复

- 明确声明 MCP endpoint 的 `bodyParser.sizeLimit`，并与服务端全局请求体限制保持一致。
- 对 JSON-RPC arguments 增加字段级大小限制。
- 将错误统一转换为 MCP 标准 JSON-RPC error。

### 中：内置 MCP endpoint 错误结果使用非标准 message 字段，客户端可能看不到错误原因

- 位置：`projects/app/src/pages/api/mcp/app/[key]/mcp.ts:66`

#### 问题

工具调用失败时返回：

```ts
return {
  message: getErrText(error),
  content: [],
  isError: true
};
```

`message` 不是标准 `CallToolResult` content block。MCP SDK/客户端可能剥离未知字段或只展示 `content`，导致用户只看到空错误。

#### 触发场景

调用不存在的 tool、参数错误或下游工作流报错。

#### 影响

MCP Client 无法获得可读错误原因，排障困难，也不利于自动重试/修正。

#### 建议修复

把错误文本放入标准内容：

```ts
content: [{ type: 'text', text: getErrText(error) }],
isError: true
```

### 中：内置 MCP endpoint 在基础 HTTP/MCP 校验前先查询工具列表

- 位置：`projects/app/src/pages/api/mcp/app/[key]/mcp.ts:42`

#### 问题

`handlePost` 会先执行 `getMcpServerTools(key)`，然后才 `transport.handleRequest(req, res, req.body)`。这意味着无效 `Content-Type`、无效 `Accept` 或非法 JSON-RPC 请求也会先触发 key 查询、应用查询和权限逻辑。

#### 触发场景

对有效 key 发送明显非法的 MCP HTTP 请求，例如错误 content-type 或缺少 streamable HTTP 所需 header。

#### 影响

无效请求也能消耗数据库/API 查询资源，放大暴力探测和 DoS 成本。

#### 建议修复

- 先做轻量 HTTP header 和 JSON-RPC 基本结构校验。
- 按实际 method 延迟查询 tools。
- 对无效请求直接返回 4xx，不进入工具加载逻辑。

### 严重：聊天日志批量删除权限过低，查看日志者可删除聊天数据

- 位置：
  - `projects/app/src/pages/api/core/chat/history/batchDelete.ts:17`
  - `projects/app/src/pageComponents/app/detail/Logs/LogTable.tsx:583`

#### 问题

批量删除聊天历史接口仅要求 `AppReadChatLogPerVal`：

```ts
await authApp({
  req,
  authToken: true,
  authApiKey: true,
  appId,
  per: AppReadChatLogPerVal
});
```

但该接口会删除聊天、聊天项、响应记录、沙盒和聊天文件。前端日志表也直接给日志查看者展示单条删除和批量删除入口。

#### 触发场景

拥有“查看对话日志”权限但没有应用写权限或管理权限的成员进入应用日志页，点击删除按钮或直接调用批量删除 API。

#### 影响

日志查看者可以硬删除聊天历史和相关文件，属于越权删除。该问题会影响审计、运营分析和用户历史回放。

#### 建议修复

- 将批量删除接口权限提升到应用写权限、管理权限，或新增独立的“删除聊天日志”权限。
- 前端删除入口使用同一权限判断隐藏或禁用。
- 增加权限矩阵测试：只读日志权限可以查看但不能删除。

### 严重：聊天批量删除把部分副作用放在事务外，失败会产生半残数据

- 位置：`projects/app/src/pages/api/core/chat/history/batchDelete.ts:25`

#### 问题

接口先在 Mongo 事务外执行：

```ts
MongoChatItemResponse.deleteMany(...)
deleteSandboxesByChatIds(...)
```

随后才进入 `mongoSessionRun` 删除 `MongoChatItem`、`MongoChat` 和 S3 文件。如果后续事务 abort 或 S3 删除失败，前面已经删除的响应记录和沙盒无法回滚。

#### 触发场景

聊天批量删除过程中，事务内任意数据库操作失败，或 `deleteChatFilesByPrefix` 抛错。

#### 影响

可能留下“chat 还在但 response/sandbox 已删”或其他不一致状态，导致日志详情、回放链路、沙盒文件查看失败，恢复成本较高。

#### 建议修复

- 所有 Mongo 删除尽量放入同一事务。
- S3 和沙盒这类外部副作用应在事务 commit 后执行，或设计补偿/重试任务。
- 删除流程增加幂等和失败重试记录。

### 严重：带文件创建知识库时先移动对象存储文件，事务失败会导致文件丢失或孤儿对象

- 位置：`projects/app/src/pages/api/core/dataset/createWithFiles.ts:74`
- 关键逻辑：`projects/app/src/pages/api/core/dataset/createWithFiles.ts:119`

#### 问题

`createWithFiles` 在 Mongo 事务中创建 dataset 后，直接将 temp 文件移动到正式 dataset 路径：

```ts
await bucket.move({
  from: file.fileId,
  to: newKey
});
```

然后才调用 `createCollectionAndInsertData` 创建 collection 并入队。对象存储移动不受 Mongo 事务保护。如果移动成功后后续逻辑失败，temp 文件已经不在原位置，数据库也可能没有对应集合。

#### 触发场景

`bucket.move` 成功，但 `createCollectionAndInsertData`、训练入队、权限写入、事务提交等后续步骤失败。

#### 影响

可能产生孤儿对象，或用户上传的 temp 文件被移走后数据库没有记录，表现为文件丢失、知识库创建失败后无法重试。

#### 建议修复

- 优先让 DB 事务成功，再执行对象存储移动。
- 或保留 temp 文件，使用 copy 后 commit 成功再删除 temp。
- 如果必须 move，失败时补偿 move 回 temp，并记录补偿失败任务。

### 高：AgentSkill 版本更新未绑定 versionId 与 skillId，可能跨技能修改版本

- 位置：`projects/app/src/pages/api/core/agentSkills/version/update.ts:17`
- 关键逻辑：`projects/app/src/pages/api/core/agentSkills/version/update.ts:19`

#### 问题

接口只校验调用者对请求体中的 `skillId` 有写权限：

```ts
await authSkill({ skillId, ..., per: WritePermissionVal });
```

随后直接按 `versionId` 更新：

```ts
await MongoAgentSkillsVersion.findByIdAndUpdate(versionId, { versionName });
```

没有确认该 `versionId` 属于同一个 `skillId` 或同一 team。

#### 触发场景

用户对自己的 AgentSkill A 有写权限，拿到另一个技能版本的 `_id` 后，请求 `{ skillId: A, versionId: victimVersionId, versionName: 'pwn' }`。

#### 影响

可跨技能甚至跨团队修改版本名称，破坏版本记录和审计可信度。

#### 建议修复

- 改为 `updateOne({ _id: versionId, skillId, isDeleted: false }, { $set: { versionName } })`。
- 检查 `matchedCount`，未命中时返回无权限或不存在。
- 增加“不能用 A 的权限更新 B 的版本”的测试。

### 高：AgentSkill 切换版本未绑定 versionId 与 skillId，可能清空当前技能 active 版本并激活其他技能版本

- 位置：
  - `projects/app/src/pages/api/core/agentSkills/version/switch.ts:21`
  - `projects/app/src/pages/api/core/agentSkills/version/switch.ts:27`

#### 问题

接口先把当前 `skillId` 的 active 版本置为 false，随后直接 `findByIdAndUpdate(versionId)` 激活任意版本：

```ts
await MongoAgentSkillsVersion.updateMany({ skillId, isActive: true }, { isActive: false });
await MongoAgentSkillsVersion.findByIdAndUpdate(versionId, { isActive: true }, { session });
```

第二步没有限定 `{ _id: versionId, skillId }`。

#### 触发场景

用户对 AgentSkill A 有写权限，但传入 AgentSkill B 的 `versionId`。

#### 影响

A 的 active 版本会被清空，B 的指定版本会被置为 active。若 B 属于其他团队或敏感技能，会造成跨资源状态污染。

#### 建议修复

- 在同一事务中使用 `updateOne({ _id: versionId, skillId, isDeleted: false }, { isActive: true })`。
- 激活失败时回滚或抛错，避免先清空当前 active。
- 对跨 skill versionId 增加回归测试。

### 中：AgentSkill 调试消息删除只要求读权限

- 位置：
  - `projects/app/src/pages/api/core/agentSkills/debugSession/chatItem/delete.ts:17`
  - `projects/app/src/pages/api/core/agentSkills/debugSession/chatItem/delete.ts:25`

#### 问题

调试会话消息删除接口只要求 `ReadPermissionVal`，但会对 `MongoChatItem` 执行软删除：

```ts
await authSkill({ ..., per: ReadPermissionVal });
await MongoChatItem.updateOne(..., { $set: { deleteTime: new Date() } });
```

#### 触发场景

团队成员只有某个技能的只读协作权限，直接调用该接口并传入 `skillId/chatId/contentId`。

#### 影响

只读用户可以删除调试会话消息，破坏调试历史和问题定位依据。

#### 建议修复

- 权限提升为 `WritePermissionVal`。
- 查询条件补充 debug session 来源约束，避免误删同 `appId/chatId/dataId` 的其他记录。
- 前端删除入口使用同一权限判断。

### 中：AgentSkill 关联应用列表未鉴权目标 skill，可探测私有 skill 被哪些可读 app 使用

- 位置：
  - `projects/app/src/pages/api/core/agentSkills/apps.ts:32`
  - `projects/app/src/pages/api/core/agentSkills/apps.ts:67`

#### 问题

接口只校验当前用户是团队成员，未对 `skillId` 调用 `authSkill({ per: ReadPermissionVal })`。随后查询当前 team 内所有引用该 `skillId` 的 app，再按 app 读权限过滤。

#### 触发场景

团队内存在私有 skill S，应用 A 引用了 S。用户对 A 有读权限，但对 S 无读权限。用户调用 `/api/core/agentSkills/apps?skillId=S`，可以看到 A。

#### 影响

无 skill 权限的用户可以探测私有 skill 的使用范围和关联应用信息，造成资源关系泄露。

#### 建议修复

- 查询前先对 `skillId` 做 `authSkill` 读权限校验。
- 如设计允许从 app 反查，也应只返回用户对 skill 和 app 均有读权限的交集。

### 高：AgentSkill debugChat 只要求读权限，却会执行编辑调试沙箱并写入会话

- 位置：
  - `projects/app/src/pages/api/core/agentSkills/edit.ts:48`
  - `projects/app/src/pages/api/core/agentSkills/edit.ts:73`
  - `projects/app/src/pages/api/core/agentSkills/debugChat.ts:216`
  - `projects/app/src/pages/api/core/agentSkills/debugChat.ts:230`
  - `projects/app/src/pages/api/core/agentSkills/debugChat.ts:281`
  - `projects/app/src/pages/api/core/agentSkills/debugChat.ts:301`
  - `projects/app/src/pages/api/core/agentSkills/debugChat.ts:356`

#### 问题

创建 edit-debug sandbox 的 `agentSkills/edit` 要求 `WritePermissionVal`，但后续 `agentSkills/debugChat` 只要求：

```ts
authSkill({ skillId, per: ReadPermissionVal })
```

随后它查找 `chatId: 'edit-debug'` 的 sandbox，构造运行时节点并调用 `dispatchWorkFlow`，最终还会把调试对话写入 chat records。

#### 触发场景

写权限成员曾为 skill 创建编辑调试沙箱。另一个只有该 skill 读权限的成员调用 `debugChat`，传入 `messages/model/systemPrompt`。

#### 影响

读权限成员可以驱动编辑调试 sandbox 中的 skill 执行，消耗模型额度，产生调试会话，并可能观察或影响仍处于编辑调试阶段的运行结果。这和普通“读取 skill”权限语义不一致。

#### 建议修复

- `debugChat` 要求 `WritePermissionVal`，或要求创建 edit-debug sandbox 的同一成员/会话。
- 如需只读试运行，应使用已发布版本或只读隔离沙箱，不复用编辑调试 sandbox。
- 调试会话记录应区分编辑者和只读试用者，并增加审计。

### 高：批量删除 collection 跨 dataset 时只使用第一条 collection 的 datasetId 查子节点

- 位置：
  - `projects/app/src/pages/api/core/dataset/collection/delete.ts:27`
  - `projects/app/src/pages/api/core/dataset/collection/delete.ts:40`
  - `packages/service/core/dataset/collection/utils.ts:51`

#### 问题

接口会对每个 `collectionId` 分别鉴权，但只取 `Promise.all` 的第一条结果：

```ts
const [{ teamId, collection, tmbId }] = await Promise.all(...)
```

后续对所有待删 id 都使用第一条 collection 的 `datasetId` 调用 `findCollectionAndChild`。而底层 `findCollectionAndChild` 的根节点查询是 `findById(collectionId)`，没有带 `teamId/datasetId`，子节点递归才使用传入的第一条 `datasetId`。

#### 触发场景

同一用户对 dataset A/B 都有写权限，一次请求 `collectionIds=[A_folder, B_folder]`。

#### 影响

B_folder 根节点可能被删除，但它的 children 查询使用 A 的 `datasetId`，导致 B 的子 collection 和数据残留，形成孤儿数据和存储泄漏。

#### 建议修复

- 保存每个 `collectionId` 的鉴权结果，用自己的 `teamId/datasetId` 调用 `findCollectionAndChild`。
- `findCollectionAndChild` 根节点查询改为 `{ _id: collectionId, teamId, datasetId }`。
- 增加跨 dataset 批量删除测试。

### 高：训练队列单条更新/删除/详情接口信任请求体 datasetId，未绑定到已鉴权 collection

- 位置：
  - `projects/app/src/pages/api/core/dataset/training/updateTrainingData.ts:18`
  - `projects/app/src/pages/api/core/dataset/training/updateTrainingData.ts:45`
  - `projects/app/src/pages/api/core/dataset/training/deleteTrainingData.ts:15`
  - `projects/app/src/pages/api/core/dataset/training/deleteTrainingData.ts:23`
  - `projects/app/src/pages/api/core/dataset/training/getTrainingDataDetail.ts:18`
  - `projects/app/src/pages/api/core/dataset/training/getTrainingDataDetail.ts:26`

#### 问题

这些接口先用 `collectionId` 调用 `authDatasetCollection`，但随后用请求体传入的 `datasetId` 和 `dataId` 访问 `MongoDatasetTraining`：

```ts
const { teamId } = await authDatasetCollection({ collectionId, ... });
const data = await MongoDatasetTraining.findOne({ teamId, datasetId, _id: dataId });
```

单条更新、删除和详情读取都没有把训练记录限定到已鉴权的 `collection._id` / `collection.datasetId`。只有“未传 dataId 重试当前集合所有错误数据”的分支包含 `collectionId`。

#### 触发场景

用户对 collection A 有读/写/管理权限，同时知道同 team 下 dataset B 的训练记录 `_id` 和 `datasetId`。调用接口时传 `collectionId=A`、`datasetId=B`、`dataId=B_training_id`。

#### 影响

可能跨 collection 读取训练错误内容、重试/修改训练数据或删除训练任务。若团队内资源权限细分较多，会绕过 collection 所属知识库的权限边界。

#### 建议修复

- 鉴权后使用 `collection.datasetId`，不要信任请求体 `datasetId`。
- 所有单条查询/更新/删除条件增加 `collectionId: collection._id`。
- schema 可以去掉冗余 `datasetId`，或仅用于前端展示但服务端不参与权限查询。
- 增加“不能用 A collection 权限操作 B training data”的测试。

### 高：应用创建/移动允许挂到非目录节点，移动还可挂到自身/子孙，可能制造异常资源树

- 位置：
  - `projects/app/src/pages/api/core/app/folder/create.ts:40`
  - `projects/app/src/pages/api/core/app/folder/create.ts:48`
  - `projects/app/src/pages/api/core/app/update.ts:74`
  - `projects/app/src/pages/api/core/app/update.ts:121`
  - `projects/app/src/pages/api/core/app/folder/path.ts:29`

#### 问题

应用 folder 创建接口只校验调用者对 `parentId` 有写权限，随后直接把新 folder 写到该父节点下，没有校验父节点必须是 `folder/toolFolder`。

应用更新接口也只校验目标 `parentId` 有管理权限，没有校验目标必须是 folder/toolFolder，也没有拒绝 `parentId === appId` 或移动到自己的子孙节点。随后直接写入：

```ts
await MongoApp.findByIdAndUpdate(appId, {
  ...parseParentIdInMongo(parentId),
  ...(isMove && { inheritPermission: true })
});
```

路径接口 `getParents` 递归查 `parentId`，没有 visited 集合或最大深度。

#### 触发场景

拥有某普通应用写权限的用户，在该应用下创建 folder；或拥有某应用和目标节点管理权限的用户，把应用 A 的 `parentId` 改成 A 自己，或把 folder A 移到其子孙 folder B 下。

#### 影响

应用树可能出现环或挂到非目录节点。列表、路径、权限继承、父级更新时间更新等逻辑会出现递归异常、展示缺失或权限继承混乱。

#### 建议修复

- 创建/移动前校验目标类型必须在 `AppFolderTypeList`。
- 拒绝 `parentId === appId`。
- 向上遍历目标父链，若遇到当前 appId 则拒绝。
- 路径/父级更新时间函数增加 visited 集合和最大深度兜底。

### 高：知识库创建/移动允许挂到非 folder 节点，移动还可挂到自身/子孙，可能制造异常资源树

- 位置：
  - `projects/app/src/pages/api/core/dataset/create.ts:49`
  - `projects/app/src/pages/api/core/dataset/create.ts:81`
  - `projects/app/src/pages/api/core/dataset/createWithFiles.ts:55`
  - `projects/app/src/pages/api/core/dataset/createWithFiles.ts:79`
  - `projects/app/src/pages/api/core/dataset/folder/create.ts:27`
  - `projects/app/src/pages/api/core/dataset/folder/create.ts:45`
  - `projects/app/src/pages/api/core/dataset/update.ts:91`
  - `projects/app/src/pages/api/core/dataset/update.ts:197`
  - `projects/app/src/pages/api/core/dataset/paths.ts:32`

#### 问题

知识库创建、带文件创建和 folder 创建接口只校验调用者对 `parentId` 有写权限，随后直接写入父节点，没有校验父节点是 `DatasetTypeEnum.folder`。

知识库更新接口也只校验目标 `parentId` 有管理权限，没有校验目标是 `DatasetTypeEnum.folder`，也没有防止移动到自身或子孙节点。路径接口递归读取父链，同样没有 visited 集合或最大深度。

#### 触发场景

用户在普通 dataset 下创建新 dataset/folder，或把 dataset/folder A 的 `parentId` 设置为 A 自己，或把 A 移动到其子孙 folder B 下。

#### 影响

知识库目录树可能形成环，导致路径接口递归异常、列表不可达、权限继承和批量删除子树逻辑混乱。

#### 建议修复

- 创建/移动目标必须是 `DatasetTypeEnum.folder`。
- 拒绝自指和移动到子孙节点。
- `findDatasetAndAllChildren`、路径接口、权限继承递归增加 visited/maxDepth 防护。

### 高：collection 创建/移动未校验 parentId 属于同一 dataset 且为 folder，可能形成跨库挂载或环

- 位置：
  - `packages/service/core/dataset/collection/controller.ts:271`
  - `packages/service/core/dataset/collection/controller.ts:294`
  - `projects/app/src/pages/api/core/dataset/collection/update.ts:111`
  - `projects/app/src/pages/api/core/dataset/collection/paths.ts:37`

#### 问题

多个 collection 创建入口和 update 接口最终只把 `parentId` 作为普通字段写入。服务端没有统一校验：

- `parentId` 对应 collection 存在；
- `parentId` 属于同一个 `teamId/datasetId`；
- `parentId` 是 folder；
- 移动时不能指向自己或子孙节点。

路径接口递归 `parentId` 时也没有 visited 集合或最大深度。

#### 触发场景

对 dataset A 有写权限的用户，在创建 collection 时传入 dataset B 的 folder id 作为 `parentId`；或在 update 中把 collection A 的 parentId 改成自己/子孙节点。

#### 影响

collection 可能跨 dataset 挂载，列表查询按 `datasetId + parentId` 会找不到这些节点；路径和删除子树逻辑也可能被环或跨库 parent 打乱，形成孤儿数据。

#### 建议修复

- 在 `createOneCollection` 和 update 接口中统一校验 parent collection。
- parent 必须满足 `{ _id: parentId, teamId, datasetId, type: folder }`。
- 移动场景拒绝自指和子孙节点。
- 路径递归增加 visited/maxDepth 防护。

### 高：旧版问题引导接口允许外链提交任意 messages 触发模型调用

- 位置：
  - `projects/app/src/pages/api/core/ai/agent/createQuestionGuide.ts:29`
  - `projects/app/src/pages/api/core/ai/agent/createQuestionGuide.ts:76`
  - `packages/global/openapi/core/ai/agent/api.ts:13`

#### 问题

旧版 `createQuestionGuide` 接口只解析请求体中的 `messages`，外链鉴权只需要 `shareId/outLinkUid`，没有绑定 `appId/chatId` 或读取服务端聊天记录：

```ts
const { messages } = CreateQuestionGuideBodySchema.parse(req.body);
...
const { outLinkConfig } = await authOutLinkValid({ shareId });
...
await createQuestionGuide({ messages, model: qgModel.model });
```

文件注释标记为 `Abandoned`，但路由仍然可用。

#### 触发场景

外部访问者持有公开分享链接的 `shareId` 和自己的 `outLinkUid`，构造任意 `messages` 调用 `/api/core/ai/agent/createQuestionGuide`。

#### 影响

攻击者可以把该接口当作公开模型调用入口消耗团队额度。因为 messages 不来自服务端 chat history，也更难与真实会话行为对应。

#### 建议修复

- 下线旧路由，统一使用 v2，并要求 `appId/chatId` 后从服务端读取最近消息。
- 如需保留兼容，增加 IP/用户/分享链接频率限制，并限制 messages 数量、长度和角色。
- 外链场景应校验发布链接是否允许问题引导，以及是否绑定当前 app。

### 中：新版问题引导接口信任客户端 questionGuide 配置，可绕过应用开关并指定模型/prompt

- 位置：
  - `projects/app/src/pages/api/core/ai/agent/v2/createQuestionGuide.ts:17`
  - `projects/app/src/pages/api/core/ai/agent/v2/createQuestionGuide.ts:25`
  - `projects/app/src/pages/api/core/ai/agent/v2/createQuestionGuide.ts:37`
  - `projects/app/src/pages/api/core/ai/agent/v2/createQuestionGuide.ts:40`
  - `projects/app/src/pages/api/core/ai/agent/v2/createQuestionGuide.ts:54`
  - `projects/app/src/pages/api/core/ai/agent/v2/createQuestionGuide.ts:56`
  - `projects/app/src/components/core/chat/ChatContainer/ChatBox/index.tsx:626`
  - `projects/app/src/components/core/chat/ChatContainer/ChatBox/index.tsx:630`
  - `packages/service/core/ai/functions/createQuestionGuide.ts:25`
  - `packages/service/core/ai/functions/createQuestionGuide.ts:29`
  - `projects/app/src/service/support/wallet/usage/push.ts:165`
  - `projects/app/src/service/support/wallet/usage/push.ts:184`

#### 问题

新版 `/api/core/ai/agent/v2/createQuestionGuide` 相比旧版已经绑定 `appId/chatId` 并读取真实历史，但仍把 `questionGuide` 暴露为可选请求体字段：

```ts
const { appId, chatId, questionGuide: inputQuestionGuide } = req.body;
const questionGuide = await (async () => {
  if (inputQuestionGuide) {
    return inputQuestionGuide;
  }
  const { chatConfig } = await getAppLatestVersion(appId);
  return chatConfig.questionGuide;
})();
```

前端确实会把当前 `questionGuide` 作为请求体提交，但服务端不能信任该字段。调用方可以直接构造请求，把已关闭的问题引导改成 `{ open: true }`，或指定任意 `model/customPrompt`。后续代码不会检查 `questionGuide.open`，而是直接用 `questionGuide?.model || getDefaultLLMModel().model` 调用 LLM，并把 `customPrompt` 拼进最终 user 消息。

#### 触发场景

外链用户、team-space 用户或有聊天访问权限的成员拿到某个真实 `chatId` 后，直接调用 v2 问题引导接口，在请求体里传入自定义 `questionGuide`。即使应用配置关闭问题引导，或配置了低成本模型，服务端仍会按请求体执行一次 LLM 调用并记入团队用量。

#### 影响

该问题不能像旧版接口那样提交任意历史消息，但可以绕过应用级问题引导开关、模型选择和 prompt 策略，造成额外用量、非预期模型成本和策略偏离。若 `customPrompt` 很长，还会放大单次请求的输入 token 成本。

#### 建议修复

- 服务端始终从 `getAppLatestVersion(appId)` 读取 `chatConfig.questionGuide`，不要接受客户端传入的完整配置。
- 明确校验 `questionGuide.open === true`，关闭时直接返回空数组或 403。
- 如果确实需要客户端传动态参数，只允许传无安全影响的展示参数，并对 `customPrompt` 长度做上限。
- 问题引导接口增加按 app/chat/uid 维度的频率限制。

### 中：应用详情缺少 appId 时没有提前返回，参数错误会变成噪声错误

- 位置：`projects/app/src/pages/api/core/app/detail.ts:13`

#### 问题

缺少 `appId` 时调用了 `Promise.reject`，但没有 `return` 或 `throw`：

```ts
if (!appId) {
  Promise.reject(CommonErrEnum.missingParams);
}
```

函数会继续执行 `authApp({ appId })`。

#### 触发场景

请求 `/api/core/app/detail` 时不带 `appId`。

#### 影响

本应返回明确参数错误，实际可能进入鉴权逻辑并产生不稳定的 500、未处理 rejection 或噪声日志。

#### 建议修复

改成：

```ts
if (!appId) {
  return Promise.reject(CommonErrEnum.missingParams);
}
```

或直接 `throw CommonErrEnum.missingParams`，并增加缺参测试。

### 中：应用更新接口缺少 appId 或 app 不存在时 Promise.reject 没有中断

- 位置：
  - `projects/app/src/pages/api/core/app/update.ts:54`
  - `projects/app/src/pages/api/core/app/update.ts:68`

#### 问题

`app/update` 与 `app/detail` 有同类问题。缺少 `appId` 或 `app` 不存在时调用了 `Promise.reject`，但没有 `return` 或 `throw`：

```ts
if (!appId) {
  Promise.reject(CommonErrEnum.missingParams);
}
...
if (!app) {
  Promise.reject(AppErrEnum.unExist);
}
```

函数会继续执行后续鉴权和更新路径。

#### 触发场景

请求更新接口时缺少 `appId`，或传入已删除/不存在的 appId。

#### 影响

本应明确返回参数错误或资源不存在，实际可能继续进入鉴权、移动或更新逻辑，产生不稳定错误和未处理 rejection 日志。虽然正常情况下 `authApp` 会先失败，但这里仍是错误处理中断缺失。

#### 建议修复

- 改成 `return Promise.reject(...)` 或 `throw ...`。
- 对 `app/update` 增加缺参和不存在 app 的回归测试。

### 高：应用创建接口 schema 解析失败后回退使用原始 req.body，运行时校验形同可绕过

- 位置：
  - `projects/app/src/pages/api/core/app/create.ts:40`
  - `projects/app/src/pages/api/core/app/create.ts:41`
  - `projects/app/src/pages/api/core/app/create.ts:63`
  - `packages/global/openapi/core/app/common/api.ts:40`

#### 问题

`CreateAppBodySchema` 已经定义了 `name/type/modules/edges/chatConfig` 等运行时约束，但接口没有用 `parse` 失败即拒绝，而是：

```ts
const parseResult = await CreateAppBodySchema.safeParseAsync(req.body);
const body = parseResult.success ? parseResult.data : req.body;
```

这意味着只要请求体不满足 schema，就直接进入“未校验原始 body”路径。后续 `onCreateApp` 会把 `type/modules/edges/chatConfig` 写入 Mongo；Mongoose 对 `modules`、`edges` 只是 `Array`，不能替代工作流节点结构校验。

#### 触发场景

有应用创建权限或目标父级写权限的用户绕过前端，提交非法 `modules/edges/chatConfig`、不完整节点、超大数组，或提交 schema 不允许但 Mongoose 可接收的结构。

#### 影响

可能创建出运行时无法调试/发布的损坏应用，或把异常工作流结构带入后续调度、版本、模板复制等链路。该问题也会削弱 OpenAPI schema 对外部 API 调用方的约束可信度。

#### 建议修复

- 改为 `const body = await CreateAppBodySchema.parseAsync(req.body)`，解析失败直接返回 400。
- 如果确实需要兼容旧数据，单独写迁移/兼容 schema，不要在公开写接口回退原始 body。
- 对非法节点、缺少 `name/type/modules`、超大 modules 增加接口测试。

### 高：AgentSkill 编辑调试沙箱允许写权限用户指定任意镜像，运行边界过宽

- 位置：
  - `projects/app/src/pages/api/core/agentSkills/edit.ts:32`
  - `projects/app/src/pages/api/core/agentSkills/edit.ts:57`
  - `packages/service/core/agentSkills/sandboxController.ts:86`
  - `packages/service/core/agentSkills/sandboxController.ts:246`
  - `packages/global/core/agentSkills/type.ts:170`

#### 问题

编辑调试沙箱接口没有使用 `CreateEditDebugSandboxBodySchema.parse`，只从 `req.body` 中取 `skillId` 和 `image`。随后只校验 `image.repository` 存在：

```ts
const { skillId, image } = req.body as CreateEditDebugSandboxBody;
if (image && !image.repository) { ... }
```

`createEditDebugSandbox` 会把该 `image` 传给 OpenSandbox 创建容器。schema 层也只约束了 `repository: string`、`tag?: string`，没有 allowlist、registry 限制、digest 固定或权限开关。

#### 触发场景

拥有某个 Skill 写权限的团队成员，通过 API 传入自定义镜像仓库/tag，触发平台创建编辑调试沙箱。

#### 影响

沙箱中运行的基础镜像可被调用者替换，容易绕过平台预期的运行时依赖、入口约束和安全加固。在启用 OpenSandbox、Volume Manager 或集群网络可达内部服务的部署中，风险会放大为资源滥用、横向探测或供应链执行风险。

#### 建议修复

- 默认不允许请求体覆盖镜像，只使用服务端 `AGENT_SANDBOX_OPENSANDBOX_IMAGE_REPO/TAG`。
- 如确需调试自定义镜像，应要求系统管理员权限，并配置镜像 registry allowlist、固定 digest 和审计日志。
- 路由使用 `CreateEditDebugSandboxBodySchema.parse(req.body)`，限制字符串长度和未知字段。

### 高：会话沙箱文件读写只复用聊天读鉴权，readChatLog 成员可操作他人沙箱文件

- 位置：
  - `projects/app/src/pages/api/core/ai/sandbox/list.ts:16`
  - `projects/app/src/pages/api/core/ai/sandbox/list.ts:18`
  - `projects/app/src/pages/api/core/ai/sandbox/read.ts:10`
  - `projects/app/src/pages/api/core/ai/sandbox/read.ts:12`
  - `projects/app/src/pages/api/core/ai/sandbox/write.ts:16`
  - `projects/app/src/pages/api/core/ai/sandbox/write.ts:18`
  - `projects/app/src/pages/api/core/ai/sandbox/download.ts:15`
  - `projects/app/src/pages/api/core/ai/sandbox/download.ts:17`
  - `projects/app/src/pages/api/core/ai/sandbox/getHtmlPreviewLink.ts:31`
  - `projects/app/src/service/support/permission/auth/chat.ts:183`
  - `projects/app/src/service/support/permission/auth/chat.ts:215`
  - `projects/app/src/service/support/permission/auth/chat.ts:220`
  - `packages/service/core/ai/sandbox/controller.ts:169`
  - `packages/service/core/ai/sandbox/controller.ts:184`
  - `projects/app/src/service/core/sandbox/fileService.ts:31`
  - `projects/app/src/service/core/sandbox/fileService.ts:52`
  - `packages/global/openapi/core/ai/sandbox/api.ts:34`
  - `packages/global/openapi/core/ai/sandbox/api.ts:48`

#### 问题

会话沙箱的 list/read/write/download/preview 接口都使用同一套模式：从请求体解析 `appId/chatId/path/outLinkAuthData`，调用 `authChatCrud` 后拿到 `uid`，再用 `getSandboxClient({ appId, userId: uid, chatId })` 操作沙箱文件。

```ts
const { uid } = await authChatCrud({ req, authToken: true, authApiKey: true, appId, chatId, ...outLinkAuthData });
const sandbox = await getSandboxClient({ appId, userId: uid, chatId });
await writeSandboxFile(sandbox, path, content);
```

但 `authChatCrud` 的 cookie/API key 分支只按应用读权限鉴权；如果调用者拥有 `hasReadChatLogPer`，函数会返回目标 chat 的归属 uid：

```ts
if (permission.hasReadChatLogPer) {
  return { uid: chat.outLinkUid ?? chat.tmbId, ... };
}
```

这对读取聊天记录是合理的，但对沙箱文件读写过宽。`getSandboxClient` 会用 `appId + uid + chatId` 生成沙箱 ID，并确保沙箱可用；随后 read/download 可以读取文件，write 可以改写文件，preview 可以把 HTML 上传成临时预览链接。

#### 触发场景

团队成员对某应用有聊天记录查看权限，但不是某条会话的发起人。该成员获取 `chatId` 后，调用 `/api/core/ai/sandbox/read` 下载该会话沙箱里的文件，或调用 `/api/core/ai/sandbox/write` 修改工作区文件。

如果会话来自外链用户，`uid` 会解析为 `outLinkUid`，内部只读日志成员同样可以进入该外链用户会话对应的沙箱文件空间。

#### 影响

沙箱中可能包含 agent 生成的代码、临时文件、上传文件派生内容、运行产物或用户手动编辑内容。读权限成员可读取/下载这些文件；写入口还允许篡改沙箱工作区，影响后续预览、下载和用户继续编辑。由于 `ensureAvailable()` 会启动或恢复沙箱，攻击者还可以通过只读权限触发沙箱资源消耗。

#### 建议修复

- 沙箱文件读写应区分“会话所有者/外链用户本人”和“聊天日志查看者”；`hasReadChatLogPer` 不应自动获得沙箱文件空间访问权。
- `write`、`download`、`getHtmlPreviewLink` 至少要求会话所有者或应用管理/运维权限，并记录审计。
- 对 read/list 如需支持管理员排查，应走单独只读审计接口，避免复用普通聊天读鉴权。
- `path/content` 增加长度、大小和路径范围限制，避免超大写入或异常路径传给底层 sandbox provider。

### 中：HTTP/MCP 工具集更新会更新任意一条 app version，未限定当前版本

- 位置：
  - `projects/app/src/pages/api/core/app/httpTools/update.ts:39`
  - `projects/app/src/pages/api/core/app/httpTools/update.ts:48`
  - `projects/app/src/pages/api/core/app/mcpTools/update.ts:37`
  - `projects/app/src/pages/api/core/app/mcpTools/update.ts:48`
  - `projects/app/src/pages/api/core/app/version/publish.ts:123`

#### 问题

HTTP ToolSet 和 MCP ToolSet 更新时会同时写当前 app 和版本表：

```ts
await MongoAppVersion.updateOne(
  { appId },
  { $set: { nodes: [toolSetRuntimeNode] } },
  { session }
);
```

版本表只有 `{ appId, time: -1 }` 索引，没有“当前版本”唯一字段。当前运行版本通常记录在 `app.pluginData.nodeVersion`，但更新接口没有按该 versionId 更新，也没有按 `isAutoSave/isPublish/time` 明确选择。

#### 触发场景

一个工具集存在多条版本记录后，管理员更新工具配置。MongoDB 的 `updateOne({ appId })` 可能命中任意一条符合条件的版本记录，而不是当前版本。

#### 影响

`app.modules` 与版本历史可能不一致。后续按版本加载工具、回滚、发布或插件化调用时，可能读取到旧工具配置、错误 headerSecret，或把历史版本误改成当前配置。

#### 建议修复

- 使用 `app.pluginData.nodeVersion` 精确更新 `{ _id: app.pluginData.nodeVersion, appId }`。
- 若工具集不应该维护普通版本历史，应移除这次版本表写入，改由发布流程统一创建版本。
- 增加“多版本工具集更新只影响当前版本”的回归测试。

### 高：HTTP 工具执行只在请求前做一次 SSRF 检查，重定向后可能访问内网地址

- 位置：
  - `packages/service/core/app/http.ts:149`
  - `packages/service/core/app/http.ts:155`
  - `packages/service/core/app/http.ts:169`
  - `packages/service/common/api/axios.ts:8`

#### 问题

HTTP Tool 在执行前构造 `fullUrl` 并调用 `isInternalAddress(fullUrl)`。但真正请求使用的是默认 axios 实例：

```ts
const { data } = await axios({
  method,
  baseURL: fullBaseUrl,
  url: toolPath,
  ...
});
```

`axios` 的 SSRF 拦截器只在 request interceptor 中检查初始 URL。若外部可控 URL 返回 30x 跳转到 `http://127.0.0.1`、metadata 或私网地址，当前代码没有在 redirect 后重新校验最终地址。

#### 触发场景

用户配置 HTTP Tool 指向一个公网地址，该地址返回重定向到内网服务。默认 axios 会跟随跳转。

#### 影响

HTTP Tool 可能成为内网探测或访问跳板。该问题与部署模板默认 `CHECK_INTERNAL_IP=false` 叠加时，普通私网段风险更高。

#### 建议修复

- 禁止自动重定向，或在每次 redirect 前校验 `Location` 解析后的目标地址。
- 统一封装“安全 axios”，在 follow-redirects 钩子里复用 `isInternalAddress/checkUrlSafety`。
- 对 HTTP Tool、OpenAPI schema 拉取、文件 URL 拉取等出站请求增加重定向 SSRF 测试。

### 中：本地文件预览鉴权没有校验 fileId 属于目标 dataset，跨库临时文件可被用于预览分块

- 位置：
  - `projects/app/src/pages/api/core/dataset/file/getPreviewChunks.ts:44`
  - `projects/app/src/pages/api/core/dataset/file/getPreviewChunks.ts:55`
  - `packages/service/support/permission/auth/file.ts:14`
  - `packages/service/support/permission/auth/file.ts:23`

#### 问题

本地文件预览接口在 `type === fileLocal` 时先调用 `authCollectionFile({ fileId: sourceId })`，该函数只校验 `sourceId` 是存在的 `dataset/` S3 key，并给出 owner 权限。随后接口再校验调用者对请求体 `datasetId` 有写权限，但没有校验 `sourceId` 前缀中的 datasetId 与请求体 `datasetId` 一致。

```ts
const fileAuthRes = await authCollectionFile({ fileId: sourceId, ... });
const { dataset } = await authDataset({ datasetId, per: WritePermissionVal, ... });
```

`getPreviewChunks` 最终会把 `sourceId` 交给 `readDatasetSourceRawText` 解析。

#### 触发场景

用户对 dataset A 有写权限，并持有或猜到 dataset B 下尚未入库的临时文件 key。调用预览分块时传 `datasetId=A`、`sourceId=dataset/B/...`。

#### 影响

可能跨知识库读取并预览文件内容，或造成解析缓存、图片提取、用量归属落到错误 dataset。和“用 fileId 创建 collection 未校验归属”的问题属于同一类文件归属边界缺口。

#### 建议修复

- `fileLocal` 场景校验 `sourceId.startsWith(\`dataset/${datasetId}/\`)`。
- `authCollectionFile` 返回文件归属信息，或改名为更明确的 `authDatasetTempFile` 并要求 datasetId 入参。
- 增加“不能用 dataset B 的 sourceId 在 dataset A 中预览”的测试。

### 高：HTTP ToolSet 创建到父应用时使用了团队权限位，读聊天日志者可创建子工具集

- 位置：
  - `projects/app/src/pages/api/core/app/httpTools/create.ts:27`
  - `projects/app/src/pages/api/core/app/httpTools/create.ts:28`
  - `packages/global/support/permission/user/constant.ts:29`
  - `packages/global/support/permission/app/constant.ts:19`
- 对比：
  - `projects/app/src/pages/api/core/app/mcpTools/create.ts:37`
  - `projects/app/src/pages/api/core/app/mcpTools/create.ts:38`

#### 问题

HTTP ToolSet 创建接口在传入 `parentId` 时走 `authApp`，但传入的 `per` 是团队级的 `TeamAppCreatePermissionVal`：

```ts
parentId
  ? await authApp({ req, appId: parentId, per: TeamAppCreatePermissionVal, authToken: true })
  : await authUserPer({ req, authToken: true, per: TeamAppCreatePermissionVal });
```

`TeamAppCreatePermissionVal` 的位值是 `0b001000`，刚好与 App 权限里的 `readChatLog: 0b1000` 撞位。`authApp` 会按 App 权限解释该位，因此拥有父应用“查看聊天日志”权限的成员，即使没有写权限，也可能通过该接口在父应用下创建 HTTP ToolSet。

同类 `mcpTools/create.ts` 在有 `parentId` 时使用的是 `WritePermissionVal`，符合创建子资源的语义。

#### 触发场景

成员只被授予父应用的日志查看权限，没有编辑应用权限。调用 HTTP ToolSet 创建接口并传入该父应用 `parentId`。

#### 影响

资源树写入权限被降级，日志查看者可以创建新的工具集子应用，后续可能结合 HTTP Tool 的出站请求能力扩大影响。

#### 建议修复

- `parentId` 场景改用 App 资源域的 `WritePermissionVal` 或 `ManagePermissionVal`。
- 禁止把团队权限位直接传入资源权限鉴权函数，可在类型层区分 `TeamPermissionValue` 与 `AppPermissionValue`。
- 增加“只有 readChatLog 不能在父应用下创建 HTTP ToolSet”的回归测试。

### 高：全局 API Key 可指定团队内任意 appId 发起对话，和“不能访问应用”的产品语义不一致

- 位置：
  - `packages/service/support/permission/auth/common.ts:59`
  - `packages/service/support/permission/auth/common.ts:77`
  - `packages/service/support/permission/auth/common.ts:84`
  - `projects/app/src/pages/api/v1/chat/completions.ts:622`
  - `projects/app/src/pages/api/v1/chat/completions.ts:629`
  - `projects/app/src/pages/api/v2/chat/completions.ts:693`
  - `projects/app/src/pages/api/v2/chat/completions.ts:700`
- 产品提示：
  - `packages/web/i18n/zh-CN/account_apikey.json:2`

#### 问题

全局 API Key 创建只要求团队级 `TeamApikeyCreatePermissionVal`，不会绑定具体应用。UI 文案也说明“无法访问应用，访问应用需使用应用内的 API key”。

但 `/v1/chat/completions` 和 `/v2/chat/completions` 的 API Key 分支使用：

```ts
const currentAppId = apiKeyAppId || appId;
const app = await MongoApp.findOne({ _id: currentAppId, teamId });
```

如果 key 本身没有绑定 `apiKeyAppId`，调用方可以在 body 中传任意团队内 `appId`。旧格式 `Bearer fastgpt-xxxx-appId` 还会把 Authorization 后缀解析成 `authorizationAppid`，同样可作为 `currentAppId` 使用。这里没有再调用 `authAppByTmbId` 校验该 key 创建者是否有目标应用读/运行权限。

#### 触发场景

成员拥有“创建 API Key”团队权限，创建全局 key。即使该成员没有某个私有应用的读取权限，也可以拿全局 key 调用对话接口并在请求体或 Authorization 后缀中指定该私有应用 `appId`。

#### 影响

全局 API Key 的实际能力扩大为团队级应用调用凭证，可能绕过应用级权限、应用内 Key 管理和审计预期。

#### 建议修复

- 对应用对话接口要求 API Key 必须绑定 `appId`，全局 key 直接拒绝。
- 或在全局 key 指定 `appId` 时调用 `authAppByTmbId({ tmbId, appId, per: ReadPermissionVal })`。
- 废弃 `Bearer key-appId` 旧格式，或只允许 app-bound key 的 appId 与后缀一致。
- 增加“全局 API Key 不能访问未授权应用”的测试。

### 高：API Key 续聊只校验 team/app，不绑定 chat 来源和调用身份，可能串读或串写已有会话

- 位置：
  - `projects/app/src/pages/api/v1/chat/completions.ts:658`
  - `projects/app/src/pages/api/v1/chat/completions.ts:660`
  - `projects/app/src/pages/api/v1/chat/completions.ts:663`
  - `projects/app/src/pages/api/v2/chat/completions.ts:729`
  - `projects/app/src/pages/api/v2/chat/completions.ts:731`
  - `projects/app/src/pages/api/v2/chat/completions.ts:734`
  - `projects/app/src/pages/api/v1/chat/completions.ts:213`
  - `projects/app/src/pages/api/v2/chat/completions.ts:229`

#### 问题

API Key 分支查询已有 chat 时只按 `{ appId, chatId }` 取记录，随后仅校验 `teamId`。代码注释明确跳过了创建者区分：

```ts
chat &&
  (String(chat.teamId) !== teamId ||
    (authType === AuthUserTypeEnum.token && String(chat.tmbId) !== tmbId))
```

后续会按同一个 `appId/chatId` 拉取历史消息和变量，再把新一轮对话写回同一 `chatId`。这里没有限制 `source === api`，也没有绑定 `outLinkUid/customUid/sourceName/apikey`。

#### 触发场景

应用 API Key 调用方知道同一 app 下某个在线聊天、分享链接聊天、team-space 聊天或另一个 API 调用方的 `chatId`，然后用该 `chatId` 调用 completions。

#### 影响

API Key 可读取已有会话上下文并继续写入，造成跨来源串读、串写和审计归属混乱。即使产品允许 API Key 管理本应用的 API 会话，也不应默认混入在线/分享/team-space 会话。

#### 建议修复

- API Key 续聊只允许 `source === api` 的 chat。
- 对 API 来源 chat 继续按 `apikey`、`sourceName`、`customUid/outLinkUid` 或显式 owner scope 做绑定。
- 若确需管理全应用会话，应提供单独的管理接口，并要求应用 `ManagePermissionVal`。
- 增加“API Key 不能用在线/分享/team chatId 续聊”的测试。

### 高：OpenAPI Schema URL 解析只校验入口 URL，Swagger Parser 可能继续解析内网或 file `$ref`

- 位置：
  - `projects/app/src/pages/api/core/app/httpTools/getApiSchemaByUrl.ts:16`
  - `projects/app/src/pages/api/core/app/httpTools/getApiSchemaByUrl.ts:20`
  - `packages/global/openapi/core/app/httpTools/api.ts:81`
  - `packages/global/common/string/swagger.ts:4`
  - `packages/global/common/string/swagger.ts:5`
- 对比：
  - `packages/service/core/app/mcp.ts:141`
  - `packages/service/core/app/mcp.ts:143`
  - `packages/service/core/app/mcp.ts:146`

#### 问题

HTTP ToolSet 的 schema 解析接口只要求登录态，并对顶层 `url` 调一次 `isInternalAddress`。入参 schema 只是 `z.string()`，没有协议白名单。

真正解析使用：

```ts
export const loadOpenAPISchemaFromUrl = async (url: string) => {
  return SwaggerParser.bundle(url);
};
```

`SwaggerParser.bundle` 会解析 OpenAPI 中的 `$ref`。当前没有禁用 `file` 或 `http` resolver，也没有对每个外部引用做 SSRF 校验。MCP 工具 schema 解析处已经显式禁用了 `file` 和 `http` resolver，说明这里缺少同等保护。

#### 触发场景

已登录用户传入公网 schema URL，该 schema 中包含 `$ref: "http://169.254.169.254/..."`、`$ref: "http://10.0.0.1/..."` 或 `file:///...`。顶层公网 URL 通过校验后，解析器继续读取外部引用。

#### 影响

服务端可能被用来访问内网 HTTP 资源或本地文件 resolver，造成 SSRF、敏感文件探测或解析结果泄露。

#### 建议修复

- `GetApiSchemaByUrlBodySchema` 使用 `checkUrlSafety` 或等价逻辑，限制 `http/https`。
- 调用 Swagger Parser 时禁用 `file`、`http` resolver，或对每个外部引用套用同一 SSRF 校验。
- 增加“公网 schema 引用 metadata/file 被拒绝”的测试。

### 高：HTTP Tool runTool 调试接口只要求登录，可被任意用户当作服务端出站代理

- 位置：
  - `projects/app/src/pages/api/core/app/httpTools/runTool.ts:15`
  - `projects/app/src/pages/api/core/app/httpTools/runTool.ts:17`
  - `projects/app/src/pages/api/core/app/httpTools/runTool.ts:29`
  - `packages/service/core/app/http.ts:87`
  - `packages/service/core/app/http.ts:169`

#### 问题

`runTool` 接口只执行：

```ts
await authCert({ req, authToken: true });
```

随后完全使用请求体中的 `baseUrl/toolPath/method/customHeaders/headerSecret/staticHeaders/staticBody/params` 调用 `runHTTPTool`。接口没有要求调用者对某个 HTTP ToolSet 有读/写权限，也没有要求这些参数来自已保存的工具配置。

#### 触发场景

任意已登录成员直接调用 `runTool`，提交任意公网 URL、请求方法、请求头和请求体。若部署默认未开启完整内网 IP 检查，还可访问 RFC1918 私网地址；即使开启，也仍是一个不受应用权限约束的服务端出站能力。

#### 影响

普通登录用户可借 FastGPT 服务端网络发起任意 HTTP 请求，造成 SSRF、内网探测、第三方请求伪造或审计绕过。

#### 建议修复

- 调试接口必须绑定 `appId/toolId` 并要求对应工具集 `WritePermissionVal`。
- 不接受完整工具配置作为自由输入，优先从服务端已保存的工具配置读取。
- 对需要临时调试的未保存工具，至少要求团队管理/应用写权限，并加频率限制和审计日志。

### 高：outLink/team-space 已有 chat 鉴权没有绑定 shareId/source，存在入口混用串读风险

- 位置：
  - `projects/app/src/service/support/permission/auth/chat.ts:105`
  - `projects/app/src/service/support/permission/auth/chat.ts:116`
  - `projects/app/src/service/support/permission/auth/chat.ts:153`
  - `projects/app/src/service/support/permission/auth/chat.ts:168`
  - `projects/app/src/pages/api/core/chat/outLink/init.ts:24`
  - `projects/app/src/pages/api/core/chat/outLink/init.ts:33`

#### 问题

`authChatCrud` 的 outLink 分支已确认 `shareId` 对应的 appId，但读取已有 chat 后只校验：

```ts
chat.outLinkUid === uid
```

没有校验 `chat.shareId === shareId`，也没有校验 `chat.source === share`。team-space 分支也只校验 `teamId + outLinkUid`，没有校验 `source === team`。`outLink/init` 同样只校验 `outLinkUid`。

当没有外链 hook 时，`uid` 通常来自调用方传入的 `outLinkUid`，不同分享入口或不同来源之间更容易发生 uid 碰撞。

#### 触发场景

同一 app 发布了多个分享链接，外部用户在两个链接中使用相同 `outLinkUid`。如果知道另一个入口的 `chatId`，当前入口可通过 init、记录读取、引用读取等走 `authChatCrud` 的接口访问不属于该入口的历史。

team-space 场景下，如果某个 `outLinkUid` 与分享链接用户 uid 碰撞，也可能因为没有校验 `source` 而混用 chat。

#### 影响

分享链接、team-space 和普通外链之间的会话隔离依赖不完整，可能造成聊天历史、变量、引用数据或文件预签名的串读。

#### 建议修复

- outLink 已有 chat 必须同时校验 `appId/chatId/shareId/outLinkUid/source=share`。
- team-space 已有 chat 必须校验 `appId/chatId/teamId/outLinkUid/source=team`，并复用 team tag 鉴权。
- `outLink/init`、记录读取、引用读取、历史状态等入口统一使用同一套完整绑定条件。

### 高：历史写/删接口传入写权限但 authChatCrud 固定按读权限鉴权，readChatLog 可修改他人历史

- 位置：
  - `projects/app/src/pages/api/core/chat/history/updateHistory.ts:12`
  - `projects/app/src/pages/api/core/chat/history/updateHistory.ts:17`
  - `projects/app/src/pages/api/core/chat/history/delHistory.ts:12`
  - `projects/app/src/service/support/permission/auth/chat.ts:184`
  - `projects/app/src/service/support/permission/auth/chat.ts:189`
  - `projects/app/src/service/support/permission/auth/chat.ts:215`

#### 问题

`updateHistory` 调用 `authChatCrud` 时传入了 `per: WritePermissionVal`，但 `authChatCrud` cookie/API key 分支内部固定用 `ReadPermissionVal` 调 `authApp`：

```ts
const { teamId, tmbId, permission, authType } = await authApp({
  ...
  per: ReadPermissionVal
});
```

之后只要 `permission.hasReadChatLogPer` 为真，就允许操作同 app 下任意 chat。`delHistory` 没有显式传写权限，也复用同一鉴权。

#### 触发场景

成员拥有应用 `readChatLog` 权限，但没有写权限。调用 `updateHistory` 修改他人 chat 标题/置顶/自定义标题，或调用 `delHistory` 软删除他人 chat。

#### 影响

“查看日志”权限变成了“修改/删除日志”权限，破坏只读审计角色的边界。

#### 建议修复

- `authChatCrud` 应尊重调用方传入的 `per`，或拆分 `authChatRead` / `authChatWrite`。
- 历史写/删接口要求应用 `WritePermissionVal` 或更高权限。
- 保留日志管理能力时，应独立定义 `manageChatLog` 权限，避免复用 read 权限。

### 高：单条聊天记录和反馈管理写接口只走读语义，readChatLog 可删除消息或改反馈

- 位置：
  - `projects/app/src/pages/api/core/chat/record/delete.ts:19`
  - `projects/app/src/pages/api/core/chat/record/delete.ts:28`
  - `projects/app/src/pages/api/core/chat/feedback/adminUpdate.ts:18`
  - `projects/app/src/pages/api/core/chat/feedback/adminUpdate.ts:26`
  - `projects/app/src/pages/api/core/chat/feedback/updateFeedbackReadStatus.ts:20`
  - `projects/app/src/pages/api/core/chat/feedback/updateFeedbackReadStatus.ts:27`
  - `projects/app/src/pages/api/core/chat/feedback/closeCustom.ts:20`
  - `projects/app/src/pages/api/core/chat/feedback/closeCustom.ts:31`
  - `projects/app/src/service/support/permission/auth/chat.ts:184`
  - `projects/app/src/service/support/permission/auth/chat.ts:215`

#### 问题

`record/delete`、`feedback/adminUpdate`、`feedback/updateFeedbackReadStatus` 和 `feedback/closeCustom` 都调用 `authChatCrud`，但没有传入或没有生效写权限。`authChatCrud` cookie/API key 分支固定用 `ReadPermissionVal` 调 `authApp`，随后只要 `permission.hasReadChatLogPer` 为真，就允许访问同 app 下任意 chat。

这些接口随后会软删单条消息、写入 `adminFeedback`、更新 `isFeedbackRead` 或移除 `customFeedbacks`。

#### 触发场景

成员只有应用 `readChatLog` 权限，没有写权限。该成员知道 `chatId/dataId/contentId` 后，调用上述接口删除单条消息或修改反馈状态。

#### 影响

只读审计/日志查看角色可以改写日志内容和反馈运营状态，破坏对话记录完整性，也会污染未读反馈、管理员反馈和自定义反馈统计。

#### 建议修复

- `authChatCrud` 尊重调用方传入的写权限，或拆分只读/管理鉴权函数。
- 单条记录删除和管理员反馈写接口要求 `WritePermissionVal` 或独立 `manageChatLog/manageFeedback` 权限。
- 查询条件补充 `obj/source/deleteTime` 等约束，避免更新到非预期消息。
- 增加 `readChatLog` 不能删除消息、不能改反馈的回归测试。

### 中：team-space 对话运行时使用 app owner 的 tmbId，外部用户会继承内部成员资料和审计归属

- 位置：
  - `projects/app/src/pages/api/v1/chat/completions.ts:587`
  - `projects/app/src/pages/api/v1/chat/completions.ts:589`
  - `projects/app/src/pages/api/v1/chat/completions.ts:591`
  - `projects/app/src/pages/api/v1/chat/completions.ts:291`
  - `projects/app/src/pages/api/v2/chat/completions.ts:659`
  - `projects/app/src/pages/api/v2/chat/completions.ts:661`
  - `projects/app/src/pages/api/v2/chat/completions.ts:663`
  - `projects/app/src/pages/api/v2/chat/completions.ts:352`
  - `packages/service/support/user/team/utils.ts:7`
  - `packages/service/core/workflow/dispatch/child/runTool.ts:105`

#### 问题

team-space completions 鉴权成功后返回：

```ts
tmbId: app.tmbId,
authType: AuthUserTypeEnum.outLink,
outLinkUserId: uid
```

工作流执行时又用该 `tmbId` 调 `getRunningUserInfoByTmbId`。工具节点会把 `username/contact/membername/teamName/teamId/name` 等 `runningUserInfo` 注入运行上下文。

这意味着 team-space 外部用户虽然保存为 `outLinkUid`，但运行身份、工具变量和部分审计归属使用的是应用 owner，而不是外部 `uid` 或一个明确的虚拟外部用户上下文。

#### 触发场景

team-space 用户调用应用，工作流中存在 HTTP 工具、子应用、插件或使用用户信息变量的节点。

#### 影响

外部 team-space 用户可能间接继承应用 owner 的成员名、联系方式、外部供应商配置或审计身份，造成日志归属不准和内部成员资料暴露风险。该行为也与通用 `authChatCrud` 返回 `AuthUserTypeEnum.teamDomain` 的语义不一致。

#### 建议修复

- team-space completions 返回 `AuthUserTypeEnum.teamDomain`。
- 为外部 team-space 用户构造专门的 `runningUserInfo`，只包含允许暴露的 team 信息和外部 uid。
- 工具节点中区分内部团队成员变量和外部访问者变量，避免默认注入内部 owner 资料。

### 中：历史列表和状态接口普通 app 分支只校验登录态，不校验当前 app 访问权限

- 位置：
  - `projects/app/src/pages/api/core/chat/history/getHistories.ts:69`
  - `projects/app/src/pages/api/core/chat/history/getHistories.ts:70`
  - `projects/app/src/pages/api/core/chat/history/getHistoryStatus.ts:43`
  - `projects/app/src/pages/api/core/chat/history/getHistoryStatus.ts:44`
  - `projects/app/src/pages/api/core/chat/history/getHistoryStatus.ts:35`

#### 问题

普通 app 分支只调用 `authCert({ authToken: true, authApiKey: true })`，然后按 `{ appId, tmbId }` 或 `{ appId, tmbId, chatIds }` 查询历史元数据。它没有调用 `authApp({ appId, per: ReadPermissionVal })`。

team-space 的 `getHistoryStatus` 分支也只校验 team token 后按 `appId/outLinkUid/source` 查状态，没有像 `getHistories` 一样校验 app 的 `teamTags` 可访问性。

#### 触发场景

成员曾经能访问某 app 并产生历史，后来被移除 app 权限。该成员仍可通过历史列表或状态接口看到自己的旧 chat 标题、更新时间、生成状态、已读状态等元数据。

team-space 用户标签变更后，只要知道 `chatId`，也可能继续查询状态。

#### 影响

权限变更后历史元数据仍可见，侧漏应用仍存在、旧对话标题和运行状态。API Key 场景还会受全局 key/appId 问题叠加。

#### 建议修复

- 普通 app 分支补 `authApp({ appId, per: ReadPermissionVal })`。
- API Key 分支要求 app-bound key 或对指定 app 做权限校验。
- team-space 状态接口补 app teamTags 校验，并绑定 `source=team`。

### 中：API Key 清空历史按 app + source 全量软删，未限定调用方或 customUid

- 位置：
  - `projects/app/src/pages/api/core/chat/history/clearHistories.ts:47`
  - `projects/app/src/pages/api/core/chat/history/clearHistories.ts:49`
  - `projects/app/src/pages/api/core/chat/history/clearHistories.ts:58`
  - `projects/app/src/pages/api/core/chat/history/clearHistories.ts:60`

#### 问题

`clearHistories` 在 API Key 鉴权下构造的删除条件是：

```ts
{ appId, source: ChatSourceEnum.api }
```

随后把匹配到的所有 chatId 全部软删除。这里没有限定 `tmbId`、`apikey`、`sourceName`、`customUid/outLinkUid` 或调用方声明的用户范围。

#### 触发场景

同一个 app 有多个 API 调用方或多个业务用户通过 `customUid` 产生会话。任一可访问该 app 的 API Key 调用清空历史接口。

#### 影响

一个 API Key 可以清空该 app 下所有 API 来源历史，影响其他 key、其他业务用户和审计追溯。

#### 建议修复

- API Key 清空历史默认限定到当前 key 或当前 `customUid/outLinkUid`。
- 若要提供全 app API 历史清空能力，应要求 app 管理权限并使用独立管理接口。
- 删除前记录 key id、sourceName、影响数量等审计字段。

### 中：AIProxy createChannel 失败响应回传原始错误对象，可能泄露代理 token

- 位置：
  - `projects/app/src/pages/api/aiproxy/api/createChannel.ts:18`
  - `projects/app/src/pages/api/aiproxy/api/createChannel.ts:20`
  - `projects/app/src/pages/api/aiproxy/api/createChannel.ts:25`
  - `projects/app/src/pages/api/aiproxy/api/createChannel.ts:29`

#### 问题

`createChannel` 向 AIProxy 请求时会在 headers 中带上：

```ts
Authorization: `Bearer ${token}`
```

catch 分支直接把原始 `error` 放进响应 `data`：

```ts
res.json({
  success: false,
  message: getErrText(error),
  data: error
});
```

AxiosError 往往包含 `config.headers`、请求 URL、响应体等调试信息。

#### 触发场景

系统管理员调用创建渠道，AIProxy 返回错误、网络失败或超时。

#### 影响

响应体可能把 `AIPROXY_API_TOKEN` 或内部代理请求信息返回到前端、浏览器日志或错误上报系统。入口要求系统管理员，风险范围较小，但泄露的是高权限服务 token。

#### 建议修复

- 响应只返回脱敏后的 `message/code/status`。
- 记录服务端日志时对 `Authorization`、cookie、token 字段做统一脱敏。
- 对 AxiosError 使用专门的 safe serializer。

### 高：MCP Tool getTools/runTool 调试接口只要求登录态，可被当作服务端 MCP 出站代理

- 位置：
  - `projects/app/src/pages/api/core/app/mcpTools/getTools.ts:17`
  - `projects/app/src/pages/api/core/app/mcpTools/getTools.ts:19`
  - `projects/app/src/pages/api/core/app/mcpTools/getTools.ts:21`
  - `projects/app/src/pages/api/core/app/mcpTools/getTools.ts:23`
  - `projects/app/src/pages/api/core/app/mcpTools/runTool.ts:16`
  - `projects/app/src/pages/api/core/app/mcpTools/runTool.ts:18`
  - `projects/app/src/pages/api/core/app/mcpTools/runTool.ts:20`
  - `projects/app/src/pages/api/core/app/mcpTools/runTool.ts:29`
  - `packages/global/openapi/core/app/mcpTools/api.ts:100`
  - `packages/global/openapi/core/app/mcpTools/api.ts:126`
  - `packages/service/core/app/mcp.ts:17`
  - `packages/service/core/app/mcp.ts:52`
  - `packages/service/core/app/mcp.ts:60`
  - `packages/service/core/app/mcp.ts:68`
  - `packages/service/core/app/mcp.ts:189`
  - `packages/service/core/app/mcp.ts:202`

#### 问题

`mcpTools/getTools` 和 `mcpTools/runTool` 只调用：

```ts
await authCert({ req, authToken: true });
```

随后从请求体解析调用方提供的 `url/headerSecret/toolName/params`，只做 `assertMCPUrlNotInternal(url)`，再创建 `MCPClient` 发起 Streamable HTTP 或 SSE 连接并执行 `listTools/callTool`。接口没有绑定 `appId`、已保存的 MCP ToolSet，也没有校验调用者对某个应用或工具集的写/管理权限。

#### 触发场景

任意登录用户直接调用 `/api/core/app/mcpTools/getTools` 或 `/api/core/app/mcpTools/runTool`，传入外部 MCP 服务地址、自定义请求头和工具参数。

#### 影响

后端会成为通用 MCP 出站代理，可被用来发起长时间工具调用、触发第三方副作用或消耗服务端连接资源。由于 MCP 连接底层使用 `fetch`，重定向后的目标也没有二次内网校验；当私网地址默认策略较宽时，该问题还会放大 SSRF 风险。

#### 建议修复

- 调试远程 MCP 工具时要求应用写权限或工具集管理权限，并绑定到明确的 `appId/toolSetId`。
- 只允许调用已保存且当前用户有权限的 MCP 配置；临时 URL 调试应放到受限管理接口。
- 对 MCP 连接禁用或手动处理 redirect，并对每一次最终请求目标做 IP/协议校验。
- 增加调用频率、连接时长、工具参数大小和审计记录限制。

### 高：workflow debug/chatTest 只要求应用读权限，却执行调用方提交的节点图

- 位置：
  - `projects/app/src/pages/api/core/workflow/debug.ts:20`
  - `projects/app/src/pages/api/core/workflow/debug.ts:47`
  - `projects/app/src/pages/api/core/workflow/debug.ts:62`
  - `projects/app/src/pages/api/core/workflow/debug.ts:77`
  - `projects/app/src/pages/api/core/workflow/debug.ts:78`
  - `projects/app/src/pages/api/core/workflow/debug.ts:83`
  - `projects/app/src/pages/api/core/chat/chatTest.ts:70`
  - `projects/app/src/pages/api/core/chat/chatTest.ts:90`
  - `projects/app/src/pages/api/core/chat/chatTest.ts:94`
  - `projects/app/src/pages/api/core/chat/chatTest.ts:162`
  - `projects/app/src/pages/api/core/chat/chatTest.ts:215`
  - `projects/app/src/pages/api/core/chat/chatTest.ts:235`
  - `projects/app/src/pages/api/core/chat/chatTest.ts:236`
  - `packages/global/openapi/core/chat/completion/api.ts:140`
  - `packages/global/openapi/core/chat/completion/api.ts:141`
  - `packages/global/openapi/core/chat/completion/api.ts:142`

#### 问题

`workflow/debug` 从请求体接收 `nodes/edges/chatConfig/variables`，但只要求：

```ts
authApp({ req, authToken: true, appId, per: ReadPermissionVal })
```

之后直接把调用方提交的 `nodes/edges/chatConfig` 传入 `dispatchWorkFlow`。`chat/chatTest` 也只要求 `ReadPermissionVal`，再把 `ChatTestPropsSchema` 中的 `nodes/edges/chatConfig/variables` 转换为运行时图并执行。

#### 触发场景

成员只有某应用读权限，没有编辑权限。该成员构造请求，把自定义节点图提交到 debug/test 接口，例如加入 HTTP/MCP/工具/模型节点，或调整 `chatConfig/variables`。

#### 影响

读权限成员可以执行未保存、未发布、由自己提交的工作流图，触发外部请求、工具副作用和模型消耗，并产生 usage/chat test 记录。这把“查看/运行已授权应用”和“编辑调试任意草稿图”的边界混在了一起。

#### 建议修复

- 对调用方提交 `nodes/edges/chatConfig` 的 debug/test 请求要求应用写权限。
- 若读权限允许试聊，应只运行服务端保存的已发布图或当前可读版本，不接受客户端自定义节点图。
- 将“运行应用”和“调试草稿”拆成两个权限点，并为读权限成员增加回归测试。

### 高：AgentSkill 创建/移动未校验 parentId 为文件夹且非自身/子孙，可能形成异常目录树

- 位置：
  - `projects/app/src/pages/api/core/agentSkills/create.ts:51`
  - `projects/app/src/pages/api/core/agentSkills/create.ts:53`
  - `projects/app/src/pages/api/core/agentSkills/create.ts:163`
  - `projects/app/src/pages/api/core/agentSkills/create.ts:165`
  - `projects/app/src/pages/api/core/agentSkills/folder/create.ts:25`
  - `projects/app/src/pages/api/core/agentSkills/folder/create.ts:27`
  - `projects/app/src/pages/api/core/agentSkills/folder/create.ts:43`
  - `projects/app/src/pages/api/core/agentSkills/folder/create.ts:47`
  - `projects/app/src/pages/api/core/agentSkills/update.ts:58`
  - `projects/app/src/pages/api/core/agentSkills/update.ts:62`
  - `projects/app/src/pages/api/core/agentSkills/update.ts:163`
  - `projects/app/src/pages/api/core/agentSkills/update.ts:196`
  - `projects/app/src/pages/api/core/agentSkills/update.ts:199`
  - `packages/service/core/agentSkills/controller.ts:350`
  - `packages/service/core/agentSkills/controller.ts:371`
  - `packages/service/core/agentSkills/controller.ts:392`
  - `packages/service/core/agentSkills/controller.ts:419`
  - `packages/service/core/agentSkills/controller.ts:424`

#### 问题

AgentSkill 创建、创建文件夹和移动时，只校验调用者对 `parentId` 指向资源有写/管理权限，没有校验目标资源是否为 `AgentSkillTypeEnum.folder`。移动时也没有拒绝 `parentId === skillId` 或把文件夹移动到自身子孙节点下。

服务层 `createSkillFolder` 直接写入 `parentId`。`getSkillFolderPath/getParents` 会递归向上查找父节点，但没有 visited/depth 防护；一旦目录树出现环，路径解析类接口可能无限递归直到栈溢出或请求超时。

#### 触发场景

拥有某 skill 管理权限的成员，把该 skill 的 `parentId` 更新为自己或自己的子节点；或在普通 skill 下创建新的 skill/folder。

#### 影响

目录树会出现“非文件夹下面挂子资源”或环形父子关系，导致列表、路径面包屑、权限继承和更新时间刷新行为异常。环形树还可能让依赖递归路径解析的接口持续失败。

#### 建议修复

- 创建/移动前读取目标 `parentId`，要求目标存在、同团队且 `type === folder`。
- 移动文件夹前校验目标不等于自身，也不在自身子树内。
- 在 `getParents` 等递归路径函数中加入 visited set 和最大深度兜底。
- 为 app/dataset/collection/agentSkill 等资源树抽一个统一的 parentId 校验 helper，避免各资源重复遗漏。

### 中：营销工作流导入 fetchWorkflow 是登录态通用服务端 JSON 抓取入口

- 位置：
  - `projects/app/src/pages/api/support/marketing/fetchWorkflow.ts:22`
  - `projects/app/src/pages/api/support/marketing/fetchWorkflow.ts:24`
  - `projects/app/src/pages/api/support/marketing/fetchWorkflow.ts:29`
  - `projects/app/src/pages/api/support/marketing/fetchWorkflow.ts:33`
  - `projects/app/src/pages/api/support/marketing/fetchWorkflow.ts:39`
  - `projects/app/src/web/context/useInitApp.ts:143`
  - `projects/app/src/pageComponents/dashboard/agent/JsonImportModal.tsx:50`
  - `projects/app/src/pageComponents/dashboard/agent/JsonImportModal.tsx:53`

#### 问题

`fetchWorkflow` 只要求登录态，然后从请求体读取任意 `url`，通过服务端 `axios.get` 抓取 JSON：

```ts
await authCert({ req, authToken: true });
const url = req.body?.url;
...
const { data } = await axios.get(url, { timeout: 30000 });
```

前端会把 `utm_workflow` 落到 localStorage，并在 JSON 导入弹窗里自动请求该接口，但后端本身没有限制 URL 必须来自官方营销短链、签名链接或可信域名。

#### 触发场景

任意登录用户直接调用 `/api/support/marketing/fetchWorkflow`，传入可控 URL；或诱导用户访问带 `utm_workflow` 的链接后打开导入弹窗。

#### 影响

该接口可被当作服务端 JSON 抓取代理。虽然入口有内网地址检查，但私网地址默认策略、HTTP 重定向和 DNS 变化仍会影响实际边界；即使只返回 JSON，也可能泄露内部 JSON 接口内容或消耗服务端请求资源。

#### 建议修复

- 将 `utm_workflow` 限制为官方域名、签名短链或后端预登记的模板 ID。
- 禁用 redirect，或在每次跳转后重新做协议/IP 校验。
- 对响应大小、content-type、超时时间和频率做限制。
- 如只是营销模板导入，推荐改成“短链 ID -> 服务端读取可信存储”的模式，避免直接让用户提交任意 URL。

### 高：发布链接 hookUrl 保存入口未做 URL 安全校验，可持久触发服务端出站回调

- 位置：
  - `projects/app/src/pages/api/support/outLink/create.ts:34`
  - `projects/app/src/pages/api/support/outLink/update.ts:57`
  - `packages/service/support/outLink/runtime/auth.ts:27`
  - `packages/service/support/outLink/runtime/auth.ts:101`
  - `packages/service/support/outLink/tools.ts:47`
  - `packages/service/common/system/utils.ts:192`

#### 问题

发布链接创建/更新会把请求体中的 `limit` 原样写入 `MongoOutLink`，没有对 `limit.hookUrl` 调用 `checkUrlSafety` 或做域名白名单校验。运行时会把该 URL 当作 axios `baseURL`，分别请求：

- `/shareAuth/init`
- `/shareAuth/start`
- `/shareAuth/finish`

这些调用会携带 `token/question/chatId/responseData/flowResponses` 等数据。

#### 触发场景

有应用管理权限的成员创建或更新发布链接，把 `limit.hookUrl` 设置为可控地址。随后外部用户访问分享链接、开始对话或完成 OpenAPI share chat。

#### 影响

这是一个持久化的服务端出站回调点。默认私网拦截策略较宽时，可能访问 RFC1918 私网服务；即使只指向公网，也会持续把分享链接用户问题、回答、流程响应和 chatId 推送给该地址。若团队成员误填或恶意配置，影响会跨后续所有分享访问持续存在。

#### 建议修复

- 创建/更新 outLink 时对 `limit.hookUrl` 使用 `checkUrlSafety`，限制 http/https 并拒绝内网/metadata。
- 运行时禁用或手动处理 redirect，并对最终目标再次做安全校验。
- 如这是产品能力，增加域名 allowlist、显式“外部回调”权限和审计日志。
- 限制回调 payload 大小，并避免默认推送完整 `flowResponses`。

### 中：lafApi 是无鉴权服务端反代，私有 Laf 环境会被公开到 FastGPT API 下

- 位置：
  - `projects/app/src/pages/api/lafApi/[...path].ts:6`
  - `projects/app/src/pages/api/lafApi/[...path].ts:19`
  - `projects/app/src/pages/api/lafApi/[...path].ts:26`
  - `projects/app/src/pages/api/lafApi/[...path].ts:36`
  - `projects/app/src/pages/api/lafApi/[...path].ts:44`
  - `projects/app/src/web/common/api/lafRequest.ts:164`
  - `projects/app/src/web/support/laf/api.ts:3`
  - `projects/app/src/web/support/laf/api.ts:13`
  - `projects/app/src/web/support/laf/api.ts:22`
  - `projects/app/data/config.json:4`

#### 问题

`/api/lafApi/[...path]` 不做本地登录态或团队权限校验。只要 `global.feConfigs.lafEnv` 存在，就把请求 method、headers、body 转发到该 `lafEnv` 的同源路径：

```ts
const targetUrl = buildSameOriginUrl(requestPath, lafEnv);
const response = await fetch(request);
```

`buildSameOriginUrl` 能防止 path 覆盖 host，但没有限制可访问路径，也没有校验 `lafEnv` 是否为公网安全地址。前端实际只需要 `pat2token`、`applications`、`applications/:appid` 等少量 Laf API。

#### 触发场景

实例配置了 `lafEnv`，尤其是私有化部署时把它指向内网 Laf 控制面。任意外部请求者无需登录，直接访问 `/api/lafApi/<任意路径>?<任意查询>`。

#### 影响

公开 FastGPT API 会变成到固定 Laf 环境的通用代理入口。若 `lafEnv` 是内网地址，会把原本只对内开放的 Laf 控制面暴露到 FastGPT 域名下；即使是公网 Laf，也可被滥用为借 FastGPT 服务器 IP 发起 Laf API 请求的转发器。

#### 建议修复

- 给 `/api/lafApi` 增加登录态，并校验当前团队已配置 Laf 账号或当前请求属于 Laf 绑定流程。
- 对允许的 path/method 做白名单，只开放前端实际需要的 Laf API。
- 启动或配置加载时对 `lafEnv` 做 URL 安全校验，私有地址必须显式启用并只在内网部署中使用。
- 增加频率限制和代理访问审计。

### 中：API 知识库目录预览接口未绑定 dataset 时只要求登录态，可按请求体配置抓取第三方 API

- 位置：
  - `projects/app/src/pages/api/core/dataset/apiDataset/getCatalog.ts:21`
  - `projects/app/src/pages/api/core/dataset/apiDataset/getCatalog.ts:24`
  - `projects/app/src/pages/api/core/dataset/apiDataset/getCatalog.ts:32`
  - `projects/app/src/pages/api/core/dataset/apiDataset/getPathNames.ts:45`
  - `projects/app/src/pages/api/core/dataset/apiDataset/getPathNames.ts:57`
  - `projects/app/src/pages/api/core/dataset/apiDataset/getPathNames.ts:63`
  - `packages/global/core/dataset/apiDataset/type.ts:16`
  - `packages/service/core/dataset/apiDataset/index.ts:6`
  - `packages/service/core/dataset/apiDataset/custom/api.ts:32`
  - `packages/service/core/dataset/apiDataset/custom/api.ts:84`

#### 问题

`getCatalog` 接收请求体中的 `apiDatasetServer`，只要求登录态后就调用 `getApiDatasetRequest(apiDatasetServer).listFiles()`。`getPathNames` 在没有 `datasetId` 的分支也只调用 `authCert`，再使用请求体里的 `apiDatasetServer` 拉取文件详情路径。

自定义 API 知识库配置允许调用方传入 `apiServer.baseUrl` 和 `authorization`，服务端会把它作为 axios `baseURL` 请求 `/v1/file/list` 等接口。

#### 触发场景

任意登录用户直接调用 `getCatalog` 或不带 `datasetId` 的 `getPathNames`，传入可控 `apiDatasetServer.apiServer.baseUrl/authorization`。

#### 影响

该预览接口可被当作登录态服务端 API 抓取入口。虽然通用 axios 拦截器会做初始 URL 内网检查，但私网默认策略、redirect 和第三方响应大小仍会影响边界。它还允许调用方让服务端携带任意 Bearer token 向目标 API 请求。

#### 建议修复

- 配置预览接口应要求团队知识库创建权限，或绑定到一个正在编辑的 dataset 草稿。
- 保存/预览前对 `apiServer.baseUrl` 使用 `checkUrlSafety`，并限制协议、响应大小、超时和 redirect。
- 对未绑定 dataset 的预览请求增加频率限制和审计。
- 能绑定 dataset 时优先使用服务端已保存配置，不接受客户端临时传入的 baseUrl/authorization。

### 高：插件访问 JWT 使用公开默认密钥，invoke 接口可被伪造身份读取用户资料

- 位置：
  - `packages/service/support/permission/auth/pluginAccessToken.ts:6`
  - `packages/service/support/permission/auth/pluginAccessToken.ts:7`
  - `packages/service/support/permission/auth/pluginAccessToken.ts:27`
  - `packages/service/support/permission/auth/pluginAccessToken.ts:50`
  - `projects/app/src/pages/api/plugin/getAccessToken.ts:15`
  - `projects/app/src/pages/api/plugin/getAccessToken.ts:16`
  - `projects/app/src/pages/api/plugin/getAccessToken.ts:18`
  - `projects/app/src/pages/api/invoke/userInfo.ts:23`
  - `projects/app/src/pages/api/invoke/userInfo.ts:25`
  - `projects/app/src/pages/api/invoke/userInfo.ts:49`
  - `document/content/self-host/config/env.mdx:174`
  - `document/content/self-host/config/env.en.mdx:174`

#### 问题

插件访问 token 的签名密钥有代码级默认值，文档也把默认值写成公开字符串：

```ts
const PLUGIN_ACCESS_TOKEN_SECRET =
  process.env.PLUGIN_ACCESS_TOKEN_SECRET || 'plugin_access_token_secret';
```

`authPluginAccessToken` 只验证 JWT 签名并解析 `tmbId/teamId/toolId`，不会校验该 token 是否由当前实例为真实插件调用签发，也不会校验 `tmbId` 与 `teamId` 的成员关系。`/api/invoke/userInfo` 随后信任 token 中的 `tmbId/teamId`，返回账号、成员名、联系方式、组织和群组信息。`/api/plugin/getAccessToken` 在插件服务 token 通过后，也直接使用请求体里的 `tmbId/teamId/toolId` 签发 accessToken。

#### 触发场景

自部署实例没有覆盖 `PLUGIN_ACCESS_TOKEN_SECRET`，或沿用文档默认值。攻击者只要获得或猜到团队成员 `tmbId`/`teamId`，即可离线签出合法 JWT，再调用 `/api/invoke/userInfo`。

如果部署模板中的插件服务 `AUTH_TOKEN/PLUGIN_TOKEN` 也保持默认值，攻击者还可以直接调用 `/api/plugin/getAccessToken`，让服务端为任意请求体签发 accessToken。

#### 影响

用户联系信息、团队成员名、组织路径和群组名称会被未授权读取；后续如果新增更多 `/api/invoke/*` 接口并复用同一鉴权，影响会扩大为插件 invoke 能力的通用身份伪造。

#### 建议修复

- `PLUGIN_ACCESS_TOKEN_SECRET` 不允许有生产可用默认值，启动时检测为空或已知弱默认值应拒绝启动。
- 文档和部署模板改为要求随机生成至少 32 字节密钥。
- accessToken payload 增加 `iat/jti/audience/issuer`，必要时落库或缓存校验，避免离线长期伪造。
- `/api/plugin/getAccessToken` 不能信任请求体中的任意 `tmbId/teamId/toolId`，应绑定到真实插件调用上下文。
- `/api/invoke/userInfo` 在返回数据前校验 `tmbId` 属于 token 中的 `teamId`，并限制返回字段。

### 高：v2 chat stop 只复用会话读鉴权，拥有 readChatLog 的成员可停止他人运行中的会话

- 位置：
  - `projects/app/src/pages/api/v2/chat/stop.ts:16`
  - `projects/app/src/pages/api/v2/chat/stop.ts:26`
  - `projects/app/src/pages/api/v2/chat/stop.ts:32`
  - `projects/app/src/service/support/permission/auth/chat.ts:183`
  - `projects/app/src/service/support/permission/auth/chat.ts:189`
  - `projects/app/src/service/support/permission/auth/chat.ts:215`
  - `packages/service/core/workflow/dispatch/workflowStatus.ts:22`
  - `packages/service/core/workflow/dispatch/workflowStatus.ts:25`
  - `packages/service/core/workflow/dispatch/index.ts:282`
  - `packages/service/core/workflow/dispatch/index.ts:287`

#### 问题

`/api/v2/chat/stop` 会对指定 `appId/chatId` 设置 Redis 停止标记，并等待工作流结束：

```ts
await setAgentRuntimeStop({ appId, chatId });
await waitForWorkflowComplete({ appId, chatId, timeout: 5000 });
```

但该接口只调用 `authChatCrud`，没有要求写权限或会话所有者。`authChatCrud` 的 cookie/API key 分支内部固定以 `ReadPermissionVal` 调用 `authApp`，随后只要应用权限具备 `hasReadChatLogPer`，就允许访问同 app 下任意 chat：

```ts
if (permission.hasReadChatLogPer) {
  return { teamId, tmbId, chat, uid: chat.outLinkUid ?? chat.tmbId, ... };
}
```

工作流运行时每 100ms 轮询该 Redis 标记，命中后设置 `stopping = true`，实际影响正在执行的流程。

#### 触发场景

团队成员拥有某应用的聊天记录查看权限，但不是某条运行中会话的发起人。该成员通过记录列表或其他泄露渠道获得 `chatId` 后，直接调用 v2 stop。

#### 影响

可中断同应用下其他成员、外链用户或 API 会话的运行中工作流，造成结果丢失、用户体验异常和审计归属混乱。该问题和历史写/删接口的读权限写副作用同源，但 stop 的影响发生在运行时，属于独立副作用。

#### 建议修复

- `v2/chat/stop` 显式要求 `WritePermissionVal` 或更精确的“会话所有者/可管理会话”权限。
- 修正 `authChatCrud`，让调用方传入的 `per` 真正生效，或拆分 `authChatRead` / `authChatWrite`。
- stop 前校验当前操作者与 `chat.tmbId/outLinkUid/source` 的关系；管理员批量运维能力应走单独接口和审计。
- Redis stop key 可加入 `teamId`，并对 stop 行为记录审计日志。

### 高：语音合成和转写接口只用聊天读鉴权，允许按任意输入消耗团队音频额度

- 位置：
  - `projects/app/src/pages/api/core/chat/record/getSpeech.ts:20`
  - `projects/app/src/pages/api/core/chat/record/getSpeech.ts:26`
  - `projects/app/src/pages/api/core/chat/record/getSpeech.ts:56`
  - `projects/app/src/pages/api/core/chat/record/getSpeech.ts:65`
  - `projects/app/src/pages/api/v1/audio/transcriptions.ts:17`
  - `projects/app/src/pages/api/v1/audio/transcriptions.ts:37`
  - `projects/app/src/pages/api/v1/audio/transcriptions.ts:43`
  - `projects/app/src/pages/api/v1/audio/transcriptions.ts:48`
  - `projects/app/src/service/support/permission/auth/chat.ts:19`
  - `projects/app/src/service/support/permission/auth/chat.ts:95`
  - `projects/app/src/service/support/permission/auth/chat.ts:138`
  - `projects/app/src/service/support/permission/auth/chat.ts:192`
  - `packages/global/openapi/core/chat/record/api.ts:171`
  - `packages/global/openapi/core/chat/record/api.ts:174`

#### 问题

`/api/core/chat/record/getSpeech` 会从请求体读取任意 `input` 和 `ttsConfig`，通过 `authChatCrud` 后直接调用 TTS，并按 `input.length` 记账：

```ts
const { ttsConfig, input } = GetChatSpeechBodySchema.parse(req.body);
const { teamId, tmbId, authType } = await authChatCrud({ req, authToken: true, authApiKey: true, ...req.body });
await text2Speech({ res, input, model: ttsConfig.model, voice: ttsConfig.voice, ... });
pushAudioSpeechUsage({ charsLength: input.length, tmbId, teamId, ... });
```

schema 只声明 `input: z.string()`，没有最大长度；接口也没有校验该应用是否开启了 TTS、`ttsConfig` 是否来自应用配置，或 `input` 是否对应某条真实 AI 回复。`authChatCrud` 的设计是没有 `chatId` 时只校验 cookie/share/team token/app 访问，并明确说明“Chat没有读写的权限之分”。因此有应用读权限、公开外链 token 或 team-space token 的调用方，都可以把该接口当作通用 TTS 代理使用。

`/api/v1/audio/transcriptions` 同样从 multipart 表单读取 `appId/shareId/outLinkUid/teamToken`，只通过 `authChatCrud` 后就对上传音频调用 STT，并写入 Whisper 用量。它也没有校验应用是否开启语音输入，且当模型没有返回 usage 时会使用客户端提交的 `duration` 作为兜底计费依据。

#### 触发场景

团队给某成员开放了应用读权限或聊天记录查看权限；该成员无需写权限，只要知道一个可访问的 `appId`，即可循环调用 `getSpeech` 提交任意长文本生成音频。公开分享链接或 team-space 入口暴露时，外部用户也可以复用同一鉴权参数调用语音接口，而不是只播放真实聊天回复。

同理，外部用户可以通过 `/api/v1/audio/transcriptions` 上传任意音频触发 STT。虽然转写接口有 IP 级 `1/s` 限流，但没有团队/应用/外链维度限额，仍会把成本记到对应团队。

#### 影响

低权限成员或外链用户可消耗团队 TTS/STT 额度，造成费用异常、模型供应商配额被耗尽和审计归因错误。TTS 还允许选择请求体中的模型和 voice，绕过应用级语音配置；没有 `input` 长度限制时，单次请求即可制造较高成本和较长服务端流式连接。

#### 建议修复

- 语音接口应读取服务端应用配置，确认 `whisperConfig/ttsConfig` 已启用，并只允许使用应用配置中的模型、voice 和 speed。
- TTS 不应接受任意文本作为计费输入；建议传 `chatId + dataId`，由服务端读取对应 AI 回复文本，或至少要求写权限/会话所有者并限制外链可用范围。
- 给 `input`、上传音频大小、音频时长增加 schema 上限和团队/成员/外链维度频率限制。
- STT 计费不要信任客户端 `duration` 作为兜底值；缺少模型 usage 时应基于服务端解析的音频时长或拒绝计费不确定的结果。

### 中：preLogin 验证码校验过期与精确匹配语义不足，公开接口可放大登录干扰

- 位置：
  - `projects/app/src/pages/api/support/user/account/preLogin.ts:17`
  - `projects/app/src/pages/api/support/user/account/preLogin.ts:21`
  - `projects/app/src/pages/api/support/user/account/preLogin.ts:25`
  - `projects/app/src/pages/api/support/user/account/loginByPassword.ts:37`
  - `projects/app/src/pages/api/support/user/account/loginByPassword.ts:30`
  - `projects/app/src/pages/api/support/user/account/loginByPassword.ts:31`
  - `packages/service/support/user/auth/controller.ts:45`
  - `packages/service/support/user/auth/controller.ts:49`
  - `packages/service/support/user/auth/controller.ts:59`
  - `packages/service/support/user/auth/schema.ts:37`

#### 问题

`preLogin` 会生成 6 位验证码并写入 `MongoUserAuth`，过期时间是 30 秒：

```ts
await addAuthCode({
  type: UserAuthTypeEnum.login,
  key: username,
  code,
  expiredTime: addSeconds(new Date(), 30)
});
```

但 `loginByPassword` 调用的 `authCode` 只按 `key/type/code` 查询，不校验 `expiredTime >= now`，并且用用户提交的 `code` 直接拼接正则：

```ts
const result = await MongoUserAuth.findOne({
  key,
  type,
  code: { $regex: new RegExp(`^${code}$`, 'i') }
});
```

实际过期完全依赖 Mongo TTL 索引 `expiredTime`。TTL 删除不是实时执行，MongoDB 通常按后台周期清理，过期记录可能继续存在一段时间。另外 `authCode` 命中后会先 `deleteOne()`，随后 `loginByPassword` 才查询用户名和密码。

#### 触发场景

攻击者或自动化脚本调用 `preLogin` 获取某用户名的 code，在 30 秒后但 TTL 后台清理前，仍携带正确密码 hash 和旧 code 调用 `loginByPassword`。

攻击者也可以反复调用公开的 `preLogin` 刷新某用户名的验证码，或用已知 code 搭配错误密码触发 `authCode` 删除，干扰该用户正在进行的密码登录流程。

#### 影响

验证码的有效窗口会大于代码声明的 30 秒，实际取决于 Mongo TTL 清理时机。它不是单独的登录绕过，因为仍需要正确密码，但会削弱预登录验证码的时效性和精确匹配语义，并允许公开接口对目标用户名制造登录干扰。

#### 建议修复

- `authCode` 查询条件增加 `expiredTime: { $gte: new Date() }`。
- 对 `code` 使用普通字符串等值查询，或至少先 `replaceRegChars(code)` 并限制长度为 6。
- 密码校验成功后再消费验证码，或将验证码消费与密码校验放入同一事务中，并区分失败原因。
- 给 `preLogin` 增加与用户名/IP 绑定的频率限制，避免公开接口被大量刷新验证码。

### 中：系统默认模型更新先全量清空再逐项设置，无效或缺字段会静默重置默认配置

- 位置：
  - `projects/app/src/pages/api/core/ai/model/updateDefault.ts:29`
  - `projects/app/src/pages/api/core/ai/model/updateDefault.ts:31`
  - `projects/app/src/pages/api/core/ai/model/updateDefault.ts:33`
  - `projects/app/src/pages/api/core/ai/model/updateDefault.ts:45`
  - `projects/app/src/pages/api/core/ai/model/updateDefault.ts:96`
  - `projects/app/src/pageComponents/account/model/ModelConfigTable.tsx:735`
  - `projects/app/src/pageComponents/account/model/ModelConfigTable.tsx:741`
  - `packages/service/core/ai/config/utils.ts:45`
  - `packages/service/core/ai/config/utils.ts:176`
  - `packages/service/core/ai/config/utils.ts:192`
  - `packages/service/core/ai/model.ts:5`
  - `packages/service/core/ai/model.ts:32`

#### 问题

`/api/core/ai/model/updateDefault` 在管理员鉴权后，先对所有系统模型清空默认标记：

```ts
await MongoSystemModel.updateMany(
  {},
  {
    $unset: {
      'metadata.isDefault': 1,
      'metadata.isDefaultDatasetTextModel': 1,
      'metadata.isDefaultDatasetImageModel': 1
    }
  },
  { session }
);
```

随后才根据请求体里存在的字段逐项 `updateOne({ model })` 设置默认值。该接口没有 schema 校验、没有校验模型是否存在/启用/类型匹配，也没有检查 `updateOne` 的 `matchedCount`。如果请求体缺少某类模型，或传入拼错、已删除、未启用的模型名，事务仍会成功提交，原有默认标记已经被清空。

`updatedReloadSystemModel()` 重新加载时会从 active model map 中取第一个模型作为兜底默认值；如果某类模型列表为空，`getDefaultLLMModel()`、`getDefaultEmbeddingModel()` 等函数仍通过非空断言返回 `undefined`。因此该接口的失败不是显式报错，而是把管理员原先选定的默认模型静默改成排序后的第一个可用模型，极端情况下还会让后续模型调用拿到空默认值。

#### 触发场景

后台默认模型弹窗当前会尽量提交所有字段，但接口类型本身全部是可选字段，任意管理员脚本、旧前端、浏览器重放或网络中间层丢字段都可以提交部分 body。另一个常见场景是模型配置刚被删除/禁用，前端仍持有旧的 `defaultData`，确认保存后 `updateOne` 不命中任何记录，但接口仍返回成功并 reload 全局模型配置。

#### 影响

管理员看到“更新成功”，但数据库中的默认标记已经丢失，运行期默认模型可能被重置为排序后的第一个模型，导致聊天、知识库向量化、语音转写、TTS、Rerank 或 VLM 任务使用非预期模型。该问题会造成成本、效果、供应商路由和审计归因偏差；在某类模型没有 active fallback 时，后续链路可能出现空模型异常。

#### 建议修复

- 用 zod schema 明确该接口是全量更新还是部分更新：全量更新则要求必要字段全部存在，部分更新则只清理被更新类别的默认标记。
- 在事务前校验每个传入模型存在、启用且类型匹配；dataset image 默认模型还应校验 `vision` 能力。
- 对每个 `updateOne` 检查 `matchedCount === 1`，不命中时抛错并回滚，不允许清空后静默成功。
- `updatedReloadSystemModel()` 可以保留运行期 fallback，但接口返回应暴露“使用 fallback”或直接拒绝保存，避免管理员误以为指定默认值已生效。

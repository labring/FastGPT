# Agent Sandbox 实例 source 化设计方案

> 本方案作为标准 Chat `sourceType/sourceId` 改造后的后续阶段执行。本次 Chat/Skill Edit 共用 chat 三表改造不立即落地 sandbox 实例表迁移；先记录设计、风险和迁移边界，待当前改造稳定后单独实施。

## 背景

标准 Chat 正在从 App-only 的 `appId` 语义迁移到统一的 `sourceType + sourceId` 语义：

- App Chat：`sourceType=app`，`sourceId=appId`。
- Skill Edit Chat：`sourceType=skillEdit`，`sourceId=skillId`。

`agent_sandbox_instances` 当前仍以 `appId/userId/chatId/type` 表达沙盒归属，其中 `appId` 在 Skill Edit 场景容易被误用为 `skillId`，`type=edit-debug/session-runtime` 与 `sourceType` 存在重复表达。沙盒实例表数据量远小于 chat 三表，可以直接迁移字段语义，避免长期保留多套归属字段造成一致性风险。

## 目标

- `agent_sandbox_instances` 不再使用 `appId`、`skillId`、`type` 表达业务来源。
- 沙盒实例统一使用 `sourceType + sourceId` 表达所属资源。
- App 沙盒继续按用户会话隔离，保留 `userId/chatId`。
- Skill Edit 沙盒按 skill 隔离，不依赖 `userId/chatId`。
- `getSandboxClient` 不再负责根据 `appId/userId/chatId` 计算 `sandboxId`。
- 所有 Chat/Skill 调用方统一通过 `getRunningSandboxId` 或上层 helper 计算 `sandboxId`。
- 删除、恢复、归档、保活、ticket 校验都使用同一套 source 语义。
- 归档 S3 key 继续只由 `sandboxId` 决定，不额外迁移归档对象路径。

## 非目标

- 不迁移 chat 三表物理字段 `appId`，该迁移仍按标准 Chat source 化方案处理。
- 不保留 `appId/skillId/type` 作为 sandbox 实例表的长期兼容字段。
- 不让 Skill Edit 沙盒按用户或 chat 维度隔离。
- 不把 `sandboxId` 暴露为 OpenAPI 主入参；对外 API 仍使用业务资源标识。
- 不改现有归档 key：`agent-sandbox/${sandboxId}/package.zip`。
- 不新增 `metadata.archive.key`。

## 核心模型

```ts
type SandboxInstance = {
  provider: SandboxProviderType;
  sandboxId: string;

  sourceType: ChatSourceTypeEnum;
  sourceId: string;

  userId?: string;
  chatId?: string;

  status: SandboxStatusType;
  lastActiveAt: Date;
  createdAt: Date;
  limit?: SandboxLimit;
  storage?: unknown;
  metadata?: Record<string, unknown>;
};
```

字段规则：

| 场景 | sourceType | sourceId | userId | chatId | sandboxId |
| --- | --- | --- | --- | --- | --- |
| App Chat | `app` | `appId` | 必填 | 必填 | `hash(appId, userId, chatId)` |
| Skill Edit | `skillEdit` | `skillId` | 不写入 | 不写入 | `getEditDebugSandboxId(skillId)` |

`sourceType/sourceId` 是业务归属；`sandboxId` 是 provider 侧物理资源定位。
`sandboxId` 仍是归档对象和远端资源的唯一物理 key，因此生成规则必须保证不同业务语义不会复用同一个 `sandboxId`。

## sandboxId 计算

统一入口：

```ts
export const getRunningSandboxId = ({
  sourceType,
  sourceId,
  userId,
  chatId
}: {
  sourceType: ChatSourceTypeEnum;
  sourceId: string;
  userId: string;
  chatId: string;
}) => {
  if (sourceType === ChatSourceTypeEnum.app) {
    if (!userId || !chatId) {
      throw new Error('userId and chatId are required for app sandbox');
    }

    return generateSandboxId(sourceId, userId, chatId);
  }

  if (sourceType === ChatSourceTypeEnum.skillEdit) {
    return getEditDebugSandboxId(sourceId);
  }

  const exhaustiveCheck: never = sourceType;
  throw new Error(`Unsupported chat source type: ${exhaustiveCheck}`);
};
```

虽然函数签名保留 `userId/chatId`，但 Skill Edit 分支不使用这两个字段。这样 workflow 层可以用同一个参数对象调用，具体隔离粒度由 `sourceType` 决定。

App 分支必须强制 `userId/chatId` 非空。这样即使 Skill Edit 继续使用历史稳定规则：

```ts
generateSandboxId(skillId, '', 'edit-debug')
```

也不会和 App sandbox 撞，因为 App sandbox 不允许空 `userId`。同时需要移除旧逻辑中的：

```ts
props.chatId === 'edit-debug' ? '' : props.userId
```

App 分支不再允许通过 `chatId=edit-debug` 清空 `userId`。

## Runtime API 设计

`getSandboxClient` 只接收已计算好的 `sandboxId`，可选携带业务归属 metadata：

```ts
export type SandboxClientQuery = {
  sandboxId: string;
  sourceType?: ChatSourceTypeEnum;
  sourceId?: string;
  userId?: string;
  chatId?: string;
};
```

含义：

- `sandboxId`：必须字段，用于连接或创建 provider 沙盒。
- `sourceType/sourceId`：可选字段，用于首次创建、归档恢复、清理查询和审计归属。
- `userId/chatId`：只在 App Chat 沙盒写入；Skill Edit 不写入。

移除旧 union：

```ts
| {
    appId: string;
    userId?: string;
    chatId: string;
  }
```

原因：

- `getSandboxClient` 不应再隐式计算 `sandboxId`。
- 避免调用方把 `skillId` 传入 `appId`。
- 避免 `sandboxId` 与 `appId/userId/chatId` 同时传入但互相不一致。

## 上层 helper

对 Chat runtime 提供 source-aware helper，避免调用方重复手写 `getRunningSandboxId`：

```ts
async function getChatSandboxClient({
  sourceType,
  sourceId,
  userId,
  chatId,
  ...options
}: {
  sourceType: ChatSourceTypeEnum;
  sourceId: string;
  userId: string;
  chatId: string;
}) {
  const sandboxId = getRunningSandboxId({
    sourceType,
    sourceId,
    userId,
    chatId
  });

  return getSandboxClient({
    sandboxId,
    sourceType,
    sourceId,
    ...(sourceType === ChatSourceTypeEnum.app ? { userId, chatId } : {})
  }, options);
}
```

规则：

- Chat/Workflow 主链路使用 `getChatSandboxClient`。
- 已经明确拿到 `sandboxId` 的工具调用或内部资源操作，可以直接 `getSandboxClient({ sandboxId })`。
- 如果需要刷新或写入归属信息，必须同时传 `sourceType/sourceId`。

## 实例表索引

保留：

```js
db.agent_sandbox_instances.createIndex(
  { provider: 1, sandboxId: 1 },
  { unique: true, name: 'provider_1_sandboxId_1' }
);
```

新增：

```js
db.agent_sandbox_instances.createIndex(
  { sourceType: 1, sourceId: 1, chatId: 1 },
  { name: 'sourceType_1_sourceId_1_chatId_1' }
);

db.agent_sandbox_instances.createIndex(
  { status: 1, lastActiveAt: 1, 'metadata.archive.state': 1 },
  { name: 'status_1_lastActiveAt_1_archiveState_1' }
);
```

可选：

```js
db.agent_sandbox_instances.createIndex(
  { sourceType: 1, sourceId: 1, userId: 1, chatId: 1 },
  { name: 'sourceType_1_sourceId_1_userId_1_chatId_1' }
);
```

不再新增按 `type` 的索引。唯一性由 `{ provider, sandboxId }` 保证。

## 读写规则

### 创建或刷新实例

`upsertRunningSandboxInstance` 改为接收：

```ts
{
  provider,
  sandboxId,
  sourceType,
  sourceId,
  userId?,
  chatId?,
  storage?,
  limit?,
  metadata?
}
```

写入规则：

- `sourceType/sourceId` 有值时写入实例归属。
- `sourceType=app` 时允许写入 `userId/chatId`。
- `sourceType=skillEdit` 时不写入 `userId/chatId`。
- 不写入 `appId/skillId/type`。

如果调用方只传 `sandboxId`，可以连接或恢复已有 provider 资源，但不会补写业务归属。Chat/Workflow 主链路必须传完整 `sourceType/sourceId`，避免新建实例缺失归属信息。

### 查询和删除

统一新增 source 维度 resource 查询：

```ts
findSandboxResourcesBySource({
  sourceType,
  sourceId,
  chatIds?
});

deleteSandboxesBySource({
  sourceType,
  sourceId,
  chatIds?
});
```

规则：

- 删除 App 时：`deleteSandboxesBySource({ sourceType: app, sourceId: appId })`。
- 删除 App chat 时：`deleteSandboxesBySource({ sourceType: app, sourceId: appId, chatIds })`。
- 删除 Skill 时：`deleteSandboxesBySource({ sourceType: skillEdit, sourceId: skillId })`。
- Skill Edit 不按 `chatId` 删除 sandbox，chat 删除只清 chat/S3/nodeResponse 等资源。

## Ticket 与沙盒文件 API

沙盒编辑器相关 API 对外仍使用业务资源标识，不要求客户端传 `sandboxId`。

Raw API 入参：

```ts
type SandboxTargetInput =
  | { appId: string; skillId?: never }
  | { skillId: string; appId?: never };
```

API route 使用 zod transform 转成：

```ts
{
  sourceType: ChatSourceTypeEnum;
  sourceId: string;
}
```

签发 ticket 时，JWT 内写入：

```ts
{
  sourceType,
  sourceId,
  userId?,
  chatId?,
  channel,
  permission
}
```

校验 ticket 时：

1. 验签。
2. 使用 `sourceType/sourceId/userId/chatId` 计算 `sandboxId`。
3. 调用 `getSandboxClient({ sandboxId, sourceType, sourceId, userId, chatId })`。

Skill Edit ticket 不需要 `userId/chatId` 定位 sandbox，但可以在 claims 中保留 `userId` 用于审计；不得参与 Skill Edit `sandboxId` 计算。

## 归档恢复

`restoreArchivedSandboxBeforeUse` 使用 `sourceType/sourceId/userId/chatId` 记录恢复后的实例归属。

要求：

- 恢复逻辑不依赖 `appId/type`。
- 归档占位记录迁移时按 `provider+sandboxId` 定位。
- 如果恢复的是 Skill Edit sandbox，只恢复 `sourceType/sourceId`，不补 `chatId`。

### 归档 S3 key

归档 key 保持现状：

```text
agent-sandbox/${sandboxId}/package.zip
```

原因：

- 当前归档上传、下载、删除都只依赖 `sandboxId`。
- `sandboxId` 是远端 provider 资源和归档对象的共同物理 key。
- App 旧沙盒和旧归档不需要迁移路径。
- 只要 `getRunningSandboxId` 保证 App 分支 `userId/chatId` 非空，Skill Edit 使用空 `userId` 的 edit-debug 规则不会和 App 撞。

本方案不新增 `metadata.archive.key`。`metadata.archive` 继续只记录状态：

```ts
{
  state: 'archiving' | 'archived' | 'restoring',
  archivedAt?: Date
}
```

删除 sandbox 归档时仍通过 `sandboxId` 删除对应 S3 对象。

## 迁移方案

### 数据审计

上线前 dry-run：

```js
db.agent_sandbox_instances.aggregate([
  {
    $group: {
      _id: {
        provider: '$provider',
        sandboxId: '$sandboxId'
      },
      count: { $sum: 1 }
    }
  },
  { $match: { count: { $gt: 1 } } }
]);
```

统计旧字段：

```js
db.agent_sandbox_instances.countDocuments({ appId: { $exists: true } });
db.agent_sandbox_instances.countDocuments({ type: { $exists: true } });
db.agent_sandbox_instances.countDocuments({ 'metadata.skillId': { $exists: true } });
```

### App 记录迁移

旧 App 记录：

```js
{
  appId,
  userId,
  chatId
}
```

迁移为：

```js
{
  sourceType: 'app',
  sourceId: appId,
  userId,
  chatId
}
```

然后 unset：

```js
{
  appId: '',
  type: ''
}
```

### Skill Edit 记录迁移

优先识别：

- `metadata.skillId`
- 或旧 `type=edit-debug` 且 `appId` 实际为 skillId`
- 或 `sandboxId=getEditDebugSandboxId(skillId)` 可反查命中的记录

迁移为：

```js
{
  sourceType: 'skillEdit',
  sourceId: skillId
}
```

然后 unset：

```js
{
  appId: '',
  userId: '',
  chatId: '',
  type: '',
  'metadata.skillId': ''
}
```

如果无法可靠识别来源，保守策略是输出审计报告，不自动删除或改写。

## 兼容期策略

因为该表数据量较小，推荐强迁移后再切代码，不长期保留兼容查询。

短兼容期可接受：

- 新代码只写 `sourceType/sourceId`。
- 清理逻辑临时兼容旧 `appId` 查询一次，用于上线窗口内未迁移完成的数据。
- 迁移完成后移除 `findSandboxResourcesByAppId`、`findSandboxResourcesByChatIds`、`findSandboxAppIdBySandboxId`。

不建议长期保留：

- `appId` 字段作为 SkillId 容器。
- `type=edit-debug/session-runtime` 分支。
- `metadata.skillId` 作为主查询条件。

## 风险点

1. `sandboxId` 与归属信息不一致  
   解决：只允许 `getRunningSandboxId` 生成 Chat runtime sandboxId；`getSandboxClient` 不再接受可计算 `sandboxId` 的业务三元组。

2. Skill Edit 误写 `userId/chatId`  
   解决：`upsertRunningSandboxInstance` 按 `sourceType` 展开写入字段，Skill Edit 分支忽略 `userId/chatId`。

3. App 删除漏清旧实例  
   解决：迁移前跑 dry-run；迁移后删除逻辑只查 `sourceType=app/sourceId=appId`，上线窗口可临时兼容旧 `appId`。

4. Ticket 旧 claims 无法校验  
   解决：ticket 有效期很短，可以直接切换 claims；必要时仅在 1 分钟窗口内兼容旧 `appId/userId/chatId`。

5. 归档恢复占位记录迁移错误  
   解决：恢复逻辑以 `provider+sandboxId` 为主键，source 字段只作为归属 metadata，不参与物理资源定位。

## 改造顺序

本节为后续 sandbox 专项改造顺序，不纳入本次标准 Chat source 化改造的执行范围。

1. 新增 source-aware sandbox repository 方法和 schema 字段。
2. 调整 `getSandboxClient`，只接收 `sandboxId` 和可选 source metadata。
3. 新增 `getChatSandboxClient` 或等价 helper。
4. 调整 workflow sandbox runtime、toolCall、status stream，统一由 source 计算 sandboxId。
5. 调整 sandbox ticket、download、preview、keepalive、verifyTicket API，raw 入参转换为 source target。
6. 调整 sandbox resource delete/archive/restore 查询，移除 `appId/type` 主路径。
7. 跑 sandbox 实例表迁移脚本 dry-run。
8. 创建新索引。
9. 执行迁移并 unset 旧字段。
10. 删除旧 `appId/type/metadata.skillId` 兼容代码和旧索引。

## 代码改动范围

### 全局常量和 sandboxId

- `packages/global/core/ai/sandbox/constants.ts`
  - 保留 `generateSandboxId` 旧实现，供 App 和 Skill Edit 稳定生成使用。
- `packages/service/core/ai/sandbox/runtime/id.ts`
  - App 分支增加 `userId/chatId` 非空校验。
  - Skill Edit 分支继续调用 `getEditDebugSandboxId(sourceId)`。

### 实例 schema 和类型

- `packages/service/core/ai/sandbox/type.ts`
  - `SandboxInstanceZodSchema` 增加 `sourceType/sourceId`。
  - 移除或废弃 `appId/type` 主路径。
  - `metadata.skillId` 不再作为主查询字段。
- `packages/service/core/ai/sandbox/instance/schema.ts`
  - schema 增加 `sourceType/sourceId`。
  - 移除 `type` 字段和相关索引。
  - 移除 `appId` 作为主归属字段。
  - 新增 source 查询索引。

### 实例 repository

- `packages/service/core/ai/sandbox/instance/repository.ts`
  - `upsertRunningSandboxInstance` 改为写 `sourceType/sourceId`。
  - `findSandboxResourcesByAppId`、`findSandboxResourcesByChatIds` 替换为 source-aware 查询。
  - `findSandboxAppIdBySandboxId` 移除或改为 source-aware 反查。
  - `markSandboxRestored`、`migrateArchivedSandboxInstanceRecord`、`updateSandboxInstanceRecordBySandboxId` 改为 source 字段。

### runtime 和 resource service

- `packages/service/core/ai/sandbox/service/runtime.ts`
  - `SandboxClientQuery` 改为只接收 `sandboxId` 和可选 source metadata。
  - 移除 `{ appId, userId, chatId }` union 分支。
  - 移除 `chatId=edit-debug` 清空 `userId` 的兼容逻辑。
- `packages/service/core/ai/sandbox/runtime/index.ts`
  - `prepareAgentSandboxRuntime` 入参改为 `sourceType/sourceId` 或只接收已算好的 `sandboxId + metadata`。
- `packages/service/core/ai/sandbox/service/resource.ts`
  - 删除入口改为 `deleteSandboxesBySource`。
  - 删除归档仍按 `sandboxId` 调 `deleteWorkspaceArchive`。
- `packages/service/core/ai/sandbox/service/archive.ts`
  - restore/mark restored 入参改为 `sourceType/sourceId`。
  - 归档 S3 source 调用仍传 `sandboxId`。

### Workflow 和工具调用

- `packages/service/core/workflow/dispatch/ai/agent/sub/sandbox/*`
  - 主链路统一使用 `getRunningSandboxId`。
  - 向 sandbox runtime 传 `sandboxId + sourceType/sourceId`。
- `packages/service/core/workflow/dispatch/ai/toolcall/hooks/useToolCatalog.ts`
  - 继续使用 source-aware `getRunningSandboxId`。
- `packages/service/core/ai/sandbox/toolCall/index.ts`
  - 只已知 `sandboxId` 的工具调用可以继续 `getSandboxClient({ sandboxId })`。

### Sandbox API 和权限

- `packages/global/openapi/core/ai/sandbox/api.ts`
  - sandbox editor API raw 入参支持 `appId/skillId`。
  - runtime schema transform 为 `sourceType/sourceId`。
- `projects/app/src/pages/api/core/ai/sandbox/getTicket.ts`
- `projects/app/src/pages/api/core/ai/sandbox/verifyTicket.ts`
- `projects/app/src/pages/api/core/ai/sandbox/download.ts`
- `projects/app/src/pages/api/core/ai/sandbox/getHtmlPreviewLink.ts`
- `projects/app/src/pages/api/core/ai/sandbox/keepalive.ts`
  - API route 使用 `parseApiInput`。
  - ticket claims 改为 `sourceType/sourceId`。
  - App 分支保留 `userId/chatId`，Skill Edit 不用 `chatId` 定位 sandbox。
- `projects/app/src/service/core/sandbox/auth.ts`
  - 鉴权入口支持 App 和 Skill Edit target。

### Skill Edit sandbox

- `packages/service/core/ai/skill/edit/config.ts`
  - `getEditDebugSandboxId(skillId)` 可继续使用现有稳定规则。
- `packages/service/core/ai/skill/edit/sandbox.ts`
  - 查询、恢复、更新 sandbox 记录改为 `sourceType=skillEdit/sourceId=skillId`。
- `packages/service/core/ai/skill/delete/*`
  - 删除 Skill 时调用 `deleteSandboxesBySource({ sourceType: skillEdit, sourceId: skillId })`。

## 验收标准

以下验收标准用于后续 sandbox 专项改造，不作为本次 Chat source 化改造的验收条件。

- App Chat 多轮对话仍复用同一个 sandbox。
- 不同 App、不同用户、不同 chat 的 sandbox 互相隔离。
- Skill Edit 同一个 skill 始终复用同一个 edit sandbox。
- Skill Edit 不因不同用户或 chatId 生成多个 sandbox。
- 删除 App 会删除该 App 下所有 App sandbox。
- 删除 App chat 只删除对应 App chat sandbox，不影响 Skill Edit。
- 删除 Skill 会删除该 Skill Edit sandbox。
- ticket、download、preview、keepalive 均不再依赖 `appId` 字段。
- `agent_sandbox_instances` 新写入记录不包含 `appId/skillId/type` 字段。

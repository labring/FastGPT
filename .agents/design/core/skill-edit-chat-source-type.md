# SkillEdit 复用标准 Chat 设计方案

状态：当前实现（原 `skill-edit-chat-source-type-tech-plan.md` 已收敛至本文）

最后核对：2026-11-27

## 背景

Skill Edit 调试会话复用标准 chat 表、标准 chat service 和标准 chat API。现有 chat 三表的物理字段仍叫 `appId`，历史 App 数据量很大，不适合为了接入多来源会话做大规模字段重命名或全量回填。

最终方案是在业务语义层引入 `sourceType + sourceId`：

- App 会话：`sourceType=app`，`sourceId=appId`。
- Skill Edit 会话：`sourceType=skillEdit`，`sourceId=skillId`。
- 后续扩展的辅助生成会话（`workflowBuilder`、`chatAgentHelper`）遵循相同的显式 `sourceType` 匹配规则。

MongoDB 中 chat 三表继续保留物理字段 `appId`，将其视为历史字段名，业务含义是 `sourceId`。

## 目标与非目标

### 目标

- App 与 Skill Edit 共用 `chats`、`chatitems`、`chat_item_responses`。
- 标准 chat API 对外继续使用业务字段 `appId` 或 `skillId`，不暴露内部 `sourceType/sourceId`。
- API route 使用 `parseApiInput` 和 runtime schema 将 `appId/skillId` 转换为 `sourceType/sourceId`。
- API handler 之后的业务层统一接收 `sourceType/sourceId`，禁止继续传 API 原始字段 `appId/skillId`。
- App 历史数据在缺失 `sourceType` 的情况下仍可读取、更新和删除。
- Skill Edit 的 usage 写入 `usage.skillId`，不污染 `usage.appId`。
- Skill Edit 不写入 App 最近使用、App 统计日志（`app_chat_logs`）和 App 看板。
- stop、resume、nodeResponse、S3、Sandbox 均按 `sourceType/sourceId` 隔离。

### 非目标

- 不做 Mongo chat 三表字段 `appId -> sourceId` 的物理重命名，也不强制回填存量历史 App chat 数据。
- 不让 `ChatSourceEnum` 承担资源类型语义。它继续表示对话入口来源（如 `test`、`api`、`online`、`share`）。
- 不把 Skill Edit 接入 App 最近使用和 App chat logs。

## 核心模型

```ts
export enum ChatSourceTypeEnum {
  app = 'app',
  workflowBuilder = 'workflowBuilder',
  skillEdit = 'skillEdit',
  chatAgentHelper = 'chatAgentHelper'
}
```

`sourceId` 是所属资源真实 ObjectId：

- `sourceType=app`（及辅助生成来源 `workflowBuilder` / `chatAgentHelper`）时，`sourceId` 是 AppId。
- `sourceType=skillEdit` 时，`sourceId` 是 SkillId。

chat 三表统一通过 `packages/service/core/chat/source.ts` 构造写入和查询条件（App 默认兼容缺失 `sourceType` 的历史数据；非 App 来源必须精确匹配 `sourceType`）：

```ts
export function buildChatSourceWriteFields({ sourceType, sourceId }: ChatSourceParams) {
  return { sourceType, appId: sourceId };
}

export function buildChatSourceQuery({ sourceType, sourceId }: ChatSourceParams) {
  if (sourceType === ChatSourceTypeEnum.app) {
    return {
      appId: sourceId,
      $or: [{ sourceType: ChatSourceTypeEnum.app }, { sourceType: { $exists: false } }]
    };
  }

  if (requiresExplicitChatSourceType(sourceType)) {
    return {
      appId: sourceId,
      sourceType
    };
  }

  const exhaustiveCheck: never = sourceType;
  throw new Error(`Unsupported chat source type: ${exhaustiveCheck}`);
}
```

聚合管线统一使用 `buildChatSourceAggregateMatch`（显式兼容 ObjectId 存量 `appId` 字段）。

## API 设计

### 入参

标准 chat API 对外只接受 `appId` 或 `skillId`：

```json
{ "appId": "68ad85a7463006c963799a05", "chatId": "chat_xxx" }
```

```json
{ "skillId": "68ad85a7463006c963799a06", "chatId": "chat_xxx" }
```

规则：

- 类型和 OpenAPI 提示 `appId`、`skillId` 二选一；运行时同时传入时优先使用 `skillId`，忽略 `appId` 及其 `sourceType`。
- 只传 `appId`：转换为 `sourceType=app`、`sourceId=appId`。
- 只传 `skillId`：转换为 `sourceType=skillEdit`、`sourceId=skillId`。
- Zod transform 后的业务层不再保留顶层 `appId/skillId`。
- 不使用字段名 `type` 表示资源类型，避免和已有业务枚举冲突。

### OpenAPI schema 分层

`withChatTarget` 一类 runtime schema 带 transform，不能直接用于 OpenAPI 文档生成。每个标准 chat API 严格分两层：

- **Raw schema**（`createChatTargetInputSchema`、`createOptionalChatTargetInputSchema`、`createOutLinkChatTargetInputSchema`、`createOptionalOutLinkChatTargetInputSchema`）：不带 transform，对外描述 `appId/skillId`，用于 OpenAPI path 注册和前端请求类型。
- **Runtime schema**（`withChatTarget`、`withOutLinkChatTarget`、`withOptionalOutLinkChatTarget`、`.transform(transformChatTargetInput)`）：API route 的 `parseApiInput` 使用，输出 `sourceType/sourceId`。

支持外链的接口在运行时按 `outLinkAuthData > skillId > appId` 选择上下文，低优先级字段通过 `never().optional().catch(undefined)` 忽略，再由 runtime transform 去除。高优先级字段显式存在但格式错误或鉴权失败时仍报错，不回退到低优先级身份；允许不传上下文的接口也不能将这类错误降级为直接访问资源。

### 标准接口覆盖范围

以下 24 个接口统一支持 `appId/skillId` raw input，并在 route 中经 `parseApiInput` 解析为 `sourceType/sourceId`：

- `/api/core/chat/init`
- `/api/core/chat/resume`
- `/api/v2/chat/stop`
- `/api/core/chat/record/getRecords_v2`
- `/api/core/chat/record/getPaginationRecords`
- `/api/core/chat/record/getResData`
- `/api/core/chat/record/delete`
- `/api/core/chat/record/getQuote`
- `/api/core/chat/record/getCollectionQuote`
- `/api/core/chat/history/getHistories`
- `/api/core/chat/history/getHistoryStatus`
- `/api/core/chat/history/markRead`
- `/api/core/chat/history/updateHistory`
- `/api/core/chat/history/delHistory`
- `/api/core/chat/history/clearHistories`
- `/api/core/chat/history/batchDelete`
- `/api/core/chat/feedback/updateUserFeedback`
- `/api/core/chat/feedback/updateFeedbackReadStatus`
- `/api/core/chat/feedback/adminUpdate`
- `/api/core/chat/feedback/closeCustom`
- `/api/core/chat/feedback/getFeedbackRecordIds`
- `/api/core/chat/file/presignChatFilePostUrl`
- `/api/core/chat/file/presignChatFileGetUrl`
- `/api/v1/audio/transcriptions`

历史 wrapper route 如果保留，必须复用同一个 source-aware handler 和 schema。

### App-only 接口

以下接口保持 App-only，不接入 Skill Edit：

- outLink init / team init
- inputGuide / recentlyUsed
- 公开 OpenAPI chat completions
- `/api/core/chat/chatTest`（App workflow test 协议，依赖 `nodes/edges/chatConfig/appName` 和 `authApp`；Skill Edit 调试走 Skill 专属入口）
- helperBot
- App chat logs

App-only 接口内部如调用标准 chat service，必须显式传 `sourceType=app` 和 `sourceId=appId`。

## 前端 Chat Target 与 ChatBox 边界

前端分为两层 target：

```ts
type ChatSourceTarget = {
  sourceType: 'app' | 'skillEdit';
  sourceId: string;
};

type ChatApiTarget = { appId: string } | { skillId: string };
```

调用形态：

```tsx
<ChatBox
  sourceTarget={{ sourceType, sourceId }}
  features={features}
  onStartChat={onStartChat}
  onChatGenerateStatusChange={onChatGenerateStatusChange}
/>
```

边界约束：

- `ChatBox`、`WorkflowRuntimeContext`、`ChatProvider` 及标准 chat 请求均只接收内部 `sourceTarget`，不感知 `appId/skillId`；API 请求边界统一由 `toChatApiTarget(sourceTarget)` / `useChatApiTarget(sourceTarget)` 派生 `{ appId } | { skillId }`，禁止组件手拼。
- App 页面传 `sourceTarget={{ sourceType: 'app', sourceId: appId }}`；Skill Preview 传 `sourceTarget={{ sourceType: 'skillEdit', sourceId: skillId }}`。
- 内部状态 key（滚动、恢复防串、重复恢复等）不暴露成 prop，统一由 `getChatSourceKey(sourceTarget)` 生成（`${sourceType}:${sourceId}`）。
- `features` 控制所有功能展示和能力开关（feedback、mark、voice、tts、inputGuide、sandbox、workorder、autoResume、markRead、quickReplies、footer actions）；Skill Preview 下语音、TTS、inputGuide 与 ChatBox 内 App 沙盒入口均关闭，不展示也不调用。
- `onStartChat` 保留外部注入（App/Home/Share/ChatTest/Skill Preview 生成编排不同）；停止与单条删除不再通过外部 override，统一走 source-aware `/api/v2/chat/stop` 与 `/api/core/chat/record/delete`。
- `onChatGenerateStatusChange` 只作为事件通知外部页面；`ChatBox` 目录内禁止直接依赖 `ChatContext`、`useChatStore`、侧栏 history 或最近使用状态，由页面层 hook 承接外部同步（Skill Preview 不传该回调）。
- Skill Detail 的编辑沙盒 `SandboxEditor` 传 `chatTarget={{ skillId }}`；Sandbox API 对外接收 `appId/skillId` raw target，route 内转换为 `sourceType/sourceId`，不得再传 `appId={skillId}`。

## 权限设计

标准 chat target 统一通过 `authChatTargetCrud` 鉴权（`packages/service/core/chat/auth.ts`）：

- `sourceType=app`：复用 `authChatCrud` / `authApp`，将 `sourceId` 作为 AppId。
- `sourceType=skillEdit`：走 `authSkill`；传入 `chatId` 时使用 `buildChatSourceQuery({ sourceType, sourceId })` 查 chat，并校验 chat 的 `teamId` 与 skill 权限结果一致。
- outLink、share、team domain 等 App 专属入口保持 `sourceType=app`。

禁止事项：

- 禁止裸查 `{ appId, chatId }` 做 chat 存在性或归属校验，必须使用 `buildChatSourceQuery`。
- 禁止在标准 chat route 中把 `skillId` 当作 `appId` 传给 `authChatCrud`。
- 禁止在 service 入参中继续传 API 原始字段 `appId/skillId`。

## 数据模型与索引

### chat 三表（`chats`、`chatitems`、`chat_item_responses`）

- 均包含 `sourceType` 字段，不设置 `required: true` 且**不设置 schema default**：历史 App 数据允许缺失 `sourceType`，但所有新写入必须经 `buildChatSourceWriteFields` 显式传入，避免漏传在 Mongoose 层静默回落成 `app`。
- `appId` 保留为物理字段名，业务语义为 `sourceId`。
- 核心读写函数（`preChatRound`、`prepareChatRound`、`validateChatRoundDataIds`、`tryStartGenerateChat`、`ensureGenerateChat`、`updateChatGenerateStatus`、`finalizeChatRound`、`failChatRound`、`pushChatRecords`、`getChatItems`、`updateInteractiveChat`、`createWorkflowEntryNodeResponseWriter` 等）统一使用 `buildChatSourceWriteFields` / `buildChatSourceQuery`，保证 App legacy row 可读可更新、Skill Edit 仅读写 `sourceType=skillEdit`、nodeResponse 不跨源串读。

### 索引

- `chats`：唯一索引 `{ sourceType: 1, appId: 1, chatId: 1 }`（`sourceType_1_appId_1_chatId_1`）。由于未回填历史 App 数据的 `sourceType`，App 写入路径必须先用 source-aware 查询命中 legacy row，禁止盲插导致同一 `appId/chatId` 同时存在 `sourceType` 缺失与 `sourceType=app` 两份逻辑重复。
- `chatitems`：source-aware 复合索引
  - `{ sourceType: 1, appId: 1, chatId: 1, dataId: 1 }`
  - `{ sourceType: 1, appId: 1, chatId: 1, deleteTime: 1 }`
  - `{ sourceType: 1, appId: 1, chatId: 1, _id: -1 }`
  - `{ sourceType: 1, appId: 1, chatId: 1, obj: 1, _id: -1 }`
- `chat_item_responses`：source-aware 复合索引 `{ sourceType: 1, appId: 1, chatId: 1, chatItemDataId: 1, _id: 1 }`。

### `usages` 与 `app_chat_logs`

- `usages` 包含 `skillId` 字段：App chat 只写 `usage.appId`，Skill Edit chat 只写 `usage.skillId`；`usages` / `usage_items` 为计费审计数据，不随 chat 删除。
- `app_chat_logs` 不新增 `sourceType`，仅在 `sourceType=app` 时写入，由 App 删除流程单独清理。

## Workflow Runtime、Sandbox 与隔离键

### Workflow Runtime 与 `systemVar`

`RunningAppInfo` 不保留 deprecated `id` 或 `sandboxId` 字段：

```ts
type RunningAppInfo = {
  sourceType: ChatSourceTypeEnum;
  sourceId: string;
  teamId: string;
  tmbId: string;
  name: string;
  isChildApp?: boolean;
};
```

- chat 持久化、nodeResponse、stop/resume 均以 `sourceType/sourceId` 为准；App 专属逻辑只能在 `sourceType=app` 时把 `sourceId` 当 AppId 使用。
- `systemVar` 在 App 场景注入 `appId=sourceId`；Skill Edit 场景不伪造 `appId`。

### Sandbox

Agent Sandbox 完整架构见 [Agent Sandbox 设计](./ai/sandbox/index.md)。与 chat source 对齐的核心不变量如下：

- **底层持久化模型**：沙盒实例集合 `agent_sandbox_instances_v3`（`packages/service/core/ai/sandbox/infrastructure/instance/schema.ts`）原生使用 `sandboxId`、`sourceType`（`app | workflowBuilder | skillEdit`）、`sourceId`、`userId`，无物理 `appId` 或 `chatId` 字段。
- **实例 ID 计算**：统一由 `getRunningSandboxId`（`packages/service/core/ai/sandbox/utils/id.ts`）计算，不含 `chatId`：

```ts
export const getSandboxUserId = ({
  sourceType,
  userId
}: {
  sourceType: ChatSourceTypeEnum;
  userId: string;
}) => {
  if (isAppSandboxSourceType(sourceType)) {
    // app / workflowBuilder 按成员级 userId 隔离
    return userId;
  }
  if (sourceType === ChatSourceTypeEnum.skillEdit) {
    // skillEdit 固定使用 'skillEdit'（与 getEditDebugSandboxId(skillId) 同源）
    return ChatSourceTypeEnum.skillEdit;
  }
  // chatAgentHelper 不支持 sandbox 身份
  throw new Error(`Unsupported chat source type: ${sourceType}`);
};

export const getRunningSandboxId = ({
  sourceType,
  sourceId,
  userId
}: {
  sourceType: ChatSourceTypeEnum;
  sourceId: string;
  userId: string;
}) =>
  generateSandboxId({
    sourceType,
    sourceId,
    userId: getSandboxUserId({ sourceType, userId })
  });
```

- **运行态准备与状态推送**：`prepareAgentSandboxRuntime` / `ensureAgentSandboxRuntime` 与 `ensureWorkflowSandboxReadyForUse`（`packages/service/core/workflow/dispatch/ai/sandbox.ts`）均接收 `sourceType/sourceId/userId/chatId`，内部通过 `getRunningSandboxId` 计算 `sandboxId` 并推送 `lazyInit / upgrading / ready` 状态（不从 `runningAppInfo` 读取 `sandboxId`）；`chatId` 仅用于推导用户级沙盒内的会话工作目录与会话级状态记录。

### S3 文件

新上传统一使用 source-aware key，由 `getChatFileS3Key` / `parseChatFileS3Key` / `isAuthorizedChatFileS3Key` 集中维护：

```text
chat/${sourceType}/${sourceId}/${uid}/${chatId}/${filename}
```

兼容与鉴权规则：

- 新 App 文件使用 `chat/app/${appId}/${uid}/${chatId}/...`，新 Skill Edit 文件使用 `chat/skillEdit/${skillId}/${uid}/${chatId}/...`。
- 历史 App 文件 key `chat/${appId}/${uid}/${chatId}/${filename}` 不重写，仅在 `sourceType=app` 的鉴权上下文中可读；Skill Edit 不读取 legacy App key。
- 文件预览 `/api/core/chat/file/presignChatFileGetUrl` 同时校验 `sourceType/sourceId/uid/chatId` 与 key 归属。

### stop / resume Redis Key

stop、resume、catchUp、runtime status 的 key 构造均集中于 helper，禁止各处手写：

```text
agent_runtime_stopping:${sourceType}:${sourceId}:${chatId}
stream:resume:data:${teamId}:${sourceType}:${sourceId}:${chatId}
stream:resume:unavailable:${teamId}:${sourceType}:${sourceId}:${chatId}
stream:resume:active:${teamId}:${sourceType}:${sourceId}:${chatId}
```

stale generating 清理从 chat 记录读取 `sourceType ?? app` 与 `appId as sourceId`。

## 删除与清理边界

`deleteChatResourcesBySource`（`packages/service/core/chat/delete.ts`）负责按 source 硬删除标准 chat 资源：

```ts
export type DeleteChatResourcesBySourceParams = ChatSourceParams & {
  chatIds?: string[];
  /** 用户操作传入授权范围；资源删除任务省略，继续按整个 source 清理。 */
  scope?: ChatAccessScope;
};
```

职责边界：

- **负责删除**：`chats`、`chatitems`、`chat_item_responses` 以及对应前缀的 chat S3 文件（显式传 `chatIds: []` 必须 no-op，不能退化成整 source 删除）。
- **不负责删除**：
  - **Sandbox 资源**：用户级 App/WorkflowBuilder Sandbox 与 Skill Edit Sandbox 不跟单条 Chat 生命周期绑定，单会话删除或日志批量硬删均不删除沙盒；仅在资源级删除时显式回收。
  - `app_chat_logs`（App 统计日志域，由 App 删除流程单独清理）、`usages` / `usage_items`（计费审计，不删）、`chat_input_guides`（App 配置域）、HelperBot chat（独立命名空间）。

各删除链路约定：

- **App 删除**（`deleteAppDataProcessor`，`packages/service/core/app/controller.ts`）：先调用 `deleteAppSandboxes(appId)`（在确认 App 软删除标记后清理 `app` 与 `workflowBuilder` 沙盒），再按 `[app, workflowBuilder, chatAgentHelper]` 逐个调用 `deleteChatResourcesBySource({ sourceType, sourceId: appId })`，并单独清理 `MongoAppChatLog`。
- **会话批量硬删**（`/api/core/chat/history/batchDelete`）：校验权限后调用 `deleteChatResourcesBySource({ sourceType, sourceId, chatIds, scope })`，不触碰用户级沙盒。
- **Skill 删除**（`agentSkillDeleteProcessor`，`packages/service/core/ai/skill/delete/processor.ts`）：先调用 `deleteSkillEditSandboxes(nonFolderSkillIds)` 清理编辑沙盒，再调用 `deleteChatResourcesBySource({ sourceType: ChatSourceTypeEnum.skillEdit, sourceId: skillId })`。

## 长期风险与约束

1. **历史 App 数据兼容**：在未完成存量 `sourceType` 全量回填前，`sourceType=app` 查询必须持续兼容缺失 `sourceType` 的文档，写入路径必须先按 source-aware 查询命中 legacy row，避免产生逻辑重复记录。
2. **usage 归因隔离**：Skill Edit 只能写 `usage.skillId`，禁止写入 `usage.appId` 或 `app_chat_logs`。
3. **S3 与删除防串源**：App 删除清理 legacy + new App 前缀；Skill 删除仅清理 `chat/skillEdit/${skillId}`；非 App 来源一律要求精确匹配 `sourceType`。

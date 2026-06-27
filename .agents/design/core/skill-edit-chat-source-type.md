# SkillEdit 复用标准 Chat 设计方案

## 背景

Skill Edit 调试会话需要复用标准 chat 表、标准 chat service 和标准 chat API。现有 chat 三表的物理字段仍叫 `appId`，历史 App 数据量很大，不适合为了接入 Skill Edit 做大规模字段重命名或全量回填。

最终方案是在业务语义层新增 `sourceType + sourceId`：

- App 会话：`sourceType=app`，`sourceId=appId`。
- Skill Edit 会话：`sourceType=skillEdit`，`sourceId=skillId`。

Mongo 第一阶段继续保留物理字段 `appId`，但在 chat 三表中把它视为历史字段名，业务含义是 `sourceId`。

## 目标

- App 和 Skill Edit 共用 `chats`、`chatitems`、`chat_item_responses`。
- 标准 chat API 对外继续使用业务字段 `appId` 或 `skillId`，不暴露内部 `sourceType/sourceId`。
- API route 使用 `parseApiInput` 和 runtime schema 把 `appId/skillId` 转换为 `sourceType/sourceId`。
- API handler 之后的业务层统一接收 `sourceType/sourceId`，禁止继续传 API 原始字段 `appId/skillId`。
- App 历史数据在缺失 `sourceType` 的情况下仍可读取、更新和删除。
- Skill Edit 的 usage 写入 `usage.skillId`，不污染 `usage.appId`。
- Skill Edit 不写入 App 最近使用、App 统计日志和 App 看板。
- stop、resume、nodeResponse、S3、sandbox 都按 `sourceType/sourceId` 隔离。

## 非目标

- 第一阶段不做 Mongo 字段 `appId -> sourceId` 的物理重命名。
- 第一阶段不强制回填几亿历史 App chat 数据。
- 不长期兼容旧 Skill Debug chat；上线初始化阶段清理掉旧数据。
- 不让 `ChatSourceEnum` 承担资源类型语义。它继续表示入口来源，例如 `test`、`api`、`online`、`share`。
- 不把 Skill Edit 接入 App 最近使用和 App chat logs。

## 核心模型

```ts
export enum ChatSourceTypeEnum {
  app = 'app',
  skillEdit = 'skillEdit'
}
```

`sourceId` 是所属资源真实 ObjectId：

- `sourceType=app` 时，`sourceId` 是 AppId。
- `sourceType=skillEdit` 时，`sourceId` 是 SkillId。

chat 三表写入时统一映射：

```ts
{
  sourceType,
  appId: sourceId
}
```

所有新代码通过统一 helper 构造查询和写入字段。App 查询默认兼容历史缺失 `sourceType` 的数据；Skill Edit 查询必须精确匹配 `sourceType=skillEdit`。

```ts
function buildChatSourceWriteFields({ sourceType, sourceId }) {
  return { sourceType, appId: sourceId };
}

function buildChatSourceQuery({ sourceType, sourceId }) {
  if (sourceType === ChatSourceTypeEnum.app) {
    return {
      appId: sourceId,
      $or: [{ sourceType: ChatSourceTypeEnum.app }, { sourceType: { $exists: false } }]
    };
  }

  if (sourceType === ChatSourceTypeEnum.skillEdit) {
    return {
      appId: sourceId,
      sourceType: ChatSourceTypeEnum.skillEdit
    };
  }

  const exhaustiveCheck: never = sourceType;
  throw new Error(`Unsupported chat source type: ${exhaustiveCheck}`);
}
```

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

- `appId` 和 `skillId` 必须且只能传一个。
- 只传 `appId`：转换为 `sourceType=app`、`sourceId=appId`。
- 只传 `skillId`：转换为 `sourceType=skillEdit`、`sourceId=skillId`。
- Zod transform 后的业务层不再保留顶层 `appId/skillId`。
- 不使用字段名 `type` 表示资源类型，避免和已有业务枚举冲突。

### OpenAPI schema 分层

`withChatTarget` 一类 runtime schema 带 transform，不能直接用于 OpenAPI 文档生成。

每个标准 chat API 使用两层 schema：

- Raw schema：不带 transform，对外描述 `appId/skillId`，用于 OpenAPI path 和前端请求类型。
- Runtime schema：基于 raw schema transform，API route 的 `parseApiInput` 使用，输出 `sourceType/sourceId`。

OpenAPI 只注册 raw schema。互斥约束由 raw schema 的 `superRefine` 和 API route 的 `parseApiInput` 在运行时保证。

### 标准接口覆盖范围

以下接口统一支持 `appId/skillId` raw input，并在 route 中解析为 `sourceType/sourceId`：

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

- outLink init
- team init
- inputGuide
- recentlyUsed
- 公开 OpenAPI chat completions
- `/api/core/chat/chatTest`
- helperBot
- App chat logs

App-only 接口内部如调用标准 chat service，必须显式传 `sourceType=app` 和 `sourceId=appId`。

`/api/core/chat/chatTest` 的入参是 App workflow test 协议，依赖 `nodes/edges/chatConfig/appName` 和 `authApp`。Skill Edit 调试当前使用 Skill 专属协议构造 runtime nodes 和编辑沙盒上下文，不应仅通过给 `chatTest` 增加 `skillId` 来混用两套请求结构。若后续要求彻底移除 Skill debug 专属接口，需要单独设计生成入口转换层，而不是把 `skillId` 直接塞进现有 `ChatTestPropsSchema`。

## 前端 Chat Target

前端分为两层 target：

```ts
type ChatSourceTarget = {
  sourceType: 'app' | 'skillEdit';
  sourceId: string;
};

type ChatApiTarget = { appId: string } | { skillId: string };
```

规则：

- `ChatSourceTarget` 是前端标准 chat 组件内部 target，`ChatBox`、`WorkflowRuntimeContext` 和标准 chat 请求都以它为准。
- `ChatApiTarget` 是 OpenAPI/API 边界 raw target，只在请求发出前由 `toChatApiTarget(sourceTarget)` 派生。
- App 页面传 `sourceTarget={{ sourceType: 'app', sourceId: appId }}`。
- Skill Preview 传 `sourceTarget={{ sourceType: 'skillEdit', sourceId: skillId }}`。
- API route 的 zod runtime schema 继续负责把 `{ appId } | { skillId }` 转换成 `sourceType/sourceId`，业务层不感知 `appId/skillId`。
- ChatBox runtime 状态 key 不暴露成 prop，统一用 `getChatSourceKey(sourceTarget)` 生成，如 `${sourceType}:${sourceId}`。
- Skill Preview 下 input guide、TTS、语音识别入口和 ChatBox 内的 App 沙盒入口不展示、不调用。
- Skill Detail 的编辑沙盒继续使用 `SandboxEditor`，但必须传 `chatTarget={{ skillId }}`；Sandbox API 对外接收 `appId/skillId` raw target，route 内转换为 `sourceType/sourceId`，不得再传 `appId={skillId}`。
- sandbox 实例表当前仍复用物理字段 `appId/userId/chatId` 保存历史归属，属于存储兼容层；UI/API/service 调用层以 `sourceType/sourceId` 或 raw `chatTarget` 为准。
- 语音识别接口按 `sourceTarget + chatId` 派生 API raw target 做鉴权绑定；当前 Skill Edit 前端不暴露入口。
- 所有标准 chat API 调用只能从 `sourceTarget` 派生 `ChatApiTarget`，不能从真实 App-only `appId` 或 Skill ID 推导。
- 前端组件不要自行拼 API raw target，统一走 `toChatApiTarget(sourceTarget)`。

### ChatBox 最终前端方案

最终前端方案：

`ChatBox` 不再感知 `appId/skillId`，只接收标准内部 target：

```ts
type ChatSourceTarget = {
  sourceType: 'app' | 'skillEdit';
  sourceId: string;
};
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

边界划分：

- `sourceTarget`：用于 record/history/feedback/file/quote/resume/stop/delete 等标准 chat 能力。
- `features`：只控制功能展示和能力开关，比如 feedback、mark、voice、tts、inputGuide、sandbox、workorder、autoResume、markRead、quickReplies、footer actions。
- `onStartChat`：保留外部注入，因为 App/Home/Share/ChatTest/Skill Preview 的生成编排不同，暂时不能统一。
- `onChatGenerateStatusChange`：只作为事件通知外部页面；ChatBox 不直接读写侧栏 history、最近使用、路由状态等外部模型。
- `onStopChat`：移除外部 override，统一走 source-aware `/api/v2/chat/stop`。
- `onDeleteChatItem`：移除外部 override，统一走 source-aware chat item delete 接口。
- 内部状态 key 不暴露成 prop，统一用 `getChatSourceKey(sourceTarget)` 生成，如 `${sourceType}:${sourceId}`。
- ChatBox 目录内禁止直接依赖 `ChatContext`、`useChatStore`、最近使用等外部页面状态；需要影响外部时通过 props 回调由页面层承接。
- App/Home/Share 侧栏历史同步放在页面层 hook 中消费 `onChatGenerateStatusChange`；Skill Preview 不传该回调。

前端请求边界通过 `toChatApiTarget(sourceTarget)` 转成 OpenAPI raw target：

```ts
{ sourceType: 'app', sourceId: appId } -> { appId }
{ sourceType: 'skillEdit', sourceId: skillId } -> { skillId }
```

迁移顺序：

1. 新增 `ChatSourceTarget`、`getChatSourceKey`、`toChatApiTarget`。
2. `WorkflowRuntimeContext` 改为暴露 `sourceTarget/sourceKey/appId/chatId`，其中 `appId` 只表示真实 App-only 能力所需的 AppId。
3. `ChatBox` props 改为 `sourceTarget + features + onStartChat`，不保留 `feedbackType/showMarkIcon/showVoiceIcon/...` 等旧 feature props。
4. 标准 chat 请求统一改用 `toChatApiTarget(sourceTarget)`。
5. 删除 `onStopChat/onDeleteChatItem` 两个 props，Skill Preview 改走通用 stop/delete。
6. App-only 功能全部从 `appId` 判断改为 `features` 控制。
7. 外部 history/recently used/router 等状态同步迁到页面层 props 回调，ChatBox 内只保留自身 UI 状态。
8. 最后扫 `ChatBox` 目录内 `appId/skillId/chatTarget/chatTargetId`，确保只剩入口页面或 App-only 能力使用。

最大注意点：`onStartChat` 不是 feature，也不是标准 CRUD，先保留。

## 权限设计

新增标准 chat target 鉴权入口：

```ts
type AuthChatTargetParams = {
  sourceType: ChatSourceTypeEnum;
  sourceId: string;
  chatId?: string;
};
```

规则：

- `sourceType=app`：复用现有 `authChatCrud/authApp`。
- `sourceType=skillEdit`：走 `authSkill`，并在传入 `chatId` 时用 source-aware 查询校验 chat 属于当前 skill 和团队。
- outLink、share、team domain 等 App 专属入口保持 `sourceType=app`。

所有 chat 存在性校验必须使用 source-aware 查询，禁止裸查 `{ appId, chatId }`。

## 数据模型

### chats

新增 `sourceType` 字段，第一阶段不设置 `required: true`，也不设置 schema default。

原因：

- 历史 App 数据缺失 `sourceType`。
- 新写入必须通过 `buildChatSourceWriteFields` 显式带 `sourceType`；不能让漏传在 Mongoose 层静默默认成 App。
- 待可选回填完成后，再评估是否收紧 schema 校验。

`appId` 保留为物理字段名，但注释必须说明业务语义是 `sourceId`。

### chatitems

新增同样的 `sourceType` 字段。Human/AI 占位写入、AI 消息更新、软删除、反馈、记录读取都必须带 source-aware 条件。

### chat_item_responses

新增同样的 `sourceType` 字段。`createWorkflowEntryNodeResponseWriter` 写入和读取都接收 `sourceType/sourceId`，避免 App 与 Skill Edit 在极端 ID 碰撞时串数据。

### usages

新增 `skillId` 字段。

写入规则：

- App chat：写 `usage.appId`，不写 `usage.skillId`。
- Skill Edit chat：写 `usage.skillId`，不写 `usage.appId`。

`usages` 和 `usage_items` 是计费审计数据，不能随 chat 删除。

### app_chat_logs

不新增 `sourceType`。该表语义是 App 统计日志，Skill Edit 不写入。`app_chat_logs` 不纳入统一 chat 资源删除函数，由 App 删除流程自行处理。

## Workflow Runtime

`runningAppInfo` 不保留 deprecated `id` 或 `sandboxId` 字段，最终结构为：

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

使用规则：

- chat 持久化：使用 `sourceType/sourceId`。
- 计费：App 写 `usage.appId=sourceId`，Skill Edit 写 `usage.skillId=sourceId`。
- nodeResponse：使用 `sourceType/sourceId` 写入和读取。
- stop/resume：使用 `sourceType/sourceId/chatId` 作为 Redis namespace。
- App 专属逻辑只能在 `sourceType=app` 时把 `sourceId` 当 AppId 使用。
- Skill Edit 专属逻辑只能在 `sourceType=skillEdit` 时把 `sourceId` 当 SkillId 使用。

`streamAgentSandboxInitStatus` 不应再接收 `appId` 或 `sandboxId`。它只接收 `sourceType/sourceId/userId/chatId`，内部调用 `getRunningSandboxId` 计算实际 sandboxId 后推送状态。

## Sandbox

Sandbox id 统一由 `getRunningSandboxId` 计算：

```ts
function getRunningSandboxId({
  sourceType,
  sourceId,
  userId,
  chatId
}: {
  sourceType: ChatSourceTypeEnum;
  sourceId: string;
  userId: string;
  chatId: string;
}) {
  if (sourceType === ChatSourceTypeEnum.app) {
    return generateSandboxId(sourceId, userId, chatId);
  }

  if (sourceType === ChatSourceTypeEnum.skillEdit) {
    return getEditDebugSandboxId(sourceId);
  }

  const exhaustiveCheck: never = sourceType;
  throw new Error(`Unsupported chat source type: ${exhaustiveCheck}`);
}
```

规则：

- App chat：`generateSandboxId(appId, userId, chatId)`。
- Skill Edit：固定 `getEditDebugSandboxId(skillId)`。
- `ensureAgentSandboxRuntime` 内部计算 sandboxId，不从 `runningAppInfo` 读取。
- 底层 sandbox schema 如仍叫 `appId`，调用层必须集中封装，避免业务代码把它误认为真实 AppId。

## systemVar

Skill Edit 场景不伪造 `appId`。

规则：

- App 场景继续注入 `appId=sourceId`。
- Skill Edit 场景不注入 `appId`。
- 内部运行态可以携带 `sourceType/sourceId`；是否暴露到变量面板另行评估。

## S3 文件

新上传统一使用 source-aware key：

```ts
chat/${sourceType}/${sourceId}/${uid}/${chatId}/${filename}
```

兼容规则：

- 旧 App 文件 key `chat/${appId}/${uid}/${chatId}/${filename}` 继续可读。
- 新 App 文件使用 `chat/app/${appId}/...`。
- 新 Skill Edit 文件使用 `chat/skillEdit/${skillId}/...`。
- 历史 chat item 中保存的旧 key 不重写。
- legacy key 只允许在 `sourceType=app` 的鉴权上下文中通过。
- Skill Edit 不默认读取 legacy App key。

## stop/resume key

stop key：

```ts
agent_runtime_stopping:${sourceType}:${sourceId}:${chatId}
```

stream resume key：

```ts
stream:resume:data:${teamId}:${sourceType}:${sourceId}:${chatId}
stream:resume:unavailable:${teamId}:${sourceType}:${sourceId}:${chatId}
stream:resume:active:${teamId}:${sourceType}:${sourceId}:${chatId}
```

stop、resume、catchUp、runtime status 的 key 构造必须集中到 helper，禁止各处手写。

## 删除与清理

标准 chat 会话资源统一由 source-aware 删除函数处理：

- `chats`
- `chatitems`
- `chat_item_responses`
- chat S3 文件
- chat 绑定的 sandbox 实例和资源

不纳入统一函数：

- `app_chat_logs`：App 日志域，由 App 删除流程处理。
- `usages` / `usage_items`：计费审计域，不能删除。
- `chat_input_guides`：App 配置域。
- HelperBot chat：独立命名空间。

App 删除调用：

```ts
await deleteSandboxesByAppId(appId);

deleteChatResourcesBySource({
  sourceType: ChatSourceTypeEnum.app,
  sourceId: appId,
  includeLegacyApp: true,
  deleteSandboxResources: false
});
```

App 删除流程先按 App 维度删除 sandbox，再调用统一 chat 资源删除函数；统一函数此时不再重复删 chat 绑定 sandbox。App 日志仍由 App 删除流程单独删除。

App 日志批量硬删 chat 调用：

```ts
deleteChatResourcesBySource({
  sourceType: ChatSourceTypeEnum.app,
  sourceId: appId,
  chatIds,
  includeLegacyApp: true
});
```

该场景会删除指定 chat 绑定的 App sandbox。

Skill 删除调用：

```ts
deleteChatResourcesBySource({
  sourceType: ChatSourceTypeEnum.skillEdit,
  sourceId: skillId
});
```

旧 Skill Debug 初始化清理调用：

```ts
deleteChatResourcesBySource({
  sourceType: ChatSourceTypeEnum.skillEdit,
  sourceId: skillId,
  legacySkillDebug: true
});
```

`legacySkillDebug=true` 只匹配：

```ts
{
  appId: skillId,
  source: ChatSourceEnum.test,
  sourceType: { $exists: false }
}
```

## 旧 Skill Debug 清理

旧 Skill Debug chat 不做迁移，初始化阶段一次性硬删。原因：

- 旧数据缺少 `sourceType`，会和历史 App 兼容逻辑冲突。
- 旧唯一索引 `{ appId: 1, chatId: 1 }` 存在时，旧 Skill row 会挡住新 Skill Edit row。
- Skill Preview 可能从 localStorage 复用旧 `chatId`，不清理会触发 duplicate key。

清理识别规则：

1. 扫描 `agentSkills._id`，Skill 数量预计不超过 1000。
2. 用 skillId 集合匹配 legacy chats：

```js
{
  appId: { $in: skillIds },
  source: 'test',
  sourceType: { $exists: false }
}
```

3. 与 `apps._id` 做审计比对，输出重复 ID 报告。第一阶段不把碰撞作为自动剔除条件。
4. 按 skillId 和 chat 游标分批硬删 chats/items/responses/S3。Skill Edit 编辑沙盒由 Skill 删除链路处理，不由 legacy chat 清理函数处理。
5. 脚本支持 dry-run、断点续跑和幂等重试。

上线后保留一次 duplicate 兜底：Skill Edit 创建 chat 遇到 duplicate 时，如果确认是 legacy Skill Debug row，则清理该单 chat 后重试一次。

## 索引与迁移

上线前先创建新索引。

`chats` 新唯一索引：

```js
db.chats.createIndex(
  { sourceType: 1, appId: 1, chatId: 1 },
  {
    unique: true,
    name: 'sourceType_1_appId_1_chatId_1'
  }
);
```

创建前先做重复审计。旧 `{ appId: 1, chatId: 1 }` 唯一索引稳定后再删除。

如果不回填历史 App 数据，删除旧唯一索引后 DB 不会阻止以下逻辑重复：

```js
{ appId, chatId, sourceType: { $exists: false } }
{ appId, chatId, sourceType: 'app' }
```

因此 App 写入路径必须先用 source-aware query 命中 legacy row，不能盲插新 App row。

`chatitems` 和 `chat_item_responses` 需要补 source-aware 非唯一复合索引，用于记录读取、分页、删除和 nodeResponse 查询。旧索引先保留，用于 legacy App 查询、rollback 和 explain 对比。

## 风险

### 历史 App 数据漏查

App 查询必须长期兼容 `sourceType` 缺失，直到可选回填完成且确认不再需要 legacy 查询。

### 旧唯一索引删除后的重复写入

删除旧唯一索引前必须确认 App 写入路径不会在同一 `appId/chatId` 下创建 legacy row 和 `sourceType=app` row 两份逻辑重复。

### usage 归因错误

Skill Edit 只能写 `usage.skillId`，不能写 `usage.appId`。

### runningAppInfo 字段误用

不保留 `runningAppInfo.id` 和 `runningAppInfo.sandboxId`。所有运行态调用只使用 `sourceType/sourceId`，sandboxId 统一计算。

### S3 或删除串源

新文件 key、预览授权和删除前缀都必须按 source-aware 规则处理。App 删除清理 legacy + new App 前缀，Skill 删除只清理 `chat/skillEdit/${skillId}`。

## TODO

- [x] 创建新索引并执行旧 Skill Debug dry-run。
- [x] 上线 sourceType/sourceId 基础类型、schema、helper 和鉴权入口。
- [x] 改造标准 chat API 的 raw schema、runtime schema、route `parseApiInput` 和 OpenAPI path。
- [x] 改造 chat 三表读写、nodeResponse、stop/resume、usage、app_chat_logs 边界。
- [x] 改造 workflow runtime、`runningAppInfo`、sandbox id 计算和 systemVar 注入。
- [x] 改造 S3 key 生成、解析、授权和删除。
- [x] 改造 ChatBox/Skill Preview，标准 chat API 请求统一从 `sourceTarget` 经 `toChatApiTarget(sourceTarget)` 转成 `{ appId } | { skillId }`。
- [x] 增加统一 chat 资源硬删除函数，并接入 App 删除、Skill 删除。
- [x] 增加旧 Skill Debug 初始化清理任务入口，调用 `deleteChatResourcesBySource({ sourceType: skillEdit, sourceId: skillId, legacySkillDebug: true })`，支持 dry-run、断点续跑和幂等重试。
- [x] 补充单测、集成测试和关键查询 explain。
- [x] 最后执行集成复验（本地数据 + 浏览器）：使用本地 MongoDB 测试 App/Skill 数据，启动 `projects/app` 与必要的 sandbox proxy，在浏览器覆盖 App Chat 和 Skill Preview 的创建、继续对话、停止、恢复、删除、文件上传/预览，并确认 Skill Preview 不展示、不调用语音、TTS、input guide 和 ChatBox 内 App 沙盒入口。

当前进度：

- ChatBox 内部已新增并使用 `useChatApiTarget(sourceTarget)`，删除、反馈、引用、上传、语音识别、停止、恢复、已读标记等标准 chat 请求不再直接依赖兼容层 `chatTarget`。
- `useFileUpload` 已改为只接收内部 `sourceTarget`，不再接收 `appId/chatTarget` 双入口。
- 标准 ChatBox/Provider 已改为强制接收 `sourceTarget`，不再接收 `appId/chatTarget` raw 入口；App Chat、Home Chat、Share Chat、ChatTest、Log Detail 和 Skill Preview 主要调用点均已传内部 `sourceTarget`。
- `WorkflowRuntimeContext` 已移除 raw `chatTarget` 暴露；标准请求点通过 `sourceTarget -> useChatApiTarget(sourceTarget)` 局部转换成 `{ appId } | { skillId }`。
- `FileSelector` 已改为从 `WorkflowRuntimeContext.sourceTarget` 派生 chat API target，文件预览/上传不再读取 runtime raw `chatTarget`。
- 文件预览 `/api/core/chat/file/presignChatFileGetUrl` 已补齐 `chatId` 入参，授权时同时校验 `sourceType/sourceId/uid/chatId` 与 S3 key 归属；旧 App key `chat/${appId}/${uid}/${chatId}/...` 继续可读，新 App/Skill key 使用 `chat/${sourceType}/${sourceId}/${uid}/${chatId}/...`。
- ChatBox 公开 props 已直切为 `sourceTarget + features + onStartChat + props callbacks`；旧 `feedbackType/showMarkIcon/showVoiceIcon/showWorkorder/enableAutoResume/enableMarkChatRead/enableQuickReplies` 等 feature props 已删除，不保留客户端兼容入口。
- ChatBox 内 TTS/App-only 能力由 `features` 控制，真实 AppId 仅从 `sourceTarget` 派生；Skill Edit 下 `features.voice/tts/inputGuide/sandbox/markRead` 关闭后不会展示或调用对应 App-only 能力。
- `WorkflowRuntimeContextProvider` 已强制接收 `sourceTarget`，不再保留 `appId/chatTarget` 兼容入口；PluginRunBox 等 App-only 场景显式传 `sourceType=app/sourceId=appId`。
- Agent sandbox runtime 原子入口 `prepareAgentSandboxRuntime` 已改为接收 `sourceType/sourceId/userId/chatId`，内部统一调用 `getRunningSandboxId`，只在 sandbox 实例表兼容层写入物理 `appId/userId/chatId` 字段。
- Skill 导出接口已从 `findSandboxInstanceByAppChatType({ appId: skillId })` 改为按 `getRunningSandboxId({ sourceType: skillEdit, sourceId: skillId })` 计算 `sandboxId` 后查询 edit-debug 实例。
- Skill 保存发布和编辑态 sandbox 复用已改为按 `getEditDebugSandboxId(skillId)` 计算 `sandboxId` 后查询当前 provider 实例；`getSandboxClient` 创建编辑态 sandbox 时也显式传入 `sandboxId`，不再依赖 `appId=skillId + chatId=edit-debug` 的推导入口。
- Skill Preview 已不再把 Skill ID 写入 `chatBoxData.appId`，避免后续误判为真实 App-only 能力目标。
- Skill Preview 目录内未挂载的 `PreviewInput` 已同步把 prop 从 `appId` 改为 `skillId`，避免保留 Skill ID 伪装 App ID 的命名。
- ChatBox 已移除内部侧栏历史同步逻辑；生成状态变化通过 `onChatGenerateStatusChange` 抛给页面层，App Chat、Home Chat、Share Chat 由页面层 hook 同步 history，Skill Preview 不接入外部 history。
- 运行时滚动 key、恢复防串 key、重复恢复 key 已改为使用 `sourceKey`，避免 App 与 Skill Edit 只按裸 id 混用。
- OpenAPI chat target helper 已补齐 `createOutLinkChatTargetInputSchema`、`createOptionalOutLinkChatTargetInputSchema`、`withOutLinkChatTarget` 和 `withOptionalOutLinkChatTarget`，避免 `OutLinkChatAuthSchema.extend(createChatTargetInputSchema(...).shape)` 丢失 `appId/skillId` 互斥校验。
- `record/history/resume/audio transcriptions` 等带外链鉴权的标准 chat schema 已补互斥校验；OpenAPI path 仍注册 raw schema，API route 通过 runtime schema transform 输出 `sourceType/sourceId`。
- `/v1/audio/transcriptions` 已补 OpenAPI multipart/form-data path，文档表单 schema 使用 `file` 二进制和 raw `data` 参数，`data` 内仍暴露 `{ appId } | { skillId } + chatId + duration`，不暴露内部 `sourceType/sourceId`。
- HelperBot `deleteRecord/getFilePresign/getFilePreviewUrl` 已补齐 `parseApiInput` 路由校验和 OpenAPI path，避免同一 chat 目录下保留直接读取 `req.body/req.query` 的边界实现。
- 新增 `packages/global/test/openapi/core/chat/targetSchema.test.ts` 覆盖 App/Skill target transform、必填 target 缺失、`appId+skillId` 同传拒绝、可选 target 缺省/歧义行为，以及 `/v1/audio/transcriptions` raw form schema 与 runtime `sourceType/sourceId` transform 分层。
- 新增 `packages/service/test/core/chat/schema.test.ts` 覆盖 `chats/chatitems/chat_item_responses` 的 source-aware 索引声明，包括 `sourceType_1_appId_1_chatId_1` 唯一索引。
- `packages/service/test/core/workflow/workflowStatus.test.ts` 已补 `agent_runtime_stopping:${sourceType}:${sourceId}:${chatId}` key 格式测试，防止 stop key 回退为裸 sourceId/chatId。
- `projects/app/test/service/support/permission/auth/chat.test.ts` 已补 Skill Edit `authChatTargetCrud` 鉴权、source-aware chat 查询和团队不匹配拒绝测试。
- App 删除已先删 App sandbox，再调用 `deleteChatResourcesBySource({ sourceType: app, includeLegacyApp: true, deleteSandboxResources: false })`；Skill 删除已对非文件夹 Skill 调用 `deleteChatResourcesBySource({ sourceType: skillEdit })`。
- `pnpm --filter @fastgpt/app typecheck` 已通过。
- `pnpm --filter @fastgpt/app typecheck` 已在文件预览 `chatId` 授权收紧后复跑通过。
- `pnpm --filter @fastgpt/global test -- test/openapi/core/chat/targetSchema.test.ts` 已在文件预览 raw/runtime schema 增加 `chatId` 后复跑通过。
- `pnpm --filter @fastgpt/global test -- test/openapi/core/chat/targetSchema.test.ts` 已在 `/v1/audio/transcriptions` OpenAPI multipart path 与 raw/runtime 分层测试补齐后复跑通过，当前覆盖 81 个文件、1688 个测试。
- `pnpm exec vitest run -c vitest.config.ts test/pages/api/core/chat/file/presignChatFilePostUrl.test.ts test/pages/api/core/chat/file/presignChatFileGetUrl.test.ts test/service/support/permission/auth/chat.test.ts`（在 `projects/app` 下执行）已通过，覆盖文件上传/预览和 chat target 鉴权。
- `pnpm exec vitest run -c vitest.config.ts test/common/s3/key.test.ts test/core/chat/delete.test.ts test/core/chat/legacySkillDebugCleanup.test.ts`（在 `packages/service` 下执行）已通过，覆盖 S3 key `chatId` 授权、source-aware 删除和旧 Skill Debug 清理。
- `pnpm exec vitest run -c vitest.config.ts test/components/core/chat/ChatContainer/ChatBox/scrollUtils.test.ts test/pages/api/core/chat/file/presignChatFileGetUrl.test.ts test/pages/api/core/chat/file/presignChatFilePostUrl.test.ts test/api/core/chat/record/getResData.test.ts test/api/core/ai/sandbox/keepalive.test.ts test/api/core/chat/history/batchDelete.test.ts`（在 `projects/app` 下执行）已通过。
- `pnpm --filter @fastgpt/global test -- test/openapi/core/chat/targetSchema.test.ts` 已通过。
- `pnpm exec vitest run -c vitest.config.ts test/core/workflow/workflowStatus.test.ts`（在 `packages/service` 下执行）已通过。
- `pnpm exec vitest run -c vitest.config.ts test/service/support/permission/auth/chat.test.ts`（在 `projects/app` 下执行）已通过。
- `pnpm exec vitest run -c vitest.config.ts test/api/core/ai/skill/debugChat.test.ts test/api/core/ai/skill/debugSession/list.test.ts test/api/core/ai/skill/debugSession/records.test.ts test/api/core/ai/skill/debugSession/delete.test.ts test/api/core/ai/skill/debugSession/chatItemDelete.permission.test.ts test/api/core/ai/skill/debugSession/stop.test.ts`（在 `projects/app` 下执行）已通过，旧 Skill Debug 专属测试数据已同步为 `sourceType=skillEdit`。
- `pnpm exec vitest run -c vitest.config.ts test/components/core/chat/ChatContainer/ChatBox/scrollUtils.test.ts test/pages/api/core/chat/file/presignChatFileGetUrl.test.ts test/pages/api/core/chat/file/presignChatFilePostUrl.test.ts test/api/core/chat/record/getResData.test.ts test/api/core/chat/history/batchDelete.test.ts test/service/support/permission/auth/chat.test.ts test/api/core/ai/skill/debugChat.test.ts test/api/core/ai/skill/debugSession/list.test.ts test/api/core/ai/skill/debugSession/records.test.ts test/api/core/ai/skill/debugSession/delete.test.ts test/api/core/ai/skill/debugSession/chatItemDelete.permission.test.ts test/api/core/ai/skill/debugSession/stop.test.ts`（在 `projects/app` 下执行）已通过，覆盖 12 个文件、116 个测试。
- `pnpm exec vitest run -c vitest.config.ts test/common/s3/key.test.ts test/core/chat/delete.test.ts test/core/chat/legacySkillDebugCleanup.test.ts test/core/chat/nodeResponseStorage.test.ts test/core/chat/saveChat.test.ts test/core/chat/controller.test.ts`（在 `packages/service` 下执行）已通过，覆盖 6 个文件、126 个测试。
- `pnpm exec vitest run -c vitest.config.ts test/pages/api/core/chat/helperBot/deleteRecord.test.ts test/pages/api/core/chat/helperBot/getFilePresign.test.ts test/pages/api/core/chat/helperBot/getFilePreviewUrl.test.ts test/api/core/chat/record/delete.test.ts`（在 `projects/app` 下执行）已通过，覆盖 4 个文件、12 个测试。
- `pnpm exec vitest run -c vitest.config.ts test/core/chat/schema.test.ts test/core/chat/delete.test.ts test/core/chat/legacySkillDebugCleanup.test.ts`（在 `packages/service` 下执行）已通过，覆盖 3 个文件、10 个测试。
- `pnpm exec vitest run -c vitest.config.ts test/core/ai/sandbox/runtime/index.test.ts test/core/workflow/dispatch/ai/agent/sub/sandbox/prepare.test.ts`（在 `packages/service` 下执行）已通过，覆盖 2 个文件、9 个测试。
- `pnpm exec vitest run -c vitest.config.ts test/core/workflow/dispatch/ai/agent/index.test.ts test/core/workflow/dispatch/ai/agent/piAgent/index.test.ts`（在 `packages/service` 下执行）已通过，覆盖 2 个文件、16 个测试；相关 fixture 已移除旧 `runningAppInfo.id`，改用最终 `sourceType/sourceId` 结构。
- `pnpm exec vitest run -c vitest.config.ts test/api/core/ai/skill/export.test.ts`（在 `projects/app` 下执行）已通过，覆盖 Skill 导出按 edit-debug `sandboxId` 查询实例。
- `pnpm exec vitest run -c vitest.config.ts test/core/ai/skill/deploy.test.ts test/core/ai/skill/editSandboxPackage.test.ts test/core/ai/sandbox/instance/repository.test.ts`（在 `packages/service` 下执行）已通过，覆盖 Skill 保存部署、编辑态打包和 sandbox repository 回归。
- `pnpm exec vitest run -c vitest.config.ts test/core/ai/skill/deploy.test.ts test/core/ai/skill/editSandboxPackage.test.ts test/core/ai/sandbox/runtime/index.test.ts test/core/workflow/dispatch/ai/agent/sub/sandbox/prepare.test.ts`（在 `packages/service` 下执行）已通过，覆盖 4 个文件、22 个测试，确认 Skill 保存发布、编辑态 sandbox、agent sandbox runtime 和 prepare 链路均使用 source-aware/sandboxId 口径。
- 已补充 `packages/service/test/core/chat/schema.test.ts` 断言 chat 三表 `sourceType` 可缺失但无默认值，防止新写入漏传时被静默归为 App；并重跑 `test/core/chat/schema.test.ts test/core/chat/delete.test.ts test/core/chat/legacySkillDebugCleanup.test.ts test/core/chat/saveChat.test.ts test/core/chat/controller.test.ts`，覆盖 5 个文件、95 个测试。
- 已用脚本逐项复核标准接口列表：24 个 route 均调用 `parseApiInput`，handler 内均使用 `sourceType/sourceId`，且未发现 `req.body/req.query` 裸读取或 `Schema.parse(req.*)`。
- 已在本地 MongoDB `fastgpt` 执行重复审计，`DUPLICATE_SOURCE_ROWS=0`、`DUPLICATE_LEGACY_APP_ROWS=0`；随后创建 `chats`、`chatitems`、`chat_item_responses` 的 source-aware 新索引，复核 `MISSING_INDEXES={ chats: [], chatitems: [], chat_item_responses: [] }`。
- 已在本地 MongoDB 执行旧 Skill Debug dry-run：扫描 Skill 2 个，命中 1 个，legacy chat 3 条，chatitems 22 条，chat item responses 489 条，App ID 冲突 0 个。
- 已在本地 MongoDB 执行关键查询 explain：当前本地库有 legacy App 样本，legacy App 查询走 `appId_1_chatId_1`；本地暂无 `sourceType=app/skillEdit` 样本可用于 explain 新索引命中，但 schema 测试和实际索引复核已证明新索引存在。
- 已启动本地 `projects/app` dev server：`http://localhost:3010`，并用浏览器登录 root 验证。Skill Detail 页面 `/skill/detail?skillId=6a109b3df5f26558f004a0dd` 能渲染 Skill Preview，`/api/core/chat/record/getRecords_v2` 请求体为 `{ skillId, chatId }`，不再传伪 `appId`；Skill 编辑沙盒 `/api/core/ai/sandbox/getTicket` 请求体为 `{ skillId, chatId: "edit-debug" }`，ticket 内为 `sourceType=skillEdit/sourceId=skillId`。
- 浏览器最终集成验证已完成：使用临时 1007 端口运行当前源码构建的 `agent-sandbox-proxy`，本地 `projects/app` 以 `AGENT_SANDBOX_PROXY_URL=ws://localhost:1007` 启动；Skill Detail 页面可加载编辑沙盒文件树、打开 `SKILL.md`，并通过 `/api/core/ai/skill/debugChat` 成功生成 Skill Preview 回复。
- 浏览器最终集成验证已确认 Skill Preview 下未出现语音、TTS、input guide、ChatBox 内 App 沙盒入口；编辑沙盒 ticket 请求体为 `{ skillId, chatId: "edit-debug" }`，Skill Preview 记录读取请求体为 `{ skillId, chatId }`，未出现伪 `appId=skillId`。
- 浏览器同源 `fetch` 已补充验证标准接口：`/api/v2/chat/stop`、`/api/core/chat/resume`、`/api/core/chat/record/delete` 均使用 `{ skillId, chatId }` 调通；删除后 `getRecords_v2` 返回空列表，MongoDB 中对应 Human/AI chat item 均写入 `deleteTime` 且保留 `sourceType=skillEdit`。
- 本地 MongoDB 已确认该 Skill Preview 会话写入 `chats/chatitems.sourceType=skillEdit`、物理 `appId=skillId`，usage 只写 `skillId` 且 `appId` 为空。
- App Chat 浏览器验证中，标准 `/api/core/chat/record/getRecords_v2` 和 `/api/core/chat/history/getHistories` 请求体均为 OpenAPI raw `{ appId, chatId }`，未向前端暴露内部 `sourceType/sourceId`。
- 合并前最终集成复验已完成（本地数据 + 浏览器 + 本地 HTTP 会话）：本地 `projects/app` 使用 `http://localhost:3010`，当前源码构建的 `agent-sandbox-proxy` 使用 `ws://localhost:1007`；Skill Detail `/skill/detail?skillId=6a109b3df5f26558f004a0dd` 能渲染 Skill Preview 和编辑沙盒文件树，proxy keepalive 显示 `sourceType=skillEdit/sourceId=6a109b3df5f26558f004a0dd/appId=None/chatId=edit-debug`。
- Skill Preview 最终复验中发送对话后生成 `pong`；MongoDB 中 `chats` 写入 `_id=6a3d810679221725bdb362a4`、`appId=6a109b3df5f26558f004a0dd`、`sourceType=skillEdit`、`chatId=zf2uDJmjKCvGww7AziSz2Iag`，`chatitems` 和 `chat_item_responses` 均写入 `sourceType=skillEdit`，usage 只写 `skillId` 且 `appId=null`。
- App Chat 最终复验中，`/chat?appId=698acb87c732acf2ae635408&pane=ra` 可读取 `sourceType` 缺失的旧 App 历史；发送新对话后 MongoDB 中 `chats` 写入 `_id=6a3d818e79221725bdb366af`、`sourceType=app`、`chatId=pN1hm6zhLYjwr0ZLeunZPEn0`，`chatitems` 和 `chat_item_responses` 均写入 `sourceType=app`，usage 写 `appId` 且 `skillId=null`。
- 文件上传/预览最终复验中，Chrome 扩展的本地文件权限限制导致浏览器 file chooser `setFiles` 被拒绝；随后用同一登录会话调用文件 API 验证成功：`presignChatFilePostUrl` 生成 `chat/app/6985c80636a9f033848ecd4f/67c526a0ddd9a98bde65ad8e/mtfWFmeKCZ2bfzGZbeiGccYC/codex-integration_bOMf62.txt`，上传代理返回 200，正确 `chatId` 预览返回 200，错误 `chatId` 预览返回 `unAuthChat`。
- stop/resume/delete 最终复验中，App 使用 raw `{ appId, chatId }`、Skill Edit 使用 raw `{ skillId, chatId }` 调通 `/api/v2/chat/stop`、`/api/core/chat/resume` 和 `/api/core/chat/record/delete`；删除验证为测试记录软删除，MongoDB 中目标 Human item 分别保留 `sourceType=app` 或 `sourceType=skillEdit` 并写入 `deleteTime`。
- `git diff --check` 已通过。
- ChatBox 根节点已不再向 DOM 透传 `sourceTarget/chatId/outLinkAuthData/InputLeftComponent/dialogTips` 等 provider-only props。
- AI 气泡 footer 的 App-only sandbox 入口已改为只有 `features.sandbox && appId && isPc && useAgentSandbox` 时才启用；`useSandboxEditor` 支持 `enabled=false` no-op，Skill Preview 生成完成后不会因为没有真实 AppId 抛出 `Sandbox target is required`。
- 浏览器 console 复验仅剩既有表单 `id/name` 可访问性 issue，未再出现 `sourceTarget/chatId` DOM prop warning、`Sandbox target is required` runtime error 或 sandbox proxy WebSocket 401。
- 曾误用 `pnpm --filter @fastgpt/app test -- test/service/support/permission/auth/chat.test.ts`，该命令实际触发了大范围 app 测试，并暴露多处旧测试未同步 sourceType/sourceId 或 mock 缺新导出的失败；不作为本轮局部验证通过依据。
- ChatBox 目录扫描已确认不再直接依赖 `ChatContext`、`useChatStore`、`postMarkChatRead`、侧栏 histories 或 recently-used；需要影响外部 history 的状态变化已通过 `onChatGenerateStatusChange` 交给页面层处理。
- 复核 API 边界时清理了 `/api/core/workflow/debug` 的 `parseApiInput(...).body as PostWorkflowDebugProps`，改为由 `WorkflowDebugBodySchema` 推断 handler 本地类型；`rg` 已确认 `projects/app/src/pages/api` 和 `packages/global/openapi` 下不再存在 `parseApiInput(...).body/query as ...` 形态。
- 已重新验证 24 个标准 source-aware route：均调用 `parseApiInput`，无 `Schema.parse(req.*)`，handler 内均使用 `sourceType/sourceId`；OpenAPI chat request schema 扫描确认未暴露内部 `sourceType/sourceId`，且 requestBody/query 未注册 runtime transform schema。
- 已补充运行 `pnpm --filter @fastgpt/app typecheck`，通过；`git diff --check` 通过；`cargo check` 因本机未安装 `cargo` 无法执行。随后使用 `docker build --no-cache -t fastgpt-agent-sandbox-proxy:codex-check projects/agent-sandbox-proxy` 验证 sandbox proxy Dockerfile release 构建通过，`cargo build --release --locked` 完成，release 编译用时 2m24s；临时镜像已删除。
- 已扩展复跑 service chat/workflow/sandbox 关键测试：`test/common/s3/key.test.ts test/core/chat/schema.test.ts test/core/chat/delete.test.ts test/core/chat/legacySkillDebugCleanup.test.ts test/core/workflow/workflowStatus.test.ts test/core/ai/sandbox/runtime/index.test.ts test/core/workflow/dispatch/ai/agent/sub/sandbox/prepare.test.ts` 通过，覆盖 7 个文件、40 个测试。
- 已扩展复跑 service chat 主链路测试：`test/core/chat/nodeResponseStorage.test.ts test/core/chat/saveChat.test.ts test/core/chat/controller.test.ts test/core/chat/title.test.ts test/core/chat/utils/dataIdValidation.test.ts test/core/chat/utils/prepare.test.ts test/core/chat/interactiveResponseDataId.test.ts` 通过，覆盖 7 个文件、155 个测试。
- 已扩展复跑 app API/Skill Debug 回归：`test/pages/api/core/chat/file/presignChatFilePostUrl.test.ts test/pages/api/core/chat/file/presignChatFileGetUrl.test.ts test/service/support/permission/auth/chat.test.ts test/api/core/chat/record/delete.test.ts test/api/core/chat/resume.test.ts test/api/core/ai/sandbox/keepalive.test.ts` 通过，覆盖 6 个文件、57 个测试；`test/api/core/ai/skill/debugChat.test.ts test/api/core/ai/skill/debugSession/list.test.ts test/api/core/ai/skill/debugSession/records.test.ts test/api/core/ai/skill/debugSession/delete.test.ts test/api/core/ai/skill/debugSession/chatItemDelete.permission.test.ts test/api/core/ai/skill/debugSession/stop.test.ts test/api/core/ai/skill/export.test.ts test/api/core/chat/history/batchDelete.test.ts test/api/core/chat/record/getResData.test.ts test/api/core/chat/record/getCollectionQuote.test.ts` 通过，覆盖 10 个文件、79 个测试。
- 已将 `@alicloud/credentials` 缺失的间接依赖 `debug` 补到 workspace `packageExtensions`，并通过 `pnpm install` 更新 lockfile，避免 admin/API 测试在干净安装环境下因依赖提升差异失败。
- 已把真正依赖外部 sandbox/volume manager 的 `packages/service/test/core/ai/sandbox/sandbox.integration.test.ts` 加上 `SANDBOX_INTEGRATION=true` 显式开关；默认全量测试只跑可本地 mock 的 sandbox 单测，避免本地 `.env.test.local` 中存在 sandbox 配置时误连外部服务。
- 已补充复跑最新回归：`pnpm exec vitest run -c vitest.config.ts test/support/invoke/invoke.test.ts test/support/outLink/runtime/utils.test.ts test/core/workflow/dispatch/ai/toolcall/hooks/useToolRunner.test.ts`（在 `packages/service` 下执行）通过，覆盖 3 个文件、10 个测试，确认 invoke/outLink/toolcall 均使用最终 `sourceType/sourceId` 入参。
- 已补充复跑 source-aware sandbox 删除回归：`pnpm exec vitest run -c vitest.config.ts test/core/ai/sandbox/service/resource.test.ts test/core/ai/sandbox/instance/repository.test.ts test/core/chat/delete.test.ts test/core/chat/legacySkillDebugCleanup.test.ts test/core/ai/sandbox/sandbox.integration.test.ts`（在 `packages/service` 下执行）通过，其中 4 个文件、23 个测试通过，外部 sandbox integration 文件默认跳过 21 个测试。
- 已补充复跑 `pnpm exec vitest run -c vitest.config.ts test/api/core/chat/history/batchDelete.test.ts`（在 `projects/app` 下执行）通过，覆盖 1 个文件、12 个测试，确认批量删除 Skill Edit chat 不会误删 App chat sandbox。
- 已补充运行全量 `pnpm test`，4 个任务全部成功：`@fastgpt/global` 使用缓存通过 81 个文件、1688 个测试；`@fastgpt/app` 通过 138 个文件、1018 个测试；`@fastgpt/service` 通过 217 个文件、2903 个测试，跳过 2 个外部集成文件、35 个测试。
- 最终复核 `pnpm --filter @fastgpt/app typecheck` 通过，`git diff --check` 通过。

技术实施顺序见 [SkillEdit 复用标准 Chat 技术方案](./skill-edit-chat-source-type-tech-plan.md)。

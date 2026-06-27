# SkillEdit 复用标准 Chat 技术方案

本文对应 [SkillEdit 复用标准 Chat 设计方案](./skill-edit-chat-source-type.md)，只描述最终实施顺序、代码改造点和验证标准。

## 阶段 0：数据库前置

上线代码前先由 DBA 或运维在 MongoDB 创建新索引。

`chats`：

```js
db.chats.createIndex(
  { sourceType: 1, appId: 1, chatId: 1 },
  {
    unique: true,
    name: 'sourceType_1_appId_1_chatId_1'
  }
);
```

`chatitems`：

- `{ sourceType: 1, appId: 1, chatId: 1, dataId: 1 }`
- `{ sourceType: 1, appId: 1, chatId: 1, deleteTime: 1 }`
- `{ sourceType: 1, appId: 1, chatId: 1, _id: -1 }`
- `{ sourceType: 1, appId: 1, chatId: 1, obj: 1, _id: -1 }`

`chat_item_responses`：

- `{ sourceType: 1, appId: 1, chatId: 1, chatItemDataId: 1, _id: 1 }`

执行要求：

- 创建索引前跑 duplicate 审计。
- 旧 `{ appId: 1, chatId: 1 }` 唯一索引先保留。
- 不把几亿历史 App 数据回填作为上线前置。

## 阶段 1：旧 Skill Debug 初始化清理

旧 Skill Debug chat 不迁移，按初始化任务硬删。

dry-run：

1. 扫描 `agentSkills._id`。
2. 查询 legacy Skill Debug chats：

```js
db.chats.find({
  appId: { $in: skillIds },
  source: 'test',
  sourceType: { $exists: false }
});
```

3. 与 `apps._id` 做审计比对，只输出重复 ID 报告。
4. 输出每个 skill 的 chats、chatitems、chat_item_responses、S3 prefix 数量。

清理：

- 按 skillId 分批。
- 每个 skill 内按 chat `_id` 或 `updateTime` 游标分页。
- 每批走 `deleteChatResourcesBySource({ sourceType: skillEdit, sourceId: skillId, legacySkillDebug: true })` 清理 legacy chat 三表和 S3；Skill Edit 编辑沙盒由 Skill 删除链路处理。
- 支持 dry-run、断点续跑、幂等重试。
- 默认不直接删除所有 `source=test && sourceType missing` 数据。

上线兜底：

- Skill Edit 创建 chat 遇到 duplicate 时，只检查同 `skillId/chatId` 的 legacy Skill Debug row。
- 确认命中后硬删该单 chat 并重试一次。
- 未命中 legacy row 时按真实 duplicate 错误抛出。

## 阶段 2：基础类型和 helper

新增或确认以下基础能力：

- `ChatSourceTypeEnum.app`
- `ChatSourceTypeEnum.skillEdit`
- `ChatSourceParams`
- `buildChatSourceWriteFields`
- `buildChatSourceQuery`
- `getRunningSandboxId`

约束：

- 新业务代码直接传 `sourceType/sourceId`。
- `buildChatSourceQuery` 默认让 App 查询兼容 `sourceType` 缺失数据。
- `legacySkillDebug=true` 只允许用于初始化清理和 duplicate 兜底。

## 阶段 3：Mongoose schema

给以下 schema 增加 `sourceType` 字段：

- `ChatSchema`
- `ChatItemSchema`
- `ChatItemResponseSchema`

第一阶段不设置 `required: true`，也不设置 schema default。

原因是历史 App 数据可以缺失 `sourceType`，但新写入必须通过 `buildChatSourceWriteFields` 显式带 `sourceType`；如果在 Mongoose 层默认成 App，会掩盖 service 层漏传 source 的 bug。

字段注释要求：

- `sourceType` 说明所属资源类型。
- `appId` 说明是历史物理字段名，业务语义为 `sourceId`；只有 App 场景才是真实 AppId。

usage schema 增加：

```ts
skillId?: string;
```

## 阶段 4：OpenAPI schema 和 API route

标准 chat API 使用 raw/runtime 两层 schema。

实现方式：

- Raw schema 使用 `createChatTargetInputSchema` 或 `createOptionalChatTargetInputSchema`。
- Runtime schema 使用 `withChatTarget` 或 `.transform(transformChatTargetInput)`。
- OpenAPI path 只注册 raw schema。
- API route 使用 `parseApiInput` 解析 runtime schema。
- handler 之后只传 `sourceType/sourceId`。

必须覆盖：

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

App-only route 保持 App-only，但内部调用标准 chat service 时显式传 `sourceType=app`。

`/api/core/chat/chatTest` 属于 App workflow test 协议，依赖 `nodes/edges/chatConfig/appName`、`authApp` 和 App 配置上下文。本轮不把它改成 `appId/skillId` raw target；它内部落标准 chat 记录时只允许显式传 `sourceType=app/sourceId=appId`。Skill Edit 调试继续走 Skill 专属入口，后续如要完全取消该专属入口，需要新增协议转换层，而不是复用现有 `ChatTestPropsSchema`。

当前验证记录：

- 标准接口列表已用脚本逐项确认 route 均调用 `parseApiInput`。
- route handler 内部均使用 `sourceType/sourceId`，未发现简单裸 `{ appId, chatId }` 查询模式。
- OpenAPI path 注册 raw schema，未把 runtime `sourceType/sourceId` 暴露到文档 schema。
- `/api/core/chat/resume` 已从直接 `ResumeStreamParamsSchema.parseAsync(req.query)` 改为 `parseApiInput({ querySchema: ResumeStreamParamsSchema })`。
- 最近一次脚本复核覆盖 24 个标准 route：均调用 `parseApiInput`，均出现 `sourceType/sourceId`，且未发现 `req.body/req.query` 裸读取或 `Schema.parse(req.*)`。

## 阶段 5：权限

新增 `authChatTargetCrud`。

App 分支：

- 复用 `authChatCrud`。
- 将 `sourceId` 作为 AppId。

Skill Edit 分支：

- 走 `authSkill`。
- 如果传入 `chatId`，使用 `buildChatSourceQuery({ sourceType, sourceId })` 查 chat。
- 校验 chat 的 teamId 与 skill 权限结果一致。

禁止：

- 在标准 chat route 中直接把 `skillId` 当 `appId` 传给 `authChatCrud`。
- 在 service 入参中继续传 API 原始字段 `appId/skillId`。

## 阶段 6：chat 三表读写

改造核心函数：

- `preChatRound`
- `prepareChatRound`
- `validateChatRoundDataIds`
- `tryStartGenerateChat`
- `ensureGenerateChat`
- `updateChatGenerateStatus`
- `finalizeChatRound`
- `failChatRound`
- `pushChatRecords`
- `getChatItems`
- `updateInteractiveChat`
- record/history/feedback 相关查询

要求：

- 写入使用 `buildChatSourceWriteFields`。
- 查询使用 `buildChatSourceQuery`。
- App legacy row 能被读取和更新。
- Skill Edit 只读写 `sourceType=skillEdit` 的 row。
- `MongoAppChatLog` 只在 `sourceType=app` 时写入。

## 阶段 7：nodeResponse

`createWorkflowEntryNodeResponseWriter` 入参改为 `sourceType/sourceId`。

写入：

```ts
{
  sourceType,
  appId: sourceId
}
```

读取：

- 使用同一组 source-aware 条件。
- 禁止只按 `{ appId, chatId, chatItemDataId }` 查询。

验收：

- App 和 Skill Edit 使用相同 `chatId/chatItemDataId` 时不串读。
- nodeResponse 详情、分页和 runtime collector 均带 source 条件。

## 阶段 8：workflow runtime

`RunningAppInfo` 改为：

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

改造点：

- 删除 `runningAppInfo.id`。
- 删除 `runningAppInfo.sandboxId`。
- App 专属逻辑通过 `getWorkflowAppId` 或等价 helper 获取真实 AppId。
- Skill Edit 分支不注入 `appId` system variable。
- usage 按 sourceType 写 `appId` 或 `skillId`。

`streamAgentSandboxInitStatus`：

- 参数只保留 `sourceType/sourceId/userId/chatId`。
- 内部调用 `getRunningSandboxId`。
- 不再接收 `appId` 或 `sandboxId`。

## 阶段 9：stop/resume

stop key：

```ts
agent_runtime_stopping:${sourceType}:${sourceId}:${chatId}
```

resume key：

```ts
stream:resume:*:${teamId}:${sourceType}:${sourceId}:${chatId}
```

改造点：

- `/api/v2/chat/stop` 用 runtime schema 解析 `sourceType/sourceId`。
- `setAgentRuntimeStop`、`waitForWorkflowComplete` 接收 `sourceType/sourceId`。
- `/api/core/chat/resume`、stream mirror、catchUp、unavailable state 都使用新 key。
- stale generating 清理从 chat row 读取 `sourceType ?? app` 和 `appId as sourceId`。

## 阶段 10：sandbox

统一计算函数：

```ts
getRunningSandboxId({ sourceType, sourceId, userId, chatId })
```

改造点：

- `ensureAgentSandboxRuntime` 接收 `sourceType/sourceId`。
- toolcall sandbox 入口接收 `sourceType/sourceId`。
- sandbox status 推送使用同一个计算函数。
- Skill Edit 固定映射到 `getEditDebugSandboxId(skillId)`。

当前 sandbox 对外管理 API 如果仍以 `appId/chatId` 表达 App 归属，先保持 App-only 或兼容协议，不混入标准 chat API 的 source target。

## 阶段 11：S3 文件

新 key：

```ts
chat/${sourceType}/${sourceId}/${uid}/${chatId}/${filename}
```

改造点：

- `getChatFileS3Key` 生成新 key。
- `parseChatFileS3Key` 同时支持新格式和 legacy App 格式。
- `isAuthorizedChatFileS3Key` 接收 `sourceType/sourceId/uid`。
- post/get presign route 使用 raw/runtime schema 和 `parseApiInput`。
- App 删除清理 legacy App prefix 和 new App prefix。
- Skill 删除清理 `chat/skillEdit/${skillId}`。

验收：

- 旧 App 文件仍可预览。
- Skill Edit 不能默认读取 legacy App key。
- 历史 chat item 中保存的旧 key 不改写。

## 阶段 12：ChatBox 和 Skill Preview

前端分为两层 target：

```ts
type ChatSourceTarget = {
  sourceType: 'app' | 'skillEdit';
  sourceId: string;
};

type ChatApiTarget = { appId: string } | { skillId: string };
```

改造点：

- ChatBox、ChatProvider、ChatRecordContext、ChatItemContext 中标准 chat API 调用从 `sourceTarget` 派生 `{ appId } | { skillId }`。
- App 页面传 `sourceTarget={{ sourceType: 'app', sourceId: appId }}`。
- Skill Preview 传 `sourceTarget={{ sourceType: 'skillEdit', sourceId: skillId }}`，不能传 `appId={skillId}`。
- ChatBox runtime 状态 key 不暴露成 prop，统一用 `getChatSourceKey(sourceTarget)` 生成，如 `${sourceType}:${sourceId}`。
- App-only 能力只由 `features` 控制；需要真实 AppId 时，只能从 `sourceTarget.sourceType === 'app'` 派生。
- Skill Preview 下 input guide、TTS、语音识别入口和 ChatBox 内的 App 沙盒入口不展示、不调用。
- Skill Detail 的编辑沙盒 `SandboxEditor` 使用 `chatTarget={{ skillId }}`，Sandbox API route 统一把 raw target 转成 `sourceType/sourceId`。
- sandbox 实例表物理字段 `appId/userId/chatId` 暂时作为兼容存储层保留，不作为 UI/API 入参语义。
- `/api/v1/audio/transcriptions` 按 `sourceTarget + chatId` 派生 API raw target 鉴权绑定；当前 Skill Edit 前端不暴露语音入口。
- Skill Preview 迁移完成后，删除旧 skill debug API 和前端 client。

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

最终边界：

- `sourceTarget`：用于 record/history/feedback/file/quote/resume/stop/delete 等标准 chat 能力。
- `features`：只控制功能展示和能力开关，比如 feedback、mark、voice、tts、inputGuide、sandbox、workorder、autoResume、markRead、quickReplies、footer actions。
- `onStartChat`：保留外部注入，因为 App/Home/Share/ChatTest/Skill Preview 的生成编排不同，暂时不能统一。
- `onChatGenerateStatusChange`：只负责把生成状态变化通知外部页面；ChatBox 不直接写侧栏 history、最近使用、路由状态等外部模型。
- `onStopChat`：移除外部 override，统一走 source-aware `/api/v2/chat/stop`。
- `onDeleteChatItem`：移除外部 override，统一走 source-aware chat item delete 接口。
- 内部状态 key 不暴露成 prop，统一用 `getChatSourceKey(sourceTarget)` 生成，如 `${sourceType}:${sourceId}`。
- ChatBox 目录内禁止直接依赖 `ChatContext`、`useChatStore`、最近使用等外部页面状态；需要影响外部时通过 props 回调由页面层承接。
- App/Home/Share 侧栏历史同步放在页面层 hook 中消费 `onChatGenerateStatusChange`；Skill Preview 不传该回调。

最终迁移顺序：

1. 新增 `ChatSourceTarget`、`getChatSourceKey`、`toChatApiTarget`。
2. `WorkflowRuntimeContext` 改为暴露 `sourceTarget/sourceKey/appId/chatId`，其中 `appId` 只表示真实 App-only 能力所需的 AppId。
3. `ChatBox` props 改为 `sourceTarget + features + onStartChat`，不保留 `feedbackType/showMarkIcon/showVoiceIcon/...` 等旧 feature props。
4. 标准 chat 请求统一改用 `toChatApiTarget(sourceTarget)`。
5. 删除 `onStopChat/onDeleteChatItem` 两个 props，Skill Preview 改走通用 stop/delete。
6. App-only 功能全部从 `appId` 判断改为 `features` 控制。
7. 外部 history/recently used/router 等状态同步迁到页面层 props 回调，ChatBox 内只保留自身 UI 状态。
8. 最后扫 `ChatBox` 目录内 `appId/skillId/chatTarget/chatTargetId`，确保只剩入口页面或 App-only 能力使用。

最大注意点：`onStartChat` 不是 feature，也不是标准 CRUD，先保留。

## 阶段 13：统一删除函数

新增：

```ts
type DeleteChatResourcesBySourceParams = {
  sourceType: ChatSourceTypeEnum;
  sourceId: string;
  chatIds?: string[];
  includeLegacyApp?: boolean;
  legacySkillDebug?: boolean;
  deleteSandboxResources?: boolean;
};
```

职责：

- 硬删 `chats`。
- 硬删 `chatitems`。
- 硬删 `chat_item_responses`。
- 删除 chat S3 文件。
- 删除 chat sandbox。

不负责：

- `app_chat_logs`
- `usages`
- `usage_items`
- `chat_input_guides`
- HelperBot chat

调用场景：

- App 删除：先 `deleteSandboxesByAppId(appId)`，再 `sourceType=app/sourceId=appId/includeLegacyApp=true/deleteSandboxResources=false`。
- App 日志批量硬删：`sourceType=app/sourceId=appId/chatIds/includeLegacyApp=true`，删除指定 chat 绑定 sandbox。
- Skill 删除：`sourceType=skillEdit/sourceId=skillId`。
- 旧 Skill Debug 初始化清理：`sourceType=skillEdit/sourceId=skillId/legacySkillDebug=true`。

执行顺序：

1. source-aware 查询 chatList。
2. 删除 `chat_item_responses`，并按需删除 App chat 绑定 sandbox。
3. 删除 `chatitems`。
4. 删除 `chats`。
5. 按 source prefix 或指定 chat key 删除 S3 文件。

边界：

- 显式传 `chatIds: []` 必须 no-op，不能退化成整 source 删除。
- Skill Edit chat 资源删除不删除编辑沙盒；编辑沙盒由 Skill 删除链路统一处理。

## 阶段 14：测试

P0 单测：

- raw/runtime schema 互斥校验和 transform。
- `buildChatSourceQuery` 的 App legacy、Skill Edit 精确匹配、legacy Skill Debug 匹配。
- `getRunningSandboxId` 的 App/Skill Edit 分支。
- stop/resume key 构造。
- S3 key 生成、解析和授权。

P0 集成测试：

- App legacy chat 读取、分页、反馈、停止、恢复、删除。
- 新 App chat 创建、生成、停止、恢复、反馈、删除。
- Skill Edit 通过标准接口创建、读取、删除、停止、恢复。
- App 与 Skill Edit 使用相同 `sourceId/chatId` 或 `chatId` 时不串数据。
- Skill Edit usage 写 `skillId`，不写 `appId`。
- Skill Edit 不写 `app_chat_logs`。
- nodeResponse source 隔离。

P1 前端测试：

- App Chat UI 回归。
- Skill Preview 不再传 `appId={skillId}`；ChatBox 必须使用 `sourceTarget={{ sourceType: skillEdit, sourceId: skillId }}`。
- Skill Preview 的标准 chat API 调用不能依赖 `appId={skillId}`，必须从 `sourceTarget` 经 `toChatApiTarget(sourceTarget)` 派生 `{ skillId }`。
- Skill Preview 的停止、恢复、删除、记录读取走标准 chat 接口；生成仍通过 `onStartChat` 外部注入。
- 文件上传和文件预览在 App 与 Skill Edit 下均可用。
- Skill Preview 下 input guide、TTS、语音识别入口和 ChatBox 内的 App 沙盒入口不展示、不发请求。
- Skill Detail 编辑沙盒不再传 `appId={skillId}`，必须通过 `chatTarget={{ skillId }}` 调用 SandboxEditor。

迁移验证：

- 新索引 explain 覆盖关键查询。
- 旧 Skill Debug dry-run 数量可解释。
- 清理脚本可断点续跑。
- 删除旧 `{ appId: 1, chatId: 1 }` 唯一索引前，无残留盲插路径。
- 最终集成测试（本地数据 + 浏览器）：准备本地 App 与 Skill 测试数据，启动本地应用，用浏览器验证 App Chat 和 Skill Preview 的创建、继续对话、停止、恢复、删除、文件上传/预览，以及 Skill Preview 下语音、TTS、input guide、sandbox 入口不展示不调用。

### 人工功能测试清单

本清单用于浏览器里逐项对照执行，重点验证 ChatBox 标准能力没有因为 `sourceTarget` 改造漏功能。测试时同时打开浏览器 DevTools Network，确认标准 chat 请求对外仍传 raw target：App 场景是 `{ appId, chatId }`，Skill Edit 场景是 `{ skillId, chatId }`，请求体或 query 不应出现内部 `sourceType/sourceId`。

#### 测试准备

- 启动本地 `projects/app`，并用有权限的账号登录。
- 准备 1 个普通 App，App 的 workflow 至少能稳定返回文本。
- 准备 1 个开启文件上传的 App，用于测试文件上传和预览。
- 准备 1 个开启问题引导、语音输入、TTS、快捷回复的 App，用于测试 App-only 功能开关。
- 准备 1 个可编辑 Skill，进入 Skill Detail 页面，使用右侧 Skill Preview 测试。
- 准备 1 条带自定义反馈输出的 App 对话，或使用能产出 `customFeedbacks` 的工作流，用于关闭自定义反馈测试。
- 准备 1 条已有点踩或标注的 App 对话，用于刷新后读回状态测试。
- 准备 1 个 App 日志详情入口，用于测试管理员标注、反馈已读和 log 模式展示。
- 如果要测 App legacy 历史读取，准备 1 条 `sourceType` 缺失的旧 App chat 记录。

#### App Chat 基础对话

- 打开 App Chat 页面，新建对话，发送纯文本问题。
- 预期：Human 消息立即出现在列表中，AI 消息流式生成，结束后状态为完成。
- 预期：Network 中生成入口仍使用 App 原有协议；后续 `getRecords_v2/history/feedback/file/stop/resume/delete` 请求使用 `{ appId, chatId }`。
- 预期：Mongo 中新 `chats/chatitems/chat_item_responses` 写入 `sourceType=app`，物理 `appId` 为真实 AppId。
- 刷新页面，重新打开该会话。
- 预期：历史消息完整读回，顺序正确，AI 回复内容、引用、responseData 不丢失。

#### App 历史会话读取

- 打开一条 `sourceType` 缺失的旧 App 会话。
- 预期：会话能出现在历史列表中。
- 预期：点击后能读取历史消息、引用详情和 nodeResponse 详情。
- 预期：对旧会话继续追问时，不创建同一 `appId/chatId` 的重复 chat row。
- 预期：旧会话的点赞、点踩、删除、停止、恢复等操作仍能命中原记录。

#### Skill Preview 基础对话

- 打开 Skill Detail，确认 Skill Preview 正常渲染。
- 发送一条文本问题。
- 预期：能生成 Human/AI 记录，刷新页面后记录能读回。
- 预期：Network 中记录读取、删除、停止、恢复等标准 chat 请求使用 `{ skillId, chatId }`，不能出现 `{ appId: skillId }`。
- 预期：Mongo 中 `chats/chatitems/chat_item_responses` 写入 `sourceType=skillEdit`，物理 `appId` 为 SkillId。
- 预期：usage 只写 `skillId`，不写 `appId`。
- 预期：不写 App 最近使用，不写 `app_chat_logs`。

#### Skill Preview 禁用能力

- 在 Skill Preview 中观察输入区和 AI 消息 footer。
- 预期：不展示语音输入按钮。
- 预期：不展示或触发 TTS 播放入口。
- 预期：不展示 input guide 或问题引导入口。
- 预期：不展示 ChatBox 内 App sandbox 入口。
- 预期：不调用 `/api/v1/audio/transcriptions`。
- 预期：不调用 App input guide 相关 API。
- 预期：生成完成后浏览器 console 不出现 `Sandbox target is required`。

#### 停止生成

- 在 App Chat 中发送一个会持续生成的请求，生成过程中点击停止。
- 预期：前端停止继续追加文本，停止按钮恢复为可发送状态。
- 预期：`/api/v2/chat/stop` 请求使用 `{ appId, chatId }`。
- 预期：再次发送消息仍可继续同一会话。
- 在 Skill Preview 中重复同样步骤。
- 预期：`/api/v2/chat/stop` 请求使用 `{ skillId, chatId }`。
- 预期：App 与 Skill 使用相同 `chatId` 时不会互相停止。

#### 恢复生成

- 在 App Chat 中制造一个 generating 状态会话，例如生成过程中刷新页面或断开网络后恢复。
- 预期：重新进入该会话后自动恢复或展示可恢复状态，恢复完成后状态变为完成。
- 预期：`/api/core/chat/resume` 请求使用 `{ appId, chatId }`。
- 切换到另一个会话后等待恢复结果返回。
- 预期：恢复结果不会写入当前错误会话。
- 在 Skill Preview 中重复恢复流程。
- 预期：`/api/core/chat/resume` 请求使用 `{ skillId, chatId }`，恢复结果只写入该 Skill 会话。

#### 删除、重试和编辑

- 在 App Chat 中删除一轮 Human+AI 记录。
- 预期：UI 中该轮记录消失或按当前模式折叠。
- 预期：`/api/core/chat/record/delete` 使用 `{ appId, chatId, dataId }`。
- 预期：Mongo 中对应 `chatitems` 写入 `deleteTime`，不误删其他会话。
- 对某条 Human 消息点击重试。
- 预期：当前 Human 之后的相关 AI 记录被删除或软删除，输入内容按原消息重新发送。
- 对 Human 消息点击编辑并提交。
- 预期：编辑后的文本重新发送，旧后续回复不会残留在当前显示链路里。
- 在 Skill Preview 中至少测试删除一轮记录。
- 预期：删除请求使用 `{ skillId, chatId, dataId }`，不会走旧 Skill debug 专属删除接口。

#### 点赞

- 在 App Chat 的 AI 回复上点击点赞。
- 预期：点赞图标立即点亮，点踩图标保持未选中。
- 预期：触发 `/api/core/chat/feedback/updateUserFeedback`，请求使用 `{ appId, chatId, dataId, userGoodFeedback: "yes" }`。
- 再次点击已点赞图标。
- 预期：点赞取消，服务端 `userGoodFeedback` 被清空。
- 先点踩并提交内容，再点击点赞。
- 预期：点赞成功后清空点踩状态，两个状态互斥。
- 刷新页面。
- 预期：点赞状态能从服务端读回。

#### 点踩

- 在 App Chat 的 AI 回复上点击点踩。
- 预期：打开用户反馈弹窗。
- 不输入内容直接提交。
- 预期：使用默认无内容反馈文案，点踩图标点亮。
- 再次点踩另一条 AI 回复，输入自定义反馈内容后提交。
- 预期：点踩图标点亮，反馈内容在日志或详情中可见。
- 预期：触发 `/api/core/chat/feedback/updateUserFeedback`，请求使用 `{ appId, chatId, dataId, userBadFeedback }`。
- 对已点踩消息再次点击点踩。
- 预期：取消点踩，服务端 `userBadFeedback` 被清空。
- 点赞后再点踩。
- 预期：提交点踩成功后点赞状态被清空，两个状态互斥。
- 刷新页面。
- 预期：点踩状态和内容能从服务端读回。

#### 管理员标注

- 进入支持标注的 App 日志详情或管理视图，找到一条 AI 回复。
- 点击标注按钮。
- 预期：打开标注弹窗，默认问题内容取上一条 Human 文本，默认答案内容取当前 AI 文本。
- 选择 dataset、collection，填写或确认 q/a，提交标注。
- 预期：触发 `/api/core/chat/feedback/adminUpdate`，请求使用 `{ appId, chatId, dataId, adminFeedback }`。
- 预期：提交后当前 AI 消息下展示标注内容。
- 刷新页面。
- 预期：标注内容仍展示。
- 再次点击已有标注。
- 预期：进入编辑态，回填原 dataset、collection、q、a。
- 修改后提交。
- 预期：本地展示和服务端记录同步更新。
- 在 Skill Preview 中确认标注入口不展示，除非后续产品明确开启 `features.mark`。

#### 自定义反馈关闭

- 打开一条 AI 回复包含 custom feedback 的会话。
- 预期：AI 消息下展示自定义反馈列表和关闭 checkbox。
- 勾选某条自定义反馈。
- 预期：触发 `/api/core/chat/feedback/closeCustom`，请求使用 `{ appId, chatId, dataId, index }`。
- 预期：该条自定义反馈从当前 UI 消失。
- 刷新页面。
- 预期：已关闭的自定义反馈不再展示。
- 如果 Skill Preview 会产生 custom feedback，也重复一次，预期请求使用 `{ skillId, chatId, dataId, index }`。

#### 反馈已读和反馈筛选

- 进入 App 日志详情或反馈管理页，找到带点赞或点踩的 AI 回复。
- 点击标记已读。
- 预期：触发 `/api/core/chat/feedback/updateFeedbackReadStatus`，请求使用 `{ appId, chatId, dataId, isRead: true }`。
- 预期：UI 显示为已读，外层统计或列表刷新。
- 再点击切回未读。
- 预期：请求使用 `isRead: false`，UI 状态同步。
- 使用反馈筛选或“有反馈记录”列表。
- 预期：`/api/core/chat/feedback/getFeedbackRecordIds` 能返回目标记录，点击能定位到对应消息。
- 预期：App 日志和反馈管理不包含 Skill Preview 会话。

#### 历史列表和已读

- App Chat 新建一条会话并完成回复。
- 预期：侧栏历史新增或更新标题、时间和生成状态。
- 切换会话再切回。
- 预期：历史状态与当前记录一致。
- 打开未读会话。
- 预期：触发 `/api/core/chat/history/markRead`，请求使用 `{ appId, chatId }`。
- Skill Preview 完成回复后观察 App 侧栏历史。
- 预期：不新增 Skill 会话，不触发 App 最近使用或 App history 同步。

#### 文件上传和预览

- 在开启文件上传的 App Chat 中上传一个 txt、md 或图片文件。
- 预期：上传完成后文件出现在输入区，发送后 Human 消息中展示文件。
- 预期：`presignChatFilePostUrl` 请求使用 `{ appId, chatId }`，返回 key 形如 `chat/app/${appId}/${uid}/${chatId}/...`。
- 点击已发送文件预览。
- 预期：`presignChatFileGetUrl` 请求带正确 `chatId`，预览成功。
- 用错误 `chatId` 或另一个 App 的 `appId` 请求同一 key。
- 预期：返回未授权。
- 在 Skill Preview 中上传或引用文件。
- 预期：请求使用 `{ skillId, chatId }`，新 key 形如 `chat/skillEdit/${skillId}/${uid}/${chatId}/...`。
- 预期：Skill Preview 不能读取 App legacy key。

#### 引用和知识库来源

- 使用会产生知识库引用的 App 发送问题。
- 预期：AI 回复下展示引用来源。
- 点击普通引用详情。
- 预期：`/api/core/chat/record/getQuote` 请求使用 `{ appId, chatId, dataId }`，详情可打开。
- 点击集合引用详情。
- 预期：`/api/core/chat/record/getCollectionQuote` 请求使用 `{ appId, chatId, dataId }`，详情可打开。
- 刷新页面后重复点击引用。
- 预期：引用仍可打开，responseData 没有丢失。
- 如果 Skill Preview 会产生引用，重复点击引用，预期请求使用 `{ skillId, chatId, dataId }`。

#### nodeResponse 和运行详情

- 在 App Chat 中运行带多节点 workflow 的 App。
- 展开 AI 消息的运行详情或 nodeResponse 详情。
- 预期：`/api/core/chat/record/getResData` 请求使用 `{ appId, chatId, dataId }`。
- 预期：返回节点顺序、耗时、工具输出、引用数据正确。
- 在 Skill Preview 中运行能产生 nodeResponse 的 Skill。
- 预期：`getResData` 请求使用 `{ skillId, chatId, dataId }`，不会读到 App 同名 chat 的 nodeResponse。

#### 语音输入和 TTS

- 在开启语音输入的 App Chat 中点击语音按钮并完成一次语音识别。
- 预期：`/api/v1/audio/transcriptions` 被调用，请求 data 中包含 `{ appId, chatId, duration }`。
- 预期：识别文本进入输入框或按当前交互发送。
- 在 App Chat 的 AI 回复上点击 TTS 播放。
- 预期：能播放、暂停或停止；播放状态不影响点赞、删除、重试。
- 在 Skill Preview 中确认没有语音按钮和 TTS 播放入口。
- 预期：不会调用 `/api/v1/audio/transcriptions`，不会请求 TTS buffer。

#### 问题引导和快捷回复

- 使用开启问题引导的 App Chat 发送一条问题。
- 预期：AI 回复完成后出现问题引导。
- 点击问题引导。
- 预期：作为下一轮问题发送，发送后引导清空或更新。
- 使用开启快捷回复的入口，点击快捷回复。
- 预期：快捷回复能发送为下一轮消息，输入框状态正确。
- 在 Skill Preview 中确认问题引导和快捷回复入口符合产品配置；当前 Skill Preview 默认不展示 input guide。

#### workorder 入口

- 使用开启 workorder 的 App Chat。
- 预期：聊天底部展示工单入口。
- 点击工单入口。
- 预期：按原流程打开或发送工单，不影响当前 chat target。
- 在 Skill Preview 中确认不展示 workorder，除非后续产品明确开启。

#### 分享页和 Home Chat

- 打开 App 分享页，发送新会话。
- 预期：生成、停止、恢复、删除、点赞、点踩、文件预览均使用 `{ appId, chatId }` 和外链鉴权数据。
- 刷新分享页。
- 预期：历史记录能读回，不出现未授权。
- 打开 Home Chat，发送新会话。
- 预期：侧栏历史同步正常，快捷入口、语音、TTS、文件能力按 App 配置生效。

#### 删除整会话和批量删除

- 在 App 历史列表删除单个会话。
- 预期：会话从列表移除，`chats/chatitems/chat_item_responses` 对应数据按 App source 条件删除或软删，文件和 chat sandbox 按设计清理。
- 批量删除 App 历史。
- 预期：只删除选中的 App 会话，不影响 Skill Preview 会话。
- 删除 Skill 或执行 Skill chat 清理。
- 预期：删除 `sourceType=skillEdit/sourceId=skillId` 的 chat 三表、S3 `chat/skillEdit/${skillId}` 文件；不删除 App chat。

#### 多资源隔离

- 准备 App 和 Skill 使用相同 `chatId` 的测试记录。
- App Chat 读取记录。
- 预期：只读 App 记录。
- Skill Preview 读取记录。
- 预期：只读 Skill 记录。
- 对 App 记录执行点赞、点踩、删除、停止、恢复。
- 预期：Skill 记录不变化。
- 对 Skill 记录执行删除、停止、恢复。
- 预期：App 记录不变化。

#### 刷新和错误状态

- 发送消息过程中刷新页面。
- 预期：恢复生成或错误状态按原逻辑展示，不出现空白卡死。
- 生成失败时观察最后一条 AI 消息。
- 预期：显示错误态，可重试；重试后错误状态清理。
- 切换会话、再返回原会话。
- 预期：输入草稿、滚动位置、生成状态不串到其他会话。

#### 浏览器 Console 和 Network 复核

- 全流程执行时观察 console。
- 预期：无 `sourceTarget/chatId/outLinkAuthData` DOM prop warning。
- 预期：无 `Sandbox target is required`。
- 预期：无未处理 Promise rejection。
- Network 过滤 `chat/feedback`。
- 预期：点赞、点踩、标注、关闭自定义反馈、反馈已读都调用对应标准接口。
- Network 过滤 `record/getRecords_v2`、`history`、`file`、`resume`、`stop`。
- 预期：App 请求只出现 raw `appId`，Skill 请求只出现 raw `skillId`，不暴露内部 `sourceType/sourceId`。

## 验收标准

- 标准 App chat 全链路不回退。
- 历史 App chat 缺失 `sourceType` 时仍可用。
- Skill Edit 只通过标准 chat 接口完成调试会话。
- API 文档只展示 `appId/skillId`，不展示内部 `sourceType/sourceId`。
- handler 之后的业务层只接收 `sourceType/sourceId`。
- `runningAppInfo.id` 和 `runningAppInfo.sandboxId` 无残留。
- App 与 Skill Edit 在 chat 三表、nodeResponse、S3、sandbox、stop/resume key 上互相隔离。
- Skill Edit usage 只写 `skillId`。
- Skill Edit 不写 `app_chat_logs`。
- App 删除、Skill 删除、旧 Skill Debug 清理都走 source-aware 删除能力。

## 当前执行进度

- 已补齐 `createOutLinkChatTargetInputSchema`、`createOptionalOutLinkChatTargetInputSchema`、`withOutLinkChatTarget` 和 `withOptionalOutLinkChatTarget`，避免带外链鉴权的 schema 通过 `.shape` 拼接时丢失 `appId/skillId` 互斥校验。
- `record/history/resume/audio transcriptions` 等标准 chat schema 已保留 raw schema 给 OpenAPI，runtime schema 通过 transform 输出 `sourceType/sourceId`。
- `/v1/audio/transcriptions` 已补 OpenAPI multipart/form-data path，文档表单 schema 使用 `file` 二进制和 raw `data` 参数，`data` 内仍暴露 `{ appId } | { skillId } + chatId + duration`，不暴露内部 `sourceType/sourceId`。
- 已新增 `packages/global/test/openapi/core/chat/targetSchema.test.ts`，覆盖 App/Skill target transform、必填 target 缺失、`appId+skillId` 同传拒绝、可选 target 缺省和歧义拒绝，以及 `/v1/audio/transcriptions` raw form schema 与 runtime `sourceType/sourceId` transform 分层。
- ChatBox 公开 props 已直切为 `sourceTarget + features + onStartChat + props callbacks`；旧 `feedbackType/showMarkIcon/showVoiceIcon/showWorkorder/enableAutoResume/enableMarkChatRead/enableQuickReplies` 等 feature props 已删除，不保留客户端兼容入口。
- 标准 ChatBox/Provider 已强制接收 `sourceTarget`，不再接收 `appId/chatTarget` raw 入口；App Chat、Home Chat、Share Chat、ChatTest、Log Detail、Skill Preview 主要调用点已显式传内部 `sourceTarget`。
- `WorkflowRuntimeContext` 已移除 raw `chatTarget` 暴露，标准请求点统一从 `sourceTarget` 经 `useChatApiTarget` 转成 OpenAPI raw target。
- `FileSelector` 已改为从 runtime `sourceTarget` 派生 `{ appId } | { skillId }`，文件预览和上传不再依赖 raw `chatTarget` context 字段。
- 文件预览 `/api/core/chat/file/presignChatFileGetUrl` 已补齐 `chatId` 入参，授权时同时校验 `sourceType/sourceId/uid/chatId` 与 S3 key 归属；旧 App key `chat/${appId}/${uid}/${chatId}/...` 继续可读，新 App/Skill key 使用 `chat/${sourceType}/${sourceId}/${uid}/${chatId}/...`。
- ChatBox TTS/App-only 能力由 `features` 控制，真实 AppId 仅从 `sourceTarget` 派生；Skill Edit 下 `features.voice/tts/inputGuide/sandbox/markRead` 关闭后不会展示或调用对应 App-only 能力。
- `WorkflowRuntimeContextProvider` 已强制接收 `sourceTarget`，不再保留 `appId/chatTarget` 兼容入口；PluginRunBox 等 App-only 场景显式传 `sourceType=app/sourceId=appId`。
- Agent sandbox runtime 原子入口 `prepareAgentSandboxRuntime` 已改为接收 `sourceType/sourceId/userId/chatId`，内部统一调用 `getRunningSandboxId`，只在 sandbox 实例表兼容层写入物理 `appId/userId/chatId` 字段。
- Skill 导出接口已从 `findSandboxInstanceByAppChatType({ appId: skillId })` 改为按 `getRunningSandboxId({ sourceType: skillEdit, sourceId: skillId })` 计算 `sandboxId` 后查询 edit-debug 实例。
- Skill 保存发布和编辑态 sandbox 复用已改为按 `getEditDebugSandboxId(skillId)` 计算 `sandboxId` 后查询当前 provider 实例；`getSandboxClient` 创建编辑态 sandbox 时也显式传入 `sandboxId`，不再依赖 `appId=skillId + chatId=edit-debug` 的推导入口。
- Skill Preview 已使用 `sourceTarget={{ sourceType: skillEdit, sourceId: skillId }}`，并通过 `features` 关闭 `markRead/voice/tts/inputGuide/sandbox`；`chatBoxData.appId` 不再写入 Skill ID，避免把 Skill ID 伪装成 App ID 触发 App-only 能力。
- Skill Preview 目录内未挂载的 `PreviewInput` 已同步把 prop 从 `appId` 改为 `skillId`，避免保留 Skill ID 伪装 App ID 的命名。
- ChatBox 已移除内部侧栏历史同步逻辑；生成状态变化通过 `onChatGenerateStatusChange` 抛给页面层，App Chat、Home Chat、Share Chat 由页面层 hook 同步 history，Skill Preview 不接入外部 history。
- HelperBot `deleteRecord/getFilePresign/getFilePreviewUrl` 已补齐 `parseApiInput` 路由校验和 OpenAPI path，避免同一 chat 目录下保留直接读取 `req.body/req.query` 的边界实现。
- `packages/service/test/core/chat/schema.test.ts` 已覆盖 `chats/chatitems/chat_item_responses` 的 source-aware 索引声明，包括 `sourceType_1_appId_1_chatId_1` 唯一索引。
- `packages/service/test/core/workflow/workflowStatus.test.ts` 已覆盖 stop key 格式 `agent_runtime_stopping:${sourceType}:${sourceId}:${chatId}`。
- `projects/app/test/service/support/permission/auth/chat.test.ts` 已覆盖 Skill Edit `authChatTargetCrud` 鉴权、source-aware chat 查询和团队不匹配拒绝。
- App 删除链路已接入 `deleteChatResourcesBySource({ sourceType: app, includeLegacyApp: true, deleteSandboxResources: false })`；Skill 删除链路已接入 `deleteChatResourcesBySource({ sourceType: skillEdit })`。
- 已验证 `pnpm --filter @fastgpt/global test -- test/openapi/core/chat/targetSchema.test.ts`。
- 已验证 `pnpm --filter @fastgpt/app typecheck`。
- 已在文件预览 `chatId` 授权收紧后复跑 `pnpm --filter @fastgpt/app typecheck`。
- 已在文件预览 raw/runtime schema 增加 `chatId` 后复跑 `pnpm --filter @fastgpt/global test -- test/openapi/core/chat/targetSchema.test.ts`。
- 已在 `/v1/audio/transcriptions` OpenAPI multipart path 与 raw/runtime 分层测试补齐后复跑 `pnpm --filter @fastgpt/global test -- test/openapi/core/chat/targetSchema.test.ts`，当前覆盖 81 个文件、1688 个测试。
- 已验证 `pnpm exec vitest run -c vitest.config.ts test/pages/api/core/chat/file/presignChatFilePostUrl.test.ts test/pages/api/core/chat/file/presignChatFileGetUrl.test.ts test/service/support/permission/auth/chat.test.ts`（在 `projects/app` 下执行），覆盖文件上传/预览和 chat target 鉴权。
- 已验证 `pnpm exec vitest run -c vitest.config.ts test/common/s3/key.test.ts test/core/chat/delete.test.ts test/core/chat/legacySkillDebugCleanup.test.ts`（在 `packages/service` 下执行），覆盖 S3 key `chatId` 授权、source-aware 删除和旧 Skill Debug 清理。
- 已验证 core/chat API 目录、`/api/v1/audio/transcriptions` 和 `/api/v2/chat/stop` 不再存在 `.parse(req.*)`，标准 route 均走 `parseApiInput`。
- 已验证 `pnpm exec vitest run -c vitest.config.ts test/components/core/chat/ChatContainer/ChatBox/scrollUtils.test.ts test/pages/api/core/chat/file/presignChatFileGetUrl.test.ts test/pages/api/core/chat/file/presignChatFilePostUrl.test.ts test/api/core/chat/record/getResData.test.ts test/api/core/ai/sandbox/keepalive.test.ts test/api/core/chat/history/batchDelete.test.ts`（在 `projects/app` 下执行）。
- 已验证 `pnpm exec vitest run -c vitest.config.ts test/components/core/chat/ChatContainer/ChatBox/scrollUtils.test.ts test/pages/api/core/chat/file/presignChatFileGetUrl.test.ts test/pages/api/core/chat/file/presignChatFilePostUrl.test.ts test/api/core/chat/record/getResData.test.ts test/api/core/chat/history/batchDelete.test.ts test/service/support/permission/auth/chat.test.ts`（在 `projects/app` 下执行）。
- 已验证 `pnpm exec vitest run -c vitest.config.ts test/common/s3/key.test.ts test/core/chat/delete.test.ts test/core/chat/nodeResponseStorage.test.ts test/core/chat/saveChat.test.ts test/core/chat/controller.test.ts`（在 `packages/service` 下执行）。
- 已验证 `pnpm exec vitest run -c vitest.config.ts test/core/workflow/workflowStatus.test.ts`（在 `packages/service` 下执行）。
- 已验证 `pnpm exec vitest run -c vitest.config.ts test/service/support/permission/auth/chat.test.ts`（在 `projects/app` 下执行）。
- 已验证 `pnpm exec vitest run -c vitest.config.ts test/api/core/ai/skill/debugChat.test.ts test/api/core/ai/skill/debugSession/list.test.ts test/api/core/ai/skill/debugSession/records.test.ts test/api/core/ai/skill/debugSession/delete.test.ts test/api/core/ai/skill/debugSession/chatItemDelete.permission.test.ts test/api/core/ai/skill/debugSession/stop.test.ts`（在 `projects/app` 下执行），并将旧 Skill Debug 专属测试数据同步为 `sourceType=skillEdit`。
- 已验证 `pnpm exec vitest run -c vitest.config.ts test/components/core/chat/ChatContainer/ChatBox/scrollUtils.test.ts test/pages/api/core/chat/file/presignChatFileGetUrl.test.ts test/pages/api/core/chat/file/presignChatFilePostUrl.test.ts test/api/core/chat/record/getResData.test.ts test/api/core/chat/history/batchDelete.test.ts test/service/support/permission/auth/chat.test.ts test/api/core/ai/skill/debugChat.test.ts test/api/core/ai/skill/debugSession/list.test.ts test/api/core/ai/skill/debugSession/records.test.ts test/api/core/ai/skill/debugSession/delete.test.ts test/api/core/ai/skill/debugSession/chatItemDelete.permission.test.ts test/api/core/ai/skill/debugSession/stop.test.ts`（在 `projects/app` 下执行），覆盖 12 个文件、116 个测试。
- 已验证 `pnpm exec vitest run -c vitest.config.ts test/common/s3/key.test.ts test/core/chat/delete.test.ts test/core/chat/legacySkillDebugCleanup.test.ts test/core/chat/nodeResponseStorage.test.ts test/core/chat/saveChat.test.ts test/core/chat/controller.test.ts`（在 `packages/service` 下执行），覆盖 6 个文件、126 个测试。
- 已验证 `pnpm exec vitest run -c vitest.config.ts test/pages/api/core/chat/helperBot/deleteRecord.test.ts test/pages/api/core/chat/helperBot/getFilePresign.test.ts test/pages/api/core/chat/helperBot/getFilePreviewUrl.test.ts test/api/core/chat/record/delete.test.ts`（在 `projects/app` 下执行），覆盖 4 个文件、12 个测试。
- 已验证 `pnpm exec vitest run -c vitest.config.ts test/core/chat/schema.test.ts test/core/chat/delete.test.ts test/core/chat/legacySkillDebugCleanup.test.ts`（在 `packages/service` 下执行），覆盖 3 个文件、10 个测试。
- 已验证 `pnpm exec vitest run -c vitest.config.ts test/core/ai/sandbox/runtime/index.test.ts test/core/workflow/dispatch/ai/agent/sub/sandbox/prepare.test.ts`（在 `packages/service` 下执行），覆盖 2 个文件、9 个测试。
- 已验证 `pnpm exec vitest run -c vitest.config.ts test/core/workflow/dispatch/ai/agent/index.test.ts test/core/workflow/dispatch/ai/agent/piAgent/index.test.ts`（在 `packages/service` 下执行），覆盖 2 个文件、16 个测试；相关 fixture 已移除旧 `runningAppInfo.id`，改用最终 `sourceType/sourceId` 结构。
- 已验证 `pnpm exec vitest run -c vitest.config.ts test/api/core/ai/skill/export.test.ts`（在 `projects/app` 下执行），覆盖 Skill 导出按 edit-debug `sandboxId` 查询实例。
- 已验证 `pnpm exec vitest run -c vitest.config.ts test/core/ai/skill/deploy.test.ts test/core/ai/skill/editSandboxPackage.test.ts test/core/ai/sandbox/instance/repository.test.ts`（在 `packages/service` 下执行），覆盖 Skill 保存部署、编辑态打包和 sandbox repository 回归。
- 已验证 `pnpm exec vitest run -c vitest.config.ts test/core/ai/skill/deploy.test.ts test/core/ai/skill/editSandboxPackage.test.ts test/core/ai/sandbox/runtime/index.test.ts test/core/workflow/dispatch/ai/agent/sub/sandbox/prepare.test.ts`（在 `packages/service` 下执行），覆盖 4 个文件、22 个测试，确认 Skill 保存发布、编辑态 sandbox、agent sandbox runtime 和 prepare 链路均使用 source-aware/sandboxId 口径。
- 已在本地 MongoDB `fastgpt` 执行重复审计，`DUPLICATE_SOURCE_ROWS=0`、`DUPLICATE_LEGACY_APP_ROWS=0`；随后创建 `chats`、`chatitems`、`chat_item_responses` 的 source-aware 新索引，复核 `MISSING_INDEXES={ chats: [], chatitems: [], chat_item_responses: [] }`。
- 已在本地 MongoDB 执行旧 Skill Debug dry-run：扫描 Skill 2 个，命中 1 个，legacy chat 3 条，chatitems 22 条，chat item responses 489 条，App ID 冲突 0 个。
- 已在本地 MongoDB 执行关键查询 explain：当前本地库有 legacy App 样本，legacy App 查询走 `appId_1_chatId_1`；本地暂无 `sourceType=app/skillEdit` 样本可用于 explain 新索引命中，但 schema 测试和实际索引复核已证明新索引存在。
- 已启动本地 `projects/app` dev server：`http://localhost:3010`，并用浏览器登录 root 验证。Skill Detail 页面 `/skill/detail?skillId=6a109b3df5f26558f004a0dd` 能渲染 Skill Preview，`/api/core/chat/record/getRecords_v2` 请求体为 `{ skillId, chatId }`，不再传伪 `appId`；Skill 编辑沙盒 `/api/core/ai/sandbox/getTicket` 请求体为 `{ skillId, chatId: "edit-debug" }`，ticket 内为 `sourceType=skillEdit/sourceId=skillId`。
- 浏览器最终集成验证已完成：使用临时 1007 端口运行当前源码构建的 `agent-sandbox-proxy`，本地 `projects/app` 以 `AGENT_SANDBOX_PROXY_URL=ws://localhost:1007` 启动；Skill Detail 页面可加载编辑沙盒文件树、打开 `SKILL.md`，`/api/core/ai/sandbox/getTicket` 请求体为 `{ skillId, chatId: "edit-debug" }`，proxy 反查 `/api/core/ai/sandbox/verifyTicket` 成功并完成 WebSocket handshake。
- 浏览器最终集成验证已确认 Skill Preview 下未出现语音、TTS、input guide、ChatBox 内 App 沙盒入口，并通过 `/api/core/ai/skill/debugChat` 成功生成回复；`/api/core/chat/record/getRecords_v2` 请求体为 `{ skillId, chatId }`，刷新页面后可读回刚生成的 Human/AI 记录。
- 浏览器同源 `fetch` 已补充验证标准接口：`/api/v2/chat/stop`、`/api/core/chat/resume`、`/api/core/chat/record/delete` 均使用 `{ skillId, chatId }` 调通；删除后 `getRecords_v2` 返回空列表，MongoDB 中对应 Human/AI chat item 均写入 `deleteTime` 且保留 `sourceType=skillEdit`。
- 本地 MongoDB 已确认该 Skill Preview 会话写入 `chats/chatitems.sourceType=skillEdit`、物理 `appId=skillId`，usage 只写 `skillId` 且 `appId` 为空。
- App Chat 浏览器验证中，标准 `/api/core/chat/record/getRecords_v2` 和 `/api/core/chat/history/getHistories` 请求体均为 OpenAPI raw `{ appId, chatId }`，未向前端暴露内部 `sourceType/sourceId`。
- 合并前最终集成复验已完成（本地数据 + 浏览器 + 本地 HTTP 会话）：本地 `projects/app` 使用 `http://localhost:3010`，当前源码构建的 `agent-sandbox-proxy` 使用 `ws://localhost:1007`；Skill Detail `/skill/detail?skillId=6a109b3df5f26558f004a0dd` 能渲染 Skill Preview 和编辑沙盒文件树，proxy keepalive 显示 `sourceType=skillEdit/sourceId=6a109b3df5f26558f004a0dd/appId=None/chatId=edit-debug`。
- Skill Preview 最终复验中发送对话后生成 `pong`；MongoDB 中 `chats` 写入 `_id=6a3d810679221725bdb362a4`、`appId=6a109b3df5f26558f004a0dd`、`sourceType=skillEdit`、`chatId=zf2uDJmjKCvGww7AziSz2Iag`，`chatitems` 和 `chat_item_responses` 均写入 `sourceType=skillEdit`，usage 只写 `skillId` 且 `appId=null`。
- App Chat 最终复验中，`/chat?appId=698acb87c732acf2ae635408&pane=ra` 可读取 `sourceType` 缺失的旧 App 历史；发送新对话后 MongoDB 中 `chats` 写入 `_id=6a3d818e79221725bdb366af`、`sourceType=app`、`chatId=pN1hm6zhLYjwr0ZLeunZPEn0`，`chatitems` 和 `chat_item_responses` 均写入 `sourceType=app`，usage 写 `appId` 且 `skillId=null`。
- 文件上传/预览最终复验中，Chrome 扩展的本地文件权限限制导致浏览器 file chooser `setFiles` 被拒绝；随后用同一登录会话调用文件 API 验证成功：`presignChatFilePostUrl` 生成 `chat/app/6985c80636a9f033848ecd4f/67c526a0ddd9a98bde65ad8e/mtfWFmeKCZ2bfzGZbeiGccYC/codex-integration_bOMf62.txt`，上传代理返回 200，正确 `chatId` 预览返回 200，错误 `chatId` 预览返回 `unAuthChat`。
- stop/resume/delete 最终复验中，App 使用 raw `{ appId, chatId }`、Skill Edit 使用 raw `{ skillId, chatId }` 调通 `/api/v2/chat/stop`、`/api/core/chat/resume` 和 `/api/core/chat/record/delete`；删除验证为测试记录软删除，MongoDB 中目标 Human item 分别保留 `sourceType=app` 或 `sourceType=skillEdit` 并写入 `deleteTime`。
- 已修复 ChatBox 根节点向 DOM 透传 provider-only props 的问题，`sourceTarget/chatId/outLinkAuthData/InputLeftComponent/dialogTips` 等只作为 Provider 入参，不会再通过 `...props` 落到 Chakra `Box` DOM 属性。
- 已修复 AI 气泡 footer 的 App-only sandbox 入口初始化问题：`useSandboxEditor` 支持 `enabled=false` no-op，`AIChatBubbleActions` 只有在 `features.sandbox && appId && isPc && useAgentSandbox` 时才解析 sandbox target，Skill Preview 生成完成后不会因为没有真实 AppId 抛出 `Sandbox target is required`。
- 浏览器 console 复验仅剩既有表单 `id/name` 可访问性 issue，未再出现 `sourceTarget/chatId` DOM prop warning、`Sandbox target is required` runtime error 或 sandbox proxy WebSocket 401。
- 已移除 `chats/chatitems/chat_item_responses` Mongoose schema 的 `sourceType` 默认值，并补充 `packages/service/test/core/chat/schema.test.ts` 断言 `sourceType` 可缺失但不默认成 App；重跑 `test/core/chat/schema.test.ts test/core/chat/delete.test.ts test/core/chat/legacySkillDebugCleanup.test.ts test/core/chat/saveChat.test.ts test/core/chat/controller.test.ts` 通过，覆盖 5 个文件、95 个测试。
- 已验证 `git diff --check`。
- 误用 `pnpm --filter @fastgpt/app test -- test/service/support/permission/auth/chat.test.ts` 会触发大范围 app 测试；之前暴露出的旧 Skill Debug 测试数据未同步 `sourceType/sourceId` 问题已修复并单独验证，后续仍不把该命令视作局部测试结果。
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

后续 TODO：

- [x] 最后执行集成复验（本地数据 + 浏览器）：使用本地 MongoDB 测试 App/Skill 数据，启动 `projects/app` 与必要的 sandbox proxy，在浏览器覆盖 App Chat 和 Skill Preview 的创建、继续对话、停止、恢复、删除、文件上传/预览，并确认 Skill Preview 不展示、不调用语音、TTS、input guide 和 ChatBox 内 App 沙盒入口。

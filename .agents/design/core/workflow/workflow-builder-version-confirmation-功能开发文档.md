# Workflow Builder 二次确认与版本回退功能开发文档

## 文档标识

- 任务前缀：`workflow-builder-version-confirmation`
- 文档文件名：`workflow-builder-version-confirmation-功能开发文档.md`
- 前置文档：`workflow-builder-version-confirmation-需求设计文档.md`
- 状态：已实现，待集成环境验证

## 0. 开发目标与约束

- 功能目标：将 Builder 的自动应用改为用户二次确认；成功应用后归档 JSON，并支持从聊天历史再次应用版本。
- 代码范围：global chat/openapi schema、Workflow Builder service/API、聊天 AI 卡片、画布应用和快照上下文、i18n、局部测试。
- 非目标：候选文件副本、Redis 状态、服务端持久化“我的编辑”、Workflow Builder 专属撤销、永久版本存储。
- 适用维度：API[x] Data[x] Frontend[x] Logging[x] Packaging[x] Testing[x] DocI18n[x]
- 需遵循：仓库 `AGENTS.md`、`.agents/code/syntax.md`、API `parseApiInput` 规则、Mongo 索引规则、三语 i18n。

### 0.1 权威版本语义：一轮生成只绑定一次画布基线

一次 Workflow Builder 生成轮次只在开始时读取一次当前画布，并将其作为本轮唯一基线：

```text
用户发起新的 Builder 工作流需求
-> 前端读取当前画布版本 A
-> 后端校验 workflowContext
-> 将版本 A 写入 Sandbox/workflow.json
-> AI 基于版本 A 理解需求并生成 Mermaid
-> 第一道确认：确认并开始搭建
-> AI 继续基于版本 A 生成、修复和校验
-> 第二道确认：应用到画布
-> 直接覆盖此刻的当前画布
```

本轮从首次请求开始，直到生成 ready 版本、取消或失败，均遵守以下规则：

- 用户期间手动修改画布，不实时同步给 AI。
- 不监听画布变化，不因为画布变化重新生成 Mermaid。
- `ask/preview` 等结构化交互续跑、第一道确认、修改方案后的继续执行，都属于同一生成轮次。
- 同轮交互续跑不得重新读取画布，也不得重新调用 `prepareWorkflowBuilderSandbox()` 覆盖 `workflow.json`。
- 第二道确认不比较当前画布与本轮基线，用户点击后直接覆盖当前画布。
- 画布原有撤销/重做不属于版本卡片协议，本功能不新增专属撤销状态或按钮。

轮次边界不通过用户文本、按钮名称或业务场景枚举推断。当前 `ChatBox/index.tsx` 在 `agentAsk` 或 `workflowBuilderPreview` 待回答时会隐藏普通聊天输入框，只展示对应表单，所以一轮完整 Builder 生成在 UI 上天然表现为“聊天框发起一次，后续全部通过表单续跑”。后端只需要判断 histories 中是否仍有 `lastInteractive`。

| 请求协议 | `lastInteractive` | 轮次语义 | Sandbox 行为 |
|---|---|---|---|
| 用户从聊天输入框发送新的工作流需求 | 不存在 | 创建新的 Builder 生成轮次 | 采纳本次 `workflowContext`，写入一次 `workflow.json` |
| 用户提交需求澄清表单 | 存在；旧 `agentPlanAskQuery` 经 helper 适配后返回 `agentAsk` | 继续当前生成轮次 | 忽略请求重新携带的当前画布，保留既有 `workflow.json` |
| 用户提交 `workflowBuilderPreview` 表单（确认、修改、取消） | 存在 `workflowBuilderPreview` | 继续当前生成轮次 | 忽略请求重新携带的当前画布，保留既有 `workflow.json` |
| 用户点击第二道“应用到画布” | 不调用 Builder chat 接口，只调用 version load/apply | 不属于生成轮次请求 | 读取最终 `workflow.json`，不执行初始化或恢复判断 |

```ts
const lastInteractive = getLastInteractiveValue(histories);
const isBuilderResume = lastInteractive !== undefined;

if (!isBuilderResume) {
  // 新轮次：采用请求中的当前画布并初始化 Sandbox workflow.json。
} else {
  // 同轮续跑：忽略请求中的当前画布，保留 Sandbox workflow.json。
}
```

`pendingMainContext` 和 `childrenInteractiveParams` 仍由 AgentLoop 用于恢复各自的运行现场，但不参与 Builder 轮次判断。Builder 无需读取或组合这两个来源，也不引入 `start/resume/stale_interaction` 状态机。

`preparedRound.shouldFinalizePreparedRound` 也不参与 Builder 轮次判断。它属于通用聊天消息持久化语义，回答的是“是否完成一组预创建 ChatItem”，不能用来决定 Sandbox 是否重写。

当前 `ChatPanel.tsx#onStartChat` 在普通输入和表单提交时都会携带当下的 `workflowContext`。这是通用 ChatBox 请求结构造成的，不代表后端每次都应采纳它：仅当 `lastInteractive` 不存在时才将其作为新轮次基线；存在时必须忽略其中的最新画布。

如果用户在 Mermaid 修改表单中写“重新读取画布”，该请求仍存在 `lastInteractive`，所以不会重新读取。重新读取画布的唯一入口是结束当前交互后，从聊天输入框发起新的工作流需求。

示例：

```text
Builder 轮次 1：基于画布 A 生成版本 1
用户生成期间把画布手动编辑为 B
用户点击第二道确认
-> 版本 1 直接覆盖画布 B

用户随后提出新的工作流需求
-> 进入 Builder 轮次 2
-> 重新读取版本 1 应用后的当前画布
-> 以该画布作为新基线生成版本 2
```

### 0.2 Checksum 使用边界

- `target checksum` 用于验证 AI 最终生成的 `workflow.json`、聊天卡片、load 响应和 S3 归档是否属于同一份完整内容。
- CLI 内部的 `base checksum` 只允许约束同一个 Sandbox 事务中的 Plan/Commit，不代表第二道确认时的当前画布状态。
- 禁止在第一道确认、第二道确认或再次应用时，用本轮 `base checksum` 与前端当前画布做乐观并发检查。
- 画布在生成期间发生变化是允许场景，不是错误；第二道确认就是用户对覆盖行为的明确授权。

## 1. 实施任务拆解

| 任务ID | 任务名称 | 责任层 | 输入 | 输出 | 完成定义（DoD） |
|---|---|---|---|---|---|
| T1 | 定义版本消息和 API 契约 | global | 已确认字段和两个接口 | Zod schema/type/OpenAPI path | 已完成 |
| T2 | 固定生成轮次基线并持久化 ready 消息 | pro service | 新轮次画布或同轮交互恢复、Commit 成功目标文档 | 稳定 Sandbox 基线、AI ChatItem version value | 已完成 |
| T3 | 实现版本 load 服务与 API | service/pro API | ChatItem ID | Sandbox/S3 文档与 checksum | 已完成 |
| T4 | 实现 commit 归档服务与 API | service/pro API | 实际应用 JSON | S3 key、过期时间、ChatItem 更新 | 已完成 |
| T5 | 实现 AI 工作流版本卡片 | app chat UI | version value + 页面操作态 | `ready/available/expired/superseded` 卡片与按钮 | 已完成，待 UI 视觉调整 |
| T6 | 重构画布应用事务 | app workflow UI | load 返回文档 | 覆盖、布局、归档、本地消息更新 | 已完成 |
| T7 | 接入“我的编辑”版本命名 | app snapshot | 应用成功后的画布状态 | `AI 生成版本 N` 快照标题 | 已完成，需集成验证多次应用场景 |
| T8 | 补齐 i18n、日志和测试 | 全链路 | T1-T7 | 三语文案、测试、验证结果 | 已完成局部测试，待集成环境验证 |

## 2. 文件级改动清单

下列路径是按当前仓库结构的建议落点；开发时如已有同域聚合文件，应优先修改现有文件，不新增无必要转发层。

| 文件路径 | 类型 | 变更摘要 | 关键代码/伪代码 | 任务 |
|---|---|---|---|---|
| `packages/global/core/chat/type.ts` | 修改 | 增加 `WorkflowBuilderVersionSchema` 并挂到 AI value | `workflowBuilderVersion: Schema.optional()` | T1 |
| `packages/global/openapi/core/workflow/builder/api.ts` | 修改 | 增加 load/commit 请求响应 schema；调整旧 Applied 语义 | `LoadBodySchema`、`CommitBodySchema` | T1 |
| `packages/global/openapi/core/workflow/builder/index.ts` | 修改 | 注册两个版本接口，修正 chat 描述不再“自动应用” | 新增 path 定义 | T1 |
| `pro/admin/src/service/core/ai/workflowBuilder/sandbox.ts` | 修改 | 区分新轮次初始化与同轮事务恢复，并导出安全读取固定 JSON 的能力 | `prepare...()` / `resume...()` / `readLatest...()` | T2,T3 |
| `pro/admin/src/service/core/ai/workflowBuilder/handler.ts` | 修改 | 在采用画布前读取 `lastInteractive` 并按“存在/不存在”选择续跑或初始化；Commit 成功后保存 ready value，不发送自动应用事件 | `getLastInteractiveValue()` + assistant version value | T2 |
| `packages/global/core/workflow/runtime/utils.ts` | 复用 | 从 histories 读取当前 `lastInteractive`，作为 Builder 唯一轮次判断依据 | `getLastInteractiveValue(histories)` | T2 |
| `pro/admin/src/service/core/ai/workflowBuilder/version/service.ts` | 新增（若无合适现有文件） | 编排鉴权后版本加载、S3 归档、ChatItem 条件更新 | `loadWorkflowBuilderVersion`、`commitWorkflowBuilderVersion` | T3,T4 |
| `pro/admin/src/pages/api/core/workflow/builder/version/load.ts` | 新增 | load API，使用 `parseApiInput` | parse -> auth -> service | T3 |
| `pro/admin/src/pages/api/core/workflow/builder/version/commit.ts` | 新增 | commit API，使用 `parseApiInput` | parse -> auth -> service | T4 |
| `projects/app/src/components/core/chat/components/AIResponseBox/index.tsx` | 修改 | 渲染版本 value | `RenderWorkflowBuilderVersion` | T5 |
| `projects/app/src/components/core/chat/components/AIResponseBox/RenderWorkflowBuilderVersion.tsx` | 新增 | 专用文件卡片，展示四个状态分支和操作 | `getWorkflowBuilderVersionDisplayState()` | T5 |
| `projects/app/src/pageComponents/app/detail/WorkflowComponents/WorkflowBuilder/api.ts` | 修改 | 增加 load/commit 客户端 | `postWorkflowBuilderVersionLoad/Commit` | T3,T4 |
| `projects/app/src/pageComponents/app/detail/WorkflowComponents/WorkflowBuilder/ChatPanel.tsx` | 修改 | 去掉 SSE 自动应用消费；明确前端携带的当前画布只有新轮次可被后端采纳 | context/action wiring | T2,T5 |
| `projects/app/src/pageComponents/app/detail/WorkflowComponents/WorkflowBuilder/index.tsx` | 修改 | 承载加载、直接覆盖、布局、归档的事务 | `applyWorkflowBuilderVersion()` | T6 |
| `projects/app/src/pageComponents/app/detail/WorkflowComponents/context/workflowSnapshotContext.tsx` | 复用 | 使用既有快照能力记录应用成功后的 AI 版本 | `pushPastSnapshot` | T7 |
| `packages/web/i18n/{zh-CN,zh-Hant,en}/workflow.json` | 修改 | 新增版本状态、操作和错误文案 | 同 key 三语同步 | T8 |
| 对应 global/service/app 测试文件 | 新增/修改 | 覆盖 schema、状态推导、API、S3 幂等和画布事务 | 见第 7 节 | T8 |

### 2.1 关键代码片段

#### T1：共享版本结构

```ts
export const WorkflowBuilderVersionSchema = z.object({
  versionNo: IntSchema.positive(),
  name: z.string().min(1),
  filename: z.string().min(1),
  checksum: WorkflowChecksumSchema,
  generatedAt: z.coerce.date(),
  s3Key: z.string().min(1).optional(),
  expiresAt: z.coerce.date().optional(),
  appliedAt: z.coerce.date().optional()
});

export const AIChatItemValueSchema = z.object({
  // existing fields
  workflowBuilderVersion: WorkflowBuilderVersionSchema.optional()
});
```

说明：实际实现时 checksum schema 应放在业务可共享位置，再由 OpenAPI 复用，避免 `core/chat` 反向依赖 `openapi`。

#### T2：固定轮次基线并生成 ready value

```ts
const workflowRuntime = await (async () => {
  const lastInteractive = getLastInteractiveValue(histories);

  if (lastInteractive !== undefined) {
    // 同一个 Builder 任务续跑：不得采纳本次请求重新携带的画布。
    return resumeWorkflowBuilderSandboxRuntime({
      sourceId,
      tmbId,
      chatId,
      locale,
      templateBundle,
      workflowStreamResponse,
      currentFiles
    });
  }

  return prepareWorkflowBuilderSandboxRuntime({
    sourceId,
    tmbId,
    chatId,
    locale,
    document: body.workflowContext.document,
    templateBundle,
    workflowStreamResponse,
    currentFiles
  });
})();

const baseDocument = workflowRuntime.baseDocument;
const baseChecksum = await getWorkflowChecksum(baseDocument);
```

`lastInteractive` 必须在采用 `body.workflowContext`、调用 `prepareWorkflowBuilderSandboxRuntime()` 之前从 histories 读取，避免“先用当前画布覆盖文件，再发现这是表单续跑请求”。API 边界仍可以校验 `workflowContext` 的传输结构，但存在 `lastInteractive` 的请求不得用它构造 CLI Gateway 或比较本轮基线 checksum。

`prepare...()` 和 `resume...()` 应统一返回本轮权威 `baseDocument`：

- 新任务：`baseDocument` 就是校验后的请求 `workflowContext.document`，同时写入 `workflow.json`。
- 同任务续跑：从既有 Sandbox `workflow.json` 读取 `baseDocument` 并重算 `baseChecksum`，不得把请求中的当前画布继续传给 CLI Gateway。

`resumeWorkflowBuilderSandboxRuntime()` 是职责示意，实际实现应自底向上复用现有 Sandbox client 和路径构造逻辑。它必须恢复已有事务上下文，不写 `workflow.json`；若 Sandbox 事务本身已不可恢复，应明确返回“当前 Builder 交互已失效”，不能偷偷以请求中的当前画布创建新基线。该失败只由 Sandbox 恢复结果决定，不额外检查 `pendingMainContext`。

本轮生成并校验成功后，再追加 ready value：

```ts
const versionNo = await resolveWorkflowBuilderVersionNo({
  sourceType,
  sourceId,
  chatId,
  responseChatItemId
});

aiResponse.value.push({
  workflowBuilderVersion: {
    versionNo,
    name: `AI 生成版本 ${versionNo}`,
    filename: `AI 生成版本 ${versionNo}.json`,
    checksum: appliedWorkflow.checksum,
    generatedAt: new Date()
  }
});
```

版本号查询必须排除同一 `responseChatItemId`，使请求重试得到同一个 `N`。

#### T3：加载来源判定

```ts
const version = await getOwnedWorkflowBuilderVersion(params);

const rawDocument = await (async () => {
  if (version.s3Key) {
    assertVersionNotExpired(version.expiresAt);
    return readChatS3Json(version.s3Key);
  }

  await assertLatestReadyVersion(params);
  return readLatestSandboxWorkflow({ ...sandboxQuery, allowCreate: false });
})();

const document = parseCompatibleWorkflowDocument(rawDocument);
const checksum = await getWorkflowChecksum(document);
assert(checksum === version.checksum);
return { versionNo: version.versionNo, document, checksum, source };
```

#### T4：归档实际应用内容

```ts
const document = parseCompatibleWorkflowDocument(body.document);
const checksum = await getWorkflowChecksum(document);
assert(checksum === body.checksum && checksum === version.checksum);

if (version.s3Key && version.expiresAt > new Date()) {
  return version;
}

const expiresAt = addDays(new Date(), 1);
const upload = await getS3ChatSource().uploadChatFile({
  ...chatSource,
  filename: version.filename,
  body: `${JSON.stringify(document, null, 2)}\n`,
  contentType: 'application/json',
  expiredTime: expiresAt
});

return conditionallyAttachArchive({
  responseChatItemId,
  checksum,
  s3Key: upload.key,
  expiresAt
});
```

#### T5：版本卡片状态推导

```ts
const state = (() => {
  if (version.expiresAt && version.expiresAt.getTime() <= Date.now()) return 'expired';
  if (!version.s3Key) return isLatestReady ? 'ready' : 'superseded';
  return 'available';
})();
```

`ready` 是最新未应用候选；`available` 是已经应用并归档到 S3、可再次应用的版本；`expired` 和 `superseded` 都不可操作。状态只由 ChatItem 版本元数据、是否为最新 ready 及当前时间推导，不依赖页面快照。

#### T6/T7：应用和“我的编辑”快照

```ts
const applyVersion = async (versionItem: VersionItem) => {
  const loaded = await postWorkflowBuilderVersionLoad(versionItem.ids);
  const beforeSnapshot = captureCurrentWorkflow();

  try {
    await replaceCanvasAndLayout(loaded.document);
  } catch (error) {
    restoreWorkflow(beforeSnapshot);
    throw error;
  }

  const archived = await postWorkflowBuilderVersionCommit({
    ...versionItem.ids,
    document: loaded.document,
    checksum: loaded.checksum
  });
  pushAiVersionSnapshot(archived.versionNo, loaded.document);
  return archived;
};
```

应用成功后使用 commit 返回的归档元数据更新当前卡片，使其立即从 `ready` 切换为 `available`。画布导入或布局失败时自动恢复应用前状态属于事务失败恢复，不是面向用户的版本撤销。归档失败时需要保留 `loaded` 内容供原卡片重试 commit；不能重新调用 load，否则可能得到不同的 Sandbox 最新文件。

## 2.2 Reviewer 阅读流程

### 2.2.1 一句话改动主线

Builder 新生成轮次只在首次请求读取当前画布并初始化 Sandbox，同轮澄清和第一道确认始终恢复该基线；生成入口不再把 CLI 结果通过 SSE 自动覆盖画布，而是写入 ready 文件信息。用户在文件卡片确认后通过 load 获取 Sandbox/S3 JSON，画布成功覆盖后再通过 commit 归档实际应用版本，并写入带 `AI 生成版本 N` 标题的“我的编辑”快照。

### 2.2.2 阅读顺序表

| 步骤 | Reviewer 先看什么 | 文件/符号 | 关注点 | 结论 |
|---|---|---|---|---|
| 1 | 类型契约 | `packages/global/core/chat/type.ts`、builder OpenAPI schema | 字段是否单一来源、可选兼容 | 消息和接口数据如何表达 |
| 2 | Builder 轮次入口 | `runtime/utils.ts#getLastInteractiveValue`、`workflowBuilder/handler.ts` | 是否在采用请求画布前读取 `lastInteractive` | 画布基线何时读取且为何不变化 |
| 3 | Sandbox 初始化/恢复 | `workflowBuilder/sandbox.ts` | 新轮次写入、同轮只恢复 | 第一道确认不会覆盖原基线 |
| 4 | Builder 完成入口 | `workflowBuilder/handler.ts` | 是否停止自动应用并正确创建 ready value | 第二道确认何时产生 |
| 5 | load API | `version/load.ts` -> `version/service.ts` | 鉴权、Sandbox/S3 分支、target checksum | 卡片读取的 JSON 是否可信 |
| 6 | commit API | `version/commit.ts` -> service -> S3/ChatItem | 实际内容归档、TTL、条件更新 | 历史版本如何形成 |
| 7 | AI 卡片 | `RenderWorkflowBuilderVersion.tsx` | 四个展示分支、禁用与 loading | 用户看到什么按钮 |
| 8 | 画布事务 | `WorkflowBuilder/index.tsx` | 直接覆盖、失败恢复、归档时机 | 是否避免半应用和画布冲突检查 |
| 9 | “我的编辑” | `workflowSnapshotContext.tsx`、`WorkflowBuilder/index.tsx` | 复用快照能力和 AI 版本标题 | 应用后的编辑版本如何记录 |
| 10 | 测试 | 第 7 节路径 | 基线固定、竞态、幂等、过期、状态分支 | 设计关键风险是否被证明 |

### 2.2.3 调用链展开

1. 轮次判断：handler 从当前 histories 读取 `lastInteractive`；存在即续跑，不存在即新轮次，不解析用户文字、按钮类型或 AgentLoop provider memory。
2. 新任务入口：无 `lastInteractive` -> 采纳 `ChatPanel.tsx#onStartChat` 携带的当前 `workflowContext` -> `prepareWorkflowBuilderSandboxRuntime()` -> `prepareWorkflowBuilderSandbox()`，只在此处写入固定 `workflow.json`。
3. 同任务续跑：有 `lastInteractive` -> Sandbox restore 路径；忽略请求重新携带的当前画布，不写 `workflow.json`。
4. 恢复失败：有 `lastInteractive` 但 Sandbox 事务本身不可恢复 -> 返回明确错误，不以请求当前画布新建基线。
5. 生成完成：Runner/CLI 基于原始基线得到 target document/checksum；handler 将 `workflowBuilderVersion` 追加到 AI ChatItem，不发送前端自动应用事件。
6. 展示入口：Chat history -> `AIResponseBox` -> `RenderWorkflowBuilderVersion`，根据 ChatItem 归档元数据、最新 ready 和过期时间推导状态。
7. 首次应用：卡片 -> `version/load` -> App 写权限/ChatItem 归属 -> `getSandboxClient({ allowCreate: false })` -> 固定 `workflow.json` -> schema/target checksum。
8. 画布更新：load 返回 -> Workflow Builder 页面导入适配 -> `initData()` -> 自动布局；不读取基线，不比较当前画布 checksum。
9. 归档：画布成功 -> `version/commit` -> 重算 target checksum -> `S3ChatSource.uploadChatFile(expiredTime)` -> 条件回写原 AI ChatItem。
10. 页面结果：用 commit 返回值更新本地聊天 value -> 插入 `AI 生成版本 N` 快照 -> 当前卡片显示“再次应用”。
11. 异常：同轮 Sandbox 无法恢复则本轮失败，不建立新基线；load 失败不改画布；画布步骤失败恢复应用前快照；commit 失败保留画布和同一 loaded JSON用于重试。
12. 测试：global schema、轮次基线、service 分支、API 鉴权、卡片状态纯函数、画布应用事务和 E2E 串联验证。

## 3. 后端实施说明

### 3.1 API 改动

| 接口 | 方法 | 请求参数 | 响应结构 | 鉴权 | 错误处理 |
|---|---|---|---|---|---|
| `/core/workflow/builder/version/load` | POST | appId/chatId/responseChatItemId | versionNo/document/checksum/source | App 写权限 + ChatItem 归属 | 404 消息或 Sandbox 文件不存在；409 旧 ready/checksum 不符；410 已过期 |
| `/core/workflow/builder/version/commit` | POST | IDs + document/checksum | 完整归档元数据 | App 写权限 + ChatItem 归属 | 400 schema/checksum；409 版本不符；502 S3 失败 |

所有 API 入参必须通过：

```ts
const { body } = parseApiInput({
  req,
  bodySchema: WorkflowBuilderVersionLoadBodySchema
});
```

不要在 handler 直接调用 `Schema.parse(req.body)`。

### 3.2 Core/Service 改动

| 模块 | 函数/类型 | 具体改动 | 依赖关系 |
|---|---|---|---|
| Builder handler | `handleWorkflowBuilderChat` | 保存 ready value，停止自动画布 SSE | 依赖 runner 目标文档/checksum |
| Builder handler | `handleWorkflowBuilderChat` 内轮次分支 | 在采用请求画布前读取 `lastInteractive`；无交互初始化、有交互续跑 | 复用 `getLastInteractiveValue()`，不读取 provider state |
| Builder sandbox | 初始化/恢复 | 新轮次准备并写入基线；同轮恢复并返回 Sandbox 内权威 `baseDocument/baseChecksum` | 依赖 Sandbox runtime client |
| Builder sandbox | `readLatestWorkflowBuilderDocument` | 第二道确认连接既有 Sandbox，读取事务固定文件 | 依赖 Sandbox runtime client |
| Builder version service | `loadWorkflowBuilderVersion` | 鉴权后按 S3/Sandbox 加载并校验 | ChatItem、S3、workflow-core |
| Builder version service | `commitWorkflowBuilderVersion` | 校验实际 JSON、S3 上传、条件回写 | ChatItem、S3、workflow-core |
| Builder version service | `resolveVersionNo` | 同会话版本序号幂等分配 | MongoChatItem |

### 3.3 数据层改动

- 不增加 Mongo collection、顶层字段或索引。
- 新数据只存在 `ChatItem.value[].workflowBuilderVersion`。
- 不涉及 `defineIndex` 变更，也不存在历史索引清理任务。
- 如果实现选择把版本对象提升为 ChatItem 顶层字段，则属于偏离本方案，必须重新评估 schema、索引和迁移；本期不建议。

### 3.4 幂等与并发

1. **生成重试**：`responseChatItemId` 相同即复用版本号。
2. **交互续跑**：存在 `lastInteractive` 时必须恢复既有 Sandbox 基线；请求携带的最新画布不能参与覆盖或 checksum 比较。
3. **新生成任务**：不存在 `lastInteractive` 时才读取本次请求的当前画布，并覆盖 Sandbox `workflow.json`；`pendingMainContext` 的存在与否不改变该判断。
4. **Sandbox 恢复失败**：存在 `lastInteractive` 但事务文件不可恢复时明确失败，禁止当作新任务覆盖基线。
5. **首次 load**：只有最新未归档版本允许走 Sandbox；target checksum 不一致返回冲突。
6. **commit 重试**：相同 ChatItem + target checksum 已存在有效 S3 时直接返回。
7. **并发 commit**：条件更新只允许一个请求挂载最终 key；其他请求读取胜出结果，并清理多余对象。
8. **过期后再次 commit**：不允许通过历史卡片重新上传以续期；过期就是终态。只有当前刚成功应用但归档失败的临时重试状态可以提交。

## 4. 前端实施说明

| 页面/组件 | 文件路径 | 交互变化 | i18n | 状态覆盖 |
|---|---|---|---|---|
| AI 响应 | `AIResponseBox/index.tsx` | 渲染专用版本卡片 | 新增 | 空字段不渲染 |
| 版本卡片 | `RenderWorkflowBuilderVersion.tsx` | ready/available/expired/superseded | 新增 | idle/loading/success/error/disabled |
| Builder ChatPanel | `WorkflowBuilder/ChatPanel.tsx` | 不再消费自动应用 SSE | 调整 | 流式完成后显示消息卡片 |
| Builder 页面 | `WorkflowBuilder/index.tsx` | 执行 load -> 覆盖 -> layout -> commit | 新增错误文案 | 每一步 loading 与错误恢复 |
| Snapshot | `workflowSnapshotContext.tsx` | 记录 AI 版本标题 | 复用版本名 | 使用既有“我的编辑”快照能力 |

### 4.1 卡片按钮矩阵

| 状态 | 主按钮 | 次按钮 | 点击结果 |
|---|---|---|---|
| ready | 应用到画布 | 无 | Sandbox load 后应用并归档 |
| available | 再次应用 | 无 | 从 S3 load 后直接覆盖画布 |
| expired | 已过期（禁用） | 无 | 无请求 |
| superseded | 已有更新版本（禁用） | 无 | 无请求 |

卡片展示日期只作为次要信息，版本标题不得回退为时间格式。

### 4.2 应用失败恢复

- 在修改画布前捕获完整的 `nodes/edges/chatConfig`。
- 导入、模型权限处理、`initData` 或布局任何一步抛错，恢复捕获状态。
- commit 发生在画布步骤之后；commit 失败不自动撤回用户已经确认并成功看到的画布，但要保留可重试归档内容。
- 同一卡片请求中使用防重复锁，避免快速点击导致多个画布事务并行。

### 4.3 “我的编辑”接入

版本卡片不维护专属撤销栈，也不扩展 `WorkflowSnapshotContext` 的状态协议。画布成功应用并归档后，页面复用现有 `pushPastSnapshot` 写入一条可识别的快照：

```ts
pushPastSnapshot({
  pastNodes: getNodes(),
  pastEdges: edges,
  chatConfig: appDetail.chatConfig,
  customTitle: `AI 生成版本 ${archived.versionNo}`
});
```

该快照只负责在“我的编辑”中保留对应版本信息。画布编辑器原有 undo/redo 行为保持原样；聊天版本卡片不读取快照状态，也不提供撤销按钮。

## 5. 日志与可观测性

| 触发点 | 级别 | 分类 | 字段 | 备注 |
|---|---|---|---|---|
| ready 版本生成 | info | workflowBuilderVersion | sourceId/chatId/dataId/versionNo/checksum | 不记录 JSON |
| load 成功 | info | workflowBuilderVersion | source=sandbox/s3、耗时、checksum | 不记录签名 URL |
| load 冲突/过期 | warn | workflowBuilderVersion | dataId/versionNo/reason | 用于定位旧卡片 |
| commit 成功/幂等命中 | info | workflowBuilderVersion | dataId/versionNo/checksum/expiresAt/idempotent | s3Key 可记录对象 key，不记录临时 URL |
| S3/ChatItem 更新失败 | error | workflowBuilderVersion | IDs、checksum、阶段、error | 不记录 document |

## 6. i18n 实施说明

| 源文件 | 目标文件 | 类型 | 动作 | 状态 |
|---|---|---|---|---|
| `packages/web/i18n/zh-CN/workflow.json` | 同文件 | UI 文案 | 新增 | 待开发 |
| `packages/web/i18n/zh-Hant/workflow.json` | 同文件 | UI 文案 | 新增 | 待开发 |
| `packages/web/i18n/en/workflow.json` | 同文件 | UI 文案 | 新增 | 待开发 |

本期不涉及 document 站点文档翻译，DocI18n 为 Not Applicable。

## 7. 测试与验证

规范来源：`project-requirement-design/references/testing-standards.md`。

### 7.1 测试文件映射

| 源文件 | 建议测试文件 | 是否跳过 | 理由 |
|---|---|---|---|
| `packages/global/core/chat/type.ts` | `packages/global/test/core/chat/type.test.ts` | 否 | 验证新 value schema 和历史兼容 |
| Builder version service | `pro/admin/test/service/core/ai/workflowBuilder/version.test.ts` | 否 | 核心加载、归档和并发分支 |
| load/commit API | `pro/admin/test/api/core/workflow/builder/version.test.ts` 或项目既有同类 API 目录 | 否 | 鉴权、入参、错误映射 |
| `RenderWorkflowBuilderVersion.tsx` | 同目录组件测试或最近的 chat component test | 否 | 四个状态分支和按钮矩阵 |
| `WorkflowBuilder/index.tsx` 应用 helper | 将纯事务逻辑下沉后对应 `.test.ts` | 否 | 覆盖覆盖、恢复和归档时序 |
| `WorkflowBuilder/index.tsx` 的快照调用 | 对应页面或 context 测试 | 否 | 应用后写入 `AI 生成版本 N` 标题 |

### 7.2 自动化测试设计

| 类型 | 用例 | 预期结果 |
|---|---|---|
| Schema | 历史 AI value、新 version value、非法 checksum | 历史通过；新结构通过；非法拒绝 |
| Round/Sandbox | 无 `lastInteractive` | 采纳请求画布，只写入一次 `workflow.json` |
| Round/Sandbox | 需求澄清交互存在（旧 `agentPlanAskQuery` 经 helper 适配为 `agentAsk`） | 继续原事务，不调用 prepare，不重写 `workflow.json` |
| Round/Sandbox | `lastInteractive = workflowBuilderPreview` | 继续原事务，不调用 prepare，不重写 `workflow.json` |
| Round/Sandbox | `pendingMainContext` 存在或缺失 | 不改变 Builder 轮次结果，仅由 AgentLoop 自己处理 ask 消息现场恢复 |
| Round/Sandbox | `shouldFinalizePreparedRound` 值变化 | 不改变 Builder 轮次结果 |
| Round/Sandbox | 同轮续跑请求携带已变化的当前画布 | CLI Gateway 使用 Sandbox 返回的原始 `baseDocument/baseChecksum`，完全忽略请求画布 |
| Runner/Sandbox | 同轮恢复时 Sandbox 已丢失 | 明确失败，不以当前画布静默创建新基线 |
| Service | 最新 ready 从 Sandbox 加载 | `allowCreate: false`，document/checksum 正确 |
| Service | 非最新 ready、Sandbox checksum 已变化 | 返回冲突，不返回错误版本 |
| Service | available 从 S3 加载 | 不访问 Sandbox |
| Service | expired 加载 | 返回过期错误，不访问 S3 body |
| Service | commit 首次成功 | 上传一次，TTL 约 24h，回写 ChatItem |
| Service | commit 重试 | 返回相同归档，不重复上传 |
| Service | document/request/ChatItem checksum 任一不一致 | 拒绝归档 |
| Component | ready/available/expired/superseded | 按钮、文案、禁用态完全匹配矩阵；首次应用后立即变为 available |
| Snapshot | 首次应用、再次应用不同历史版本 | 每次成功应用均写入对应 `AI 生成版本 N` 快照 |
| Workflow | 画布生成期间已人工修改 | 点击确认仍直接覆盖 |
| Workflow | 第一、第二道确认前画布均已变化 | 不重新读取、不比较画布 checksum，最终 target 直接覆盖 |
| Workflow | 上一轮结束后发送新需求 | 重新读取此刻画布，作为下一轮唯一基线 |
| Workflow | 导入或布局失败 | 恢复应用前状态且不 commit |
| Workflow | commit 失败 | 画布保留，出现可重试保存状态 |

### 7.3 场景覆盖核对

| 场景 | 是否覆盖 | 对应用例 |
|---|---|---|
| 基础场景 | 是 | 首次应用、归档、再次应用 |
| 复杂场景 | 是 | 多版本、旧 ready、新一轮覆盖、并发 commit |
| 边界值 | 是 | 版本 1、恰好到期、空工作流（若 schema 允许） |
| 异常场景 | 是 | Sandbox/S3/布局/DB 失败、checksum 不符 |
| 安全边界 | 是 | 无写权限、伪造 chat item、超大/非法 JSON 按 API size/schema 拒绝 |

### 7.4 执行命令与结果

实施过程中先运行局部测试，完成后再运行仓库要求的全量检查。实际命令需结合最终测试文件确认：

| 命令 | 当前结果 | 覆盖率 | 备注 |
|---|---|---|---|
| `pnpm test packages/global/test/core/chat/type.test.ts` | 未执行 | 待记录 | T1 后运行 |
| `pnpm test <workflow-builder-version-service-test>` | 未执行 | 待记录 | T3/T4 后运行 |
| `pnpm test <workflow-builder-version-ui-test>` | 未执行 | 待记录 | T5-T7 后运行 |
| `pnpm lint` / 项目最终 typecheck | 未执行 | N/A | 全部实现后运行 |
| `pnpm test` | 未执行 | 待记录 | 最终全量验证 |

目标为核心新增纯函数和 service 行/分支覆盖 100%，最低不低于 90%；低于目标需在实现 PR 中记录原因和剩余风险。

## 8. 质量自检清单

- [ ] load/commit 均使用 `parseApiInput` 和 App 写权限鉴权
- [ ] 一轮生成只有首次请求写入画布基线，同轮交互续跑不重写 `workflow.json`
- [ ] 在采用请求画布前使用 `getLastInteractiveValue(histories)` 判断是否为同一 Builder 轮次
- [ ] Sandbox 基线判断不依赖 `pendingMainContext`、`shouldFinalizePreparedRound`、用户文字或按钮类型枚举
- [ ] 同轮续跑的 CLI Gateway 使用 Sandbox 恢复的 `baseDocument/baseChecksum`，不使用请求当前画布
- [ ] 没有调用 `prepareWorkflowBuilderSandbox()` 读取待应用文件
- [ ] 没有候选文件副本或 Redis 状态
- [ ] 没有当前画布 `baseChecksum` 冲突检查
- [ ] S3 保存内容与实际应用内容 checksum 一致
- [ ] ChatItem 不保存签名 URL或页面瞬时状态
- [ ] 聊天版本卡片不包含 `active` 状态或专属撤销操作
- [ ] 应用成功后“我的编辑”使用 `AI 生成版本 N` 标题
- [ ] 三语 i18n 同步
- [ ] 日志不包含完整 JSON
- [ ] 局部和最终测试结果已填写

## 9. 发布与回滚

### 9.1 发布步骤

1. 先发布 global schema、后端 load/commit 和兼容读取能力。
2. 再发布 Builder 消息生成和前端卡片/应用事务，避免前端先出现无法调用的卡片。
3. 观察 load 冲突率、commit 失败率、S3 上传失败和旧 ready 点击情况。

### 9.2 回滚触发条件

- Builder 成功生成后无法形成 ready ChatItem。
- load 大面积无法恢复现有 Sandbox。
- commit 归档内容与画布 checksum 不一致。
- 应用失败不能恢复画布，出现数据丢失风险。

### 9.3 回滚步骤

1. 回滚前端版本卡片和二次确认入口。
2. 必要时恢复旧 `workflowBuilderApplied` SSE 自动应用链路。
3. 保留后端可选 schema 兼容读取；新增 S3 对象等待 1 天 TTL 清理。

## 10. TODO（执行阶段逐项更新）

- [ ] T1 定义 Workflow Builder version 业务 schema、API schema 和 OpenAPI path
- [ ] T2 在 Sandbox prepare 前使用 `lastInteractive !== undefined` 判断固定基线；保存 ready AI value并停止自动应用 SSE
- [ ] T3 实现只读连接 Sandbox/S3 的 load service 和 API
- [ ] T4 实现实际应用 JSON 的 S3 commit、ChatItem 条件更新和幂等清理
- [ ] T5 实现 AI 专用版本文件卡片及四个展示分支推导
- [ ] T6 重构画布应用事务，移除 baseChecksum 检查并完善失败恢复
- [ ] T7 接入“我的编辑”的 AI 版本快照标题
- [ ] T8 补齐中英繁 i18n
- [ ] T9 完成 schema/service/API/component/snapshot 局部测试
- [ ] T10 运行 lint、typecheck 和最终全量测试，回填结果

## 11. AI 实施提示

- 严格按 T1-T10 顺序执行，每完成一项立即更新 TODO 和测试结果。
- 开发前先确认工作区已有改动，不覆盖用户暂存内容。
- 优先从小而稳定的 schema、状态推导和 service helper 开始，再组合 API 和页面事务。
- 任何需要候选副本、永久版本库或 Workflow Builder 专属撤销状态的实现都属于超范围，应停止并回到需求文档评审。

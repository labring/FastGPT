# 辅助生成统一抽象重构设计文档

## 背景

当前 Chat Agent 辅助配置生成能力为了复用 workflow 的余额校验、usage 记录、节点响应和 SSE 能力，被硬塞进 `dispatchWorkFlow`：

- API route 构造一个 `internalRuntimeNode`。
- `dispatchWorkFlow` 只执行这一个 internal node。
- internal node 再调用 Chat Agent 配置生成 processor。
- Chat Agent 配置生成 processor 内部再跑 `runUnifiedAgentLoop`。

这条链路能复用计费和运行状态，但语义上不准确：

- Chat Agent 辅助配置生成不是用户配置的 workflow，也不是 Agent 节点。
- workflow runtime 的节点、边、skip、interactive、nodeResponse 等能力大部分只是被借壳。
- 后续 Skill 辅助生成也需要类似能力，如果继续走 workflow，会把“辅助生成”与“工作流执行”绑定得更深。

辅助生成应作为独立通用抽象存在。Chat Agent 辅助配置、Skill 生成、未来的数据集配置建议等都应是辅助生成场景，而不是 workflow 特例。

## 目标

- 从 Chat Agent 辅助配置 completions 中移除 `dispatchWorkFlow` 和 `internalRuntimeNode`。
- 辅助生成核心模块完全去掉 workflow runtime 依赖：
  - 不调用 `dispatchWorkFlow`。
  - 不构造 runtime node / edge。
  - 不复用 `createWorkflowStreamResponseContext`。
  - 不使用 `WorkflowResponseType` 作为 processor 入参。
  - 不使用 workflow nodeResponse writer。
  - 不使用 workflow interactive 类型作为辅助生成领域类型。
- 封装统一辅助生成会话管理能力：
  - 鉴权。
  - 限频。
  - 对话记录读取、预创建、失败回写、成功保存。
  - 文件授权和文件内容解析。
  - 余额校验和 usage 创建、追加、汇总。
  - SSE 输出、恢复、错误收口。
  - 可选虚拟机激活。
  - 可选注入系统内置 Skill。
- 封装统一 agent loop 调用入口，场景只声明：
  - 模型、系统提示词、消息。
  - 是否允许 runtime tools。
  - 是否需要 VM / system skills。
  - 如何把 loop 结果解析成业务输出。
- 保留当前 Chat Agent 辅助配置行为：
  - collection 阶段继续输出 interactive 表单。
  - generation 阶段继续输出 Chat Agent 配置事件给前端应用。
  - chat 记录、文件、安全校验、限频语义不回退。
- 为 Skill 详情页辅助生成迁移预留接口：
  - 能在 Skill edit sandbox 中注入官方 `skill-creator`。
  - 能在同一套辅助生成会话中读写当前 Skill 工作区文件。
  - 当前变更不迁移 Skill 侧逻辑；Skill Debug 的正常 Agent 调试链路保持现状。

## 非目标

- 不重构标准 App chat completions。
- 不重构 Skill Debug 运行当前 Skill 的 `workflowStart -> agent` 调试链路。
- 不改变 chat 三表的 `sourceType/sourceId` 存储策略。
- 不把辅助生成能力暴露成用户可见 workflow 节点。
- 不把 workflow runtime 的 stream、interactive、nodeResponse 抽过来做“换壳复用”。
- 不在第一阶段强行统一 Chat Agent 辅助配置与 Skill Debug UI。

## 命名决策

新设计不继续使用 `HelperBot` 和 `TopAgent` 作为核心命名：

- Chat source type：`chatAgentHelper`。
- 前端场景名：`ChatAgentHelper`。
- 服务端 scene adapter：`chatAgentHelperSceneAdapter`。
- 业务 processor：`chatAgentConfigAssistantProcessor` 或 `chatAgentConfigProcessor`。
- SSE 配置事件：建议从 `topAgentConfig` 改为 `chatAgentConfig`。
- API 路径：建议从 `/proApi/core/chat/helperBot/completions` 改为 `/proApi/core/chat/chatAgentHelper/completions`，旧路径是否保留兼容由迁移策略决定。

`helperBot` 和 `topAgent` 只作为旧实现名出现在迁移说明中，新代码不再新增这两个命名。

## 当前迁移边界

本轮只重构 Chat Agent 辅助配置生成链路：

- 不迁移 Skill 详情页辅助生成逻辑。
- 不改变 Skill Debug 当前 `sourceType=skillEdit`。
- 不改变 Skill Debug 当前 `workflowStart -> agent` 调试运行链路。
- 仅预留 Skill 未来接入所需的 scene/runtime/agent loop 扩展点。

## 现状问题

### 1. Chat Agent 辅助配置运行语义与 workflow 不匹配

Chat Agent 辅助配置当前 runtime 只有一个 internal node，构造 workflow 的目的只是复用横切能力。这让调用链变长：

```txt
chatAgentHelper/completions
  -> preChatRound
  -> createWorkflowStreamResponseContext
  -> internalRuntimeNode
  -> dispatchWorkFlow
  -> chatAgentConfigAssistant processor
  -> runUnifiedAgentLoop
  -> pushChatRecords
```

真实业务其实是：

```txt
chatAgentHelper/completions
  -> 辅助生成会话管理
  -> chatAgentConfigAssistant processor
  -> agent loop
  -> 保存结果
```

### 2. 计费能力没有独立服务边界

workflow 的 `usagePush` 同时做了：

- usage item 追加。
- usage 总额汇总。
- root/child runtime 隔离。
- node response 关联。

辅助生成只需要其中一部分，但为了复用只能进入 workflow。

### 3. Agent loop 入口还偏底层

`runUnifiedAgentLoop` 是合理的底层 loop，但场景直接调用时还需要自己处理：

- usage 聚合。
- SSE event 映射。
- runtime tools 是否允许。
- check stopping。
- JSON 修复。
- prompt / messages 组装。

Chat Agent 辅助配置已经包装了一层 `runTopAgentPlanningLoop`，但它仍是旧 Chat Agent 场景专属，并且名字仍绑定旧 `TopAgent` 语义，不能直接服务 Skill 辅助生成。

### 4. “辅助生成”缺少领域命名

现在核心模块叫 HelperBot，而它本质只是 App 编辑页上的 Chat Agent 辅助配置入口。后续 Skill 辅助生成如果复用 HelperBot 命名，会继续扩大语义偏差。因此新抽象必须统一收敛到 `auxiliaryGeneration`，Chat Agent 辅助配置只是其中一个 scene。

## 目标架构

新增领域：`Auxiliary Generation`。

建议先使用收敛结构，不提前为 Skill 迁入拆太多目录。核心约束：`packages/service/core/ai/auxiliaryGeneration/**` 禁止 import `packages/service/core/workflow/**`，`packages/global/core/ai/auxiliaryGeneration/**` 禁止 import `packages/global/core/workflow/**`。

```txt
packages/global/core/ai/auxiliaryGeneration/
  constants.ts
  type.ts

packages/service/core/ai/auxiliaryGeneration/
  index.ts
  type.ts
  service.ts       # runAuxiliaryGeneration，总生命周期编排
  stream.ts        # 自有 SSE + resume + stream error
  usage.ts         # 余额检查、usage 创建和追加
  agentLoop.ts     # runAuxiliaryAgentLoop
  error.ts
  utils.ts

pro/admin/src/service/core/ai/auxiliaryGeneration/
  chatAgentHelper/
    service.ts
    type.ts
    schema.ts
    prompt.ts
    processor.ts
```

公共 `packages/service` 只放稳定横切能力：stream、usage、agent loop wrapper、生命周期 runner。Pro 侧放具体场景逻辑，避免公共包反向依赖 Pro，也避免把差异化逻辑抽象成空泛接口。

### 为什么不拆 `chat/`、`file/`、`runtime/`

- `chat`：Chat Agent 辅助配置和未来 Skill 辅助生成的历史读取、interactive 续写、成功保存策略都不同。公共层只要求 scene 提供 `loadContext/saveSuccess/saveFailure` 回调，不单独建 `chat/`。
- `file`：Chat Agent 辅助配置只处理聊天上传文件；Skill 辅助生成会处理 workspace 文件读写、刷新、测试输出。差异过大，不提前抽公共 `file/`。
- `runtime`：Chat Agent 辅助配置不启 VM；Skill 辅助生成才需要 edit sandbox 和 system skill 注入。runtime 目录等 Skill 迁入时放到 Skill 场景内，确认复用后再上移。

### 文件职责

- `service.ts`：统一入口 `runAuxiliaryGeneration`，只负责编排固定横切流程。
- `stream.ts`：辅助生成自己的 SSE、resume、错误输出；不包装 workflow stream。
- `usage.ts`：余额检查、usage 创建、usage item push、汇总。
- `agentLoop.ts`：统一 agent loop wrapper，调用 `runUnifiedAgentLoop`，处理 usageSink、事件映射、JSON repair。
- `chatAgentHelper/service.ts`：Chat Agent 辅助配置场景 glue，包含鉴权、历史读取、文件授权、interactive 续写、记录保存。
- `chatAgentHelper/processor.ts`：业务生成逻辑，负责把模型输出解析为 collection/generation 结果。

### Skill 迁入后的结构调整

Skill 迁入时不改公共入口，只在 Pro 侧新增 Skill 场景目录：

```txt
pro/admin/src/service/core/ai/auxiliaryGeneration/
  skillAssist/
    service.ts       # authSkill、历史读取、保存策略
    runtime.ts       # edit sandbox 激活、system skill 注入
    workspaceFile.ts # 工作区文件读写、文件树刷新所需元数据
    tools.ts         # 给 agent loop 的文件/测试 runtime tools
    processor.ts
    prompt.ts
    schema.ts
    type.ts
```

只有当 `chatAgentHelper` 和 `skillAssist` 出现真实重复实现，才把对应能力上移到公共层。例如：

- 两边都需要同一种 stream resume 细节：留在公共 `stream.ts`。
- 两边都需要同一种 usage 统计：留在公共 `usage.ts`。
- 两边文件处理不同：继续留在各自 scene。
- 两边保存 interactive 不同：继续留在各自 scene。

## 核心抽象

### AuxiliaryGenerationSession

建议用类或闭包工厂，不建议用 React hook。这里的核心问题在服务端：鉴权、usage、chat round、stream、VM runtime 都是服务端能力。前端可以后续补一个轻量 hook，但不应承担主抽象。

建议入口：

```ts
export const runAuxiliaryGeneration = async <TInput, TResult>({
  req,
  res,
  scene,
  input,
  processor
}: RunAuxiliaryGenerationProps<TInput, TResult>): Promise<TResult> => {
  // 统一生命周期
};
```

生命周期：

```txt
parse input(route 层完成)
  -> scene.authenticate()
  -> scene.rateLimit()
  -> scene.assertAccess()
  -> usage.checkBalance()
  -> scene.loadContext()
  -> scene.prepareRound()
  -> stream.create()
  -> usage.createUsage()
  -> scene.prepareRuntime(optional)
  -> processor.run()
  -> usage.flush()
  -> scene.saveSuccess()
  -> stream.done()
```

错误生命周期：

```txt
catch error
  -> scene.saveFailure() // prepared round 后才执行
  -> stream.error()     // stream 已创建时执行
  -> plain sse error    // stream 未创建时执行
```

### Scene Adapter

不同场景差异通过 adapter 表达，不写死 Chat Agent 辅助配置。

```ts
export type AuxiliaryGenerationSceneAdapter<TInput, TAuth, TUserInput> = {
  sceneType: AuxiliaryGenerationSceneEnum;
  getSource: (input: TInput) => ChatSourceTarget;
  authenticate: (props: AuthProps<TInput>) => Promise<TAuth>;
  rateLimit?: (props: RateLimitProps<TInput, TAuth>) => Promise<void>;
  assertChatAccess: (props: AssertChatAccessProps<TInput, TAuth>) => Promise<void>;
  loadContext: (props: LoadContextProps<TInput, TAuth>) => Promise<AuxiliaryGenerationContext<TUserInput>>;
  prepareRound: (props: PrepareRoundProps<TInput, TAuth, TUserInput>) => Promise<PreChatRoundResult>;
  prepareRuntime?: (props: PrepareRuntimeProps<TInput, TAuth, TUserInput>) => Promise<unknown>;
  saveSuccess: (props: SaveSuccessProps<TInput, TAuth, TUserInput, TResult>) => Promise<void>;
  saveFailure: (props: SaveFailureProps<TInput, TAuth>) => Promise<void>;
};
```

Chat Agent 辅助配置场景：

- `sourceType=chatAgentHelper`
- `sourceId=appId`
- `authenticate=authApp(ReadPermissionVal)`
- 历史读取 40 条。
- 使用 Chat Agent 辅助配置专用 interactive append 保存逻辑。

Skill 辅助生成场景（本轮只预留，不迁移）：

- 初始建议：`sourceType=skillEdit`
- `sourceId=skillId`
- `authenticate=authSkill(WritePermissionVal)`
- 历史可以复用 Skill edit chat。
- runtime prepare 负责获取 Skill edit sandbox 并注入官方 `skill-creator`。

### Usage Manager

实现辅助生成专用 usage 管理：

```ts
export type AuxiliaryGenerationUsageManager = {
  checkBalance: () => Promise<void>;
  createUsage: () => Promise<string | undefined>;
  push: (usages: ChatNodeUsageType[]) => void;
  flush: () => Promise<AuxiliaryGenerationUsageSummary>;
};
```

职责：

- 调用 `checkTeamAIPoints(teamId)`。
- 调用 `createChatUsageRecord` 创建 usage。
- 调用 `pushChatItemUsage` 追加 item。
- 汇总 `totalPoints/inputTokens/outputTokens/model`。
- 支持 `disabled` 或 `deferCreate`，方便某些场景只统计不扣费。

建议第一阶段沿用现有账单来源枚举：

- Chat Agent 辅助配置：`UsageSourceEnum.fastgpt`，`appId=sourceId`，`appName` 建议写真实 App 名称，并在 usage item 的 `moduleName` 中写 `Chat Agent helper`，方便账单归因。
- Skill 辅助生成：本轮不迁移；未来建议 `UsageSourceEnum.fastgpt`，`skillId=sourceId`，`appName` 写 Skill 名称。

余额不足行为：

1. 辅助生成会话在 LLM 调用前执行 `checkTeamAIPoints(teamId)`。
2. 如果抛出 `TeamErrEnum.aiPointsNotEnough`，直接通过 SSE error 或普通 API error 返回同名 `statusText`。
3. 前端沿用现有 request/stream 错误处理，触发 `NotSufficientModal`。
4. 不复用 workflow 的 `paymentPause` interactive。

原因：

- 当前普通 API 已经会把 `TeamErrEnum.aiPointsNotEnough` 映射到充值弹窗。
- workflow 的 `paymentPause` 是“节点执行暂停并可续跑”的语义，辅助生成不需要恢复到某个节点。
- 如果继续伪造 `paymentPause`，会把新抽象再次绑回 workflow interactive。

### Stream Context

新增辅助生成 stream context。它是独立实现，不包装 `createWorkflowStreamResponseContext`，也不暴露 `WorkflowResponseType`。

```ts
export type AuxiliaryGenerationStream = {
  write: (event: AuxiliaryGenerationStreamEvent) => void;
  writeAnswerDelta: (payload: AuxiliaryGenerationAnswerDelta) => void;
  writeReasoningDelta: (payload: AuxiliaryGenerationReasoningDelta) => void;
  writeInteractive: (interactive: AuxiliaryGenerationInteractive) => void;
  writeConfig: (config: AuxiliaryGenerationConfigPayload) => void;
  writeError: (error: AuxiliaryGenerationErrorPayload) => void;
  close: () => void;
  flushResume: () => Promise<void>;
};
```

事件定义放在 `packages/global/core/ai/auxiliaryGeneration/event.ts`：

```ts
export enum AuxiliaryGenerationEventEnum {
  answer = 'answer',
  reasoning = 'reasoning',
  interactive = 'interactive',
  config = 'config',
  usage = 'usage',
  error = 'error',
  done = 'done'
}
```

底层 SSE 格式可以继续用标准 `event: xxx\ndata: xxx\n\n`，但事件枚举和 payload 都属于 auxiliary generation，不放在 workflow runtime constants 里。

### Interactive Model

辅助生成定义自己的交互模型，避免继续依赖 workflow interactive。

```ts
export type AuxiliaryGenerationInteractive =
  | AuxiliaryGenerationFormInteractive
  | AuxiliaryGenerationAskInteractive;

export type AuxiliaryGenerationFormInteractive = {
  type: 'form';
  id: string;
  description?: string;
  submitted?: boolean;
  fields: AuxiliaryGenerationFormField[];
};

export type AuxiliaryGenerationFormField = {
  key: string;
  label: string;
  inputType: 'text' | 'number' | 'select' | 'multipleSelect' | 'file';
  required?: boolean;
  value?: unknown;
  options?: { label: string; value: string }[];
};
```

ChatBox 可以在前端做一层 adapter：

- 辅助生成消息渲染读取 `AuxiliaryGenerationInteractive`。
- 如果短期还复用现有交互 UI，adapter 只存在前端组件层，不允许服务端辅助生成模块 import workflow 类型。
- 保存到 chat item 时保存辅助生成自己的 interactive payload；不要伪装成 workflow interactive。

### Runtime Manager

辅助生成场景可选准备 VM 和系统 Skill。

```ts
export type AuxiliaryGenerationRuntimeManager = {
  prepare?: (props: AuxiliaryGenerationRuntimePrepareProps) => Promise<AuxiliaryGenerationRuntime>;
  cleanup?: (runtime: AuxiliaryGenerationRuntime) => Promise<void>;
};
```

返回值：

```ts
export type AuxiliaryGenerationRuntime = {
  sandboxClient?: AgentSandboxClient;
  currentWorkingDirectory?: string;
  injectedSystemSkills?: SystemSkillInfo[];
  runtimeTools?: AgentLoopRuntimeTool[];
};
```

Chat Agent 辅助配置：

- 默认不准备 VM。
- 默认不注入 system skill。
- 继续只生成配置建议。

Skill 辅助生成（本轮不迁移）：

- 获取当前 Skill edit sandbox。
- 激活 VM。
- 注入官方 `skill-creator`。
- 可注册文件读写、运行测试、查看目录等 runtime tools。

### Agent Loop Runner

新增统一入口，不替代 `runUnifiedAgentLoop`，而是作为上层场景友好的 wrapper。

```ts
export const runAuxiliaryAgentLoop = async ({
  teamId,
  tmbId,
  model,
  systemPrompt,
  messages,
  tools,
  runtime,
  stream,
  usage,
  checkIsStopping,
  output
}: RunAuxiliaryAgentLoopProps): Promise<AuxiliaryAgentLoopResult> => {
  // 调 runUnifiedAgentLoop
};
```

统一处理：

- 模型能力读取：vision/audio/video。
- reasoning delta 到 SSE。
- answer delta 是否透传由场景决定。
- usageSink 汇总。
- runtime tools 开关。
- updatePlan tool 开关。
- ask tool 开关。
- abort/stopping。
- 可选 JSON parse + repair。

Chat Agent 辅助配置使用方式：

```ts
const result = await runAuxiliaryAgentLoop({
  mode: 'planning',
  tools: {
    runtimeTools: [],
    updatePlan: true,
    ask: false
  },
  output: {
    type: 'json',
    schema: ChatAgentConfigAssistantAnswerSchema,
    repair: true
  }
});
```

Skill creator 使用方式：

```ts
const result = await runAuxiliaryAgentLoop({
  mode: 'editing',
  tools: {
    runtimeTools: skillCreatorRuntimeTools,
    updatePlan: true,
    ask: true
  },
  runtime: skillEditRuntime,
  output: {
    type: 'assistantMessages'
  }
});
```

## Chat Agent 辅助配置重构后流程

```txt
POST /proApi/core/chat/chatAgentHelper/completions
  -> parseApiInput(ChatAgentHelperCompletionsParamsSchema)
  -> runAuxiliaryGeneration({
       scene: chatAgentHelperSceneAdapter,
       processor: chatAgentConfigAssistantProcessor
     })
```

内部：

```txt
authApp(ReadPermissionVal)
  -> assert chatAgentHelper chat access
  -> rate limit
  -> checkTeamAIPoints
  -> read chatAgentHelper histories
  -> parse ChatBox messages
  -> preChatRound
  -> resolve authorized files
  -> create auxiliary stream (own SSE context)
  -> create usage record
  -> chatAgentConfigAssistantProcessor.run
  -> usage.flush
  -> chatAgentHelper saveSuccess
  -> stream.done
```

保留不变：

- 前端收到 Chat Agent 配置事件后 `onApply` 的机制。
- Chat Agent 辅助配置专用 `sourceType=chatAgentHelper`。
- Chat Agent 辅助配置专用文件 key 授权。
- Chat Agent 辅助配置 interactive append 保存行为。

移除：

- `internalRuntimeNode`。
- Chat Agent 辅助配置 route 中直接调用 `dispatchWorkFlow`。
- Chat Agent 辅助配置 processor 入参里的 `workflowResponseWrite` 命名。
- `createWorkflowStreamResponseContext`。
- `WorkflowResponseType`。
- workflow interactive payload。
- workflow nodeResponse 持久化。

## sourceType 迁移注意事项

`ChatSourceTypeEnum.helperBot` 改为 `ChatSourceTypeEnum.chatAgentHelper` 会影响多个边界：

- chat 三表查询与写入。
- chat file S3 key 授权。
- resume key。
- sandbox id/runtime guard 中对 helper source 的禁止逻辑。
- OpenAPI schema 与前端 `ChatSourceTarget`。
- 前端 `streamFetch` 的 resume header 白名单、resume query 拼接、SSE event 类型解析。
- `SseResponseEventEnum.topAgentConfig` 需要改名或新增 `chatAgentConfig`。
- 旧聊天记录读取。

建议实现策略：

1. 新代码只写入 `chatAgentHelper`。
2. 旧 `helperBot` enum 不再作为新 API 对外暴露。
3. 是否兼容历史数据需要产品确认：
   - 如果历史辅助配置对话可丢弃：直接不兼容旧 `helperBot` 记录。
   - 如果需要保留历史：查询层短期同时读取 `helperBot/chatAgentHelper`，保存层只写 `chatAgentHelper`，并提供一次性数据迁移。
4. S3 key 如果包含 `helperBot` 路径，也需要决定是否兼容旧文件预览；新上传统一写 `chatAgentHelper`。

## 进一步风险与处理

### 1. streamFetch 余额错误不会自动走 axios 拦截器

普通 `GET/POST` 请求已经会把 `TeamErrEnum.aiPointsNotEnough` 映射到充值弹窗，但辅助生成走 `streamFetch`。因此新 stream error 必须满足：

- 服务端 SSE error payload 或非 200 JSON payload 中保留 `statusText=TeamErrEnum.aiPointsNotEnough`。
- `streamFetch` 在 `SseResponseEventEnum.error` 和 `onopen(!ok)` 两条路径都识别该 statusText，并调用 `setNotSufficientModalType`。
- 如果 stream 已经创建且本轮 chat round 已 prepared，余额错误应写失败态，不写 AI 正文。

### 2. 断流恢复需要从旧 chat stream 白名单里接入

当前 `streamFetch` 只给旧 helper route 加 resume header，`streamResumeFetch` 也只识别 `sourceType=helperBot`。迁移时需要：

- 新 URL `/api/proApi/core/chat/chatAgentHelper/completions` 加入 resume header 白名单。
- resume query 支持 `sourceType=chatAgentHelper`。
- 旧 `helperBot` 是否可 resume 取决于历史兼容策略。
- resume 服务端实现使用辅助生成自己的 stream resume，不从 workflow stream context 引入。

### 3. 配置事件需要保留前端应用时序

旧链路收到 `topAgentConfig` 后立即 `onApply(formData)`。新事件 `chatAgentConfig` 需要保证：

- 配置事件先于最终 `[DONE]`。
- 配置事件不进入普通 answer 打字队列。
- generation 阶段保存的 AI 消息与前端已应用配置一致。

### 4. interactive 续写不能退化

Chat Agent 辅助配置 collection 阶段会生成表单，用户提交后不是普通新一轮问答，而是要回填上一条 AI 消息里的 interactive 表单并 append 新响应。新的 session runner 必须显式支持：

- `preparedRound.shouldFinalizePreparedRound=false` 的续写路径。
- 根据 `responseChatItemId` 找到旧 AI item。
- 表单提交态回填。
- 新 AI response append 到同一条 AI item。

### 5. nodeResponse 可以不作为第一阶段目标

旧链路通过 workflow 获得 nodeResponse writer，但 Chat Agent 辅助配置 UI 目前不展示运行节点明细。新设计不再提供 workflow nodeResponse。第一阶段建议：

- 保留 usage item。
- 保留 chatGenerateStatus、stream resume、错误状态。
- 不持久化 workflow nodeResponse 明细，也不构造伪 nodeResponse。

如果后续需要“辅助生成运行详情”，应设计独立 `auxiliary_generation_steps` 或轻量 metadata，不要重新依赖 workflow nodeResponse。

## Skill 辅助生成预留流程

未来 Skill Detail 左侧聊天可按意图拆分：

```txt
用户普通调试当前 Skill
  -> 继续走 skill/debugChat
  -> workflowStart -> agent

用户请求创建/修改 Skill 文件
  -> 走 skill/assist 或 skill/debugChat 内部路由到辅助生成
  -> runAuxiliaryGeneration(skillEditSceneAdapter, skillCreatorProcessor)
```

推荐先新增独立 API：

```txt
POST /proApi/core/ai/skill/assist
```

原因：

- 避免一开始在 `skill/debugChat` 里做复杂意图识别。
- 便于单独控制权限、限频、VM 注入和保存行为。
- 前端可以先用显式入口或按钮接入，等稳定后再融合到原聊天框。

后续再考虑自动路由：

- 用户输入命中“创建/修改 Skill 文件”意图，前端或服务端转辅助生成。
- 其他输入继续走 Skill Debug。

## 模块边界

### packages/global

放共享枚举和 schema：

- `AuxiliaryGenerationSceneEnum`
- 通用 stream event type。
- 前端需要识别的辅助生成事件类型。

不放服务端鉴权、VM、usage 实现。

### packages/service

放通用服务端能力：

- `runAuxiliaryGeneration`
- `createAuxiliaryGenerationUsageManager`
- `createAuxiliaryGenerationStreamContext`
- `runAuxiliaryAgentLoop`
- 辅助生成通用错误与事件 payload。

不能引用 Pro 目录。

### pro/admin

放具体场景和 processor：

- `chatAgentHelper/service.ts`
- `chatAgentHelper/processor.ts`
- 未来 `skillAssist/service.ts`
- 未来 `skillAssist/runtime.ts`
- 未来 `skillAssist/tools.ts`
- 官方 system skill 源码和注入列表。

## 迁移步骤

### 阶段 1：建立辅助生成基础设施

- 新增 `AuxiliaryGenerationEventEnum`、stream payload、interactive payload。
- 新增辅助生成专用 SSE stream context。
- 新增 `AuxiliaryGenerationUsageManager`。
- 新增 `runAuxiliaryGeneration` 生命周期编排。
- 新增 `runAuxiliaryAgentLoop`。
- 单测覆盖：
  - stream answer/reasoning/config/interactive/error/done 事件。
  - stream error 中 `TeamErrEnum.aiPointsNotEnough` payload。
  - usage 创建、push、flush。
  - session 成功/失败/abort 生命周期。
  - runtime tools 为空时不会执行工具。
  - updatePlan 可用。
  - reasoning SSE 正常透传。
  - JSON parse repair 成功/失败。

### 阶段 2：迁移 Chat Agent 辅助配置

- 新增 `/proApi/core/chat/chatAgentHelper/completions`。
- 新增 `ChatSourceTypeEnum.chatAgentHelper`。
- 新增 `chatAgentHelperSceneAdapter`。
- `chatAgentConfigAssistantProcessor` 改用 `runAuxiliaryAgentLoop`。
- 新 route 直接调用 `runAuxiliaryGeneration`，不再经过 workflow。
- 前端 `streamFetch` 支持辅助生成事件和余额错误。
- 对比旧行为：
  - chat 记录一致。
  - usage item 一致。
  - Chat Agent 配置事件一致。
  - interactive 提交和 append 一致。

### 阶段 3：清理旧命名和旧入口

- 删除或废弃 `/proApi/core/chat/helperBot/completions`。
- 删除 Chat Agent 辅助配置中的 `internalRuntimeNode` 构造代码。
- 删除旧 `topAgentConfig` 事件，或保留前端兼容分支一个版本周期。
- 删除新代码中的 HelperBot/TopAgent 命名。
- 按确认结果处理旧 `helperBot` chat/source/S3 数据兼容。

### 阶段 4：Skill 辅助生成接入

本轮不执行。这里只保留未来方向：

- 新增 Skill assist scene adapter。
- Runtime manager 激活 Skill edit sandbox。
- 注入官方 `skill-creator`。
- Processor 注册文件读写/测试 runtime tools。
- 前端 Skill Detail 接入辅助生成入口。

### 阶段 5：命名清理

- 新代码不再使用 HelperBot/TopAgent 命名。
- 服务端核心能力统一迁移到 `auxiliaryGeneration`。
- 删除 Chat Agent 辅助配置链路中的 `workflowResponseWrite` 类型引用，统一改为辅助生成 stream writer。

## 测试计划

### 单元测试

- `runAuxiliaryAgentLoop`
  - 无 runtime tools。
  - 有 runtime tools。
  - usageSink 汇总。
  - reasoning/answer event 映射。
  - JSON schema parse + repair。
  - abort/stopping。

- `AuxiliaryGenerationUsageManager`
  - 余额不足。
  - 创建 usage。
  - push 多次 usage item。
  - flush 汇总。

- `runAuxiliaryGeneration`
  - 成功生命周期调用顺序。
  - processor 抛错后 failChatRound。
  - stream 创建前抛错。
  - stream 创建后抛错。
  - prepared round 之前抛错不写失败记录。

- `chatAgentHelperSceneAdapter`
  - chat 权限校验。
  - interactive append 保存。
  - 文件 key 授权。

### 集成测试

- Chat Agent 辅助配置 collection 阶段返回 interactive。
- Chat Agent 辅助配置 generation 阶段返回配置事件并保存 AI 消息。
- Chat Agent 辅助配置 usage 写入与旧链路一致。
- Chat Agent 辅助配置余额不足时返回 `TeamErrEnum.aiPointsNotEnough`，前端触发余额弹窗。
- Chat Agent 辅助配置断流 resume 行为不退化。

### 后续 Skill 测试

- Skill assist 能激活 edit sandbox。
- system skill 注入幂等。
- 文件修改后右侧文件树可刷新。
- 发布版本不包含 system skill。

## 待确认问题

1. `helperBot` 历史聊天和旧 S3 文件是否需要兼容读取？如果不需要，迁移会简单很多。
2. Chat Agent 辅助配置 usage 的 `appName` 是否确认写真实 App 名称，`moduleName` 写 `Chat Agent helper`？
3. 新 SSE 事件名是否定为 `chatAgentConfig`？
4. 新 API 是否定为 `/proApi/core/chat/chatAgentHelper/completions`，旧 `/helperBot/completions` 是否保留一个版本周期？
5. 辅助生成是否需要保留 nodeResponse 明细展示？如果不需要，usage 和运行详情可以明显简化。
6. Skill 辅助生成的 API、sourceType、system skill 注入范围作为后续议题，本轮不迁移。

## TODO

- [ ] 确认待确认问题。
- [ ] 编写 `runAuxiliaryAgentLoop` 详细开发文档。
- [ ] 编写 `runAuxiliaryGeneration` 生命周期开发文档。
- [ ] 实现阶段 1：Chat Agent 配置生成 processor 迁移到统一 loop runner。
- [ ] 实现阶段 2：落地独立 usage/stream/session runner，并迁移 Chat Agent 辅助配置 route。
- [ ] 实现阶段 3：Chat Agent 辅助配置 completions 移除 workflow internal node。
- [ ] 补齐 Chat Agent 辅助配置行为回归测试。
- [ ] 设计 Skill assist API 和 Skill edit runtime 注入细节。

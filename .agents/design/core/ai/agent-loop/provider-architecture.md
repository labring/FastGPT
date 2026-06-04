# Agent Loop Provider 架构设计

状态：实现同步版  
日期：2026-06-04

## 背景与目标

改造前 Agent 节点存在两条实现路径：fastAgent 前身使用 `runUnifiedAgentLoop`，piAgent 前身在 workflow 层有独立 adapter。分散入口会导致 workflow agent 同时理解两套 agent loop 的输入、事件、运行详情、memory 和工具适配逻辑，后续接入新的 agent loop provider 时会继续增加业务层分支。

本设计将 `packages/service/core/ai/llm/agentLoop` 定义为 FastGPT Agent 的顶层统一入口。业务层只调用新的 `runAgentLoop`，通过 provider 选择 `fastAgent` 或 `piAgent`。workflow agent 只适配统一的 Agent Loop 标准，不再分别适配 fastAgent 和 piAgent。

核心目标：

- `agentLoop` 根目录只承载统一入口、标准协议和 provider 注册。
- 当前 unified loop 改名为 `fastAgent`，其 `base`、`prompt`、`stop` 等 loop 实现属于 provider 内部；plan/ask/sandbox/readFile 工具协议统一迁入 `systemTools`。
- `piAgent` 接入同一套标准输入、标准事件、标准结果和内置工具。
- `plan`、`ask`、sandbox、readFile 工具作为 provider 内部可挂载的内置工具统一放入 `systemTools`，本轮 fastAgent 与 piAgent 都支持注入和执行。
- skills 不进入 agent-loop 标准协议；workflow 在进入 agent-loop 前把 skills 转成消息上下文或 sandbox 背景能力。
- workflow 层只保存和恢复统一 `providerState`，不理解 provider 内部状态结构。

## 迁移原则

本次改造优先做结构迁移和接口适配，避免重写已经验证过的实现逻辑。

- 先搬迁再改名：现有 unified loop 代码应尽量原样迁移到 `providers/fastAgent`，再做必要的导出命名调整。
- 先抽公共协议再薄适配：`type/` 和 `providers/` 只定义外层契约，不把 provider 内部实现重写成新框架。
- 复用现有 reducer、parser、tool schema：plan/ask/sandbox/readFile 迁入 `systemTools/` 时以移动文件和补充能力为主，避免重写状态机。
- 复用现有 piAgent bridge：模型桥接迁到 `providers/piAgent/modelBridge.ts`，tool/runtime event 适配当前集中在 `providers/piAgent/index.ts`，只补标准事件、providerState 和 internal tools 适配，后续再按复杂度拆分。
- workflow adapter 只收敛重复分支：保留现有 userContext、sandbox、subapps、工具执行、SSE、nodeResponse 的成熟逻辑，通过标准 `AgentLoopRuntime` 包一层。
- 每一步迁移后运行对应局部测试，确认行为等价，再继续做下一层抽离。

## 当前实现状态

- `packages/service/core/ai/llm/agentLoop/run.ts` 是顶层唯一执行入口；业务层只调用 `runAgentLoop({ provider, input, runtime })`。
- `providers/registry.ts` 只接受新 provider 名称 `fastAgent` / `piAgent`。`provider` 缺省时使用 `fastAgent`，未知 provider 直接抛错，不兼容 `default`、`pi` 等旧别名。
- `ProviderCapabilities` 和 runtime `capabilities` 已删除。本轮是否启用 plan/ask/sandbox/readFile 只看 `runtime.systemTools`。
- workflow Agent 节点已收敛到统一 adapter；`AGENT_ENGINE` 只映射为 `fastAgent` 或 `piAgent`。
- ToolCall 节点也调用统一 `runAgentLoop`，当前固定使用 `fastAgent` provider，`promptMode='raw'`，plan/ask 禁用，sandbox/readFile 按 `systemTools` 可选注入。
- 业务 runtime tools 只通过 `runtime.toolCatalog.runtimeTools` 注入；plan/ask/sandbox/readFile 不再由业务层手动塞入 runtime tools。
- sandbox 执行只接收业务层提前初始化好的 `SandboxClient`。`SandboxClient` 通过 `getContext()` 暴露构建时的 `appId/userId/chatId`，`runSandboxTools` 不再自行根据这些字段获取或创建 client。
- `lang` 是 `AgentLoopRuntime` 顶层运行上下文，不挂在 sandbox internal tool 上。
- usage push 由 provider 在产生 usage 的地方调用 `runtime.usagePush(usages)`；event 上的 `usages` 只用于运行详情和节点响应展示，不作为业务计费 push 的来源。
- piAgent 仍保留迁移期 `piMessages-${nodeId}` raw memory 兼容；统一 memory 不把完整 raw transcript 作为长期标准。

## 目标目录结构

```txt
packages/service/core/ai/llm/agentLoop/
  constants.ts
  index.ts
  run.ts

  type/
    index.ts
    provider.ts
    input.ts
    result.ts
    runtime.ts
    tool.ts
    event.ts
    interactive.ts

  systemTools/
    index.ts
    plan/
      index.ts
      updateTool.ts
      requirePlan.ts
      state.ts
      reviser.ts
    ask/
      index.ts
      tool.ts
      parser.ts
    sandbox/
      index.ts
    readFile/
      index.ts

  providers/
    index.ts
    type.ts
    registry.ts
    fastAgent/
      index.ts
      loop/
        index.ts
        base.ts
        message.ts
        type.ts
      prompt/
      stop/
      tools/
    piAgent/
      index.ts
      modelBridge.ts
```

说明：

- `index.ts` 是唯一公开执行入口，导出 `runAgentLoop` 和标准类型。
- 根 `index.ts` 不整包 re-export `providers/`，避免业务层从统一入口旁路拿到 `runFastAgentLoop`、`runPiAgentLoop` 等 provider 内部实现。
- `type/` 定义跨 provider 的输入、输出、事件和业务 runtime tool 协议。
- `systemTools/` 定义 provider 内部可复用的内置工具协议和纯状态逻辑，不暴露给业务 runtime。
- `providers/` 放具体实现。provider 内部可以有自己的 loop、prompt、stop gate、SDK bridge 和工具适配。
- 不保留旧的 `agentLoop/loop`、`agentLoop/plan`、`agentLoop/stop`、`agentLoop/tools` 根目录 re-export；调用方必须使用新的顶层标准入口或 provider 内部路径。

## 标准接口

`type/` 负责定义跨 provider 的稳定协议。标准接口必须覆盖一轮 agent loop 的完整生命周期：输入、模型请求、流式输出、思考输出、工具调用、工具结果压缩、上下文压缩、内置工具、停止/中断、usage/requestId 和最终结果。

```ts
type AgentLoopProviderName = 'fastAgent' | 'piAgent';

type AgentLoopInput<TChildrenResponse = unknown> = {
  messages: ChatCompletionMessageParam[];
  systemPrompt?: string;
  activePlan?: AgentPlanType;
  providerState?: unknown;
  userAnswer?: string;
  childrenInteractiveParams?: AgentLoopChildrenInteractiveParams<TChildrenResponse>;
};

type AgentLoopResult<TChildrenResponse = unknown> = {
  status: 'done' | 'ask' | 'aborted' | 'error';
  answerText?: string;
  reasoningText?: string;
  activePlan?: AgentPlanType;
  providerState?: unknown;
  ask?: AgentAskPayload;
  completeMessages?: ChatCompletionMessageParam[];
  assistantMessages?: ChatCompletionMessageParam[];
  assistantResponses?: AIChatItemValueItemType[];
  interactiveResponse?: AgentLoopToolChildrenInteractive<TChildrenResponse>;
  requestIds: string[];
  contextCheckpoint?: ContextCheckpointValueType;
  finishReason?: CompletionFinishReason;
  usage?: {
    inputTokens: number;
    outputTokens: number;
    llmTotalPoints: number;
  };
  error?: unknown;
};
```

标准消息约束：

- Agent Loop 标准层统一使用 `ChatCompletionMessageParam[]` 作为输入和恢复后的上下文输出。
- workflow adapter 负责把 ChatItem[] / assistantResponses / interactive answer 等业务聊天结构通过 `chats2GPTMessages` 转成 GPT messages。
- provider 不直接读取 ChatItem，也不依赖 workflow chat record 结构。
- fastAgent 直接消费 GPT messages。
- 其他 provider 如果内部使用私有消息结构，应在 provider 内部完成 GPT messages 与私有消息格式的转换。
- `childrenInteractiveParams` 只用于业务 runtime tool 的子工作流交互恢复，不用于 `ask_user`。`ask_user` 通过 `userAnswer` 和 `providerState` 恢复。

### Runtime

`AgentLoopRuntime` 是 provider 与业务层之间的执行契约。provider 不直接依赖 workflow props，只通过 runtime 调用业务工具、读取本轮启用的内置工具配置、上报 usage 和标准事件。本轮是否启用 plan/ask/sandbox/readFile 统一看 `runtime.systemTools`，不再使用 runtime `capabilities`。

```ts
type AgentLoopLLMParams = {
  model: string;
  promptMode?: 'fastAgent' | 'raw';
  reasoningEffort?: ReasoningEffort;
  userKey?: OpenaiAccountType;
  stream?: boolean;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  stop?: string;
  responseFormat?: ChatCompletionCreateParams['response_format'];
  useVision?: boolean;
  useAudio?: boolean;
  useVideo?: boolean;
  extractFiles?: boolean;
};

type AgentLoopResponseParams = {
  retainDatasetCite?: boolean;
};

type AgentLoopRuntime = {
  llmParams: AgentLoopLLMParams;
  responseParams?: AgentLoopResponseParams;
  lang?: localeType;
  systemTools?: AgentLoopSystemTools;

  maxRunAgentTimes?: number;
  maxStopGateRejections?: number;
  checkIsStopping?: () => boolean;

  toolCatalog: AgentLoopToolCatalog;
  executeTool: (params: AgentLoopToolExecuteParams) => Promise<AgentLoopToolExecutionResult>;
  executeInteractiveTool?: (
    params: AgentLoopChildrenInteractiveParams
  ) => Promise<AgentLoopToolExecutionResult>;
  usagePush?: (usages: ChatNodeUsageType[]) => void;
  emitEvent?: (event: AgentLoopEvent) => void;
};

type AgentLoopSystemTools = {
  plan?: {
    enabled: boolean;
  };
  ask?: {
    enabled: boolean;
  };
  sandbox?: {
    enabled: boolean;
    client: SandboxClient;
  };
  readFile?: {
    enabled: boolean;
    execute: AgentLoopReadFileExecutor;
  };
};
```

约束：

- `llmParams` 只承载基础模型请求参数，provider 内部可以据此组装 OpenAI、pi-agent-core 或其他 SDK 的模型请求。
- `llmParams` 包含模型采样和请求形态参数，例如 `temperature`、`maxTokens`、`topP`、`stop`、`responseFormat`，但不包含 workflow-only 字段。
- `requestOrigin` 只用于 workflow adapter 在进入 agent-loop 前做文件 URL / request message 归一化，不进入 `AgentLoopRuntime`，provider 也不应把它写入模型 SDK payload。
- `responseParams` 承载 provider 返回前的响应后处理参数，例如 `retainDatasetCite`。它不是 LLM 请求参数，provider 可以在最终 `answerText` / `reasoningText` 返回前使用。
- `lang` 是本轮 agent-loop 的通用运行语言上下文，用于内置工具展示名、运行详情和工具内部本地化处理；它不属于某个特定 internal tool。
- `systemTools` 由业务层/adapter 按本轮节点配置、权限和初始化结果传入，表示本轮启用哪些内置工具。字段缺失或 `enabled=false` 都视为不启用。
- provider 不能把 plan/ask/sandbox/readFile 的本轮启用状态写成固定常量；同一个 provider 在不同业务入口可以启用不同内置工具组合。
- `sandbox.client` 是 sandbox 执行客户端。业务层负责提前初始化 client；client 通过自身上下文暴露构建时使用的 `appId/userId/chatId`，agent-loop 协议不再单独携带这些字段。sandbox tool 执行层只接收已初始化的 `SandboxClient`，不再通过 `appId/userId/chatId` 自行获取或创建 sandbox。
- `readFile.execute` 由 adapter 通过闭包提供，内部可以持有 `filesMap`、teamId、tmbId、customPdfParse 等 workflow 私有上下文；agent-loop 不直接理解这些业务结构。
- loop 控制参数、工具目录和事件回调仍留在 `AgentLoopRuntime` 顶层，避免把执行环境和 LLM 请求参数混在一起。
- 工具并发/批量调度参数归属 `toolCatalog`，因为它描述 runtime tools 应如何被 provider 调度执行。
- skills 不属于 `AgentLoopRuntime`。它们只影响进入 agent-loop 前的 messages、sandbox 初始化或 provider 外部背景，不像 internal tools 一样影响模型可见 tools。

### Tool Catalog

`AgentLoopToolCatalog` 描述业务 runtime tools 及其调度参数。协议层注入工具时不携带 plan/ask/sandbox/readFile 这类内置工具；provider 在组装模型可见工具列表时，根据 `runtime.systemTools` 按需追加内部 internal tools。

```ts
type AgentLoopToolCatalog = {
  runtimeTools: ChatCompletionTool[];
  batchToolSize?: number;
};

type AgentLoopToolExecuteParams = {
  call: ChatCompletionMessageToolCall;
  messages: ChatCompletionMessageParam[];
};

type AgentLoopToolExecutionResult = {
  response: string;
  assistantMessages: ChatCompletionMessageParam[];
  usages: ChatNodeUsageType[];
  interactive?: unknown;
  stop?: boolean;
  skipResponseCompress?: boolean;
};

type AgentLoopReadFileExecutionResult = {
  response: string;
  usages: ChatNodeUsageType[];
  nodeResponse?: ChatHistoryItemResType;
  error?: unknown;
};
```

约束：

- 协议层只向 provider 传入业务 `runtimeTools`，不能把 internal tools 混入 `runtime.toolCatalog`。
- internal tool 的 function name 必须使用各自模型可见原始名称：`update_plan`、`ask_user`、`read_files` 和 `sandbox_*`，避免出现两套名字。
- provider 在向模型提交工具前，按需把自身内部挂载的 internal tools 追加到 `runtimeTools` 后，再过滤 runtime tools 中与已知 internal tools 同名的项。
- provider 在执行工具前判断工具名：命中已知 internal tool registry 时由 provider 内部消费；否则才调用 `runtime.executeTool`。
- 协议层不按名称前缀拦截任意 runtime tool；只拦截当前 provider 已注册的已知 internal tools。这样既避免内置工具冲突，也不会误伤历史或外部业务工具。
- `runtime.executeTool` 只接收业务 runtime tools。
- sandbox/readFile internal tools 命中后由 provider 使用 `runtime.systemTools.sandbox.client` 或 `runtime.systemTools.readFile.execute` 执行，不进入 `runtime.executeTool`。
- `batchToolSize` 只约束业务 runtime tools 的批量执行，不影响 plan/ask/sandbox/readFile 这类 internal tools。
- 标准 `tool_*` 生命周期事件只覆盖业务 runtime tools；plan/ask/sandbox/readFile 通过专门的语义事件暴露。
- `executeInteractiveTool` 只处理业务 runtime tool 的 children interactive resume。provider 看到 `childrenInteractiveParams` 时应优先恢复对应业务工具，再决定是否继续模型循环。

### Event

`AgentLoopEvent` 是跨 provider 的运行时观察协议。workflow adapter 只能消费标准事件，不直接消费 provider 内部 SDK 事件。事件用于流式输出、运行详情、usage 透传和 assistantResponses 构建；最终数据库保存仍以 workflow dispatch 返回的 `assistantResponses` 为准。

```ts
type AgentLoopUsage = ChatNodeUsageType;

type AgentLoopEvent =
  | {
      type: 'llm_request_start';
      requestIndex: number;
      modelName: string;
    }
  | {
      type: 'llm_request_end';
      requestIndex: number;
      modelName: string;
      requestId: string;
      finishReason?: CompletionFinishReason;
      answerText?: string;
      reasoningText?: string;
      toolCalls?: ChatCompletionMessageToolCall[];
      usages?: AgentLoopUsage[];
      seconds: number;
      error?: unknown;
    }
  | {
      type: 'reasoning_delta';
      text: string;
    }
  | {
      type: 'answer_delta';
      text: string;
    }
  | {
      type: 'tool_call';
      call: ChatCompletionMessageToolCall;
    }
  | {
      type: 'tool_params';
      callId: string;
      argsDelta: string;
    }
  | {
      type: 'tool_run_start';
      call: ChatCompletionMessageToolCall;
    }
  | {
      type: 'tool_run_end';
      call: ChatCompletionMessageToolCall;
      rawResponse: string;
      response: string;
      errorMessage?: string;
      seconds: number;
      usages?: AgentLoopUsage[];
      toolResponseCompress?: AgentLoopToolResponseCompress;
    }
  | {
      type: 'after_message_compress';
      usages?: AgentLoopUsage[];
      requestIds: string[];
      seconds: number;
      contextCheckpoint?: ContextCheckpointValueType;
    }
  | {
      type: 'plan_status';
      status: 'generating' | 'updating';
    }
  | {
      type: 'plan_update';
      plan: AgentPlanType;
    }
  | {
      type: 'plan_operation';
      operation: 'set_plan' | 'update_step' | 'append_step' | 'delete_step' | 'replace_plan';
      success: boolean;
      message: string;
      id?: string;
      params?: string;
      seconds?: number;
      plan?: AgentPlanType;
      error?: unknown;
    }
  | {
      type: 'ask_start';
      ask: AgentAskPayload;
      id?: string;
      params?: string;
      seconds?: number;
    }
  | {
      type: 'ask';
      ask: AgentAskPayload;
      providerState?: unknown;
    }
  | {
      type: 'ask_resume';
      answer: string;
    }
  | {
      type: 'sandbox_run_start';
      id: string;
      name: string;
      toolName: string;
      params?: unknown;
    }
  | {
      type: 'sandbox_run_end';
      id: string;
      name: string;
      toolName: string;
      params?: unknown;
      response?: unknown;
      usages?: AgentLoopUsage[];
      seconds: number;
      error?: unknown;
      nodeResponse?: ChatHistoryItemResType;
    }
  | {
      type: 'file_read_start';
      id: string;
      name: string;
      toolName: string;
      params?: unknown;
    }
  | {
      type: 'file_read_end';
      id: string;
      name: string;
      toolName: string;
      params?: unknown;
      response?: string;
      usages?: AgentLoopUsage[];
      seconds: number;
      error?: unknown;
      nodeResponse?: ChatHistoryItemResType;
    }
  | {
      type: 'assistant_push';
      value: AIChatItemValueItemType;
    };

type AgentLoopToolResponseCompress = {
  response: string;
  usage: AgentLoopUsage;
  requestIds: string[];
  seconds: number;
};
```

事件 usage 约束：

- 协议层统一使用 `AgentLoopUsage = ChatNodeUsageType`，事件只携带 usage 明细，不直接做业务计费 push。
- 任意事件只要需要把该阶段 usage 暴露给运行详情或节点响应，都统一携带 `usages?: AgentLoopUsage[]`；即使只有一条 usage，也放入数组。
- `AgentLoopEvent` 顶层不再携带单数 `usage`，避免 event 既作为展示协议又作为计费来源。
- `toolResponseCompress.usage` 保留单数，因为它是 `tool_run_end` 内的压缩子调用详情，不是事件顶层 usage 字段。
- provider 负责在 agent-loop 内部计算模型调用 totalPoints，并把完整 `ChatNodeUsageType` 放入事件的 `usages` 供 workflow adapter 生成运行详情；workflow adapter 不重新计算模型调用 totalPoints。
- usage push 不再从事件反推。provider 在产生 usage 的地方主动调用 `runtime.usagePush(usages)`，业务层只在 runtime 边界提供这个回调。
- 协议层只保留 `normalizeAgentLoopUsages(usages)` 用于调用 `runtime.usagePush` 前过滤空值，避免 `after_message_compress`、`tool_run_end`、`sandbox_run_end` 等路径重复或遗漏。
- provider 不直接执行业务计费，也不直接写 workflow usage 结果。

### Plan / Ask 事件语义

这些事件是协议层提供的语义事件。是否触发、何时触发、触发几次由 provider 决定；workflow adapter 只按事件含义做展示、持久化和恢复适配。

| 事件 | 含义 | 典型触发时机 | workflow adapter 行为 |
| --- | --- | --- | --- |
| `plan_status` | 计划处于生成或更新中的过程状态，不代表 plan 已经改变。 | provider 准备执行 `update_plan` 前，或已经识别到模型将要创建/更新计划时。 | 显示 plan loading / updating 状态；不写入新的 plan 内容。 |
| `plan_operation` | 一次 plan operation 的执行结果记录，描述执行了什么 operation、是否成功、返回给模型的摘要或错误。 | provider 执行 `set_plan`、`update_step`、`append_step`、`delete_step`、`replace_plan` 后。 | 可写入运行详情或调试记录；失败时可展示错误或保留诊断信息；不直接替代 `plan_update`。 |
| `plan_update` | activePlan 的最新快照，表示可展示和可持久化的 plan 内容已经更新。 | plan reducer 成功产出新 activePlan 后。 | upsert plan card，写入 assistantResponses，供刷新恢复使用。 |
| `ask_start` | provider 已准备发起追问的过程事件，不代表本轮已经暂停。 | provider 解析出有效 ask payload 后、返回 ask 结果前。 | 可显示追问准备状态或写入调试记录；不创建最终 interactive。 |
| `ask` | 本轮 agent loop 进入等待用户输入状态的语义事件。 | provider 决定暂停并等待用户回答时；通常与 `AgentLoopResult.status = 'ask'` 对应。 | 创建/更新 interactive ask，保存 pending `providerState`，等待用户回答。最终以 result 为准。 |
| `ask_resume` | provider 使用用户回答恢复上一轮 ask pending 状态。 | workflow 把 `userAnswer` 和 `providerState` 传回 provider 后。 | 可记录恢复链路；通常不创建新的 interactive。 |

### Assistant Push 事件语义

`assistant_push` 是 provider 追加结构化 assistant value 的通用事件。它不直接写数据库，只要求 workflow adapter 把 `value` 追加到本轮 `assistantResponses` 结果构建器；最终是否保存仍由 workflow 返回的 `assistantResponses` 决定。provider 也可以在 `AgentLoopResult.assistantResponses` 中返回最终 assistant values，workflow adapter 负责把事件构建出的 values 与 result values 合并成唯一的最终保存结果。

stop gate 不需要独立事件类型。provider 通过 `assistant_push` 推入带 `agentStopGate` 的 assistant value，用于保存 provider 注入给模型的隐藏 synthetic user feedback。它在 LLM messages 中恢复为 `role: user`，用于 provider 内部存在本地 stop gate、retry gate 或完成度校验时，把“不能结束、需要继续修正”的反馈写回模型上下文。

`<stop_gate_feedback>` 只允许作为 `feedback` 文本中的 prompt tag 出现，不是 `AgentLoopEvent.type`。

`value.agentStopGate` 字段含义：

- `id`：本次 stop gate 控制记录 id。
- `reason`：provider 拒绝结束的结构化原因，例如 plan 未完成、工具结果未记录、blocked step 缺少 blocker。
- `feedback`：provider 注入回模型上下文的反馈文本，用于让模型继续修正或执行。

fastAgent 可使用 `assistant_push` 追加带 `agentStopGate` 的 value；piAgent 如果没有等价的本地 stop/retry gate，可以不触发。保留这类 assistant value 的原因是 workflow adapter 和 chat record 需要恢复 provider 注入给模型的隐藏 feedback，保证刷新、继续对话或 ask resume 后的 LLM messages 与运行时上下文一致。

存储与恢复形态：

```txt
assistantResponses:
  - text/reasoning draft        # 如果已经通过 SSE 可见
  - agentStopGate { feedback }  # 隐藏控制 value，不是用户真实输入
  - text/reasoning final

chats2GPTMessages replay:
  - assistant(draft)
  - user(<stop_gate_feedback>...)
  - assistant(final)
```

触发时机：

- 模型本轮没有继续调用工具，准备输出 final answer。
- provider 内部 stop gate 检查发现任务还不能结束，例如 activePlan 未完成、刚调用过 runtime tool 但还没写回 plan、blocked step 缺少 blocker。
- provider 把一条隐藏 synthetic user message 注入回模型上下文，让模型继续执行或修正计划。
- provider 同时发 `assistant_push`，追加带 `agentStopGate` 的 value，只记录这次“拒绝结束”的原因和反馈文本。

客户端处理：

- 不作为普通用户可见消息展示。
- 在 chat 记录中可存为 assistant response 的控制字段，例如 `assistantResponses[].agentStopGate`。
- 刷新恢复成 LLM messages 时，再还原为一条隐藏 user message。
- 可以进入运行详情或调试信息，用于解释为什么模型继续执行。
- 如果产品暂时不展示运行详情中的 stop gate 记录，也可以只持久化，不在主聊天流渲染。
- 被 stop gate 打回的 assistant draft 如果已经通过 `answer_delta` / `reasoning_delta` 让客户端可见，就应作为普通 assistant response 进入 `assistantResponses`，按正常可见内容展示和恢复；`agentStopGate` 不再重复保存这段 draft。

### 生命周期事件约束

模型请求：

- 每次真实 LLM 请求开始前必须发 `llm_request_start`。
- 每次真实 LLM 请求结束后必须发 `llm_request_end`，包含 requestId、tokens、finishReason、耗时和错误信息。
- provider 内部 SDK 如果只能在 request end 拿到 usage，也必须补齐 request start/end 事件。
- LLM 请求 usage 必须写入 `llm_request_end.usages`，并由 provider 补齐 `moduleName`、`model`、`inputTokens`、`outputTokens`、`totalPoints`；同时 provider 必须主动调用 `runtime.usagePush`。

流式输出：

- 可见回答增量统一发 `answer_delta`。
- thinking/reasoning 增量统一发 `reasoning_delta`。
- 即使 provider 内部叫 thinking、reasoning、thought，也必须映射为 `reasoning_delta`。
- 所有通过 SSE 让客户端可见的 `answer_delta` / `reasoning_delta`，都必须同步进入可持久化的 `assistantResponses`，刷新后按同样内容和顺序恢复。
- 如果 provider 同时在 result 中返回 `answerText` / `reasoningText`，workflow adapter 必须避免把已经由 delta 累积过的内容重复追加到 `assistantResponses`。
- stop gate 后续拒绝的草稿如果已经流式可见，也按普通 assistant 输出持久化；stop gate 的隐藏 feedback 单独由 `assistant_push` 推入的 `agentStopGate` value 持久化。

工具调用前：

- provider 识别到模型工具调用后，先在内部判断工具名是否命中 internal tool registry。
- 命中 internal tool 时，provider 内部执行，并可发出对应语义事件，例如 `plan_status`、`plan_operation`、`plan_update`、`ask_start`、`ask`、`ask_resume`、`sandbox_run_start`、`sandbox_run_end`、`file_read_start`、`file_read_end`，不要求发标准 `tool_*` 事件。
- 未命中 internal tool 时，视为业务 runtime tool，必须先发 `tool_call`。
- 业务工具参数流式生成时必须发 `tool_params`；如果 provider 只能拿到完整参数，也应发送一次完整参数。

工具运行：

- runtime tools 由 `runtime.executeTool` 执行。
- plan/ask/sandbox/readFile internal tools 由 provider 在调用 `runtime.executeTool` 前拦截执行。
- provider 真正开始执行业务 runtime tool 前必须发 `tool_run_start`。
- provider 拿到业务 runtime tool 原始结果，并完成压缩或确认跳过压缩后，必须发 `tool_run_end`。
- `tool_run_end.rawResponse` 是压缩前的工具结果，`tool_run_end.response` 是最终回灌给模型的工具结果，可能是原始结果，也可能是压缩结果。
- provider 可按自身能力并发 runtime tools，但必须保持 tool response 回灌顺序稳定。
- 工具运行和压缩产生的 usage 必须统一写入 `tool_run_end.usages`。
- 如果工具结果经过压缩，`tool_run_end.toolResponseCompress` 必须包含压缩文本、usage、requestIds 和耗时。
- `tool_run_end` 不用于 plan/ask/sandbox/readFile internal tools，避免内置工具专属事件与普通工具事件重复。
- `skipResponseCompress` 表示该工具结果禁止压缩，provider 必须尊重。

上下文压缩：

- provider 执行 message/context compress 后必须发 `after_message_compress`。
- 如果压缩产生 context checkpoint，必须通过 `contextCheckpoint` 返回并进入最终 result。
- 压缩产生的 usage 和 requestIds 必须写入 `after_message_compress.usages` 和 `requestIds`；同时 provider 必须主动调用 `runtime.usagePush`。

plan：

- 协议层提供 `plan_status`、`plan_operation`、`plan_update` 三类 plan 事件。
- provider 可以在开始生成或更新计划前发 `plan_status`。
- provider 可以在执行 plan operation 后发 `plan_operation`，记录 operation 类型、成功状态、message 和错误。
- provider 更新 activePlan 后可以发 `plan_update`，用于刷新 plan card 和持久化计划。
- 是否触发这些事件、触发顺序和触发频率由 provider 决定；workflow adapter 只负责适配已经收到的事件。
- plan internal tool 的 tool response 应返回简短进度摘要给模型继续推理。

ask：

- 协议层提供 `ask_start`、`ask`、`ask_resume` 三类 ask 事件。
- provider 可以在准备追问时发 `ask_start`。
- provider 暂停等待用户输入时返回 `AgentLoopResult.status = 'ask'`，并可以发 `ask` 事件。
- ask 暂停时必须返回可恢复的 `providerState`。
- provider 恢复用户回答后可以发 `ask_resume`，用于记录恢复链路。
- 是否触发 ask 事件族、触发顺序和触发频率由 provider 决定；最终交互状态以 result 为准。

sandbox：

- 协议层提供 `sandbox_run_start`、`sandbox_run_end` 两类 sandbox 事件。
- provider 开始执行 sandbox internal tool 前可以发 `sandbox_run_start`，用于 workflow adapter 创建运行状态或 nodeResponse。
- sandbox 执行结束后应发 `sandbox_run_end`，包含 response、usages、seconds、error 和可选 `nodeResponse`。
- workflow adapter 可以优先使用 `sandbox_run_end.nodeResponse` 直接 appendNodeResponse；没有 `nodeResponse` 时，按标准字段组装 nodeResponse。
- sandbox 事件只用于 system sandbox tools，不代表业务 runtime tool，不触发 `tool_*` 生命周期事件。

readFile：

- 协议层提供 `file_read_start`、`file_read_end` 两类文件读取事件。
- provider 开始执行 `read_files` 前可以发 `file_read_start`，用于 workflow adapter 创建运行状态。
- 文件读取结束后应发 `file_read_end`，包含 response、usages、seconds、error 和可选 `nodeResponse`。
- workflow adapter 可以优先使用 `file_read_end.nodeResponse` 直接 appendNodeResponse；没有 `nodeResponse` 时，按标准字段组装 readFiles nodeResponse。
- readFile 事件只用于 `read_files`，不代表业务 runtime tool，不触发 `tool_*` 生命周期事件。

停止与中断：

- 用户中断时返回 `status: 'aborted'`，保留已产生的 requestIds、providerState 和可恢复信息。
- provider 内部存在 stop/retry gate，且拒绝模型结束时，可以发 `assistant_push`，追加带 `agentStopGate` 的 value。
- provider 超过自身最大循环、stop gate 拒绝次数或 SDK 限制时返回 `status: 'error'` 和明确错误。

所有 provider 都必须支持：

- runtime tools 注入和执行。
- answer 流式输出。
- reasoning/thinking 输出。
- `tool_call`、`tool_params`、`tool_run_start`、`tool_run_end` 事件。
- usage 明细透传、模型调用 totalPoints 计算和 requestId 归集。
- abort/stop 检查。
- 标准 `done | ask | aborted | error` 结果。
- 最终可保存的 `assistantResponses` 输出或可由 workflow adapter 从标准事件构建出的等价结果。

## Provider Contract

`providers/type.ts` 定义 provider 合同：

```ts
type AgentLoopProvider = {
  name: AgentLoopProviderName;
  run: (params: {
    input: AgentLoopInput;
    runtime: AgentLoopRuntime;
  }) => Promise<AgentLoopResult>;
};
```

provider 只负责声明自身名称和执行入口。本轮启用哪些内置能力只看 `runtime.systemTools`，不再额外声明 provider 静态能力。provider 不能用第二套 capabilities 参与运行判断。例如 sandbox 的注入条件是：

```ts
if (
  runtime.systemTools?.sandbox?.enabled &&
  runtime.systemTools.sandbox.client
) {
  // 注入并执行 sandbox_* tools
}
```

`providers/registry.ts` 负责 provider 选择：

- `fastAgent -> fastAgent`
- `piAgent -> piAgent`

未知 provider 必须返回明确错误，不能静默回退；新 selector 不兼容 `default`、`pi` 等旧别名。

## System Tools

`systemTools` 是 Agent Loop 内置工具集合。它们是 provider 内部复用库，不属于业务 runtime tool 协议。是否启用由业务层传入的 `runtime.systemTools` 决定。

fastAgent 和 piAgent 必须共用同一套 plan/ask/sandbox/readFile 方案：

- 都通过挂载工具的方式把 `update_plan`、`ask_user`、`sandbox_*` 和 `read_files` 暴露给模型。
- 都可以按 `runtime.systemTools` 挂载 plan/ask/sandbox/readFile 工具。
- 都复用 `systemTools/plan`、`systemTools/ask`、`systemTools/sandbox` 和 `systemTools/readFile` 的 tool schema、parser、payload 类型和 reducer/执行协议。
- 命中 internal tool 后都由 provider 内部拦截执行，不进入 `runtime.executeTool`。
- provider 只负责把自身模型/SDK 的 tool call 格式转换成标准 `ChatCompletionMessageToolCall`，在执行前判断是否命中 internal tool，再调用统一 internal tool executor。
- sandbox tool function name 也必须使用 `sandbox_*` 原始前缀，例如 `sandbox_*`。

### Plan

`systemTools/plan` 提供：

- `update_plan` tool schema。
- plan operation 类型。
- 参数 parser。
- 纯状态 reducer。
- replace/replan 时的稳定合并逻辑。

标准 operation：

- `set_plan`：创建 active plan。
- `update_step`：更新单个 step 状态、证据、输出摘要、阻塞原因。
- `append_step`：向当前 active plan 追加 step。
- `delete_step`：删除未完成或无关键证据的 step。
- `replace_plan`：重规划，保留当前 planId，并尽量保留仍有效的已完成证据。

### Ask

`systemTools/ask` 提供：

- `ask_user` tool schema。
- ask payload 类型。
- 参数 parser。
- 建议选项解析。

标准 ask payload：

```ts
type AgentAskPayload = {
  reason: string;
  blockerType: 'missing_required_input' | 'tool_unavailable' | 'ambiguous_goal';
  question: string;
  options?: string[];
};
```

`options` 是建议选项，不是唯一可回答内容；客户端默认支持自由输入，不需要 provider 声明 `allowFreeText`。

### Sandbox

`systemTools/sandbox` 提供 sandbox 相关工具协议。sandbox 工具属于 agent loop 内置能力，不属于业务 runtime tools。

`systemTools/sandbox` 提供：

- `sandbox_*` tool schema。
- sandbox internal tool name 与原始 `sandbox_*` tool name 的双向映射。
- sandbox 执行请求和执行结果类型。
- provider 内部 sandbox executor 的最小协议。
- sandbox 运行事件到 workflow nodeResponse 的映射字段。

约束：

- sandbox 工具由 provider 根据 `runtime.systemTools.sandbox` 自行挂载，模型可见名称统一为 `sandbox_*`。
- sandbox 工具命中后由 provider 使用 `runtime.systemTools.sandbox.client` 直接执行，不进入 `runtime.executeTool`。
- sandbox 工具如果需要展示运行过程或写入 workflow nodeResponse，应由 provider 映射成 `sandbox_run_start`、`sandbox_run_end` 标准事件；协议层不把 sandbox 识别为业务 runtime tool。

### Read File

`systemTools/readFile` 提供文件读取相关工具协议。文件读取属于 agent loop 内置能力，不属于业务 runtime tools。

`systemTools/readFile` 提供：

- `read_files` tool schema。
- 参数 parser，核心参数为 `ids: string[]`。
- provider 内部 readFile executor 的最小协议。
- 文件读取事件到 workflow nodeResponse 的映射字段。

约束：

- readFile 工具由 provider 根据 `runtime.systemTools.readFile` 自行挂载，模型可见名称统一为 `read_files`。
- readFile 工具命中后由 provider 调用 `runtime.systemTools.readFile.execute`，不进入 `runtime.executeTool`。
- adapter 负责解析文件、持有 `filesMap`，并通过闭包实现 `execute`；agent-loop 不直接读取 `filesMap`。
- 文件读取如果需要展示运行过程或写入 workflow nodeResponse，应由 provider 映射成 `file_read_start`、`file_read_end` 标准事件。

## fastAgent Provider

`fastAgent` 是当前 unified loop 的正式新名称。

职责：

- 通过 tool calling 注入并执行统一的 `update_plan`、`ask_user`、sandbox 和 readFile 工具。
- 保留当前 LLM tool loop、context compress、tool response compress、stop gate 和 prompt 规则。
- `providers/fastAgent/index.ts` 将 fastAgent 主循环适配为 provider contract；`runFastAgentLoop` 只作为 provider 内部 run 实现，业务入口仍是顶层 `runAgentLoop`。
- 删除旧 `agentLoop/loop` 目录，不保留 re-export alias，避免继续误导新实现。

fastAgent 内部模块：

- `loop/index.ts`：fastAgent 主 loop 入口。
- `loop/base.ts`：底层 LLM/tool 循环。
- `prompt/`：fastAgent system prompt。
- `stop/`：fastAgent 本地 stop gate。
- `tools/`：fastAgent 工具可见性与内部工具过滤。
- plan tool schema、parser、reducer、状态操作都来自 `systemTools/plan`，不在 fastAgent 下保留独立 `plan/` 目录。
- ask tool schema 和 parser 来自 `systemTools/ask`，不归属 plan 目录。
- stop gate 只保留在 `providers/fastAgent/stop`，不从 `agentLoop/stop` 根目录 re-export。

fastAgent 不固定内置能力；本轮启用哪些能力完全由 `runtime.systemTools` 决定。

## piAgent Provider

`piAgent` 接入统一 provider contract，不再由 workflow agent 入口单独分流。

职责：

- 将 pi-agent-core 的模型、消息、工具和事件桥接为标准 Agent Loop 协议。
- 长期按标准 `input.messages` 接收 GPT messages，并在 provider 内部转换为 pi-agent-core 的 `AgentMessage[]`。
- 注入 runtime tools、`update_plan`、`ask_user`、sandbox 和 readFile 工具。
- internal tools 与 fastAgent 使用同一套 tool schema、parser 和 reducer，在 piAgent provider 内部执行，不进入 workflow runtime tool executor。
- 将 pi-agent-core 的 text/thinking/tool/request/usage 事件转换为标准 `AgentLoopEvent`。

短期兼容策略：

- piAgent 暂时不纳入 GPT messages 上下文恢复闭环，仍可通过 memories[`piMessages-${nodeId}`] 恢复 pi-agent-core raw messages。
- 恢复、压缩前 transformContext 和本轮结束写回 memory 时，必须复用旧 adapter 的 `normalizePiAgentMessages` 逻辑，修复 pi-agent-core streaming 下 tool name 与 arguments 被拆块的问题。
- 本轮结束继续把 normalize 后的 `agent.state.messages` 写回 memory。
- 当前用户输入仍通过 `agent.prompt(...)` 注入。
- 该兼容策略只属于 piAgent provider 内部实现，不改变顶层 agent-loop 使用 GPT messages 的标准。

已知风险：

- 删除中间历史后，memory 中的 raw pi messages 可能仍包含被删上下文。
- workflow history 上下文窗口和裁剪对 piAgent raw messages 不完全生效。
- contextCheckpoint 压缩暂时不能统一约束 piAgent raw messages。

后续迁移方向：

- piAgent provider 内部实现 GPT messages 与 `AgentMessage[]` 的双向转换。
- providerState/memory 只保存 GPT messages 无法表达的 provider 私有状态，不再保存完整 transcript。
- 迁移期 workflow 仍可把 raw `piMessages-${nodeId}` 单独保存为兼容 memory；统一 `agentLoopMemory-${nodeId}` 只保存 `activePlan`、`pendingAsk` 等 provider 私有状态。

plan 执行：

- `update_plan` 作为 pi-agent-core tool 注入，工具定义来自 `systemTools/plan`。
- 执行时调用 `systemTools/plan` reducer 更新 provider 内部 `activePlan`。
- 可发送标准 `plan_status`、`plan_operation` 和 `plan_update` 事件。
- 返回简短 tool result 给 pi-agent-core 继续推理。

ask 执行：

- `ask_user` 作为 pi-agent-core tool 注入，工具定义来自 `systemTools/ask`。
- 执行时使用 `systemTools/ask` parser 解析 ask payload，写入 provider 内部 pending 状态。
- 进入 pending ask 后必须中止当前 pi-agent-core turn，避免同一轮继续生成后续回答。
- 本轮 provider run 返回 `status: 'ask'`、`ask` 和 `providerState`。
- 用户回答后由 workflow 把 `providerState` 和 `userAnswer` 传回，piAgent provider 恢复执行。

piAgent 不固定内置能力；本轮启用哪些能力完全由 `runtime.systemTools` 决定。

## Workflow Adapter

workflow agent 层只保留一套面向新 `agentLoop` 的 adapter。

当前结构：

```txt
packages/service/core/workflow/dispatch/ai/agent/adapter/
  index.ts
  prompt.ts
  userContext.ts
  toolCatalog.ts
  runtime.ts
  eventMapper.ts
  useToolNodeResponse.ts
  memory.ts
```

职责：

- `prompt.ts`：解析用户系统提示词并生成 provider 输入前的 prompt 片段。
- `userContext.ts`：将 workflow props、history、当前用户输入、文件上下文整理为 GPT messages 所需上下文。
- `toolCatalog.ts`：从 workflow completion tools 中构建业务 runtime tool catalog，并过滤已知 internal tools。
- `runtime.ts`：创建 `AgentLoopRuntime`，封装基础 `llmParams`、`responseParams`、`lang`、`systemTools`、workflow runtime tools、nodeResponses 和 usagePush。
- `eventMapper.ts`：将标准 `AgentLoopEvent` 映射为 SSE、assistantResponses 构建器和部分 nodeResponses。
- `useToolNodeResponse.ts`：集中处理业务 runtime tool 的 `tool_run_end` nodeResponse，保证压缩结果、错误和 child response 齐全后再落运行详情。
- `memory.ts`：按 nodeId 保存和恢复统一 `providerState`。

`eventMapper.ts` 必须适配的语义事件：

- plan：`plan_status`、`plan_operation`、`plan_update`。
- ask：`ask_start`、`ask`、`ask_resume`。
- sandbox：`sandbox_run_start`、`sandbox_run_end`。
- readFile：`file_read_start`、`file_read_end`。
- runtime tool：`tool_call`、`tool_params`、`tool_run_start`、`tool_run_end`。
- 模型输出：`llm_request_start`、`llm_request_end`、`reasoning_delta`、`answer_delta`。
- 内部过程：`after_message_compress`。
- 结果追加：`assistant_push`。

workflow adapter 只按事件语义落 SSE、assistantResponses 构建器、nodeResponses 和 memory，不判断事件是由哪个 provider 或哪个内部工具触发。

`assistant_push` 不直接转成 SSE；它用于把 provider 生成的结构化 assistant value 追加到本轮 `assistantResponses`。对于带 `agentStopGate` 的 value，adapter 写入 `assistantResponses[].agentStopGate`，后续由 chat adapt 还原成隐藏 user feedback。

最终保存边界：

- 数据库存储不直接由 event 决定，而由 workflow dispatch 最终返回的 `assistantResponses` 决定。
- workflow adapter 可以用 event 构建本轮 `assistantResponses`，也可以合并 `AgentLoopResult.assistantResponses`。
- 如果同一段内容已经通过 `answer_delta` / `reasoning_delta` 写入构建器，result 中的 `answerText` / `reasoningText` 只能用于补齐缺失内容或生成 workflow 输出，不应再重复追加同一段可见文本。
- `assistant_push` 推入的 hidden/control value 与可见 answer value 独立保存；它只负责恢复隐藏上下文，不代表新的可见回答。

可见 SSE 持久化约束：

- workflow adapter 只要把某个 agent loop event 转成客户端可见 SSE，就必须同步写入可恢复的 chat 记录。
- `answer_delta` / `reasoning_delta` 不能只更新前端内存，应累积到当前 assistant response value；刷新后 `assistantResponses` 还原出的内容必须与用户已经看到的 SSE 内容一致。
- tool、plan、ask、sandbox 等可见运行状态同样遵循该原则：如果客户端可见，就必须能从 `assistantResponses`、`nodeResponses` 或 `providerState` 恢复。
- `assistant_push` 推入的 `agentStopGate` value 只保存隐藏 feedback；被 stop gate 拒绝但已经可见的 assistant draft 由前面的 `answer_delta` / `reasoning_delta` 按普通 assistant response 持久化。
- 如果未来某个 provider 支持候选输出缓冲，在候选未确认前不向客户端发送 SSE；一旦发送，就必须进入可恢复记录，不能依赖“完成后再决定是否保存”。

usage push 属于 workflow adapter：

- workflow adapter 在 agent-loop runtime 边界把业务层现有 `usagePush` 包装成 `runtime.usagePush` 传给 provider。
- provider 只通过 `runtime.usagePush` 上报 usage，并负责模型调用 totalPoints 计算。
- 没有标准事件覆盖的交互恢复路径，也只能复用 `runtime.usagePush`，不能回退到 agent-loop 内部直接计费。
- workflow adapter 负责累计、业务计费 push、写入 workflow 结果或错误处理，不重新计算模型调用 totalPoints。
- provider 不直接执行计费，也不直接写 workflow usage 结果。

workflow agent 入口只做：

```ts
const result = await runAgentLoop({
  provider,
  input,
  runtime
});
```

workflow 层不再 import `runFastAgentLoop`、`runUnifiedAgentLoop` 或旧 piAgent workflow adapter。

### ToolCall Adapter

ToolCall 节点不再直接调用 fastAgent base loop，而是复用统一 `runAgentLoop` 入口：

```ts
const result = await runAgentLoop({
  provider: 'fastAgent',
  input: {
    messages: finalMessages,
    childrenInteractiveParams
  },
  runtime
});
```

ToolCall 的 runtime 特殊约束：

- 固定使用 `fastAgent` provider，`llmParams.promptMode='raw'`，避免套用 Agent 节点 system prompt 和 plan/stop prompt。
- plan/ask 通过 `systemTools.plan.enabled=false`、`systemTools.ask.enabled=false` 禁用。
- sandbox/readFile 仍按业务上下文可选启用，分别通过 `systemTools.sandbox.client` 和 `systemTools.readFile.execute` 注入。
- `toolCatalog.batchToolSize=1`，保持 ToolCall 节点现有串行工具执行、流式输出和交互恢复顺序。
- 业务工具交互恢复通过 `childrenInteractiveParams` 和 `runtime.executeInteractiveTool` 完成，不复用 `ask_user`。
- usage push 仍由 provider 通过 `runtime.usagePush` 集中上报；ToolCall adapter 只负责把 usage 写回当前 ToolCall 节点结果。

## Provider State 与 Memory

provider 内部状态统一封装为 `providerState`：

```ts
type AgentLoopInput = {
  providerState?: unknown;
};

type AgentLoopResult = {
  providerState?: unknown;
};
```

workflow memory 只负责保存和恢复，不解析结构。长期标准中，完整对话 transcript 应由 GPT messages 和 chat records 恢复，`providerState` 只保存 GPT messages 无法表达的 provider 私有状态。

fastAgent 可在 `providerState` 中保存：

- ask pending 恢复所需的最小上下文或引用。
- ask toolCallId。
- activePlan。
- requirePlan。
- runtimeToolCalledSinceLastPlanUpdate。

piAgent 长期可在 `providerState` 中保存：

- activePlan。
- pending ask 状态。
- 其他 SDK resume 所需状态。

短期兼容例外：

- piAgent 当前仍可通过 memories[`piMessages-${nodeId}`] 保存和恢复 pi-agent-core raw messages。
- 该 memory 是迁移期兼容方案，不作为新的 agent-loop 标准。
- 统一 `agentLoopMemory-${nodeId}` 不保存完整 `piMessages`，只保存 ask resume、activePlan 等 provider 私有状态。
- 完成 GPT messages <-> `AgentMessage[]` 转换后，应移除完整 raw transcript memory，仅保留必要 provider 私有状态。

正常完成时 provider 返回空 `providerState` 或显式清理状态；ask 暂停时必须返回可恢复的 `providerState`。如果 sandbox 会话需要跨轮恢复，也由 provider 封装到 `providerState`。

## 事件与运行详情

标准 `AgentLoopEvent` 是跨 provider 的运行时观察协议，用于流式输出、运行详情、usage 透传和构建 assistantResponses；它不是数据库持久化协议，最终保存仍以 workflow dispatch 返回的 `assistantResponses` 为准。

事件类型包括：

- `llm_request_start`
- `llm_request_end`
- `reasoning_delta`
- `answer_delta`
- `tool_call`
- `tool_params`
- `tool_run_start`
- `tool_run_end`
- `plan_status`
- `plan_operation`
- `plan_update`
- `ask_start`
- `ask`
- `ask_resume`
- `sandbox_run_start`
- `sandbox_run_end`
- `file_read_start`
- `file_read_end`
- `assistant_push`
- `after_message_compress`

事件约束：

- 业务 runtime tools 必须发送 tool call、参数、运行开始、运行结束和最终回灌事件。
- plan/ask/sandbox/readFile internal tools 不走普通 runtime tool 生命周期事件；plan/ask 由 provider 通过 plan/ask 事件族暴露，sandbox/readFile 由 provider 映射为对应事件族或 providerState。
- 每次模型请求都必须有 requestId，并进入 nodeResponse。
- thinking/reasoning 输出由 provider 适配为 `reasoning_delta`。
- provider 内部 SDK 的事件必须先归一成标准事件，再交给 workflow adapter。

## 迁移步骤

1. 新增 `type/`、`systemTools/`、`providers/` 目录和 provider contract。
2. 用薄封装先接入 `providers/fastAgent`，保留内部 `runFastAgentLoop` 作为 provider run 实现，保持当前 unified loop 行为等价；再将 fastAgent 实体文件搬迁到 provider 目录。
3. 将现有 plan/ask schema、parser、state reducer 通过 `systemTools/` 统一导出，并补充 append/delete 能力；sandbox/readFile internal tool 复用现有 schema，并增加 `sandbox_*` / `read_files` 映射。
4. 新增顶层 `runAgentLoop` 和 provider registry，用 provider 选择 fastAgent/piAgent。
5. 新增迁移期 `providers/piAgent`，适配标准 result/event/providerState，并继续允许 `piMessages-${nodeId}` raw memory。
6. 在 piAgent provider 内挂载 `update_plan`、`ask_user`、`sandbox_*` 和 `read_files`，复用 fastAgent 同一套 parser、reducer 和 systemTools 执行协议。
7. 收敛 workflow agent adapter，使 workflow 只调用统一 `runAgentLoop`，避免直接分流 fastAgent/piAgent。
8. 删除 workflow 层对 fastAgent/piAgent 的直接分流，并删除旧 piAgent workflow adapter，避免出现第二套 piAgent 入口。
9. 清理旧 `runUnifiedAgentLoop` 调用和 `agentLoop/loop`、`agentLoop/plan`、`agentLoop/stop`、`agentLoop/tools` 根目录，不保留 re-export alias。
10. 补齐 provider、systemTools、workflow adapter 测试。

## 测试计划

provider registry：

- `fastAgent -> fastAgent`。
- `piAgent -> piAgent`。
- unknown provider 抛出明确错误。

systemTools：

- plan `set_plan`、`update_step`、`append_step`、`delete_step`、`replace_plan`。
- ask options 参数解析；客户端默认支持自由输入。
- sandbox 工具 name 映射、schema 复用和 client-only 执行协议。
- readFile 工具 name、ids 参数解析、executor 调用和 `file_read_end.nodeResponse` 映射。
- 无效参数返回结构化错误，不直接抛给模型 loop 外层。

fastAgent：

- 现有 plan/ask/tool/stop gate 行为不变。
- runtime tool 后仍必须 update plan 才能 final。
- ask pending/resume 保持同一上下文链路。

piAgent：

- runtime tool 事件映射为标准事件。
- `update_plan` 和 `ask_user` 使用与 fastAgent 相同的 internal tool schema。
- sandbox 工具使用与 fastAgent 相同的 internal tool schema 和执行协议。
- readFile 工具使用与 fastAgent 相同的 internal tool schema 和执行协议。
- sandbox 工具执行时发送 `sandbox_run_start`、`sandbox_run_end`，workflow adapter 能把 `sandbox_run_end.nodeResponse` 写入 nodeResponses。
- readFile 工具执行时发送 `file_read_start`、`file_read_end`，workflow adapter 能把 `file_read_end.nodeResponse` 写入 nodeResponses。
- `update_plan` 更新 activePlan 并发送 `plan_update`。
- `ask_user` 返回 `status: 'ask'` 和可恢复 `providerState`。
- 用户回答后可恢复 pi-agent-core 执行。
- requestId、usage、answer、reasoning 都进入标准结果和运行详情。
- `llmParams.maxTokens`、`temperature`、`topP`、`stop`、`responseFormat` 由 piAgent provider 在 `onPayload` 中转换为 pi-agent-core / OpenAI payload 字段。
- `responseParams.retainDatasetCite` 至少作用于 piAgent provider 最终返回的 `answerText` / `reasoningText`；piAgent 流式 `answer_delta` / `reasoning_delta` 的 citation 清理本轮暂不支持，允许先保持原始 delta。

workflow：

- Agent 节点只调用统一 `runAgentLoop`。
- Agent 节点通过 `runtime.systemTools` 启用 plan/ask/sandbox/readFile，不再把内置工具塞入 `runtimeTools`。
- ToolCall 节点也调用统一 `runAgentLoop`，固定使用 `fastAgent`，并通过 `systemTools` 禁用 plan/ask、可选启用 sandbox/readFile。
- `AGENT_ENGINE=fastAgent` 和 `AGENT_ENGINE=piAgent` 只传递新的 provider 名称。
- `answer_delta` / `reasoning_delta` 已经可见时，必须同步写入 `assistantResponses` 并可刷新恢复。
- stop gate 拒绝的 draft 如果已经可见，刷新后仍作为普通 assistant response 可见；`assistant_push` 推入的 `agentStopGate` value 只恢复隐藏 user feedback。
- SSE、assistantResponses、nodeResponses、memories 刷新恢复不回退。

sandbox：

- workflow 负责提前初始化 `SandboxClient` 并通过 `runtime.systemTools.sandbox.client` 传入 agent-loop。
- `runSandboxTools` 只接受 `SandboxClient`，不接收 `appId/userId/chatId`，也不自行创建 sandbox。
- sandbox 工具如果需要导出文件 URL，可从 `sandboxClient.getContext()` 读取构建时上下文；缺失上下文时返回可读错误，不阻断 agent-loop 外层。

## TODO

- [x] 创建 `type/`、`systemTools/`、`providers/` 目录。
- [x] 用薄封装将 unified loop 接入 `providers/fastAgent`，以内部 `runFastAgentLoop` 实现 provider run。
- [x] 将 unified loop 实体文件搬迁到 `providers/fastAgent`，删除旧 `agentLoop/loop` re-export 目录。
- [x] 将旧 `agentLoop/plan` 内容迁移到 `systemTools/plan`，不保留根目录 re-export。
- [x] 将 ask tool 迁移到 `systemTools/ask`，不归属 plan 目录。
- [x] 删除旧 `agentLoop/stop` 根目录 re-export，stop gate 只属于 `providers/fastAgent/stop`。
- [x] 删除旧 `agentLoop/tools` 根目录 re-export，fastAgent 工具过滤只从 provider 内部路径导入。
- [x] 通过 `systemTools` 统一导出 plan/ask，并补充 plan append/delete 能力。
- [x] 细化 sandbox internal tools 的 schema、parser、executor 和 nodeResponse 映射。
- [x] 将 sandbox 执行收口为只接受已初始化 `SandboxClient`，并由 client 暴露构建时上下文。
- [x] 将文件读取迁入 `systemTools/readFile`，通过 `read_files` 和 `runtime.systemTools.readFile.execute` 执行。
- [x] 实现 provider registry 和顶层 `runAgentLoop`。
- [x] 将 piAgent 接入 provider contract，并注入 plan/ask internal tools。
- [x] 在 piAgent provider 内补充 sandbox internal tools 的标准事件映射。
- [x] 在 fastAgent/piAgent provider 内补充 readFile internal tool 注入和 `file_read_*` 事件映射。
- [x] 收敛 workflow agent adapter，复用现有业务上下文和工具执行逻辑，并通过 provider 选择 fastAgent/piAgent。
- [x] 将 ToolCall 节点改为调用统一 `runAgentLoop`，通过 `systemTools` 禁用 plan/ask 并可选启用 sandbox/readFile。
- [x] 将 `lang` 提升为 `AgentLoopRuntime` 顶层上下文，不再挂到 sandbox internal tool。
- [x] 让 workflow adapter 将可见 `answer_delta` / `reasoning_delta` 同步累积到 `assistantResponses`，保证 SSE 可见内容刷新后可恢复。
- [x] 清理 workflow agent 入口对旧 fastAgent/piAgent 的直接分流，并删除旧 piAgent workflow adapter。
- [x] 更新并运行 agentLoop、piAgent、workflow adapter 相关局部测试。

## 后续 TODO

- [ ] 为 piAgent provider 补 GPT messages <-> AgentMessage[] 转换，逐步移除 `piMessages-${nodeId}` 完整 transcript memory。
- [ ] 补齐 piAgent 流式 delta 的 citation 清理，让 `answer_delta`、`assistantResponses` 和最终 `answerText` 在 `retainDatasetCite=false` 时完全一致。

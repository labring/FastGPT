# agentCall 声明式工具改造设计

## 1. 背景

当前 `packages/service/core/ai/llm/agentCall/index.ts` 的 `runAgentLoop` 通过四个分离的参数处理工具调度：

- `body.tools`：喂给 LLM 的 schema 数组
- `onToolCall`：LLM 识别到工具调用时的流式回调
- `onToolParam`：工具参数流式增量回调
- `onRunTool`：实际执行工具的总入口

调用方（`toolCall.ts` / `masterCall.ts`）在 `onRunTool` 内写了一长串 `if (toolId === X) else if (toolId === Y)` 分支，每个分支都要独立做 `parseJsonArgs + XxxSchema.safeParse + 错误处理`。新增工具必须改这个巨型函数，schema / 解析 / 执行三段逻辑被拆散在不同参数里。

## 2. 目标

1. **声明式**：一个工具自带 schema、参数解析、执行逻辑，三段聚合到一个对象里。
2. **两阶段执行**：所有工具统一 `parseParams`（解析 + 校验）→ `execute`（执行）两个阶段，消除分支里重复的校验代码。
3. **生命周期钩子**：流式事件（`onToolCall / onToolParam / onAfterToolCall`）保持全局，由 `runAgentLoop` 统一编排，工具定义不感知 UI 层。
4. **`runAgentLoop` 自身不感知具体工具种类**：核心循环只负责调度，新增工具不需要改 `agentCall` 模块。

本文档只覆盖 **`agentCall` 模块自身** 的改造，应用层（`toolCall.ts` / `masterCall.ts`）如何迁移在后续文档单独讨论。

## 3. 目录结构与类型定义

声明式工具的**类型定义与执行服务**放在独立目录 `packages/service/core/ai/llm/toolCall/` 下管理，与 `agentCall/` 解耦（`agentCall` 负责多轮调度，`toolCall` 负责单次工具调用的解析与执行；后者是前者的依赖）：

```
packages/service/core/ai/llm/
├── agentCall/
│   └── index.ts          # 多轮调度，import from ../toolCall
├── toolCall/
│   ├── type.ts           # ToolDefinition、ToolExecuteContext、ToolExecuteResult、ToolParseResult
│   └── index.ts          # runTool 两阶段执行器
├── request.ts
└── ...
```

因为类型不再属于 `agentCall` 私有命名空间，`AgentToolDefinition` 去掉 `Agent` 前缀，统一命名为 `ToolDefinition`（其他类型同理）。

新建 `packages/service/core/ai/llm/toolCall/type.ts`：

```ts
import type {
  ChatCompletionMessageParam,
  ChatCompletionMessageToolCall,
  ChatCompletionTool
} from '@fastgpt/global/core/ai/llm/type';
import type { ChatNodeUsageType } from '@fastgpt/global/support/wallet/bill/type';
import type { WorkflowInteractiveResponseType } from '@fastgpt/global/core/workflow/template/system/interactive/type';

// 参数解析结果：成功返回强类型 data，失败返回要回填给 LLM 的 errorMessage
export type ToolParseResult<P> =
  | { success: true; data: P }
  | { success: false; errorMessage: string };

// 执行上下文
export type ToolExecuteContext<P> = {
  call: ChatCompletionMessageToolCall;       // 原始工具调用
  messages: ChatCompletionMessageParam[];    // 当前 requestMessages 快照
  params: P;                                 // parseParams 输出
};

// 执行结果（结构与现有 onRunTool 的返回值对齐）
export type ToolExecuteResult = {
  response: string;
  assistantMessages?: ChatCompletionMessageParam[];
  usages?: ChatNodeUsageType[];
  interactive?: WorkflowInteractiveResponseType;
  stop?: boolean;
};

// 声明式工具定义
export type ToolDefinition<P = any> = {
  // 1. 喂给 LLM 的 schema（name/description/parameters）
  schema: ChatCompletionTool;

  // 2. 参数解析阶段，可选；缺省走 parseJsonArgs，参数类型为 Record<string, any>
  parseParams?: (rawArgs: string) => ToolParseResult<P>;

  // 3. 执行阶段（必填）
  execute: (ctx: ToolExecuteContext<P>) => Promise<ToolExecuteResult>;
};
```

设计要点：

- `parseParams` 的返回类型强制调用方处理校验失败，失败文案会作为 `response` 回写给 LLM（保持当前代码行为，让模型能看到错误自行纠偏）。
- `execute` 的 `params` 通过泛型 `P` 串联，从 `parseParams` 的 `data` 类型收窄而来；调用方编写 `execute` 时不再需要重复 `safeParse`。
- 返回值沿用现有的 `response / assistantMessages / usages / interactive / stop` 字段，迁移时不需要对 `agentCall` 循环体里"如何消费这些字段"做任何改动。

## 4. `runAgentLoop` Props 变更

### 4.1 删除的 props

```ts
body.tools: ChatCompletionTool[]
onToolCall: (e: { call }) => void
onToolParam: (e: { tool; params }) => void
onRunTool: (e: { call; messages }) => Promise<...>
```

### 4.2 新增 / 替换的 props

```ts
type RunAgentCallProps = {
  // ... 其他不变（maxRunAgentTimes、childrenInteractiveParams、handleInteractiveTool、
  //     onAfterCompressContext、onToolCompress、usagePush、isAborted、userKey、onReasoning、onStreaming 等）

  body: CreateLLMResponseProps['body'] & {
    // tools 字段被移除
    temperature?: number;
    top_p?: number;
    stream?: boolean;
  };

  // 声明式的工具集合（schema + 执行逻辑）
  // 所有工具必须在调用 runAgentLoop 前完整枚举。LLM 能看到的工具集 ≡ 能执行的工具集。
  // 动态场景（用户 SubApp、capability 等）由调用方在构建 tools 数组时提前展开。
  tools: ToolDefinition[];

  // 生命周期钩子（统一编排）
  onToolCall?: (e: { call: ChatCompletionMessageToolCall }) => void;
  onToolParam?: (e: { tool: ChatCompletionMessageToolCall; argsDelta: string }) => void;
  onAfterToolCall?: (e: {
    call: ChatCompletionMessageToolCall;
    response: string;
  }) => void;
};
```

### 4.3 `onToolParam` 字段重命名

当前 `onToolParam` 的 `params` 字段传的是**本次增量** `arg`（参见 `request.ts:462`：`onToolParam?.({ tool: currentTool, params: arg })`），字段名容易误解为完整参数。本次一并重命名为 `argsDelta`：

- `packages/service/core/ai/llm/request.ts:44`：类型定义 `params: string` → `argsDelta: string`
- `packages/service/core/ai/llm/request.ts:462`：调用处 `{ tool, params: arg }` → `{ tool, argsDelta: arg }`
- 所有调用方同步修改（调用方文档里列出）

## 5. 内部实现

### 5.1 新建 `toolCall/index.ts`

统一的两阶段执行器（对外暴露 `runTool` 作为 `toolCall` 服务的入口）：

```ts
import { parseJsonArgs } from '../../utils';
import { getErrText } from '@fastgpt/global/common/error/utils';
import type {
  ToolDefinition,
  ToolExecuteResult,
  ToolParseResult
} from './type';
import type {
  ChatCompletionMessageParam,
  ChatCompletionMessageToolCall
} from '@fastgpt/global/core/ai/llm/type';

type RunToolArgs = {
  call: ChatCompletionMessageToolCall;
  messages: ChatCompletionMessageParam[];
  tools: ToolDefinition[];
};

export const runTool = async ({
  call,
  messages,
  tools
}: RunToolArgs): Promise<ToolExecuteResult> => {
  const name = call.function.name;
  const def = tools.find((t) => t.schema.function.name === name);

  // 1. 工具未找到（LLM hallucination 或 tools 配置漏项）：兜底 response，外层仍会触发 onAfterToolCall
  if (!def) {
    return { response: `Call tool not found: ${name}` };
  }

  // 2. 阶段一：解析
  const parseResult: ToolParseResult<any> = def.parseParams
    ? def.parseParams(call.function.arguments ?? '')
    : { success: true, data: parseJsonArgs(call.function.arguments ?? '') };

  if (!parseResult.success) {
    return { response: parseResult.errorMessage };
  }

  // 3. 阶段二：执行（统一 try/catch）
  try {
    return await def.execute({
      call,
      messages,
      params: parseResult.data
    });
  } catch (error) {
    return { response: `Tool error: ${getErrText(error)}` };
  }
};
```

要点：

- `tools.find` 用 `schema.function.name` 查，未命中即兜底，不再提供动态解析通道。
- 任何"失败"（未找到 / 解析失败 / 执行抛错）都归一成 `{ response: string }`，外层流程不区分。
- `execute` 内部闭包捕获到的副作用（`childrenResponses.push` / `toolRunResponses.push` / `planResult = ...`）保持原样，`runner` 不感知。

### 5.2 改造 `agentCall/index.ts`

从 `toolCall` 模块引入类型和 runner：

```ts
import type { ToolDefinition } from '../toolCall/type';
import { runTool } from '../toolCall';
```

以下只列出"变化点"，其余不动：

**1) LLM 请求部分的 `body.tools`**

```ts
// 改造前
tools,       // 直接来自 props.body.tools

// 改造后
tools: tools.map((t) => t.schema),  // 来自 props.tools，运行时 .map 提取 schema
```

**2) 循环体内部的工具调用**

```ts
// 改造前（line 339-349）
for await (const tool of toolCalls) {
  const { response, assistantMessages, usages, interactive, stop } =
    await onRunTool({
      call: tool,
      messages: cloneRequestMessages
    });
  ...
}

// 改造后
for await (const toolCall of toolCalls) {
  const result = await runTool({
    call: toolCall,
    messages: cloneRequestMessages,
    tools
  });

  onAfterToolCall?.({ call: toolCall, response: result.response });

  const {
    response,
    assistantMessages: toolAssistantMessages = [],
    usages: toolUsages = [],
    interactive,
    stop
  } = result;

  // 以下压缩 / 消息追加 / interactive 处理逻辑完全不变
  ...
}
```

**3) `createLLMResponse` 的钩子透传**

```ts
// 改造前
onToolCall,
onToolParam

// 改造后（字段名一致，内部定义改名后透传不变；外部 props 也保留 onToolCall/onToolParam 语义）
onToolCall,
onToolParam   // 注意透传给 createLLMResponse 的结构里字段要同步改为 argsDelta
```

### 5.3 生命周期触发时机汇总

| 钩子 | 触发位置 | 参数 |
|---|---|---|
| `onToolCall` | `createLLMResponse` 解析出新 tool 时（`request.ts:452`）| `{ call }` |
| `onToolParam` | `createLLMResponse` 每次累积到 args 增量时（`request.ts:462`）| `{ tool, argsDelta }` |
| `onAfterToolCall` | `runTool` 返回后，压缩和消息追加之前 | `{ call, response }` |

`onAfterToolCall` 在 notFound / parseParams 失败 / execute 抛错时一样会被触发——UI 层事件流不断档。

## 6. 文件清单

```
新建目录：
  packages/service/core/ai/llm/toolCall/
    ├── type.ts            # ToolDefinition / ToolExecuteContext / ToolExecuteResult / ToolParseResult
    └── index.ts           # runTool 两阶段执行器（对外导出入口）

改动：
  packages/service/core/ai/llm/agentCall/index.ts
    - 从 ../toolCall 引入 ToolDefinition 和 runTool
    - props: 删 body.tools / onRunTool
    - props: 加 tools / onAfterToolCall
    - props: 保留 onToolCall / onToolParam 作为生命周期钩子（语义不变，字段名对齐 argsDelta）
    - LLM body.tools 改为 props.tools.map(t => t.schema)
    - 循环体 onRunTool → runTool
    - onAfterToolCall 触发点

  packages/service/core/ai/llm/request.ts
    - onToolParam 类型：params: string → argsDelta: string（44 行）
    - onToolParam 调用：params: arg → argsDelta: arg（462 行）
```

## 7. 与现有单测的关系

需要检查：

- `test/cases/service/core/ai/llm/request.test.ts` 对 `onToolParam` 的断言是否使用 `params` 字段。
- 改造完成后至少补一个 `packages/service/core/ai/llm/toolCall/` 的单测（建议测试文件放在 `test/cases/service/core/ai/llm/toolCall/` 下）覆盖：工具命中 / 未命中（LLM hallucination）/ parseParams 失败 / execute 抛错 四种路径。

## 8. 待确认问题

1. **`onAfterToolCall` 的触发粒度**：目前是 `runTool` 返回后触发一次，不含压缩后的 response。如果 UI 需要看到"压缩后的 tool response"，应该让 `onAfterToolCall` 接收压缩后的值 —— 但这会与现有 `onToolCompress`（已经单独推送压缩产物）重复。建议 `onAfterToolCall` 接收**原始 response**，与 `onToolCompress` 解耦。

2. **`body.tools` 去除后的类型收敛**：`CreateLLMResponseProps['body']` 这个类型本身可能没有 `tools` 字段，而是 agentCall 的扩展类型加进去的。需要确认并更新扩展类型定义。

## 9. 改造分步 TODO

- [ ] 新建目录 `packages/service/core/ai/llm/toolCall/`
- [ ] 新建 `toolCall/type.ts` 定义 `ToolDefinition` / `ToolExecuteContext` / `ToolExecuteResult` / `ToolParseResult`
- [ ] 新建 `toolCall/index.ts` 实现并导出 `runTool`
- [ ] 改 `request.ts`：`onToolParam` 的 `params` → `argsDelta`
- [ ] 改 `agentCall/index.ts`：props 重构 + 从 `../toolCall` 引入 + LLM body.tools 提取 + 循环体接入 `runTool` + `onAfterToolCall` 触发
- [ ] 为 `toolCall/` 补单测（四条路径：命中 / 未命中 / parseParams 失败 / execute 抛错）
- [ ] 跑一遍 `agentCall` 相关现有单测，确认类型编译通过
- [ ] 调用方（`toolCall.ts`（workflow 层同名但不同路径的文件）/ `masterCall.ts` / 其他）的迁移放在**后续文档**里讨论，此步**先不动**

> 命名冲突提示：`packages/service/core/workflow/dispatch/ai/tool/toolCall.ts` 是 workflow dispatch 层的文件名，与本次新建的 `packages/service/core/ai/llm/toolCall/` 目录同名但路径不同，不会产生 import 冲突。后续迁移时两者需要区分清楚。

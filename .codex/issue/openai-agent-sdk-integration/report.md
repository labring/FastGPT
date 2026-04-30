# OpenAI Agents SDK 集成调研报告

> 目标：评估将 [@openai/agents](https://github.com/openai/openai-agents-js)（TypeScript 版 OpenAI Agents SDK，下称 **OAI-Agents**）作为 FastGPT `dispatchRunAgent` 的第三种调度引擎引入的可行性，重点回答：**计费 token 能否拿到、tool 能否传入、skill 能否使用**。
>
> 研究对象：`/Volumes/code/fastgpt-pro/FastGPT/packages/service/core/workflow/dispatch/ai/agent/index.ts`
>
> 调研日期：2026-04-27
> SDK 版本：`@openai/agents` 0.8.5（npm latest）

---

## 0. 执行摘要（TL;DR）

| 关注点 | 结论 | 关键依据 |
|---|---|---|
| ① 拿到 token 用于计费 | ✅ **可行，且粒度比 pi 引擎更细** | `result.state.usage.requestUsageEntries[]` 暴露每次 LLM 调用的 input/output/cached/reasoning tokens；`result.rawResponses[].usage` 还能拿到 `responseId / providerData`。完全满足 FastGPT 现有 `usagePush(ChatNodeUsageType[])` 的梯度计费需求。 |
| ② 传入 tool | ✅ **可行，可直接复用现有 `getExecuteTool` 分发链** | `tool({ parameters, execute })` 接受 **JSON Schema** 或 **zod v4**，FastGPT 已锁定 zod v4，现有 `ChatCompletionTool[]` 的 `function.parameters`（JSON Schema）可直接喂入；execute 内部回调到 `getExecuteTool` 即可保持工具分发逻辑不变。 |
| ③ 使用 skill | ✅ **可行，沙箱 skill 机制对 SDK 透明** | FastGPT 的 skill 实质 = 「systemPrompt 中的 skill 元数据 + 6 个 sandbox tool + sandbox 容器中的 SKILL.md」，LLM 通过 `sandbox_read_file` 自主加载 SKILL.md。这套机制不依赖具体的 Agent loop 实现，只要把 `capabilitySystemPrompt` 注入 `Agent.instructions`、`capabilityTools` 注入 `Agent.tools` 即可。 |

**总评**：可以用 **新增第三种引擎**（`AGENT_ENGINE='openai'`）的方式接入，**不替换** 现有 `default`/`pi` 两条路径，与 piAgent 走同一类桥接套路（modelBridge + toolAdapter + 主调度），改动量约 4 个新文件 ≈ 600 行代码 + 1 行 env 枚举扩展。

**主要风险点**（需用户拍板，详见 §6）：
1. **Plan + Step 拆解能力**：OAI-Agents 自身没有 FastGPT 的「显式 plan + interactive ask」机制，需要决定是「完全交给 SDK 自主多轮 reasoning」还是「把 PlanAgentTool 作为一个 SDK tool 喂进去」。
2. **Tracing 默认外发**：SDK 默认会把 trace 上传到 OpenAI 平台，必须 `setTracingDisabled(true)` 关闭。
3. **第三方 OpenAI 兼容 endpoint**：必须 `setOpenAIAPI('chat_completions')` 切到 Chat Completions 路径；多租户并发场景需按 `Runner` 实例隔离，不要用进程级全局 setter。

---

## 1. 现有 agent 调度架构

### 1.1 入口分支
`dispatchRunAgent` 顶部按 `env.AGENT_ENGINE` 分流（[index.ts:81-83](../../../packages/service/core/workflow/dispatch/ai/agent/index.ts)）：

```ts
if (env.AGENT_ENGINE === 'pi') {
  return dispatchPiAgent(props);
}
// default 引擎：Plan + Step 编排
```

env 枚举（[env.ts:127](../../../packages/service/env.ts)）：
```ts
AGENT_ENGINE: z.enum(['default', 'pi']).default('default')
```

### 1.2 default 引擎（Plan + Master）
- **核心循环**：`dispatchPlanAgent`（计划）→ `masterCall`（执行）→ `runAgentLoop`（FastGPT 自家 LLM 多轮工具循环）
- **能力**：显式 plan 拆解 → 串行执行每个 step → 支持 plan 中途 ask 用户、续跑、最大 10 轮规划
- **关键产物**：每次 LLM 调用、每次 tool 调用都通过 `usagePush([ChatNodeUsageType])` 推送账单（[agentLoop/index.ts:336-344](../../../packages/service/core/ai/llm/agentLoop/index.ts)）

### 1.3 pi 引擎（pi-agent-core 桥接）
- **核心循环**：`agent.prompt(input)` 由 `@mariozechner/pi-agent-core` 自管多轮 reasoning
- **桥接套路**（[piAgent/](../../../packages/service/core/workflow/dispatch/ai/agent/piAgent/)，**这是 OAI-Agents 集成的最佳参考**）：
  - `modelBridge.ts` — 把 FastGPT `LLMModelItemType` 转成 pi-ai 的 `Model` 配置（baseUrl/apiKey/headers）
  - `toolAdapter.ts` — 把 `ChatCompletionTool[]` 包装成 pi-agent-core `AgentTool[]`，内部仍调 `getExecuteTool(ctx)` 复用 FastGPT 工具分发
  - `index.ts` — 主调度，订阅 `agent.subscribe(event)` 拿流式 token，`agent.state.messages` 存到 memories 跨轮恢复
- **不支持**：plan 拆解（pi-agent-core 自己管 reasoning），interactive ask

### 1.4 工具分发（两个引擎共用）
统一在 [utils.ts:`getExecuteTool`](../../../packages/service/core/workflow/dispatch/ai/agent/utils.ts)：
- 三类来源汇总到 `completionTools: ChatCompletionTool[]`：
  - **System tools**：`PlanAgentTool` / `readFileTool` / `datasetSearchTool` / `SANDBOX_TOOLS`
  - **Capability tools**：当前主要是 `sandboxSkills` 提供的 6 个（read/write/edit/execute/search/fetchUserFile）
  - **User tools**：`getAgentRuntimeTools` 从 `selectedTools` 转成 `tool / workflow / toolWorkflow` 三类
- 输入 `{ callId, toolId, args }`，输出 `{ response, usages, nodeResponse, planResult, capabilityAssistantResponses, stop }`

### 1.5 Skill 机制（**关键**）
Skill 不是 SDK 概念，是 FastGPT 自创的 progressive disclosure 模式（[capability/sandboxSkills.ts](../../../packages/service/core/workflow/dispatch/ai/agent/capability/sandboxSkills.ts) + [sub/sandbox/prompt.ts:30](../../../packages/service/core/workflow/dispatch/ai/agent/sub/sandbox/prompt.ts)）：

```
skill = (
  systemPrompt 中注入 skill 元数据  // <agent_skills><skill><name/></skill></agent_skills>
  + 6 个 sandbox tool 暴露给 LLM   // sandbox_read_file 等
  + sandbox 容器中放置 SKILL.md    // 容器内 /workspace/<skill>/SKILL.md
)
```

LLM 看到 skill 元数据后，**自主**用 `sandbox_read_file` 加载完整 SKILL.md，再用 `sandbox_execute` 跑里面的脚本。

> **结论**：skill 机制对底层 Agent SDK 完全透明，只要 SDK 能（a）拼接 systemPrompt（b）暴露 tool，就能用 skill。

### 1.6 计费数据流
```
Tool/LLM 调用产生 ChatNodeUsageType{ inputTokens, outputTokens, totalPoints, moduleName, model }
   ↓
usagePush(usages: ChatNodeUsageType[])  // dispatchProps 透传下来的回调
   ↓
工作流上层结算
```

每次 LLM 调用都要 push 一条，不是只 push 总和（**梯度计费**要求按调用计价后累加，见 [agentLoop/index.ts:328-344](../../../packages/service/core/ai/llm/agentLoop/index.ts)）。

---

## 2. OpenAI Agents SDK 关键能力（已验证）

> 详细调研结果见同目录 `research-notes.md`（如需），此处只列与三大问题相关的结论。

### 2.1 Token / Usage 数据结构

**Run 级别**（来自 `packages/agents-core/src/usage.ts:31-200`、`result.ts:69-200`）：
```ts
result.state.usage = {
  requests: number,
  inputTokens, outputTokens, totalTokens,
  inputTokensDetails: { cached_tokens?: number, ... },
  outputTokensDetails: { reasoning_tokens?: number, ... },
  requestUsageEntries: RequestUsage[]  // ← 每次 LLM 调用一条
}

type RequestUsage = {
  inputTokens, outputTokens, totalTokens,
  inputTokensDetails, outputTokensDetails,
  endpoint: 'responses.create' | 'responses.compact' | 'chat.completions' | ...
}
```

更细到 raw response：
```ts
result.rawResponses: ModelResponse[]
// 每个 ModelResponse 自带 usage、responseId、requestId、providerData
```

Stream 模式：`runContext.usage` 实时更新，`await stream.completed` 后从 `stream.state.usage` 一次性拿到全量；中途也可订阅 `raw_model_stream_event` 的 `response.completed` 子事件读取每次响应的 usage。

**对比 pi-agent-core**：pi 只在 `turn_end` 给汇总 usage，要细分得自己累加；OAI-Agents 原生就提供 per-request 明细。

### 2.2 自定义 Model Provider

**核心发现**：可以走 `OpenAIProvider({ openAIClient: customOpenAI })` 注入自建 `OpenAI` 客户端实例，每个 dispatch 一个 `Runner`，无需用进程级全局 setter，天然支持多租户多 baseUrl 并发。

```ts
import { Agent, Runner, OpenAIProvider, setOpenAIAPI } from '@openai/agents';
import OpenAI from 'openai';

setOpenAIAPI('chat_completions');  // 第三方兼容 endpoint 必须切这条路径

function makeRunner(cfg: { baseURL: string; apiKey: string; headers?: Record<string,string> }) {
  const client = new OpenAI({ apiKey: cfg.apiKey, baseURL: cfg.baseURL, defaultHeaders: cfg.headers });
  return new Runner({ modelProvider: new OpenAIProvider({ openAIClient: client }) });
}
```

> 不要用 `setDefaultOpenAIClient`（进程级全局），多并发会互相污染。

### 2.3 Tool 定义

**`tool()` 接受 zod object 或 JSON Schema**（`packages/agents-core/src/tool.ts:1215-1260`）：

```ts
import { tool } from '@openai/agents';
const myTool = tool({
  name: 'foo',
  description: 'do foo',
  parameters: { type: 'object', properties: {...}, additionalProperties: false },  // JSON Schema
  strict: false,                                                                    // 必须，因为现有 schema 不一定满足 OpenAI strict 规范
  async execute(input, runContext, details) {
    details?.signal?.throwIfAborted();
    return await fastgptDispatchTool({ callId: details!.toolCall.callId, toolId: 'foo', args: JSON.stringify(input) });
  },
  errorFunction: (ctx, err) => `tool error: ${err.message}`,
  timeoutMs: 60_000
});
```

**Tool 流事件**：`run_item_stream_event` → `name: 'tool_called' | 'tool_output' | 'tool_approval_requested' | 'message_output_created' | ...`

### 2.4 Skill 概念

❌ **SDK 没有 Skill 一等概念**。但 FastGPT 的 skill 是「prompt + tools」组合，对 SDK 透明：
- 把 `capabilitySystemPrompt`（含 `<agent_skills>` 块）拼到 `Agent.instructions`
- 把 `capabilityTools`（6 个 sandbox tool）放进 `Agent.tools`
- LLM 自主调用 `sandbox_read_file` 时，SDK 转发到 FastGPT `executeTool` → `dispatchSandboxReadFile` → 沙箱容器

**未来扩展**：如果想做"按场景动态切换 skill 集"，可以用 `Agent.asTool(...)` 把每个 skill 包成子 Agent，由 router agent 通过 `handoffs` 切换。

### 2.5 中断 & 序列化

```ts
const ctrl = new AbortController();
checkIsStopping 轮询 → ctrl.abort()
const result = await run(agent, input, { signal: ctrl.signal, maxTurns: 100 });

// 跨轮恢复
const snapshot = result.state.toString();   // 整个状态序列化为 JSON 字符串，存到 memories
const state = await RunState.fromString(agent, snapshot);
const resumed = await run(agent, state);
```

### 2.6 兼容性

| 项 | 要求 | FastGPT 现状 |
|---|---|---|
| Node | ≥20 | ✅ 20 |
| zod | **v4** | ✅ catalog 锁 `^4` |
| openai | `^6.26.0`（peer） | 待确认（需 `cd packages/service && pnpm why openai` 实测） |
| ESM | 纯 ESM + CJS dual | ✅ `@fastgpt/service` 已是 ESM |

---

## 3. 三大问题对照方案

### 3.1 ✅ 计费 token

**对照映射**：
```
SDK: result.state.usage.requestUsageEntries[]
   ↓ 每条 RequestUsage → ChatNodeUsageType
FastGPT: usagePush([{ inputTokens, outputTokens, totalPoints, moduleName, model }])
```

**实现方式（伪代码，见 §5.3）**：
```ts
// run 结束后
const entries = result.state.usage.requestUsageEntries ?? [];
const usages: ChatNodeUsageType[] = entries.map(e => {
  const totalPoints = userKey ? 0 : formatModelChars2Points({
    model: modelData,
    inputTokens: e.inputTokens,
    outputTokens: e.outputTokens
  }).totalPoints;
  return {
    moduleName: i18nT('account_usage:agent_call'),
    model: modelData.name,
    inputTokens: e.inputTokens,
    outputTokens: e.outputTokens,
    totalPoints
  };
});
usagePush(usages);
```

**风险**：第三方 provider（DeepSeek、阿里、火山）的 `cached_tokens` / `reasoning_tokens` 字段名可能不一致，**首期可以先不读这两个细分字段**，只取 `inputTokens` / `outputTokens` 走基础计费；后续要做缓存折扣计费时再按 provider 适配。

### 3.2 ✅ 传入 tool

**关键洞察**：**完全复用** 现有的 `getExecuteTool` —— 桥接层只负责把 `ChatCompletionTool[]` 转成 SDK tool[]，execute 直接回调 FastGPT 的工具分发。

```ts
import { tool as oaiTool } from '@openai/agents';

function buildOpenAITools(ctx: ToolDispatchContext) {
  const executeTool = getExecuteTool(ctx);
  return ctx.completionTools
    .filter(t => t.function.name !== SubAppIds.plan)  // 看决策点 §6.1
    .map(t => oaiTool({
      name: t.function.name,
      description: t.function.description ?? '',
      parameters: (t.function.parameters as any) ?? { type: 'object', properties: {} },
      strict: false,
      execute: async (input, _runCtx, details) => {
        const callId = details?.toolCall.callId ?? getNanoid(8);
        const { response, usages, nodeResponse, capabilityAssistantResponses } = await executeTool({
          callId,
          toolId: t.function.name,
          args: JSON.stringify(input)
        });
        // 工具内部产生的 usage 立刻 push（沙箱、子工作流、子工具会带）
        if (usages?.length) ctx.usagePush(usages);
        if (nodeResponse) ctx.nodeResponses.push(nodeResponse);
        if (capabilityAssistantResponses?.length) ctx.capAssistantResponses.push(...capabilityAssistantResponses);
        return response;
      }
    }));
}
```

**所有现存工具都能直接接入**：
- ✅ User tools（dispatchTool / dispatchApp / dispatchPlugin）
- ✅ System tools（fileRead / datasetSearch / SANDBOX_TOOLS）
- ✅ Capability tools（sandboxSkills 的 6 个工具）
- ⚠️ PlanAgentTool 看 §6.1 决策

### 3.3 ✅ 使用 skill

**直接复用** [createSandboxSkillsCapability](../../../packages/service/core/workflow/dispatch/ai/agent/capability/sandboxSkills.ts:192) 即可，跟 `dispatchPiAgent` 用法一模一样：

```ts
// 在 dispatchOpenAIAgent 里，照抄 piAgent/index.ts 的 capabilities 初始化逻辑
if (env.SHOW_SKILL) {
  const sandboxCap = await createSandboxSkillsCapability({
    skillIds: normalizedSkillIds,
    teamId, tmbId, sessionId, mode: sandboxMode,
    workflowStreamResponse,
    showSkillReferences,
    allFilesMap
  });
  capabilities.push(sandboxCap);
}

const capabilitySystemPrompt = capabilities.map(c => c.systemPrompt).filter(Boolean).join('\n\n');
const capabilityTools = capabilities.flatMap(c => c.completionTools ?? []);
const capabilityToolCallHandler = createCapabilityToolCallHandler(capabilities);

// 然后构造 Agent
const agent = new Agent({
  name: 'fastgpt-agent',
  instructions: parseUserSystemPrompt({
    userSystemPrompt: `${systemPrompt}\n\n${capabilitySystemPrompt}`.trim(),
    selectedDataset: datasetParams?.datasets
  }),
  tools: buildOpenAITools(toolCtx),  // ← 已含 capabilityTools（沙箱 skill 工具）
  model: cfg.model
});
```

skill 元数据进 prompt、sandbox tool 进 tools，LLM 自主调用 → 走到 `executeTool` → `capabilityToolCallHandler` → `buildSessionHandler` → 沙箱容器。**与现有 default/pi 引擎逻辑完全一致**。

---

## 4. 集成方案设计

### 4.1 总体策略
**新增第三种引擎**，不替换 default / pi：

```ts
// env.ts
AGENT_ENGINE: z.enum(['default', 'pi', 'openai']).default('default')

// dispatch/ai/agent/index.ts
if (env.AGENT_ENGINE === 'pi') return dispatchPiAgent(props);
if (env.AGENT_ENGINE === 'openai') return dispatchOpenAIAgent(props);
// 否则走 default Plan+Master
```

理由：
- `default` 引擎是 FastGPT 自家 Plan+Step 能力，OAI-Agents 替代不了 plan
- 三种引擎并存便于 A/B 比较与回滚
- env 切换零业务侵入

### 4.2 文件结构（新增）

```
packages/service/core/workflow/dispatch/ai/agent/
├─ openaiAgent/                         (新增目录，参照 piAgent/)
│  ├─ index.ts                          (主调度入口)
│  ├─ modelBridge.ts                    (OpenAI 客户端构建 + Provider 注入)
│  ├─ toolAdapter.ts                    (ChatCompletionTool[] → tool[])
│  ├─ usageBridge.ts                    (RequestUsageEntry[] → ChatNodeUsageType[])
│  └─ streamBridge.ts                   (run_item_stream_event → SSE)
└─ index.ts                             (顶部多加一个 if 分支)
```

依赖：`packages/service/package.json` 新增 `"@openai/agents": "^0.8.5"`、`"openai": "^6.26.0"`（确认与现有版本兼容）。

### 4.3 核心代码骨架

#### 4.3.1 modelBridge.ts
```ts
import OpenAI from 'openai';
import { OpenAIProvider, setOpenAIAPI, setTracingDisabled } from '@openai/agents';
import { getLLMModel } from '../../../../../ai/model';

setOpenAIAPI('chat_completions');  // 全局：兼容第三方 endpoint
setTracingDisabled(true);          // 全局：禁止 trace 外发到 OpenAI

const aiProxyBaseUrl = process.env.AIPROXY_API_ENDPOINT ? `${process.env.AIPROXY_API_ENDPOINT}/v1` : undefined;
const defaultBaseUrl = aiProxyBaseUrl || process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
const defaultApiKey = process.env.AIPROXY_API_TOKEN || process.env.CHAT_API_KEY || '';

export function buildOpenAIRunner(modelNameOrId?: string) {
  const cfg = getLLMModel(modelNameOrId);
  const rawUrl = cfg?.requestUrl ?? '';
  const baseURL = rawUrl ? rawUrl.replace(/\/chat\/completions$/, '') : defaultBaseUrl;
  const apiKey = cfg?.requestAuth || defaultApiKey;

  const client = new OpenAI({ apiKey, baseURL });
  const provider = new OpenAIProvider({ openAIClient: client });

  return {
    provider,
    modelId: cfg?.model ?? 'gpt-4o',
    modelData: cfg
  };
}
```

#### 4.3.2 toolAdapter.ts
```ts
import { tool as oaiTool } from '@openai/agents';
import { SubAppIds } from '@fastgpt/global/core/workflow/node/agent/constants';
import { SseResponseEventEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import { getExecuteTool, type ToolDispatchContext } from '../utils';

export function buildOpenAITools({
  ctx,
  nodeResponses,
  capabilityAssistantResponses,
  usagePush
}: { ctx: ToolDispatchContext; nodeResponses: ChatHistoryItemResType[]; capabilityAssistantResponses: AIChatItemValueItemType[]; usagePush: (u: ChatNodeUsageType[]) => void }) {
  const executeTool = getExecuteTool(ctx);

  return ctx.completionTools
    .filter(t => t.function.name !== SubAppIds.plan)  // OAI-Agents 自管 reasoning,先不喂 plan
    .map(t => {
      const toolId = t.function.name;
      return oaiTool({
        name: toolId,
        description: t.function.description ?? '',
        parameters: (t.function.parameters as any) ?? { type: 'object', properties: {}, additionalProperties: false },
        strict: false,
        async execute(input, _ctx, details) {
          const callId = details?.toolCall.callId ?? '';
          const subInfo = ctx.getSubAppInfo(toolId);

          ctx.streamResponseFn?.({
            id: callId, event: SseResponseEventEnum.toolCall,
            data: { tool: { id: callId, toolName: subInfo?.name || toolId, toolAvatar: subInfo?.avatar || '', functionName: toolId, params: JSON.stringify(input) } }
          });

          const { response, usages = [], nodeResponse, capabilityAssistantResponses: capResps = [] } = await executeTool({
            callId, toolId, args: JSON.stringify(input)
          });

          if (nodeResponse) nodeResponses.push(nodeResponse);
          if (usages.length) usagePush(usages);
          if (capResps.length) capabilityAssistantResponses.push(...capResps);

          ctx.streamResponseFn?.({
            id: callId, event: SseResponseEventEnum.toolResponse,
            data: { tool: { response } }
          });

          return response;
        }
      });
    });
}
```

#### 4.3.3 usageBridge.ts
```ts
import type { ChatNodeUsageType } from '@fastgpt/global/support/wallet/bill/type';
import type { Usage as OAIUsage } from '@openai/agents';
import { formatModelChars2Points } from '../../../../../support/wallet/usage/utils';
import { i18nT } from '../../../../../../web/i18n/utils';

export function convertOAIUsageToChatNodeUsages({
  usage, modelData, userKey
}: { usage: OAIUsage; modelData: LLMModelItemType; userKey?: any }): ChatNodeUsageType[] {
  const entries = usage.requestUsageEntries ?? [];
  if (entries.length === 0) {
    // fallback: 总和当一条
    const totalPoints = userKey ? 0 : formatModelChars2Points({
      model: modelData,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens
    }).totalPoints;
    return [{
      moduleName: i18nT('account_usage:agent_call'),
      model: modelData.name,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      totalPoints
    }];
  }

  return entries.map(e => {
    const totalPoints = userKey ? 0 : formatModelChars2Points({
      model: modelData,
      inputTokens: e.inputTokens,
      outputTokens: e.outputTokens
    }).totalPoints;
    return {
      moduleName: i18nT('account_usage:agent_call'),
      model: modelData.name,
      inputTokens: e.inputTokens,
      outputTokens: e.outputTokens,
      totalPoints
    };
  });
}
```

#### 4.3.4 index.ts（主调度，关键流程）
```ts
export const dispatchOpenAIAgent = async (props: DispatchAgentModuleProps): Promise<Response> => {
  // ... 文件、capabilities、systemPrompt、subapps 初始化（直接照抄 piAgent/index.ts:70-160）...

  const { provider, modelId, modelData } = buildOpenAIRunner(model);
  const runner = new Runner({ modelProvider: provider });

  const oaiMessagesKey = `oaiMessages-${nodeId}`;
  const lastHistory = chatHistories[chatHistories.length - 1];
  const restoredStateJSON = lastHistory?.obj === ChatRoleEnum.AI
    ? (lastHistory.memories?.[oaiMessagesKey] as string | undefined)
    : undefined;

  const tools = buildOpenAITools({ ctx: toolCtx, nodeResponses, capabilityAssistantResponses, usagePush });

  const agent = new Agent({
    name: 'fastgpt-agent',
    instructions: formatedSystemPrompt,
    model: modelId,
    tools
  });

  const ctrl = new AbortController();
  const stopPoller = setInterval(() => {
    if (checkIsStopping()) { ctrl.abort(); clearInterval(stopPoller); }
  }, 200);

  let answerText = '';
  let result;
  try {
    const input = restoredStateJSON
      ? await RunState.fromString(agent, restoredStateJSON)  // 续跑
      : formatUserChatInput;

    // 追加新输入到 state（如果是续跑场景）
    const stream = await runner.run(agent, input, {
      signal: ctrl.signal,
      maxTurns: 100,
      stream: true
    });

    for await (const event of stream) {
      if (event.type === 'raw_model_stream_event') {
        // 文本增量
        const delta = (event.data as any).delta;
        if (typeof delta === 'string') {
          answerText += delta;
          workflowStreamResponse?.({
            event: SseResponseEventEnum.answer,
            data: textAdaptGptResponse({ text: delta })
          });
        }
      }
      // tool_called / tool_output 事件已在 buildOpenAITools 内手动 emit，不重复
    }

    await stream.completed;
    result = stream;
  } finally {
    clearInterval(stopPoller);
  }

  // ===== 计费 =====
  usagePush(convertOAIUsageToChatNodeUsages({ usage: result.state.usage, modelData, userKey: externalProvider.openaiAccount }));

  // ===== 返回 =====
  if (answerText) assistantResponses.push({ text: { content: answerText } });

  return {
    data: { [NodeOutputKeyEnum.answerText]: answerText },
    [DispatchNodeResponseKeyEnum.memories]: {
      [oaiMessagesKey]: result.state.toString()  // 序列化全部状态用于跨轮恢复
    },
    [DispatchNodeResponseKeyEnum.assistantResponses]: assistantResponses,
    [DispatchNodeResponseKeyEnum.nodeResponses]: nodeResponses
  };
};
```

### 4.4 数据流总览

```
用户输入
   ↓
dispatchRunAgent (env.AGENT_ENGINE='openai')
   ↓
dispatchOpenAIAgent
   ├─ formatFileInput / capabilities / getSubapps   (复用)
   ├─ buildOpenAIRunner(model)                       (新)
   │     └─ new OpenAI({ baseURL, apiKey })
   │     └─ new OpenAIProvider({ openAIClient })
   ├─ buildOpenAITools(ctx)                          (新)
   │     └─ 每个 tool.execute → getExecuteTool(ctx) → 现有分发链
   ├─ runner.run(agent, input, { signal, stream })
   │     ↓
   │   SDK 内部多轮 LLM + tool_call
   │     ↓
   │   stream: raw_model_stream_event / run_item_stream_event
   │     ↓ (toolAdapter 内 emit SSE)
   │   workflowStreamResponse → 客户端
   ├─ convertOAIUsageToChatNodeUsages(result.state.usage)
   │     └─ usagePush(usages)                        (新桥接,复用 formatModelChars2Points)
   └─ result.state.toString() → memories             (跨轮恢复)
```

---

## 5. 三大问题对照实现速查

| 问题 | 实现位置 | 关键 API | 改动量 |
|---|---|---|---|
| 1. 拿到 token 计费 | `usageBridge.ts` | `result.state.usage.requestUsageEntries[]` → `ChatNodeUsageType[]` → `usagePush(...)` | ~30 行 |
| 2. 传入 tool | `toolAdapter.ts` | `tool({ parameters: t.function.parameters, execute: ... })` | ~50 行 |
| 3. 使用 skill | 复用 `createSandboxSkillsCapability`，把 systemPrompt 注入 `Agent.instructions`、tools 注入 `Agent.tools` | 0 行新代码（与 piAgent 一致） |

---

## 6. 决策点与风险

### 6.1 ⚠️ Plan + Step 拆解能力如何处理 [需用户拍板]

**背景**：default 引擎的 `PlanAgentTool` 提供两个核心价值：
- 显式拆解任务为多个 step
- 支持 plan 中途用户 ask（人在回路）

**OAI-Agents 没有等价机制**。三种选择：

| 方案 | 描述 | 优劣 |
|---|---|---|
| **A. 不要 plan** | 完全交给 SDK 自主多轮 reasoning（max_turns=100） | 最简单；但任务复杂度高时模型可能跑偏 |
| **B. Plan as tool** | 把现有 `PlanAgentTool` 作为一个 SDK tool 喂进去（保留 toolAdapter 中对 plan 的过滤逻辑反过来） | 兼容现有 plan 能力；interactive ask 需要走 SDK 的 `needsApproval` + `RunState` 序列化机制重写 |
| **C. 双 Agent + handoff** | plannerAgent + workerAgent，handoff 切换 | 最贴近原 default 引擎模型；改造量最大 |

**推荐**：**A**（首期）。理由：OAI-Agents 引擎本身就是为「自主多步推理 + 工具调用」设计的，强行套 plan 反而压制了它的优势；如果要 plan，留着 default 引擎用就行。

### 6.2 ⚠️ Tracing 默认外发 [必须处理]

OAI-Agents 默认会上传 trace 到 `https://api.openai.com/v1/traces`，**包含完整的 prompt / tool args / response**。

**解决**：`modelBridge.ts` 顶部 `setTracingDisabled(true)`（已写入 §4.3.1）。

### 6.3 ⚠️ 多租户并发下的全局 setter [必须处理]

下列 setter 是**进程级单例**：
- `setDefaultOpenAIClient`
- `setDefaultOpenAIKey`
- `setDefaultModelProvider`
- `setOpenAIAPI`（部分例外，下面说明）

**对策**：
- ✅ 用 `new Runner({ modelProvider })` 每次 dispatch 创建独立 Runner（已在 §4.3.4 体现）
- ✅ `setOpenAIAPI('chat_completions')` 和 `setTracingDisabled(true)` 是「全进程一次性配置」性质，进程启动时设一次即可，不会有多租户冲突
- ❌ 不要在 dispatch 路径中调 `setDefaultOpenAIClient`

### 6.4 ⚠️ Cached / Reasoning Tokens [可延后]

第三方 provider（DeepSeek、阿里、火山等）的 `inputTokensDetails.cached_tokens` / `outputTokensDetails.reasoning_tokens` 字段名可能不一致。

**首期**：只读 `inputTokens` / `outputTokens` 走基础计费，已能 100% 满足现有计费精度。
**后期**：要做 cached token 折扣计费时再按 provider 适配。

### 6.5 ⚠️ Interactive 工具响应 [影响范围有限]

OAI-Agents 通过 `tool({ needsApproval: true })` + `RunState.fromString` 实现 HITL，与 FastGPT 的 `WorkflowInteractiveResponseType` 机制不兼容。

**首期对策**：在 `toolAdapter` 里**不开启** interactive；如果走到产生 interactive 的工具，直接当 stop 处理（response = 错误消息）。default 引擎仍然支持 interactive，是 default 的差异化能力。

### 6.6 ⚠️ 包版本冲突 [需验证]

OAI-Agents peer dep `openai@^6.26.0`，需确认 `pnpm why openai` 现有版本是否兼容。FastGPT 可能在 `packages/service` 下接入了别的 openai 调用，可能要统一版本。

**验证命令**：
```bash
cd /Volumes/code/fastgpt-pro/FastGPT/packages/service && pnpm why openai
```

### 6.7 ⚠️ State 序列化体积 [可观测]

`result.state.toString()` 会把 history、turn、pending tool calls 全部序列化。多轮长会话场景下 memories 字段会很大。

**对策**：
- 监控 `oaiMessagesKey` 字段大小
- 如超过阈值（如 200KB），降级为只保存 `result.history`，下次启动新 Agent 重新构建（损失 plan/turn 元信息但消息历史保留）

---

## 7. 落地里程碑（建议）

| 里程碑 | 工作内容 | 预估工时 |
|---|---|---|
| **M1：依赖与基础设施** | `pnpm add @openai/agents`；env 增加 `'openai'` 枚举；新建 `openaiAgent/` 目录骨架 | 0.5d |
| **M2：modelBridge + toolAdapter** | 实现 `buildOpenAIRunner` / `buildOpenAITools` / `usageBridge`；写最小 e2e（hello world tool） | 1.5d |
| **M3：主调度 + skill** | 实现 `dispatchOpenAIAgent`；接入 `createSandboxSkillsCapability`；接入 SSE 流；接入 `RunState` 续跑 | 2d |
| **M4：计费验证** | 跑通 OpenAI / DeepSeek / 阿里 三类 endpoint；对 `usagePush` 输出做单测，对比 default 引擎一致性 | 1d |
| **M5：边界 & 灰度** | abort、超时、错误重试、context 压缩、长会话 | 1d |
| **M6：文档 + 灰度** | 写 docs；先内部 `AGENT_ENGINE=openai` 灰度 | 0.5d |

总计 ~ **6.5 人日**。

---

## 8. 待用户确认的问题

1. **是否同意"新增第三种引擎"而非替换 pi**？（推荐新增）
2. **Plan 拆解能力是否要保留**？（推荐首期不要，详见 §6.1）
3. **Interactive ask 是否要支持**？（推荐首期不要，详见 §6.5）
4. **首期支持的 LLM provider 范围**：仅 OpenAI 官方 / OpenAI + 第三方兼容 endpoint / 含 Claude+Gemini（需走 ai-sdk 桥，beta）？
5. **是否接受 `setTracingDisabled(true)` 直接禁掉所有 trace 上传**？（推荐是；如果想留 trace，需自建 trace 上报 endpoint）

---

## 附录 A：参考链接

- 主文档：https://openai.github.io/openai-agents-js/
- Models 指南：https://openai.github.io/openai-agents-js/guides/models
- AI SDK 适配（Claude/Gemini 走这条）：https://openai.github.io/openai-agents-js/extensions/ai-sdk
- 仓库：https://github.com/openai/openai-agents-js
- 关键源码（建议直接看）：
  - `packages/agents-core/src/usage.ts`（Usage / RequestUsage）
  - `packages/agents-core/src/result.ts`（RunResult / StreamedRunResult）
  - `packages/agents-core/src/run.ts`（Runner / RunConfig）
  - `packages/agents-openai/src/openaiProvider.ts`
  - `packages/agents-core/src/runState.ts:914-931`（fromString / 续跑）
  - `examples/model-providers/custom-example-global.ts`（最贴近 FastGPT 需求的示例）

## 附录 B：文件清单

| 路径 | 状态 | 行数估算 |
|---|---|---|
| `packages/service/core/workflow/dispatch/ai/agent/openaiAgent/index.ts` | 新增 | ~280 |
| `packages/service/core/workflow/dispatch/ai/agent/openaiAgent/modelBridge.ts` | 新增 | ~50 |
| `packages/service/core/workflow/dispatch/ai/agent/openaiAgent/toolAdapter.ts` | 新增 | ~80 |
| `packages/service/core/workflow/dispatch/ai/agent/openaiAgent/usageBridge.ts` | 新增 | ~40 |
| `packages/service/core/workflow/dispatch/ai/agent/openaiAgent/streamBridge.ts` | 新增（如必要） | ~60 |
| `packages/service/core/workflow/dispatch/ai/agent/index.ts` | 修改（+1 if） | +3 |
| `packages/service/env.ts` | 修改（枚举扩展） | +0（改字面量） |
| `packages/service/package.json` | 修改 | +1 deps |

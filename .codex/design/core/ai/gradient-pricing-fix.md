# 梯度价格计算修复设计文档

## 问题描述

### 背景

梯度价格（Gradient Pricing）通过 `inputTokens` 数量来匹配不同的计费梯度：

```
梯度 0: inputTokens 0 ~ 1000 → 价格 X
梯度 1: inputTokens 1000+   → 价格 Y
```

### 根本原因

当一个工作流节点（如 Tool Call、Agent）在内部多次调用 LLM 时，旧逻辑是：

1. 将所有 LLM 调用的 `inputTokens` / `outputTokens` **累加**
2. 用累加后的总量调用 `formatModelChars2Points(totalInputTokens)` **一次性**计算价格

这样会导致梯度匹配错误：

```
场景：模型梯度 0~1000 tokens → 价格 A；1000+ → 价格 B（更低）

Call 1: inputTokens = 500 → 应匹配梯度 0，价格 A
Call 2: inputTokens = 600 → 应匹配梯度 0，价格 A

正确总价：A * 500/1000 + A * 600/1000

错误做法：累加 1100 tokens → 匹配梯度 1，价格 B
错误总价：B * 1100/1000（价格偏低，用户少付钱）
```

---

## 受影响的代码位置

### 1. `packages/service/core/ai/llm/agentCall/index.ts` — 根源

```ts
// 问题：在 while 循环中累加 tokens
inputTokens += usage.inputTokens;
outputTokens += usage.outputTokens;

// 每次调用单独计算价格并推送（当 usagePush 存在时），但不记录进返回值
const agentUsage = formatModelChars2Points({ inputTokens: usage.inputTokens, ... });
usagePush?.([{ totalPoints: agentUsage.totalPoints, ... }]);

// 返回的是累加值，调用方再次用累加值计算价格 → 重复错误
return { inputTokens, outputTokens, ... };
```

**后果：**
- 当 `usagePush` 不传（如来自 `runToolCall`）时，单次计价被丢弃，调用方用累加值重算
- 当 `usagePush` 传入（如来自 `masterCall`）时，单次计价已正确推送，但调用方仍用累加值做展示

### 2. `packages/service/core/workflow/dispatch/ai/tool/index.ts` (dispatchRunTools) — **计费 BUG**

```ts
// toolCallInputTokens = 所有轮次累加的 tokens
const { totalPoints: modelTotalPoints } = formatModelChars2Points({
  inputTokens: toolCallInputTokens,   // ❌ 累加值
  outputTokens: toolCallOutputTokens
});
```

`runToolCall` 调用 `runAgentLoop` 时**不传 `usagePush`**，所以单次计价全部丢失，只依赖这里的累加计算 → **实际计费错误**。

### 3. `packages/service/core/workflow/dispatch/ai/agent/master/call.ts` (masterCall) — **展示 BUG**

```ts
// inputTokens = runAgentLoop 返回的累加值
const llmUsage = formatModelChars2Points({
  inputTokens,   // ❌ 累加值
  outputTokens
});
```

虽然实际计费通过 `usagePush` 正确推送，但 `nodeResponse.totalPoints` 展示值错误。

### 4. `packages/service/core/workflow/dispatch/ai/agent/sub/plan/index.ts` (dispatchPlanAgent) — **计费 + 展示 BUG**

```ts
// 再生成时累加 tokens
usage.inputTokens += regenerateResponse.usage.inputTokens;
usage.outputTokens += regenerateResponse.usage.outputTokens;

// 用累加值计算
const { totalPoints } = formatModelChars2Points({
  inputTokens: usage.inputTokens,   // ❌ 累加值
  outputTokens: usage.outputTokens
});
```

---

## 修复方案

### 核心思路

**不应用累加的 token 数计算价格，而应该每次 LLM 调用单独计价，再累加价格。**

### 方案：`runAgentLoop` 返回预计算的 `llmTotalPoints`

在 `runAgentLoop` 的 while 循环中，每次 LLM 调用后立即计算该次的价格，并累加到 `llmTotalPoints`，最终将其作为返回值之一。调用方直接使用该预计算值，而不再重复调用 `formatModelChars2Points(累加 tokens)`。

---

## 具体修改

### 修改 1：`runAgentLoop` — 增加 `llmTotalPoints` 返回值

**文件**：`packages/service/core/ai/llm/agentCall/index.ts`

```ts
// RunAgentResponse 类型新增字段
type RunAgentResponse = {
  ...
  llmTotalPoints: number;  // ← 新增
  inputTokens: number;     // 保留，用于展示
  outputTokens: number;    // 保留，用于展示
  ...
};

// 内部实现
let llmTotalPoints: number = 0;   // ← 新增

// while 循环内，每次 LLM 调用后：
const agentUsage = formatModelChars2Points({
  model: modelData.model,
  inputTokens: usage.inputTokens,   // 当次调用的 tokens
  outputTokens: usage.outputTokens
});
llmTotalPoints += agentUsage.totalPoints;   // ← 累加价格（不是 tokens）
usagePush?.([{ totalPoints: agentUsage.totalPoints, ... }]);

// return 新增
return {
  ...
  llmTotalPoints,
};
```

### 修改 2：`runToolCall` — 透传 `llmTotalPoints`

**文件**：`packages/service/core/workflow/dispatch/ai/tool/toolCall.ts`

```ts
// ResponseType 新增
type ResponseType = {
  ...
  toolCallTotalPoints: number;  // ← 新增（替代用累加 tokens 重算的方式）
  toolCallInputTokens: number;  // 保留展示用
  toolCallOutputTokens: number; // 保留展示用
};

// runAgentLoop 返回后
const { inputTokens, outputTokens, llmTotalPoints, ... } = await runAgentLoop(...);

return {
  ...
  toolCallTotalPoints: llmTotalPoints,   // ← 透传
  toolCallInputTokens: inputTokens,
  toolCallOutputTokens: outputTokens,
};
```

### 修改 3：`dispatchRunTools` — 使用预计算值

**文件**：`packages/service/core/workflow/dispatch/ai/tool/index.ts`

```ts
// 修改前（❌）
const { totalPoints: modelTotalPoints, modelName } = formatModelChars2Points({
  model,
  inputTokens: toolCallInputTokens,
  outputTokens: toolCallOutputTokens
});

// 修改后（✅）
// modelName 直接从 toolModel.name 获取，无需再调用 formatModelChars2Points
const modelName = toolModel.name;
const modelTotalPoints = toolCallTotalPoints;   // 直接使用预计算值，不再重算
```

### 修改 4：`masterCall` — 使用预计算值修正展示

**文件**：`packages/service/core/workflow/dispatch/ai/agent/master/call.ts`

```ts
// runAgentLoop 返回 llmTotalPoints
const { inputTokens, outputTokens, llmTotalPoints, childrenUsages, ... } = await runAgentLoop(...);

// 修改前（❌）
const llmUsage = formatModelChars2Points({ model: agentModel, inputTokens, outputTokens });

// 修改后（✅）
const modelData = getLLMModel(agentModel);
const llmUsage = {
  modelName: modelData.name,
  totalPoints: llmTotalPoints   // 使用预计算值
};
```

### 修改 5：`dispatchPlanAgent` — 修复累加重算

**文件**：`packages/service/core/workflow/dispatch/ai/agent/sub/plan/index.ts`

在每次 `createLLMResponse` 调用后单独计算该次价格：

```ts
let totalPoints = 0;

// 初始调用：
const initialResult = await createLLMResponse(...);
const initialUsage = formatModelChars2Points({
  model: modelData.model,
  inputTokens: initialResult.usage.inputTokens,   // 单次 tokens
  outputTokens: initialResult.usage.outputTokens
});
totalPoints += initialUsage.totalPoints;
usage.inputTokens += initialResult.usage.inputTokens;  // 累加 tokens 仅用于展示
usage.outputTokens += initialResult.usage.outputTokens;

// 再生成时：
const regenResult = await createLLMResponse(...);
const regenUsage = formatModelChars2Points({
  model: modelData.model,
  inputTokens: regenResult.usage.inputTokens,   // 单次 tokens
  outputTokens: regenResult.usage.outputTokens
});
totalPoints += regenUsage.totalPoints;
usage.inputTokens += regenResult.usage.inputTokens;
usage.outputTokens += regenResult.usage.outputTokens;

// 最终用 totalPoints（累加价格）
```

---

## 不受影响的位置（单次调用，无问题）

| 文件 | 调用方式 | 状态 |
|------|---------|------|
| `dispatch/ai/chat.ts` | 单次 `createLLMResponse` | ✅ 正确 |
| `dispatch/ai/extract.ts` | 单次 `createLLMResponse` | ✅ 正确 |
| `dispatch/ai/classifyQuestion.ts` | 单次 `createLLMResponse` | ✅ 正确 |
| `dispatch/tools/queryExternsion.ts` | 单次 LLM 调用 | ✅ 正确 |
| `dispatch/dataset/search.ts` | 各自独立单次调用 | ✅ 正确 |

---

## 修改文件清单

| 文件 | 修改内容 |
|------|---------|
| `packages/service/core/ai/llm/agentCall/index.ts` | 新增 `llmTotalPoints` 累加及返回 |
| `packages/service/core/workflow/dispatch/ai/tool/toolCall.ts` | 透传 `toolCallTotalPoints` |
| `packages/service/core/workflow/dispatch/ai/tool/index.ts` | 使用 `toolCallTotalPoints` 替代重算 |
| `packages/service/core/workflow/dispatch/ai/agent/master/call.ts` | 使用 `llmTotalPoints` 替代重算 |
| `packages/service/core/workflow/dispatch/ai/agent/sub/plan/index.ts` | 每次调用单独计价后累加 |

---

## TODO

- [ ] 修改 `runAgentLoop` 返回类型，新增 `llmTotalPoints`
- [ ] 修改 `runToolCall` 返回类型，新增 `toolCallTotalPoints`
- [ ] 修改 `dispatchRunTools` 使用预计算值
- [ ] 修改 `masterCall` 使用预计算值（修正展示）
- [ ] 修改 `dispatchPlanAgent` 每次调用单独计价
- [ ] 补充/更新相关单元测试

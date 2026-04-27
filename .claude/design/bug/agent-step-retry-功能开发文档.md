# 功能开发文档

## 文档标识

- 任务前缀：`agent-step-retry`
- 文档文件名：`agent-step-retry-功能开发文档.md`
- 文档状态：方案修订，待重新实现
- 最后更新：2026-04-24

## 0. 开发目标与约束

- 功能目标：修复 Agent v2 Step call 因 Azure 400 内容过滤导致 `step.response` 为空后，同一个 step 被重复执行和重复展示的问题。
- 纠偏说明：实现必须采用最小改动，不新增运行时 helper 文件，不把简单重试拆成额外模块。重试逻辑应直接写在 `for await (const step of agentPlan.steps)` 内部，在单个 step 的 `masterCall` 返回后立即判断并重试。
- 代码范围：
  - 修改：`FastGPT/packages/service/core/workflow/dispatch/ai/agent/index.ts`
  - 不新增：`FastGPT/packages/service/core/workflow/dispatch/ai/agent/stepRetry.ts`
  - 如前一版已新增 `stepRetry.ts`，实施本修订方案时必须删除该文件并回收导入。
- 非目标（明确不做）：不改 API、DB、前端组件、i18n 文案、`AgentStepItemSchema`，不引入新 npm 依赖，不做配置化最大重试次数。
- 实现原则：简单优先、最小改动、原地重试、只隐藏中间失败尝试。
- 必须遵循规范：`/Users/xxyyh/.codex/skills/fastgpt-requirement-design/references/style-standards-entry.md`
- 适用维度：API[ ] DB[ ] Front[x] Logger[x] Package[x] BugFix[x] DocUpdate[ ] DocI18n[ ]

## 1. 实施任务拆解（可直接执行）

| 任务ID | 任务名称 | 责任层 | 输入 | 输出 | 完成定义（DoD） |
|---|---|---|---|---|---|
| T1 | 回收非最小实现 | Service | 当前错误实现中的 `stepRetry.ts`、相关 import、测试 import | 仅保留 `index.ts` 内联重试实现 | 不存在新增运行时文件 `stepRetry.ts` |
| T2 | 在 step 循环内增加最大重试次数 | Service | `for await (const step of agentPlan.steps)` 内的 `masterCall` 调用 | `MAX_STEP_CALL_RETRY_TIMES = 3` 常量和内联 retry loop | 单个 step 最多首次执行 + 3 次重试 |
| T3 | 定义重试触发条件 | Service | `result.stepResponse?.rawResponse`、`result.nodeResponse.errorText`、`result.nodeResponse.finishReason` | `shouldRetryStepCall` 布尔判断 | 只有“返回错误且 response 为空”才重试 |
| T4 | 隐藏中间失败尝试 | Service | 第一次失败的 `assistantMessages`、`nodeResponse`、SSE | 只保留最终一次结果进入 UI/响应数据 | 中间失败不进入 `assistantResponses`、`nodeResponses`，重试时不推前端 SSE |
| T5 | 失败耗尽直接返回 | Service | 最终仍失败且 response 为空的结果 | 直接返回错误文本并清空 Agent 记忆 | 外层不再继续调度后续 step 或继续规划 |
| T6 | 回归验证 | Test/Manual | Azure 400 类空响应、正常 step、停止任务 | 自动化或手工验证记录 | 重复 step 问题消失，相邻路径不回归 |

## 2. 文件级改动清单

| 文件路径 | 改动类型 | 变更摘要 | 关联任务ID |
|---|---|---|---|
| `FastGPT/packages/service/core/workflow/dispatch/ai/agent/index.ts` | 修改 | 在 `for await (const step of agentPlan.steps)` 内，把单次 `masterCall` 改成最多 4 次尝试；中间失败不合并到前台响应 | T2,T3,T4,T5 |
| `FastGPT/packages/service/core/workflow/dispatch/ai/agent/stepRetry.ts` | 删除/不新增 | 上一版拆出的 helper 文件不符合本次最小改动要求 | T1 |
| `FastGPT/test/cases/service/core/workflow/dispatch/ai/agent/stepRetry.test.ts` | 删除/不新增 | 如果测试依赖 `stepRetry.ts`，同步删除；改为更贴近 `index.ts` 行为的验证，或记录手工验证 | T1,T6 |

## 2.1 关键代码片段（以内联方式实现）

### 2.1.1 常量与本地判断

位置：`FastGPT/packages/service/core/workflow/dispatch/ai/agent/index.ts`

放在 `dispatchRunAgent` 附近即可，不单独新建文件。

```ts
const MAX_STEP_CALL_RETRY_TIMES = 3;

const shouldRetryStepCall = (result: Awaited<ReturnType<typeof masterCall>>) =>
  !result.stepResponse?.rawResponse?.trim() &&
  !!(result.nodeResponse.errorText || result.nodeResponse.finishReason === 'error');

const getFinalStepResponseText = (result: Awaited<ReturnType<typeof masterCall>>) => {
  const rawResponse = result.stepResponse?.rawResponse;
  if (rawResponse?.trim()) return rawResponse;

  return (
    result.nodeResponse.errorText?.trim() ||
    result.stepResponse?.summary?.trim() ||
    i18nT('chat:completion_finish_error')
  );
};
```

说明：

- `MAX_STEP_CALL_RETRY_TIMES = 3` 表示失败后最多额外重试 3 次，总计最多 4 次。
- `shouldRetryStepCall` 直接内联判断 `rawResponse?.trim()` 是否为空，并且必须同时满足请求错误，不能只因为 response 为空就重试。
- `getFinalStepResponseText` 在最终结果合并或失败中断返回时使用，保证前台拿到非空文本。

### 2.1.2 替换原单次 `masterCall`

原位置：`FastGPT/packages/service/core/workflow/dispatch/ai/agent/index.ts` 的 Step calls 分支内，紧跟 `workflowStreamResponse?.({ event: SseResponseEventEnum.stepTitle ... })` 之后。

原逻辑大概是：

```ts
const result = await masterCall({
  ...props,
  systemPrompt: formatedSystemPrompt,
  masterMessages: [],
  planMessages: [],
  getSubAppInfo,
  getSubApp,
  completionTools: agentCompletionTools,
  steps: agentPlan.steps,
  step,
  filesMap,
  capabilityToolCallHandler
});
```

改成内联重试：

```ts
let result: Awaited<ReturnType<typeof masterCall>> | undefined;
let retryTimes = 0;

for (let attempt = 0; attempt <= MAX_STEP_CALL_RETRY_TIMES; attempt++) {
  result = await masterCall({
    ...props,
    // 首次执行保留原有 SSE；后台重试不推前台。
    workflowStreamResponse: attempt === 0 ? workflowStreamResponse : undefined,
    systemPrompt: formatedSystemPrompt,
    masterMessages: [],
    planMessages: [],
    getSubAppInfo,
    getSubApp,
    completionTools: agentCompletionTools,
    steps: agentPlan.steps,
    step,
    filesMap,
    capabilityToolCallHandler
  });

  const shouldRetry =
    !checkIsStopping() &&
    attempt < MAX_STEP_CALL_RETRY_TIMES &&
    shouldRetryStepCall(result);

  if (!shouldRetry) {
    break;
  }

  retryTimes++;
  getLogger(LogCategories.MODULE.AI.AGENT).warn('Step call empty response, retrying', {
    planId: agentPlan.planId,
    stepId: step.id,
    stepTitle: step.title,
    attempt,
    nextAttempt: attempt + 1,
    maxRetryTimes: MAX_STEP_CALL_RETRY_TIMES,
    finishReason: result.nodeResponse.finishReason,
    errorText: result.nodeResponse.errorText?.slice(0, 300)
  });
}

if (!result) {
  break;
}
```

### 2.1.3 只合并最终结果

重试 loop 结束后，保持现有 merge 逻辑，但只能对最终 `result` 执行：

```ts
nodeResponses.push(result.nodeResponse);

const assistantResponse = GPTMessages2Chats({
  messages: result.assistantMessages,
  reserveTool: true,
  getToolInfo: getSubAppInfo
})
  .map((item) => item.value)
  .flat()
  .map((item) => ({
    ...item,
    planId: agentPlan!.planId,
    stepId: step.id
  }));

assistantResponses.push(...assistantResponse);
```

禁止事项：

- 不要在每次 attempt 内 push `nodeResponses`。
- 不要在每次 attempt 内 merge `assistantResponses`。
- 不要在后台重试时继续用原始 `workflowStreamResponse`。

### 2.1.4 最终失败直接返回并中断

在最终结果合并前，如果重试后仍满足 `shouldRetryStepCall(result)`，直接返回错误文本：

```ts
if (shouldRetryStepCall(result)) {
  const errorText = getFinalStepResponseText(result);
  nodeResponses.push(result.nodeResponse);
  assistantResponses.push({
    text: { content: errorText },
    planId: agentPlan.planId,
    stepId: step.id
  });
  workflowStreamResponse?.({
    event: SseResponseEventEnum.answer,
    data: textAdaptGptResponse({ text: errorText })
  });

  return {
    data: {
      [NodeOutputKeyEnum.answerText]: errorText
    },
    [DispatchNodeResponseKeyEnum.memories]: {
      [masterMessagesKey]: undefined,
      [agentPlanKey]: undefined,
      [planMessagesKey]: undefined,
      [planBufferKey]: undefined
    },
    [DispatchNodeResponseKeyEnum.assistantResponses]: assistantResponses,
    [DispatchNodeResponseKeyEnum.nodeResponses]: nodeResponses
  };
}
```

如果 `retryTimes > 0`，补最终日志：

```ts
if (retryTimes > 0) {
  const retryFinalLog = {
    planId: agentPlan.planId,
    stepId: step.id,
    stepTitle: step.title,
    retryTimes,
    finishReason: result.nodeResponse.finishReason,
    errorText: result.nodeResponse.errorText?.slice(0, 300)
  };

  if (shouldRetryStepCall(result)) {
    getLogger(LogCategories.MODULE.AI.AGENT).error('Step call retry exhausted', retryFinalLog);
  } else {
    getLogger(LogCategories.MODULE.AI.AGENT).debug('Step call retry succeeded', retryFinalLog);
  }
}
```

## 3. 后端实施说明

### 3.1 API 改动

| 路由 | 方法 | 请求参数 | 响应结构 | 鉴权 | 错误处理 |
|---|---|---|---|---|---|
| N/A | N/A | N/A | N/A | N/A | N/A |

说明：本需求不改 API 合约，请不要碰 openapi、pages/api 路由入参出参。

### 3.2 Service/Core 改动

| 模块 | 函数/代码段 | 具体改动 | 依赖关系 |
|---|---|---|---|
| `packages/service/core/workflow/dispatch/ai/agent/index.ts` | Step calls 分支 | 在 `for await (const step of agentPlan.steps)` 内联增加重试 loop | 继续依赖现有 `masterCall` |
| `packages/service/core/workflow/dispatch/ai/agent/index.ts` | `shouldRetryStepCall` | 判断 response 为空且请求错误 | 本地小函数，不新增文件 |
| `packages/service/core/workflow/dispatch/ai/agent/index.ts` | 最终结果合并 | 只合并最终一次 attempt 的 `nodeResponse` 和 `assistantMessages` | 保持现有响应结构 |
| `packages/service/core/workflow/dispatch/ai/agent/index.ts` | step 失败中断 | 最终失败直接返回错误文本并清空 Agent 记忆 | 防止继续调度后续 step 或继续规划 |

### 3.3 数据层改动

| 集合/表 | 字段 | 类型 | 必填 | 默认值 | 索引 | 迁移策略 |
|---|---|---|---|---|---|---|
| N/A | N/A | N/A | N/A | N/A | N/A | 无需迁移 |

### 3.4 Bug 修复实施

| 项目 | 内容 |
|---|---|
| 问题点文件 | `FastGPT/packages/service/core/workflow/dispatch/ai/agent/index.ts` |
| 问题点函数/代码段 | `dispatchRunAgent` 的 Step calls 分支 |
| 触发条件 | `masterCall` 返回错误，且 `result.stepResponse?.rawResponse` 为空 |
| 根因（直接原因） | 空 `step.response` 被外层 `!step.response` 识别为未完成 |
| 根因（深层原因） | step 完成态依赖 response 文本非空，且失败后仍可能继续进入后续调度 |
| 修复动作 | 在 step 内联重试最多 3 次；只合并最终结果；最终失败直接返回错误文本并中断 |
| 影响范围 | 默认 Agent v2 Plan + Step 引擎；不影响 `env.AGENT_ENGINE === 'pi'` |

## 4. 前端实施说明

| 页面/组件 | 文件路径 | 交互变化 | i18n 改动 | 状态覆盖 |
|---|---|---|---|---|
| 聊天 step 展示 | `FastGPT/projects/app/src/components/core/chat/components/AIResponseBox.tsx` | 无代码改动；后端不再重复推送同一 step title | 无 | 成功/错误态由后端最终结果控制 |
| 完整响应弹窗 | `FastGPT/projects/app/src/components/core/chat/components/WholeResponseModal.tsx` | 无代码改动；中间 retry 不进入 `nodeResponses` | 无 | 最终失败最多展示一次 |

## 5. 日志与可观测性

| 触发点 | 日志级别 | category | 字段 | 备注 |
|---|---|---|---|---|
| 空响应错误准备重试 | `warn` | `LogCategories.MODULE.AI.AGENT` | `planId`, `stepId`, `stepTitle`, `attempt`, `nextAttempt`, `maxRetryTimes`, `finishReason`, `errorText` | `errorText` 截断到 300 字符 |
| 重试后成功 | `debug` | `LogCategories.MODULE.AI.AGENT` | `planId`, `stepId`, `retryTimes` | 不记录模型正文 |
| 重试耗尽 | `error` | `LogCategories.MODULE.AI.AGENT` | `planId`, `stepId`, `retryTimes`, `finishReason`, `errorText` | 最终失败需要可检索 |

注意事项：

- 统一使用 `@fastgpt/service/common/logger`。
- 不记录 token、密码、密钥、完整用户输入、完整模型输出。
- 日志 message 使用稳定短语，方便检索。

## 6. 文档更新提醒（必填）

规范来源：`references/doc-update-reminder.md`

| 文档路径 | 文档类型 | 更新原因 | 计划更新内容 | 负责人 | 截止时间 | 状态 |
|---|---|---|---|---|---|---|
| N/A | N/A | 内部 Bug 修复，不改变 API、配置、用户操作流程 | N/A | N/A | N/A | N/A |

N/A 理由：该改动只修复异常场景下重复 step 展示，不新增用户可配置项，不改变对外使用说明。

## 7. 文档 i18n 实施说明

| 中文文件 | 英文文件 | 类型（mdx/meta） | 动作 | 状态 |
|---|---|---|---|---|
| N/A | N/A | N/A | N/A | N/A |

说明：本需求不修改 `document/content/docs`。

## 8. 测试与验证

测试规范来源：`references/testing-standards.md`

### 8.1 测试文件映射

| 源文件路径 | 文件类型 | 目标测试文件路径 | 是否跳过 | 跳过理由 |
|---|---|---|---|---|
| `FastGPT/packages/service/core/workflow/dispatch/ai/agent/index.ts` | packages | `FastGPT/test/cases/service/core/workflow/dispatch/ai/agent/index.test.ts` 或现有合适测试文件 | 否 | 核心调度 Bug，需覆盖 |
| `FastGPT/packages/global/core/ai/agent/type.ts` | packages/type | N/A | 是 | 本期不改 schema；类型文件默认跳过 |
| `FastGPT/projects/app/src/components/core/chat/components/AIResponseBox.tsx` | projects/front | N/A | 是 | 本期不改前端代码，仅作为行为锚点 |
| `FastGPT/projects/app/src/components/core/chat/components/WholeResponseModal.tsx` | projects/front | N/A | 是 | 本期不改前端代码，仅作为行为锚点 |

### 8.2 自动化测试设计

优先覆盖以下场景；如果直接测 `dispatchRunAgent` mock 成本过高，至少保留手工验证记录，并跑现有 Agent/dispatch 相关测试。

| 类型 | 用例 | 预期结果 |
|---|---|---|
| 单元/集成 | 第一次 `masterCall` 成功 | 不触发重试，`masterCall` 只调用 1 次 |
| 单元/集成 | 第一次 `masterCall` 返回 `rawResponse=''` + `finishReason='error'`，第二次成功 | 调用 2 次；只合并第二次结果；前台只有一条 step title |
| 单元/集成 | 连续四次 `rawResponse=''` + error | 调用 4 次后直接返回错误文本；不继续执行后续 step 或继续规划 |
| 单元/集成 | `checkIsStopping()` 为 true | 不触发重试 |
| 回归 | 打开完整响应弹窗 | 不出现中间失败 retry 的重复“阶段 Agent 调用” |

### 8.3 执行命令

```shell
pnpm test test/cases/service/core/workflow/dispatch/ai/agent/index.test.ts
pnpm test test/cases/service/core/workflow/dispatch/index.test.ts
pnpm exec eslint --fix packages/service/core/workflow/dispatch/ai/agent/index.ts
```

若没有新增 `index.test.ts`，则必须记录替代验证命令和手工验证步骤。

### 8.4 手工验证

| 场景 | 操作步骤 | 预期结果 |
|---|---|---|
| 正常流程 | Agent v2 执行一个多 step 任务，所有 LLM 调用正常 | Step 顺序正常展示，无额外重试日志 |
| Azure 400 类异常 | 使用可触发内容过滤的 step 输入 | 前台不重复展示同一 step；后台最多重试 3 次 |
| 重试仍失败 | 连续触发内容过滤 | 直接返回内容过滤错误；不继续执行后续 step 或继续规划 |
| 完整响应 | 打开完整响应弹窗 | 不出现多条重复“阶段 Agent 调用”失败记录 |

## 9. 质量自检清单

- [ ] 不新增 `stepRetry.ts` 或其他运行时 helper 文件。
- [ ] 重试逻辑位于 `for await (const step of agentPlan.steps)` 内部。
- [ ] 最大重试次数为常量 `MAX_STEP_CALL_RETRY_TIMES = 3`。
- [ ] 只有 `response` 为空且返回错误时才重试。
- [ ] 中间失败尝试不进入 `assistantResponses` / `nodeResponses`。
- [ ] 后台重试不推前端 SSE。
- [ ] 最终失败直接返回错误文本并中断执行。
- [ ] 日志结构化且已脱敏。
- [ ] 不改 API、DB、前端组件、i18n 文案。
- [ ] 文档更新提醒已填写 N/A 理由。

## 10. 发布与回滚

### 10.1 发布步骤

1. 删除上一版错误拆分出来的 `stepRetry.ts` 和依赖它的测试。
2. 在 `agent/index.ts` 内按本文档实现内联重试。
3. 执行相关测试和 lint。
4. 在测试环境复现 Azure 400 类异常，确认前台不重复展示 step。
5. 打开完整响应弹窗，确认中间 retry 不展示。

### 10.2 回滚触发条件

- 正常 Agent v2 step 输出丢失或不再流式展示。
- `assistantResponses` 保存结果缺失，导致最终回答内容不完整。
- 重试逻辑导致全部 step 被错误标记失败。
- 计费/响应详情出现明显不一致且无法快速修正。

### 10.3 回滚步骤

1. 回滚 `FastGPT/packages/service/core/workflow/dispatch/ai/agent/index.ts` 中的内联重试改动。
2. 删除本次新增或修改的测试。
3. 重新执行 Agent v2 正常多 step 流程，确认恢复原行为。

## 11. AI 实施提示（给执行模型）

- 不要新增 `stepRetry.ts`。
- 不要为了测试把简单逻辑拆成新模块。
- 只在当前 step 的 `masterCall` 返回后判断是否重试。
- 只重试 response 为空且有错误的情况。
- 中间 retry 结果不能 push 到 `assistantResponses` 和 `nodeResponses`。
- 重试耗尽必须直接返回错误文本并清空 Agent 记忆，否则流程可能继续执行后续 step。

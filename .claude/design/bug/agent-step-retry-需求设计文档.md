# 需求设计文档

## 0. 文档标识

- 任务前缀：`agent-step-retry`
- 文档文件名：`agent-step-retry-需求设计文档.md`
- 文档状态：设计完成，已实施
- 最后更新：2026-04-24

## 1. 需求背景与目标

### 1.1 背景

- 问题现状：Agent v2 的 Plan + Step 调度模式下，某个 step 被 Azure OpenAI 内容管理策略拦截后返回 `400`，底层拿不到正常 assistant 文本，导致该 step 的 `response` 为空。
- 触发场景：Step call 执行时 LLM 请求被 Azure 拦截，`runAgentLoop` 以 `throwError: false` 收敛错误，`masterCall` 仍返回 `stepResponse.rawResponse = ''`，外层调度用 `!step.response` 判断未完成，于是同一步重复执行并在前台出现多条重复 step 记录。
- 用户期望：后台自动重试，但重试过程不要返回到前台 UI；前台不再出现同一个 step 反复展开的记录。

### 1.2 目标

- 业务目标：Agent v2 执行步骤遇到可恢复的空响应请求错误时，自动在后台有限重试，避免用户看到重复 step UI。
- 技术目标：把 step 是否完成从“只看非空文本”修正为“执行结果 + 错误状态 + 有限重试”的可控状态机。
- 成功指标（可量化）：
  - 构造 `masterCall` 首次返回 `rawResponse=''` 且 `finishReason='error'`，第二次返回正常文本时，同一个 `stepId` 只产生 1 条 `stepTitle`。
  - 隐藏重试失败记录不进入 `assistantResponses` 和 `nodeResponses`，前台完整响应不展示中间失败尝试。
  - 重试耗尽后直接返回最终错误文本并中断执行，不再继续调度后续 step 或继续规划。
  - 新增/更新测试覆盖正常成功、一次失败后成功、重试耗尽失败 3 类路径。

## 2. 当前项目事实基线（基于代码）

| 能力项 | 现有实现位置（文件路径） | 现状说明 | 结论（复用/修改/新增） |
|---|---|---|---|
| 仓库入口 | `FastGPT/package.json`、`FastGPT/pnpm-workspace.yaml` | pnpm workspace monorepo，根脚本含 `pnpm test`、`pnpm lint`；packages/projects 分层明确 | 复用 |
| Agent v2 调度 | `FastGPT/packages/service/core/workflow/dispatch/ai/agent/index.ts` 的 `dispatchRunAgent` | Step 调度循环使用 `agentPlan.steps.filter((item) => !item.response).length` 判断是否还有未完成 step，并在每次执行前推送 `SseResponseEventEnum.stepTitle` | 修改 |
| Step call 执行 | `FastGPT/packages/service/core/workflow/dispatch/ai/agent/master/call.ts` 的 `masterCall` | Step call 下从 `assistantMessages` 汇总 `answerText`，再返回 `stepResponse.rawResponse = answerText` | 修改/复用 |
| LLM Agent loop | `FastGPT/packages/service/core/ai/llm/agentLoop/index.ts` 的 `runAgentLoop` | 调用 `createLLMResponse({ throwError: false })`，请求错误不会向外抛，而是返回 `error` 和 `finish_reason` | 复用 |
| LLM 请求封装 | `FastGPT/packages/service/core/ai/llm/request.ts` 的 `createLLMResponse` | 请求错误时记录 `error`，`finish_reason` 变为 `error`，`answerText` 为空 | 复用 |
| Agent plan 类型 | `FastGPT/packages/global/core/ai/agent/type.ts` 的 `AgentStepItemSchema` | step 当前只有 `response?: string` 和 `summary?: string`，无显式状态字段 | 本期不改 schema |
| 前端 step 展示 | `FastGPT/projects/app/src/components/core/chat/components/AIResponseBox.tsx` 的 `RenderStepTitle` | 前端按后端 `stepTitle` 事件与保存后的 `assistantResponses` 渲染 step 标题；重复推送会重复展示 | 不改前端代码，由后端避免重复推送 |
| 完整响应展示 | `FastGPT/projects/app/src/components/core/chat/components/WholeResponseModal.tsx` 的 `ResponseBox` | `nodeResponses/childrenResponses` 会被 flatten 成侧边栏记录；重复失败 nodeResponse 会直接体现在完整响应 UI | 不改前端代码，由后端过滤隐藏重试记录 |
| 日志分类 | `FastGPT/packages/service/common/logger/categories.ts` 的 `LogCategories.MODULE.AI.AGENT` | Agent 模块已有统一 logger category | 复用，补充结构化 warn/error |

关键定位证据：

- `FastGPT/packages/service/core/workflow/dispatch/ai/agent/index.ts`：`while (!checkIsStopping() && agentPlan.steps.filter((item) => !item.response).length)` 把空字符串视为未完成。
- `FastGPT/packages/service/core/workflow/dispatch/ai/agent/index.ts`：`step.response = result.stepResponse?.rawResponse` 在 `rawResponse=''` 时没有完成标记。
- `FastGPT/packages/service/core/workflow/dispatch/ai/agent/master/call.ts`：`answerText` 由 assistant 消息拼接而来，请求错误时为空。
- `FastGPT/packages/service/core/ai/llm/agentLoop/index.ts`：`createLLMResponse` 使用 `throwError: false`，Azure 400 被收敛到返回值，不会中断外层 step 调度。

## 3. 需求澄清记录

| 维度 | 已确认内容 | 待确认内容 | 备注 |
|---|---|---|---|
| 业务目标 | 修复 Agent v2 同一个 step 被重复执行和重复展示的问题 | 是否要在产品层提示“已后台重试” | 推荐不提示，保持后台静默 |
| 范围边界 | 后台有限重试；重试过程不返回到前台 UI | 最大重试次数是否允许配置化 | 本期写死 3 次重试，暂不配置化 |
| 权限模型 | 不涉及权限变化 | 无 | N/A |
| 数据模型 | 不新增 DB 字段，不改 `AgentStepItemSchema` | 后续是否需要显式 step 状态字段 | 本期不做，避免扩大改动 |
| API 行为 | 不改外部 API 入参/出参 | 无 | N/A |
| 前端交互 | 前端不应看到中间重试 step/title/nodeResponse | 全部失败时是否展示一次最终错误 | 推荐只展示一次最终失败结果，避免静默吞错 |
| Bug 修复分析 | 用户提供了 Azure 400 内容过滤复现线索；代码已确认 `!step.response` 根因链路 | 具体线上模型和请求样本 | 不需要进入设计才能推进 |
| 文档更新 | 不改用户文档/API 文档 | 是否进入发版 changelog | 由发版负责人决定 |
| 文档 i18n | 不改 `document/content/docs` | 无 | N/A |

默认假设：

- 后台隐藏重试次数为 3 次，即最多总共执行 4 次 step call。
- 隐藏重试不推送 SSE，不写入 `assistantResponses`，不写入 `nodeResponses`。
- 若所有尝试都失败，最终只保留 1 条可见失败记录，直接返回错误文本并中断执行，防止继续重复调度或执行后续 step。

## 3.1 影响域判定（先判定，再核对规范）

| 维度 | 是否命中 | 证据（需求/代码锚点） | 核对规范 | 结论 |
|---|---|---|---|---|
| API | No | 不新增/修改路由；`dispatchRunAgent` 内部行为变更 | `references/style/api.md` | Not Applicable：无 API 合约变化 |
| DB | No | 不新增集合/字段/索引；`AgentStepItemSchema` 本期不改 | `references/style/db.md` | Not Applicable：无数据迁移 |
| Front | Yes | 需求明确“后台重试但是不返回到前台 UI”；前端入口为 `AIResponseBox.tsx` 和 `WholeResponseModal.tsx` | `references/style/front.md` | 命中交互行为，但不改前端代码；由后端事件与响应过滤实现 |
| Logger | Yes | 需要记录隐藏重试与重试耗尽，定位 Azure 400 等外部依赖失败 | `references/style/logger.md` | 使用 `LogCategories.MODULE.AI.AGENT`，结构化字段，不记录完整 prompt/response |
| Package | Yes | 改动在 `packages/service`，测试在 `test/cases/service`；不破坏 monorepo 依赖方向 | `references/style/package.md` | 遵守 service 依赖 global 的现有方向，不新增依赖 |
| BugFix | Yes | 用户给出明确 Bug：Azure 400 -> `step.response` 空 -> `!step.response` 重复执行 | `references/bug-fix-workflow.md` | 必须覆盖复现、定位、根因、方案、回归 |
| DocUpdate | No | 不改变 API、配置项、用户操作流程；只是修复异常场景重复展示 | `references/doc-update-reminder.md` | N/A：如需发版说明，由发版 changelog 单独记录 |
| DocI18n | No | 本需求不修改 `document/content/docs` | `references/doc-i18n-standards.md` | Not Applicable |

## 4. 范围定义

### 4.1 In Scope（本期必须）

- 在 Agent v2 Step call 执行处增加有限隐藏重试。
- 重试触发条件限定为“Step call 无有效文本 + 请求错误/finishReason=error + 未停止运行”。
- 重试过程不推送前端 SSE，不写入 `assistantResponses` 与 `nodeResponses`。
- 重试成功后只用最终成功结果补齐原 step 的 `response/summary`。
- 重试耗尽后直接返回非空错误文本并清空 Agent 记忆，确保该 step 不会被再次调度，后续 step 也不会继续执行。
- 增加 Agent step 重试的单元测试或可测 helper 测试。
- 增加结构化日志，记录 `planId`、`stepId`、`retryTimes`、`finishReason`、脱敏后的 `errorText`。

### 4.2 Out of Scope（本期不做）

- 不新增 DB 字段，不引入 `status` 状态机字段。
- 不改前端组件和 i18n 文案。
- 不改外部 Chat Completion API / OpenAPI。
- 不对所有 LLM 请求统一加重试；仅处理 Agent v2 Step call。
- 不重试用户主动停止、工具执行错误、非空回答但质量差等场景。
- 不把重试次数做成用户可配置项。

## 5. 方案对比

| 方案 | 核心思路 | 优点 | 风险 | 实施成本 | 结论 |
|---|---|---|---|---|---|
| 方案A（最小改动） | 在 `dispatchRunAgent` 的 step call 处包一层隐藏重试；仅最终结果进入 UI/响应数据；失败耗尽写非空失败摘要 | 改动集中，不碰 DB/API/前端；直接修复重复 step；符合用户“后台重试不返回 UI” | 不引入显式 step 状态，后续若状态更多仍需升级 | 低 | 推荐 |
| 方案B（可扩展） | 给 `AgentStepItemSchema` 增加 `status: pending/running/success/failed` 和 `retryCount`，调度改用状态机判断 | 状态语义完整，后续可展示重试次数/失败态 | 涉及 global type、历史数据兼容、前端显示策略，改动面明显变大 | 中-高 | 本期不选 |

推荐方案：方案A。

放弃方案B的原因：当前问题是“空响应错误被误判为未完成”，不是完整 step 生命周期管理需求。为了这一个坑就上状态机，有点拿工程铲子拍蚊子，能拍死但动静太大。本期先做最小可控修复。

## 6. 推荐方案详细设计

### 6.1 API 设计

| 路由 | 方法 | 鉴权 | 请求 | 响应 | 错误分支 | 相关文件 |
|---|---|---|---|---|---|---|
| N/A | N/A | N/A | N/A | N/A | N/A | 不涉及 API 合约 |

### 6.2 数据设计

| 实体/集合 | 字段 | 类型 | 必填 | 默认值 | 索引/约束 | 兼容策略 |
|---|---|---|---|---|---|---|
| N/A | N/A | N/A | N/A | N/A | N/A | 无需迁移 |

### 6.3 核心代码设计

| 模块 | 关键函数/类型 | 变更说明 | 上下游影响 |
|---|---|---|---|
| `FastGPT/packages/service/core/workflow/dispatch/ai/agent/index.ts` | `dispatchRunAgent` 的 Step calls 分支 | 在 `for await (const step of agentPlan.steps)` 内把单次 `masterCall` 改为内联有限重试；`stepTitle` 仍只推送一次 | 修复同一 step 重复进入调度循环 |
| `FastGPT/packages/service/core/workflow/dispatch/ai/agent/index.ts` | `shouldRetryStepCall` 本地小函数 | 直接判断 `rawResponse?.trim()` 为空且 `nodeResponse.errorText` 或 `finishReason === 'error'` 时允许重试 | 避免对正常空输出、用户停止等场景乱重试 |
| `FastGPT/packages/service/core/workflow/dispatch/ai/agent/index.ts` | 内联 retry loop | 第一次按原逻辑执行；后续 retry 使用 no-op `workflowStreamResponse`，失败尝试不进入 UI 数据 | 后台重试不污染前台 |
| `FastGPT/packages/service/core/workflow/dispatch/ai/agent/master/call.ts` | `masterCall` 返回结构 | 本期可不改；继续依赖 `nodeResponse.errorText/finishReason` 识别错误 | 控制改动面 |
| `FastGPT/packages/global/core/ai/agent/type.ts` | `AgentStepItemSchema` | 本期不新增字段 | 避免历史 plan 兼容问题 |

建议关键控制流：

```ts
const MAX_STEP_CALL_RETRY_TIMES = 3;

const shouldRetryStepCall = (result: StepCallResult) => {
  return (
    !result.stepResponse?.rawResponse?.trim() &&
    !!(result.nodeResponse.errorText || result.nodeResponse.finishReason === 'error')
  );
};

for (let attempt = 0; attempt <= MAX_STEP_CALL_RETRY_TIMES; attempt++) {
  result = await masterCall({
    ...props,
    workflowStreamResponse: attempt === 0 ? workflowStreamResponse : undefined,
    masterMessages: [],
    planMessages: [],
    step,
    steps: agentPlan.steps,
    // 其他现有参数保持不变
  });

  if (!shouldRetryStepCall(result) || attempt >= MAX_STEP_CALL_RETRY_TIMES) break;
  retryTimes++;
}

// 只在最终结果上 merge assistantResponses/nodeResponses。
// 若最终仍为空，直接返回错误文本并中断，防止继续执行后续 step 或继续规划。
```

对应规范：`references/style/package.md` 要求 monorepo 依赖方向稳定；该方案仅修改 service 内部调度，不新增跨包依赖。

### 6.4 前端设计

| 页面/组件 | 入口文件 | 交互状态（加载/空/错/成功） | i18n key | 变更说明 |
|---|---|---|---|---|
| 聊天消息 step 标题 | `FastGPT/projects/app/src/components/core/chat/components/AIResponseBox.tsx` | 成功：只展示一次 step；错误：最多展示一次最终失败对应内容；加载态沿用现有 SSE | 无新增 | 不改前端，由后端保证同一 step 不重复推送 `stepTitle` |
| 完整响应弹窗 | `FastGPT/projects/app/src/components/core/chat/components/WholeResponseModal.tsx` | 成功：不展示隐藏失败尝试；错误：只展示最终一次失败 nodeResponse | 无新增 | 不改前端，由后端过滤隐藏 retry 的 `nodeResponses` |

对应规范：`references/style/front.md` 要求用户可见文本接入 i18n；本方案不新增用户可见文案，因此无需新增 i18n key。

### 6.5 日志与观测设计

| 场景 | 日志级别 | category | 结构化字段 | 脱敏策略 |
|---|---|---|---|---|
| Step call 空响应错误触发后台重试 | `warn` | `LogCategories.MODULE.AI.AGENT` | `planId`, `stepId`, `stepTitle`, `attempt`, `maxRetryTimes`, `finishReason`, `errorText` | `errorText` 截断到 300 字符，不记录 prompt、文件内容、完整响应 |
| Step call 重试耗尽 | `error` | `LogCategories.MODULE.AI.AGENT` | `planId`, `stepId`, `retryTimes`, `finishReason`, `errorText` | 同上 |
| Step call 重试成功 | `info` 或 `debug` | `LogCategories.MODULE.AI.AGENT` | `planId`, `stepId`, `retryTimes`, `runningTime` | 不记录模型输出正文 |

对应规范：`references/style/logger.md` 要求统一使用 `getLogger(LogCategories.XXX)`、结构化字段、避免输出完整用户内容。

### 6.6 文档 i18n 设计（命中时必填）

| 中文文件 | 英文文件 | 类型（内容/导航） | 处理动作（新增/更新） | 翻译注意项 |
|---|---|---|---|---|
| N/A | N/A | N/A | N/A | 本需求不修改 `document/content/docs` |

缺失英文文件清单：N/A。

### 6.7 文档更新提醒（必填）

| 文档路径 | 文档类型 | 更新原因 | 计划更新内容 | 负责人 | 截止时间 | 状态 |
|---|---|---|---|---|---|---|
| N/A | N/A | 内部 Bug 修复，不改变 API、配置项、操作流程或对外能力说明 | N/A | N/A | N/A | N/A |

N/A 理由：该改动只修复 Agent v2 异常重试和 UI 重复展示，不新增用户可配置项，不改变使用说明。若进入版本发布说明，由发版负责人在对应 changelog 单独记录。

### 6.8 Bug 修复分析（命中时必填）

| 项目 | 内容 |
|---|---|
| Bug 现象 | Agent v2 模式下同一个 step 在 UI 中重复出现、重复执行 |
| 复现步骤 | 1. 使用 Agent v2 生成包含多个 step 的 plan；2. 某个 step call 触发 Azure OpenAI 内容过滤 400；3. 观察聊天过程和完整响应，出现同一 step 多次执行记录 |
| 期望行为 | 后台有限重试；前台只看到一个 step；重试成功后继续后续流程；重试失败后停止该 step 的重复调度 |
| 实际行为 | `step.response` 为空，外层 `!step.response` 判定未完成，同一步再次执行并再次推送 `stepTitle` |
| 定位证据（日志/堆栈/断点/代码锚点） | `FastGPT/packages/service/core/workflow/dispatch/ai/agent/index.ts` 的 `!item.response` 循环；`FastGPT/packages/service/core/workflow/dispatch/ai/agent/master/call.ts` 的 `rawResponse: answerText`；`FastGPT/packages/service/core/ai/llm/agentLoop/index.ts` 的 `throwError: false` |
| 问题点文件与函数 | `FastGPT/packages/service/core/workflow/dispatch/ai/agent/index.ts` 的 `dispatchRunAgent` Step calls 分支 |
| 根因分析（直接原因） | Azure 400 请求错误下 `answerText` 为空，`step.response` 被赋值为空/undefined，下一轮调度继续认为 step 未完成 |
| 根因分析（深层原因） | Step 完成态被编码在 `response` 文本是否非空上，没有区分“执行失败但应中断”和“尚未执行”；同时没有隐藏重试机制 |
| 影响范围 | 使用默认 Agent v2 Plan + Step 引擎的聊天/调试链路；`env.AGENT_ENGINE === 'pi'` 的 pi-agent-core 路径不受影响 |

修复方案：

| 方案 | 思路 | 优点 | 风险 | 结论 |
|---|---|---|---|---|
| 方案A（最小修复） | Step call 外层增加隐藏重试；最终失败直接返回错误文本并中断 | 改动小，直击重复调度根因 | 没有完整 step 状态字段 | 推荐 |
| 方案B（结构修复） | 给 step 增加 status/retryCount 状态机 | 语义完整 | 改动大，涉及 global schema 与前端展示 | 本期不选 |

回归验证要点：

- 原始复现路径：Azure 400 空响应后不再重复展示同一 step。
- 相邻功能：正常 step 成功、tool call、plan continue、用户主动停止不回归。
- 自动化测试：覆盖首次成功、一次失败后成功、重试耗尽失败。

## 7. 风险、迁移与回滚

### 7.1 风险清单

- 风险1：隐藏重试会增加一次 LLM 调用成本。缓解：重试次数固定为 1，且只对空响应请求错误触发。
- 风险2：如果第一次失败前已流式输出部分内容，最小方案无法撤回已输出片段。缓解：当前 Azure 400 典型场景没有正常流式内容；如后续发现，需要升级为事件缓冲后成功再 flush。
- 风险3：全部失败时若完全吞错，会让用户不知道任务为何缺结果。缓解：最终失败只保留一次可见失败记录，并停止重复调度。
- 风险4：如果把所有空文本都视为可重试，可能错误重试合法空结果。缓解：必须同时满足 `errorText` 或 `finishReason === 'error'`。

### 7.2 迁移策略

- 无 DB 迁移。
- 无历史数据回填。
- 已保存的历史聊天记录不 retroactive 修复；仅对新执行的 Agent v2 step 生效。

### 7.3 回滚策略

- 回滚目标文件：
  - `FastGPT/packages/service/core/workflow/dispatch/ai/agent/index.ts`
- 回滚触发条件：
  - 正常 step 无法实时输出或最终回答丢失。
  - 隐藏重试导致计费/响应数据明显不一致。
  - Agent v2 plan continue 流程出现无法继续规划的回归。

## 8. 验收标准

| 验收项 | 验收方式 | 通过标准 |
|---|---|---|
| 重复 step 修复 | mock `masterCall` 首次空响应错误、第二次成功 | 同一 `stepId` 只产生 1 条 `stepTitle`，最终 `step.response` 为成功文本 |
| 隐藏重试不污染 UI | 检查 `assistantResponses`、`nodeResponses` | 中间失败尝试不进入两类响应数据 |
| 重试耗尽不死循环 | mock 连续空响应错误 | 直接返回错误文本，外层不再继续执行后续 step 或继续规划 |
| 正常路径不回归 | mock 首次成功 | 不触发重试，SSE 与响应保存逻辑保持原行为 |
| 停止路径不误重试 | mock `checkIsStopping()` 为 true | 不触发后台重试 |
| 日志合规 | 代码审查 | 使用 `LogCategories.MODULE.AI.AGENT`，不记录完整 prompt/response |

## 9. MECE 核查结论

### 9.1 相互独立检查结果

- 发现问题 -> 重试控制、UI 展示过滤、错误完成态容易搅在一起。
  影响范围 -> 若直接散写在循环里，后续维护容易再次把中间失败塞进 `assistantResponses`。
  修订动作 -> 将 Step call 结果合并集中在隐藏重试 wrapper 之后，只允许最终结果进入 merge 阶段。
  修订后结果 -> 调度职责、重试职责、响应合并职责边界清晰。

- 发现问题 -> 日志和前台完整响应都可能记录错误。
  影响范围 -> Azure 400 文本可能重复出现在 UI 与日志。
  修订动作 -> 中间失败只记脱敏结构化日志，不进前台响应；最终失败最多保留一次。
  修订后结果 -> 可观测但不污染用户界面。

### 9.2 完全穷尽检查结果

- 发现问题 -> 只处理“失败后成功”，没处理“一直失败”会继续空转。
  影响范围 -> 重试耗尽后仍可能回到 `!step.response` 死循环。
  修订动作 -> 重试耗尽直接返回错误文本并记录最终失败。
  修订后结果 -> 正常、一次失败后成功、重试耗尽失败均覆盖。

- 发现问题 -> 把所有空响应都重试会误伤合法空输出或用户停止。
  影响范围 -> 增加无意义调用成本。
  修订动作 -> 重试条件必须绑定 `errorText` 或 `finishReason === 'error'`，且 `checkIsStopping()` 为 false。
  修订后结果 -> 重试边界收敛到请求错误场景。

### 9.3 修订动作与最终边界

- 本期只修 Agent v2 默认 Plan + Step 引擎的 step call 重复执行。
- 本期不引入 step 状态字段，不改 DB/API/前端组件。
- 后续若要展示“后台已重试 N 次”或做租户级重试配置，建议单开需求升级为显式状态机。

# Agent Loop 需求文档

状态：收口版  
日期：2026-05-11

## 背景

AgentV2 早期方案包含多层 agent、`stepCall`、`continue plan`、独立 stop verifier 等概念，导致上下文拼接、运行详情、流式输出、前端恢复和测试边界都比较复杂。

本轮目标是把 agent loop 收敛为一条可复用的主循环：

- workflow agent 节点只负责适配 workflow 上下文、工具、回调和持久化；
- 通用 loop 放在 `packages/service/core/ai/llm/agentLoop`；
- 模型在同一个主 loop 内完成计划维护、工具调用、追问用户和最终回答；
- 前端只展示新的 plan card、工具卡、思考和最终答案，不再兼容旧 `stepCall` UI。

## 目标

1. 简化 loop 架构，去掉多层 agent 嵌套和独立 `continue plan`。
2. 保证上下文连续，用户追问恢复和工具结果回灌都发生在同一条 message 链路中。
3. 支持模型通过 `update_plan` 维护计划，并由本地 stop gate 保证计划完成后才能 final。
4. 支持 `ask_agent` 在必要时追问用户，用户回答后继续原上下文，而不是重新生成一份独立计划。
5. 完整保存 thinking、tool call、tool result、plan、answer、requestId、tokens 和 usage。
6. SSE 事件完整覆盖 workflow 和普通对话，计划生成前需要有可感知的 loading 状态，最终答案需要保持流式输出。
7. 运行详情按 agent/tool 调用线性展示，AI 请求都能关联 requestId。

## 范围

### 必须支持

- 直接回答：简单问题不创建 plan，直接流式输出 answer。
- 显式计划：用户明确要求规划、复杂调研、比较、方案设计等场景，需要先创建 plan。
- 执行计划：plan steps 必须非空；步骤状态可批量更新。
- 工具调用：runtime tools 正常执行并展示；工具结果需要回灌给模型。
- 工具后计划更新：调用 runtime tool 后，模型必须用 `update_plan` 记录证据或结果，才能最终回答。
- 用户追问：缺少必要输入时使用 `ask_agent`，暂停当前 loop 并保存 pending context。
- 追问恢复：用户回答后，把回答作为 ask tool response 追加回原 messages，继续执行。
- 刷新恢复：历史记录恢复后，plan、thinking、tools、interactive、answer 都应完整展示。
- 工作流适配：workflow 节点通过 adapter 调用通用 agent loop，所有 workflow 专属能力通过参数和接口注入。
- 运行详情：每次 LLM 请求都需要记录 requestId、tokens、model、完成原因；runtime tools 作为对应 agent 调用下的工具展示。

### 不再支持

- 不再写入旧 `stepCall` 字段。
- 不再保留旧 stepCall 前端 UI。
- 不再使用独立 `plan_agent` tool。
- 不再使用独立 LLM stop verifier。
- 不再把历史 plan 伪造成 tool call 注入上下文。
- 不再保留 HTML 预览文档。

## 用户体验需求

### Plan Card

- 进入 plan 模式但 plan 尚未生成时，展示 plan loading skeleton 和中文提示文案。
- plan card 默认最小宽度为消息最大宽度的 50%，避免 loading 过窄。
- plan step 用颜色表达状态：
  - 蓝色：进行中，并带轻量动效；
  - 绿色：完成；
  - 灰色：待处理；
  - 黄色/红色：阻塞或需要调整。
- 不展示冗余的 `Running/Pending` 英文状态标签。
- `update_plan` 完成后只更新状态、证据和必要内容，不额外插入 step summary 气泡。
- 右侧 step 数量展示可去掉，降低噪音。

### 流式输出

- plan 生成期间不能让用户长时间无反馈。
- 模型输出过程需要实时透传给前端，包括 stop gate 最终拒绝的草稿 answer。
- stop gate 只影响最终可持久化的 answer，不负责缓存、撤回或延迟推送 `answer_delta`。
- 前端看到的是模型执行过程流；刷新恢复时只恢复最终保留在 assistantMessages 中的 answer。

### 运行详情

- 顶层展示 AI 调用节点，例如主 Agent、任务规划等，使用旧版对应 name 和 icon。
- runtime tool 作为所属 AI 调用下的子项展示。
- 每个 AI 调用都需要能看到 requestId、tokens、模型和完成原因。
- 开头或结尾空 nodeResponse 不应展示。

## 验收清单

| 编号 | 场景 | 验收点 | 状态 |
| --- | --- | --- | --- |
| A1 | 基础直接回答 | 无 plan、无 tool 时直接流式输出，刷新后 answer 恢复 | 已通过 |
| A2 | 显式计划模式 | 用户要求 plan 时必须先 `update_plan(set_plan)`，不能直接 final | 已通过 |
| A3 | 复杂任务 plan | 生成 plan card，steps 非空，可持久化恢复 | 已通过 |
| A4 | plan 批量更新 | 一次 `update_plan` 可提交多个 step update | 已通过 |
| A5 | stop gate 未完成拦截 | pending/in_progress/needsReplan/blocked 无 blocker 时不能 final | 已通过 |
| A6 | runtime tool 后 plan 记录 | runtime tool 后必须再 `update_plan` 记录结果才能 final | 已通过 |
| A7 | ask_agent 追问 | 缺少强阻塞输入时返回 interactive ask | 已通过 |
| A8 | ask_agent resume | 用户回答后沿 pendingMainContext 继续，不重建独立 planner | 已通过 |
| A9 | ask 前 runtime tool 状态 | resume 后仍要求把 ask 前 runtime tool 结果写回 plan | 已通过 |
| A10 | 无效 ask_agent 参数 | 不返回空 answer，模型可继续修正 | 已通过 |
| A11 | replace_plan | 保留当前 planId，不重复生成 plan 卡；保留已完成证据 | 已通过 |
| A12 | runtime 工具冲突 | runtime tool 同名 `ask_agent/update_plan` 会被过滤 | 已通过 |
| A13 | SSE plan loading | update_plan 开始前出现 plan skeleton，成功后替换为 plan card | 已通过 |
| A14 | SSE answer 流式 | stop gate 拒绝的草稿和最终 answer 都按过程实时透传，刷新后只恢复最终 answer | 已通过 |
| A15 | responseNode | 主链路 LLM request 写入 nodeResponse，包含 tokens 和 requestId | 已通过 |
| A16 | records 恢复 | plan、toolcall、thinking、answer 刷新后可恢复 | 已通过 |
| A17 | 旧 stepCall | 新链路不写旧 stepCall 字段，前端不依赖旧 UI | 已通过 |
| A18 | App request 基础 | 前端 request 单测仍通过 | 已通过 |

## 仍需专项确认

| 编号 | 场景 | 说明 |
| --- | --- | --- |
| R1 | dataset query extension requestId | 仍需确认 query extension requestId 透传到运行详情的完整链路 |
| R2 | Pro 计费 | 本地 OSS 无法覆盖真实扣费路径，需要在 Pro 环境专项验收 |
| R3 | 外部 OpenAI account | 需要确认内部 LLM 调用也走外部 key |
| R4 | 无效 update_plan UI 收尾 | plan skeleton 失败态仍可进一步优化 |

## 推荐回归

```bash
corepack pnpm --filter @fastgpt/service exec vitest run -c vitest.config.ts test/core/ai/llm/agentLoop test/core/workflow/dispatch/ai/agent/adapter
corepack pnpm --filter @fastgpt/global exec vitest run -c vitest.config.ts test/core/chat/adapt.test.ts test/core/chat/type.test.ts test/core/workflow/runtime/utils.test.ts
corepack pnpm --filter @fastgpt/app exec vitest run -c vitest.config.ts test/web/common/api/request.test.ts
git diff --check
```

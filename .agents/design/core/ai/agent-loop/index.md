# Agent Loop 当前设计

状态：当前实现

最后核对：2026-07-16

## 目标

Agent Loop 为不同 Agent provider 和上层业务提供稳定的模型循环协议。它统一以下语义：

- 模型请求、工具调用、计划、询问和上下文压缩。
- 流式事件、完整消息、暂停状态和 provider 恢复状态。
- 模型、工具和压缩用量的单次上报。
- `fastAgent` 与 `piAgent` 的业务可见行为。

Agent Loop 不负责 Workflow 节点输出、数据库写入、SSE 协议、权限鉴定或具体工具业务。

## 分层

```text
Workflow Agent / ToolCall
  `-- packages/service/core/workflow/dispatch/ai/agentLoopCore
        |-- context and runtime adapters
        |-- assistantResponses / nodeResponse collectors
        |-- interactive and usage adapters
        `-- packages/service/core/ai/llm/agentLoop/interface
              |-- application: provider selection and usage collection
              |-- domain: input/runtime/result/event/tool contracts
              `-- provider
                    |-- fastAgent
                    `-- piAgent
```

### `agentLoop`

目录：`packages/service/core/ai/llm/agentLoop`

职责：

- 暴露唯一公共入口 `runAgentLoop`。
- 维护与 provider 无关的 Input、Runtime、Result、Event、Tool 和 Usage 协议。
- 通过 registry 选择 provider；默认 provider 为 `fastAgent`，未知 provider 直接报错。
- 把 provider 抛出的未处理异常收敛为 `status: error` 的标准结果。
- 收集实际通过 `usagePush` 上报的用量，并随结果返回，不二次触发计费。

### `agentLoopCore`

目录：`packages/service/core/workflow/dispatch/ai/agentLoopCore`

职责：

- 把 Workflow 运行信息转换为通用 Agent Loop 的 Input 和 Runtime。
- 执行 workflow 工具、子 workflow 和交互工具。
- 消费标准事件，生成 `assistantResponses`、`nodeResponse` 和 SSE 所需数据。
- 将底层 `paused` 转为 Workflow 的 `interactive`。
- 汇总节点使用的 token、积分、最终文本、错误和恢复状态。

### 节点外壳

Workflow Agent 与 ToolCall 都调用 `agentLoopCore`，但保留各自节点语义：

- Workflow Agent 负责 Agent 配置、系统工具、历史上下文和 Sandbox/Skill 准备。
- ToolCall 是简化 Agent，只装配传入的工具节点和模型参数。
- 两者自行决定节点输出字段和外层错误处理，不复制 Agent Loop 内部实现。

## 公共协议

### Input

`AgentLoopInput` 只包含模型循环可理解的数据：

- `messages` 和可选 `systemPrompt`。
- `activePlan`。
- provider 私有但可持久化的 `providerState`。
- ask 恢复时的 `userAnswer`。
- 子工具恢复时的 `childrenInteractiveParams`。

### Runtime

`AgentLoopRuntime` 由调用方注入运行能力：

- 团队和模型参数。
- 启用的系统工具。
- runtime tool catalog 与统一 `executeTool`。
- interactive tool executor。
- 停止检查、事件回调和用量回调。

底层不能从 Workflow 闭包读取额外状态。新增业务能力应先判断它属于通用协议、系统工具还是 Workflow adapter。

### Result

`AgentLoopResult` 使用判别联合表达四种状态：

- `done`：正常完成。
- `paused`：等待 ask 回答或子工具继续执行。
- `aborted`：用户停止或 provider 控制结束。
- `error`：执行失败，同时尽量保留已产生的消息、requestId 和 usage。

稳定返回字段包括完整消息、当前轮 assistant 消息、requestId、usage、计划、providerState、Checkpoint 和 finishReason。底层结果不包含 Workflow interactive schema。

## 工具模型

### 系统工具

系统工具由 Agent Loop 维护统一语义，目前包括：

- `plan`：创建和更新当前计划。
- `ask`：暂停本轮并等待用户回答。
- `sandbox`：使用准备好的 Sandbox client 执行系统工具。
- `readFile`：读取对话上传的文档。
- `datasetSearch`：查询当前可用知识库。

是否启用以及所需 executor/client 由 Runtime 显式传入。

### Runtime 工具

业务工具通过 `toolCatalog.runtimeTools` 暴露，由统一 `executeTool` 执行。执行结果包含：

- 返回给模型的 `response`。
- 需要持久化的标准 assistant messages。
- 工具产生的 usages。
- 可选 interactive、stop、错误信息和 opaque metadata。

Agent Loop 不解释 metadata 的业务结构；Workflow collector 在边界外消费它。

## 事件与输出

Provider 通过 `AgentLoopEvent` 报告模型请求、流式文本、工具运行、计划、ask 和压缩事件。事件有两个独立消费者：

- Workflow 事件流负责 SSE。
- `agentLoopCore` collector 负责 `assistantResponses` 和 `nodeResponse`。

`assistantResponses` 的写入原则是单一来源：调用方传入额外业务响应，collector 只根据标准事件追加 Agent 响应，最终统一压缩重复计划快照。节点外壳不得再根据最终 messages 重复补写同一批工具结果。

## 上下文

### 当前轮 reminder

`agentLoopCore/application/context/reminder.ts` 统一构造当前用户消息中的动态上下文：

- 已部署 Skill 的名称、描述和 `SKILL.md` 路径。
- Sandbox 用户产物写入边界。
- 本轮文件的 id、名称、类型和 URL。
- 当前可用知识库。
- 当前时间和 Sandbox 工作目录。

这些内容放在 user message 的 `<system-reminder>` 中。文档文件通过 `read_files` 的 `{ ids }` 协议读取；Sandbox 文件操作使用独立的 Sandbox 工具。

### Checkpoint 压缩

历史上下文超过阈值时，压缩模块生成一个 `<context_checkpoint>` string，保留目标、约束、关键事实、工具结果、资源和下一步。其约束是：

- Checkpoint 是上下文，不是可见回答，也不能恢复成伪造的运行时计划。
- 当前 active plan 以确定性结构拼接，避免模型摘要改变计划状态。
- 后续裁剪必须保留 leading Checkpoint。
- Checkpoint 作为隐藏 AI value 持久化，恢复时从最新值开始重建消息。
- 模型和工具响应压缩产生的 usage 走同一用量协议。

实现位于 `packages/service/core/ai/llm/compress`，Agent provider 只消费其标准结果。

## 暂停与恢复

### ask

1. ask 工具产生标准 `ask` 事件。
2. Provider 把暂停点 messages、ask call id 和计划写入 `providerState.pendingMainContext`。
3. Agent Loop 返回 `status: paused` 和 `pause.type: ask`。
4. `agentLoopCore` 转换为 Workflow interactive。
5. 用户回答后，调用方传回 `providerState` 和 `userAnswer`，provider 在原工具调用后追加 tool response 并继续。

### 子工具交互

1. 工具执行返回 interactive children response。
2. Agent Loop 返回 `pause.type: tool_child` 和 toolCallId。
3. 恢复时调用方通过 `childrenInteractiveParams` 回传子流程结果。
4. Provider 把结果补到原工具调用上下文后继续。

旧 interactive 快照的兼容读取集中在 `agentLoopCore/adapter/memory` 和 provider 恢复边界；新写入只使用标准结构。

## 用量与计费

- Provider、工具和压缩模块只通过 `runtime.usagePush` 上报真实 usage。
- application 层在转发回调时收集同一批 usage，不能为了汇总再次计费。
- `agentLoopCore` 将通用 usage 转换为 Workflow 账单类型。
- 父 Agent 节点的 `inputTokens`、`outputTokens` 和 `llmTotalPoints` 只汇总 `agentCall` 项。
- 工具和压缩积分保留在各自的 nodeResponse/tool detail，避免父节点重复计分。

## 主要代码入口

| 能力 | 路径 |
| --- | --- |
| 公共入口 | `packages/service/core/ai/llm/agentLoop/interface/run.ts` |
| 领域协议 | `packages/service/core/ai/llm/agentLoop/domain` |
| Provider 注册 | `packages/service/core/ai/llm/agentLoop/provider/registry.ts` |
| Workflow Core | `packages/service/core/workflow/dispatch/ai/agentLoopCore` |
| Workflow Agent | `packages/service/core/workflow/dispatch/ai/agent` |
| ToolCall | `packages/service/core/workflow/dispatch/ai/toolcall` |
| 历史压缩 | `packages/service/core/ai/llm/compress` |

## 验证范围

相关测试主要位于：

- `packages/service/test/core/ai/llm/agentLoop`
- `packages/service/test/core/ai/llm/compress`
- `packages/service/test/core/workflow/dispatch/ai/agentLoopCore`
- Workflow Agent 与 ToolCall 的节点测试目录

协议改动至少需要覆盖 provider contract、collector、ask/child 恢复、Checkpoint 传播和 usage 单次上报。

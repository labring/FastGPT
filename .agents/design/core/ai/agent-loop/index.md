# Agent Loop 当前设计

状态：当前实现

最后核对：2026-10-28

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
- Pi 原生 Ask 恢复时的 `userAnswer`；FastAgent 使用已重建的消息。
- 子工具恢复时的 `childrenInteractiveParams`。

### Runtime

`AgentLoopRuntime` 由调用方注入运行能力：

- 团队和模型参数。
- 启用的系统工具。
- runtime tool catalog 与统一 `executeTool`。
- interactive tool executor。
- 停止检查、可信持久化 `recordEvent`、对外展示 `emitEvent` 和用量回调。

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

1. 有效 Ask 只保存 `value.interactive`，`params` 内保存原调用 `toolCallId` 和原始 JSON 字符串 `arguments`；`blockerType`、`description`、`questions` 均保留在原参数中，通过交互类型映射 `ask_user`。
2. Human 独立保存问题快照和答案，原 AI 不回写。适配消息时读取紧邻 Human，按原问题和选项还原 tool response；没有有效新交互的旧回答降级为普通输入。
3. FastAgent 不再读取或保存 `pendingMainContext`，运行与恢复使用同一套 ChatItem 记录。`activePlan` 从最新 `value.plan` 读取，保留 `null` 终止语义；历史从最新压缩点连续恢复。
4. Pi 的 `pendingMainContext` 与 `piMessages` 原生契约暂时保留，本次不迁移。

### 可重放的保存协议

- 本轮模型使用的改写 Human 输入以 `inputContext` 随首条 value 保存，保留当时的技能、文件、节点输入和时间；恢复时还原紧邻 Human 的模型输入，不重新生成动态 reminder。这里只保存本轮输入事实，不保存历史 messages；Ask/Preview 回答不写副本。对外读取不返回此字段。
- 每次模型响应保存到一个 value，包含正文、reasoning 和按调用顺序排列的 `tools`；`modelResponseId` 明确标识响应边界，`toolCallIds` 包含被 interactive 替代的 Ask，保证原始顺序可恢复。
- 校验失败的 Ask 保留原始调用与错误结果，标记工具 `hideInUI`；仅含隐藏内容的 value 同时标记 `hideInUI`。它们不生成 interactive、不暂停，模型继续修正。隐藏不影响上下文恢复，不使用 `hideDetails`。
- 服务端完成检查需要续跑时，将指令保存为 `userMessage: { content, source: 'server' }`，value 标记 `hideInUI`；运行和恢复均按隐藏 User 消息追加，不使用 System 或伪造的工具调用。完成或检查异常不追加指令。此记录保留完整历史，不具有 checkpoint 的压缩语义。
- 子工具展示 value 标记 `displayOnly`，不进入父模型历史，也不影响父模型的计划或压缩点。父模型只恢复其实际消费的 tool response。子工具续跑的结果保存为 `toolResponses`，按调用 ID 补到原工具结果，不创建第二次调用。
- 内部目录读取的完整结果通过可信 `recordEvent` 保存，工具标记 `internalOnly`；对外 `emitEvent` 仍只提供活动状态。普通聊天记录读取裁剪内部参数和响应，只在服务端恢复模式读取完整内容。
- 同一次响应的工具按原调用顺序恢复；暂停之后尚未执行的调用保存显式跳过结果，不执行副作用，也不留下不完整的工具配对。
- 旧 Ask 不做迁移或完整读取，跳过无效交互和工具记录，保留普通正文和 Human 输入，保证后续请求合法。

### 子工具交互

1. 工具返回业务 interactive，Agent Loop 统一返回 `pause: { toolCallId, interactive }`，不再分类 ask/tool_child，也不自动套工作流包装。
2. Ask 与 Preview 均保存 `interactive: { type, params: { toolCallId, arguments } }`；ID 使用原模型调用 ID，arguments 保留原始 JSON。Preview 不再另造 previewId，任务引用沿用原调用 ID。
3. Ask/Preview 的回答只在紧邻 Human，adapt 重建原调用和 tool response；Preview 不使用子工具恢复回调，cancel 由 Builder 业务层直接结束。
4. 只有真正的工作流工具由业务适配层显式构造 `toolChildrenInteractive`，其 params 为 `{ toolCallId, childrenResponse }`，不再嵌套 toolParams；旧包装仅在读取边界提取 ID，消息快照丢弃。用户选择与表单的协议及保存方式保持原样，恢复回调继续运行子流程，再将真实结果补到父工具。
5. 通用 tool_interactive 事件负责接管成功的直接交互 value；失败调用仍保存完整隐藏工具结果。同轮正文、reasoning 和其他工具的分组及顺序保持不变。

FastAgent 的 Workflow Agent、Workflow Builder 和辅助生成入口均停止读写 provider memory，从 ChatItem 恢复。Pi 的原生 providerState 和 piMessages 暂时保留。

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

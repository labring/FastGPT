# Agent Loop 统一化需求文档

状态：实现验收中
日期：2026-07-13
关联设计：[Agent Loop 统一化技术设计](./technical-design.md)

## 1. 文档目的

本文重新收敛 Workflow Agent 与 ToolCall 的 agent-loop 改造需求，作为后续开发、代码 review、测试和验收的唯一需求基线。

本需求不是简单抽取公共 helper，而是统一两条执行链路：

- Workflow Agent 是完整 Agent，支持 plan、ask 和业务工具。
- ToolCall 是简化 Agent，关闭 plan、ask，保留相同的循环、上下文、工具事件、交互恢复、计费和持久化规则。
- 两者只允许在工具定义、工具执行和最终节点输出包装上存在差异。

## 2. 背景与问题

Workflow Agent 与 ToolCall 都要处理多轮模型调用、工具执行、SSE、上下文恢复和计费，但历史实现分别维护 adapter，导致同一种行为有多套事实来源。

### 2.1 事件重复或缺失

- sandbox、read file 曾使用专属事件，Workflow Agent 客户端收不到与普通工具一致的 SSE。
- 为补 SSE 又同时发出通用 tool 事件，可能出现工具卡片和 nodeResponse 重复。
- plan、ask 同时耦合在 LLM/tool 事件和独立事件中，恢复与展示职责不清。

### 2.2 assistantResponses 重复

- Workflow Agent 按事件维护一份 `assistantResponses`。
- ToolCall 或最终结果又可能从 messages 转换一份。
- 子 workflow 的 assistant 内容还可能由工具结果再次追加。
- 多个来源同时落库后，同一轮 assistant 文本或工具结果可能保存两次。

### 2.3 上下文恢复不一致

- ask 回答、child interactive、plan 恢复分别携带不同快照或关联字段。
- ask 曾错误复用 `planId`；实际应由必填 `askId` 独立关联。
- child interactive 曾携带 `memoryRequestMessages`，与从 chat history 重建上下文形成双来源。
- 上下文压缩后的恢复边界不统一，可能把压缩前消息重新发给模型。

### 2.4 分层边界不清

- provider 可能感知 workflow/chat/SSE 类型。
- Workflow Agent 与 ToolCall 分别理解底层 provider 的事件和结果细节。
- 计费数据同时存在于回调、事件和最终 result，容易重复扣费。

## 3. 目标

### 3.1 统一执行入口

1. 底层统一通过 `runAgentLoop({ provider, input, runtime })` 执行 provider。
2. workflow dispatch 统一通过 `runAgentLoopCore` 调用底层循环。
3. Workflow Agent 和 ToolCall 都调用 `runAgentLoopCore`，不得继续维护旧 assistant/event adapter。
4. provider 私有入口不得从 agent-loop 根模块 re-export。

### 3.2 统一 Agent 能力模型

| 能力 | Workflow Agent | ToolCall |
| --- | --- | --- |
| 多轮 LLM 循环 | 开启 | 开启 |
| 通用工具事件 | 开启 | 开启 |
| sandbox/read file/dataset search | 按配置开启 | 按配置开启 |
| child interactive | 开启 | 开启 |
| plan | 按配置开启 | 关闭 |
| ask | 按配置开启 | 关闭 |
| 工具来源 | selected tools/sub apps | tool nodes/runtime graph |
| 最终输出包装 | Agent 节点语义 | ToolCall 节点语义 |

### 3.3 统一工具分类

工具分为三类：

1. **业务工具**：selected tool、sub app、tool node。
2. **普通系统工具**：sandbox、read file、dataset search。
3. **控制系统工具**：plan、ask。

业务工具和普通系统工具必须完全使用通用 tool 事件。sandbox 和 read file 不再拥有独立事件协议。

plan 和 ask 必须使用独立事件，不能出现在普通工具 SSE、普通工具卡片或普通工具 nodeResponse 中。

### 3.4 统一 assistantResponses

1. `assistantResponses` 必须只有一个维护入口：agentLoopCore 的标准事件 collector。
2. assistant 普通文本和 reasoning 独立保存，不能挂在 plan 或 ask 上。
3. 普通工具保存 call、参数和最终 response。
4. `agentPlanUpdate` 只保存恢复 plan tool call 所需内容。
5. `agentAsk` 只保存恢复 ask tool call 所需内容及 `askId`。
6. `plan_status` 只服务 UI/SSE，不进入 `assistantResponses`；成功的 `plan_operation` 携带后端计算完成的完整计划，并按 `planId` 覆盖保存到 `assistantResponses`，供刷新后恢复展示。
7. 子 workflow 产生的 assistant messages 通过 `tool_run_end.assistantMessages` 进入同一 collector。
8. 最终 result 只能用于补齐事件未覆盖的数据，不能成为第二套完整写入源。
9. `assistantResponses` 不保存完整 nodeResponse；运行详情独立存储。

### 3.5 统一 nodeResponse

Workflow adapter 根据以下终态事件追加运行详情：

- `llm_request_end`：一次模型请求详情。
- `tool_run_end`：一次普通工具执行详情。
- `plan_operation`：一次可恢复的 plan 操作详情。
- `ask_start`：一次收集问题详情。
- `after_message_compress`：一次上下文压缩详情。

同一个 call/request 只能追加一次。`tool_run_start` 不产生 nodeResponse。

### 3.6 统一 SSE

- answer/reasoning 增量按原有流式事件推送。
- 普通工具使用 `tool_call`、`tool_params` 和 `tool_run_end` 推送。
- sandbox/read file/dataset search 与业务工具表现一致。
- plan 内部只使用 `plan_status`、`plan_operation`；成功的 `plan_operation` 由 adapter 转换为完整 plan SSE。
- ask 使用独立交互结构，不生成普通工具卡片。
- nodeResponse 收集与 SSE 推送相互独立，不能通过重复发事件补另一侧数据。

### 3.7 统一暂停和恢复

底层 agent-loop 只表达两种暂停：

- `ask`：包含 `askId` 与问题内容。
- `tool_child`：包含 `toolCallId` 与 children response。

要求：

1. `askId` 和 `toolCallId` 都是必填关联键。
2. agent-loop 不依赖 workflow 的 interactive schema。
3. agentLoopCore 将底层 `paused` 映射为 workflow `interactive`。
4. ask 用户回答通过 `askId` 恢复为 ask tool response。
5. 带 `askId` 的 human value 是 UI-only 回答，不能再作为普通 user message 注入上下文。
6. child interactive 新数据只保存 `toolCallId` 与 children response，不保存 `memoryRequestMessages`。
7. 恢复上下文统一从 chat history 经 `chats2GPTMessages` 重建。
8. fastAgent 和 piAgent 都必须通过 `executeInteractiveTool` 恢复子工具并继续循环。

### 3.8 统一上下文压缩

- 压缩结果通过 `contextCheckpoint` 持久化。
- 恢复时只使用最新 checkpoint。
- checkpoint 之前的原始消息不得再次进入模型请求。
- checkpoint 本身作为隐藏上下文参与恢复，不作为用户可见聊天内容。

### 3.9 统一计费

1. `runtime.usagePush` 是唯一产生账单副作用的入口。
2. `result.usages` 是只读汇总数据，用于 points/token 统计和节点输出。
3. event 中的 usages 只用于 trace、nodeResponse 和展示。
4. 任何 adapter、collector 或 summary 都不得再次调用计费逻辑。
5. 每次模型、压缩和计费工具产生的 usage 只能推送一次。

### 3.10 统一底层返回值

agent-loop result 必须始终返回：

- `status`
- `completeMessages`
- `assistantMessages`
- `requestIds`
- `usages`
- `finishReason`

可选返回：

- `activePlan`
- `providerState`
- `contextCheckpoint`
- `pause`
- `error`

`answerText`、`reasoningText` 不作为 result 的独立字段；多轮最终文本由 `assistantMessages` 派生。

## 4. plan 与 ask 约束

### 4.1 plan

plan 只允许三个操作：

- `set_plan`：创建或重置计划。
- `add_steps`：追加计划步骤。
- `update_steps`：更新指定步骤的状态或备注。

步骤状态只允许：

- `pending`
- `in_progress`
- `done`
- `blocked`
- `skipped`

不保留 `acceptanceCriteria`、`evidence`、`outputSummary`、`blocker`、`needsReplan` 等扩展字段。不需要执行的步骤直接更新为 `skipped`。

### 4.2 ask

- ask 与 plan 完全独立，不使用 planId。
- `ask_start` 负责记录可恢复调用和“收集问题”运行详情。
- `ask` 表示进入暂停。
- `ask_resume` 表示用户答案已重新接入循环。
- ask 的 UI 不展示额外“状态”“反问问题”字段。

## 5. 分层边界

### 5.1 agent-loop 可感知

- 标准 LLM messages 与模型参数。
- providerState。
- 标准工具 schema、工具执行回调和系统工具开关。
- 标准事件、usage 和 pause。

### 5.2 agent-loop 不可感知

- Workflow node、ChatItem、nodeResponse、SSE schema。
- 数据库存储和前端交互结构。
- appId/userId/chatId 等 sandbox 单次调用参数。
- `agentPlanAskQuery`、`toolChildrenInteractive`。

### 5.3 节点外壳保留差异

- 上下文和权限准备。
- 工具发现与 ToolProvider 实现。
- sandbox client 初始化。
- provider、plan、ask 配置。
- 节点输出字段与运行详情包装。

## 6. 非目标

- 不统一 Workflow Agent 与 ToolCall 的工具发现逻辑。
- 不要求 fastAgent 与 piAgent 使用相同内部 memory 格式。
- 不在底层 agent-loop 中引入 workflow/chat 类型。
- 本版本不做历史数据物理迁移；保留一次版本窗口的只读兼容，下一版本按“兼容窗口结束条件”移除。
- 不要求内存长期保存子 workflow 的全部 nodeResponses；完整详情可由 writer 直接落库。
- 不改变现有前端聊天数据结构之外的业务协议。

## 7. 兼容和迁移要求

- 删除旧 adapter 和旧 re-export 后，所有 import 必须直接指向新模块。
- 历史 ask 的 `agentAsk.planId`、`agentPlanAskQuery.planId` 和 Human value `planId`
  必须在聊天读取边界统一映射为 `askId`，响应和新写入不得继续输出 `planId`。
- 旧 Workflow Agent memory `{ pendingMainContext }` 必须只读兼容为
  `{ providerState: { pendingMainContext } }`，使升级前暂停的 ask 可以提交答案并继续原消息链。
- 旧 child interactive 的 `memoryRequestMessages` 允许只读兼容，新写入不得继续产生。
- piAgent 旧 raw messages memory 可保留兼容读取，新增统一状态写入走 providerState。
- 数据库已有 `agentPlanUpdate`、`agentAsk` 和 context checkpoint 必须仍可恢复。
- 迁移期不得同时运行旧、新 assistantResponses collector。

本次历史兼容是临时迁移措施，不是新的持久化协议：

- 当前版本继续兼容读取旧 `planId` ask、旧 `{ pendingMainContext }` memory、旧 plan 字段和旧
  `memoryRequestMessages`。
- 所有新写入只使用 `askId`、统一 `providerState` 和当前 plan 字段，不得重新产生旧字段。
- 下一版本在确认兼容窗口结束后移除上述读取分支及对应测试；若仍有未迁移数据，应先完成离线迁移，
  不通过继续延长运行时兼容来掩盖数据问题。

## 8. 验收标准

| 编号 | 验收项 | 验证方式 |
| --- | --- | --- |
| AC-01 | Workflow Agent 与 ToolCall 都调用 `runAgentLoopCore` | 边界测试与依赖搜索 |
| AC-02 | agent-loop 根入口不 re-export provider 私有函数 | export 边界测试 |
| AC-03 | 底层 agent-loop 不依赖 workflow/chat/SSE | import 边界测试 |
| AC-04 | sandbox/read file 只有通用工具事件、一次 SSE、一次 nodeResponse | provider + core 事件测试 |
| AC-05 | plan/ask 不产生普通工具卡片 | SSE/assistant collector 测试 |
| AC-06 | assistant 文本/reasoning 不写入 plan/ask | assistantResponses 结构测试 |
| AC-07 | Workflow Agent 数据库无重复 assistant response | dispatch 集成测试 |
| AC-08 | 子 workflow assistant 通过 tool end 只追加一次 | child tool 集成测试 |
| AC-09 | ask 回答不会重复注入 user message | chats2GPTMessages 测试 |
| AC-10 | child interactive 恢复不需要新 `memoryRequestMessages` | fast/pi provider 恢复测试 |
| AC-11 | 最新 checkpoint 正确截断上下文 | chat 转换与 core 测试 |
| AC-12 | usage 只通过 `usagePush` 计费一次 | 精确调用次数测试 |
| AC-13 | 完整 plan 快照可刷新恢复，历史 task/title 字段读取为新结构，且不进入模型消息 | assistant collector、历史读取、交互保存与 chats2GPTMessages 测试 |
| AC-14 | 所有 result 分支都含必填字段和合法 finishReason | provider contract 测试 |
| AC-15 | ToolCall 关闭 plan/ask，其他能力与 Workflow Agent 一致 | 两入口对照测试 |
| AC-16 | 无旧 adapter、旧 re-export 和旧 import 残留 | `rg` + TypeScript 检查 |
| AC-17 | 历史 planId ask 卡片按 askId 返回，旧 pendingMainContext 可提交答案并续跑 | 历史读取与 providerState memory 测试 |

## 9. 完成定义

本需求只有在以下条件同时成立时才算完成：

1. 上述验收项都有自动化测试或明确的静态检查证据。
2. fastAgent、piAgent、agentLoopCore、Workflow Agent、ToolCall、chat 转换局部测试通过。
3. TypeScript 检查、格式检查及全量测试通过。
4. 旧实现和无用兼容代码已删除，不存在双写路径。
5. 代码行为与本需求及技术设计一致；发现偏差时先更新设计决策，再修改实现。

## 10. 当前实施证据

截至 2026-07-13，已完成以下验证：

- Workflow Agent 与 ToolCall 均通过 `runAgentLoopCoreWithSummary` 调用共享内核。
- fastAgent 与 piAgent 已覆盖普通工具成功、异常、stop、child interactive 和恢复路径。
- plan/ask 独立事件、普通工具事件、SSE、assistantResponses 和 nodeResponse 已分别测试。
- `usagePush` 精确调用次数及 `result.usages` 只读汇总已测试；ToolCall 不重复统计子工具积分。
- `chats2GPTMessages` 的 askId、plan、普通工具和最新 checkpoint 恢复测试通过。
- 数据库保存测试覆盖 ask 回答回填和 child interactive 工具卡片合并，无第二份工具卡片写入。
- agent-loop 相关 service 回归共 65 个测试文件、332 项测试通过；global chat 转换 114 项、app ask 交互 13 项测试通过。
- 仓库全量 `pnpm test` 的 4 个 workspace 全部通过；app 154 个测试文件/1081 项测试、service 255 个测试文件/3184 项测试通过，global 与 admin workspace 通过。

尚待完成：评审确认。应用 TypeScript 检查中与本需求相关的错误已清零；仓库当前仍有一处不属于本需求的 `WholeResponseContent` `contentHeight` 属性类型错误。

# Agent 上下文和工具压缩逻辑分析

日期：2026-06-23

## 结论摘要

当前 Agent 上下文链路已经从旧的 `compressed_messages: ChatCompletionMessageParam[]` 转为 checkpoint 压缩模式：历史消息在超过阈值后被压成一条隐藏的 user message，并通过 `contextCheckpoint` 写入 AI history。工具结果压缩仍是单次 tool response 级别的压缩，执行后作为 `tool` message 回灌到同一条 agent loop 消息链。

整体设计方向是正确的：避免历史 `assistant.tool_calls` / `tool` message 被 LLM 改坏配对关系，同时保留 ask resume、plan、tool result 的连续上下文。但当前实现里有一个需要优先确认的风险：`compressRequestMessages` 的结构化工具 checkpoint 分支不产生 `usage`，而 `onCompressContext` 只有存在 `result.usage` 才返回压缩结果，导致这条无 LLM 压缩路径在 agent loop 中可能被忽略。

## 相关模块地图

| 模块 | 职责 |
| --- | --- |
| `packages/service/core/workflow/dispatch/ai/agent/index.ts` | Workflow Agent 节点入口，准备历史、用户上下文、工具、sandbox，并调用 unified loop。 |
| `packages/service/core/ai/llm/agentLoop/loop/unified.ts` | 单主 Agent Loop 适配层，注入 `ask_agent`、`update_plan` 和 runtime tools，处理 stop gate。 |
| `packages/service/core/ai/llm/agentLoop/loop/base.ts` | 底层循环：每轮请求前压缩上下文，请求 LLM，执行工具，压缩工具结果，回灌 tool message。 |
| `packages/service/core/ai/llm/compress/index.ts` | 压缩实现：历史 checkpoint、通用长文本压缩、JSON 工具结果结构摘要、tool response 压缩。 |
| `packages/service/core/workflow/dispatch/ai/agent/adapter/eventMapper.ts` | 将 loop 事件写入 `assistantResponses` 和 SSE；`after_message_compress` 在这里写 checkpoint。 |
| `packages/global/core/chat/adapt.ts` | history -> GPT messages 适配；识别最新 checkpoint，丢弃 checkpoint 前普通历史。 |
| `packages/service/core/workflow/dispatch/utils/index.ts` | 按节点 history 配置裁剪历史；存在 checkpoint 时优先从 checkpoint 开始保留。 |

## 上下文构造链路

1. `dispatchRunAgent` 通过 `useUserContext` 拿到 `chatHistories`、改写后的历史和当前用户消息。
2. `chats2GPTMessages({ reserveTool: true })` 将 FastGPT history 转为 LLM messages，并保留 agent/tool 结构。
3. `runUnifiedAgentLoop` 注入 Main Agent system prompt，过滤历史里的 system message，组成初始 messages。
4. `runAgentLoop` 每轮请求前调用 `onCompressContext`，由 `compressRequestMessages` 判断是否压缩。
5. LLM 如果调用 runtime tool，工具结果会变成 `tool` message 追加回 `requestMessages`，下一轮继续沿同一条消息链请求。
6. 如果触发 `ask_agent`，`pendingMainContext.messages` 会保存当时 messages；用户回答后作为对应 ask tool response 接回原链路。

关键代码：

- `runAgentLoop` 每轮请求前压缩 request messages：`packages/service/core/ai/llm/agentLoop/loop/base.ts:286`
- LLM 请求使用压缩后的 `requestMessages`：`packages/service/core/ai/llm/agentLoop/loop/base.ts:331`
- ask resume 从 `pendingMainContext.messages` 接回 tool response：`packages/service/core/ai/llm/agentLoop/loop/unified.ts`

## 历史 checkpoint 压缩

触发逻辑在 `compressRequestMessages`：

1. 先拆出 `system/developer` 与其它消息。系统类消息不参与摘要，但最终保留在最前面。
2. 使用完整 messages 计算 token，超过 `model.maxContext * 0.8` 才触发历史压缩。
3. 优先尝试结构化工具 checkpoint：从历史 tool_calls / tool result 中确定性生成 checkpoint。
4. 如果不能使用结构化路径，则调用 LLM 压缩为 `<context_checkpoint>...</context_checkpoint>`。
5. 压缩结果作为 `{ role: user, hideInUI: true }` message 返回。
6. 若 LLM 输出仍超阈值，尝试确定性 head-tail checkpoint 兜底；仍超限则返回原始 messages。

关键代码：

- 拆分 system/developer 和其它消息：`packages/service/core/ai/llm/compress/index.ts:720`
- 80% 阈值判断：`packages/service/core/ai/llm/compress/index.ts:742`
- 结构化工具 checkpoint 分支：`packages/service/core/ai/llm/compress/index.ts:755`
- LLM checkpoint 压缩：`packages/service/core/ai/llm/compress/index.ts:791`
- 返回 checkpoint：`packages/service/core/ai/llm/compress/index.ts:914`

## checkpoint 持久化和恢复

checkpoint 不在 `dispatchRunAgent` 末尾显式追加，而是通过 loop 事件写入：

1. `runAgentLoop` 压缩成功后触发 `onAfterCompressContext`。
2. `runUnifiedAgentLoop` 转发为 `after_message_compress` 事件。
3. `eventMapper` 收到事件后向 `assistantResponses` push `{ contextCheckpoint, hideInUI: true }`。
4. 本轮 chat 保存时该 value 随 AI history 落库。
5. 下一轮 `getHistories` 发现 AI history 中有 checkpoint 时，从最新 checkpoint 所在 history 开始保留，避免先按最近 N 轮裁掉 checkpoint。
6. `chats2GPTMessages` 再次从最新 checkpoint value 精确切片，把 checkpoint 转为隐藏 user message，并跳过同一 value 的其它字段。

关键代码：

- 事件写入 checkpoint value：`packages/service/core/workflow/dispatch/ai/agent/adapter/eventMapper.ts:374`
- history 裁剪保留 checkpoint：`packages/service/core/workflow/dispatch/utils/index.ts:387`
- adapter 查找最新 checkpoint：`packages/global/core/chat/adapt.ts:73`
- checkpoint 转 hidden user message：`packages/global/core/chat/adapt.ts:479`

## 工具压缩链路

工具执行和压缩在 `runAgentLoop` 内完成：

1. LLM 产出 tool_calls 后，先把 assistant tool_calls message 追加到 `requestMessages`。
2. 对每个 tool 执行 `onRunTool`，runtime 内部工具如 `ask_agent` / `update_plan` 会设置 `skipResponseCompress`。
3. 对普通 runtime tool，调用 `compressToolResponse` 压缩结果。
4. 压缩后的内容写成 `tool` message，追加到 `requestMessages` 和 `assistantMessages`。
5. `onAfterToolCall` 把压缩后的 response 和压缩详情传给 workflow adapter，用于工具卡和运行详情。

关键代码：

- 工具执行入口：`packages/service/core/ai/llm/agentLoop/loop/base.ts:425`
- 跳过内部工具压缩：`packages/service/core/ai/llm/agentLoop/loop/base.ts:461`
- 调用 `compressToolResponse`：`packages/service/core/ai/llm/agentLoop/loop/base.ts:469`
- tool message 回灌：`packages/service/core/ai/llm/agentLoop/loop/base.ts:506`

`compressToolResponse` 的预算策略：

1. 固定上限：`model.maxContext * 0.5`。
2. 动态上限：`(model.maxContext - currentMessagesTokens) / toolLength`，避免并行工具结果整体打爆上下文。
3. 调用方自定义上限。
4. 三者取最小值。
5. JSON 工具结果优先走本地结构摘要；否则走通用 `compressLargeContent`。

关键代码：

- 工具压缩预算计算：`packages/service/core/ai/llm/compress/index.ts:1299`
- JSON 本地摘要优先：`packages/service/core/ai/llm/compress/index.ts:1316`
- 通用长文本压缩：`packages/service/core/ai/llm/compress/index.ts:1326`

## 当前风险点

### R1：结构化工具 checkpoint 在 agent loop 中可能不生效

`compressRequestMessages` 的结构化工具 checkpoint 分支返回：

```ts
return {
  messages: finalStructuredMessages,
  contextCheckpoint: structuredToolCheckpoint
};
```

该返回没有 `usage`。但 `onCompressContext` 只有 `if (result.usage)` 才返回压缩结果。结果是：结构化 checkpoint 虽然在 `compressRequestMessages` 内生成了，但 `runAgentLoop` 不会替换 `requestMessages`，也不会向外传播 `contextCheckpoint`。

影响：

- 工具调用历史很长时，本地确定性压缩路径可能被静默跳过。
- 只能依赖后续 LLM checkpoint 分支；但当前代码在结构化分支成功后直接 return，不会落到 LLM 分支。

建议：

- `onCompressContext` 应在 `result.messages !== requestMessages` 或 `result.contextCheckpoint` 存在时也返回压缩结果。
- usage 可选；调用处 `usagePush` 和 `onAfterCompressContext` 需要允许无 usage 的压缩事件，或为本地压缩生成 0 usage 记录。
- 增加 base loop 级测试，覆盖 `compressRequestMessages` 返回无 usage 但有 `contextCheckpoint` 的情况。

### R2：工具压缩动态预算可能为 0

`availableCompressedTokenLimit = max(0, floor((maxContext - currentMessagesTokens) / toolLength))`。当当前 messages 已接近或超过 maxContext 时，工具结果压缩目标可能为 0。后续 `compressLargeContent` 是否能稳定处理 0 token 预算，需要专项测试。

建议：

- 设置最小压缩预算，例如 256 或 512 token；若连最小预算都无空间，应先触发 request message checkpoint，再执行/回灌工具结果。
- 增加工具结果压缩预算为 0 的单测。

### R3：结构化 checkpoint 分支缺少运行详情事件

结构化 checkpoint 是本地压缩，不会产生 requestId 和 usage。即使修复 R1，也需要决定是否在运行详情里显示“本地上下文压缩”。否则用户只能看到上下文突然变短，缺少可观测性。

建议：

- 若前端需要可观测性，可扩展 `after_message_compress` 事件，允许 `compressionMode: 'structured_tool_checkpoint'` 和 0 usage。

### R4：checkpoint 保存顺序依赖事件时机

当前 checkpoint 通过 `after_message_compress` 事件即时 push 到 `assistantResponses`。这能保证压缩发生在本轮中间时，checkpoint 排在后续 plan/tool/text value 之前。但如果未来某些压缩路径不触发事件，只在 `result.contextCheckpoint` 返回，正常完成路径不会兜底保存。

建议：

- 明确约定：所有可持久化 checkpoint 必须通过 `after_message_compress` 写入。
- 或在 `dispatchRunAgent` done/ask 分支增加去重兜底，避免事件丢失导致 checkpoint 不落库。

## 建议 TODO

- [ ] 修复 `onCompressContext` 对无 usage checkpoint 的忽略问题。
- [ ] 增加 base loop 测试：无 usage 的 structured checkpoint 应替换 request messages 并返回 `contextCheckpoint`。
- [ ] 增加 workflow dispatch 集成测试：checkpoint value 写入顺序为 `checkpoint -> 后续 plan/tool/text`。
- [ ] 增加工具压缩动态预算为 0 或极小值时的测试。
- [ ] 明确本地结构化压缩是否需要运行详情展示。

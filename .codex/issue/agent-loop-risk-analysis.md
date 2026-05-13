# Agent Loop 与 PiAgent 适配风险分析

日期：2026-05-12

## 背景

本次分析基于 `agent-loop` 分支对新版 workflow agent 与 PiAgent 适配的本地检查、浏览器测试现象和 PR review 结果。

已经确认 PiAgent 适配方向基本正确：

- PiAgent 不再依赖 `childrenResponses`，主 Agent 请求和工具调用都应平铺写入 `nodeResponses`。
- PiAgent 工具事件需要透传为前端可识别的 `toolCall`、`toolParams`、`toolResponse`。
- PiAgent 主模型 request record 需要保留 FastGPT 内部 `requestId`，并尽量记录 provider response id。
- 主 Agent usage 和工具 usage 不应重复累计，避免计费与运行详情重复统计。

但进一步检查后，当前代码仍存在几类状态机和上下文防御问题，优先级高于继续扩展功能。

## 结论摘要

当前最需要优先处理的是非法 tool call 的完整性防线。

浏览器测试里出现的“客户端没收到 `toolResponse` 回调，导致 tools 卡片异常”，更像是后端事件映射与脏 tool call 共同导致的问题，而不是单纯前端合并逻辑异常。

核心链路如下：

1. Agent 或历史上下文里出现了 `function.name` 为空的 tool call。
2. 后端 `eventMapper` 在 `tool_call` 阶段仍然创建并透传了 tools 卡片。
3. 到 `tool_response` 阶段，`eventMapper` 又因为取不到有效 `functionName` 直接吞掉响应。
4. 前端已经拿到 tool 卡片，但永远等不到对应 tool response，因此卡片异常卡住。

这类问题一旦落库，还会在后续 `chats2GPTMessages` 转换中被重新送回模型，持续污染上下文。

## 问题 1：非法 tool call 会导致 tool 卡片无法闭合

### 现象

客户端可以收到 `toolCall`，但收不到对应 `toolResponse`。

用户贴出的异常上下文中出现了成对错位的 tool call：

- 一个 tool call 有工具名，但参数是 `{}`。
- 另一个 tool call 参数正确，但 `function.name` 是空字符串。

示例形态：

```json
{
  "id": "call_IOrIQI7h5Xe88su1LRVVD2dW",
  "type": "function",
  "function": {
    "name": "sandbox_shell",
    "arguments": "{}"
  }
}
```

```json
{
  "id": "d7f4dfb9dd274ed68b324dd035ca68bb",
  "type": "function",
  "function": {
    "name": "",
    "arguments": "{\"command\":\"python3 ...\"}"
  }
}
```

### 根因

`eventMapper` 对 `tool_call` 和 `tool_response` 的过滤逻辑不一致。

`tool_call` 阶段：

- `packages/service/core/workflow/dispatch/ai/agent/adapter/eventMapper.ts`
- `emitEvent` 处理 `tool_call` 时直接读取 `event.call.function.name`。
- 即使 `functionName` 是空字符串，也会写入 `toolNameByCallId`，并继续创建 `ToolModuleResponseItemType` 和发送 `toolCall` SSE。

`tool_response` 阶段：

- `applyToolResponse` 通过 `toolNameByCallId.get(callId)` 获取工具名。
- 如果 `functionName` 为空，直接 `return`。

因此空工具名会造成：

- 前端收到 tool card。
- 后端吞掉 tool response。
- tool card 无法闭合。

### 影响

- 前端 tools 卡片异常。
- `assistantResponses.tools` 可能出现只有 call、没有 response 的不完整记录。
- 运行详情与真实执行状态不一致。
- 脏上下文进入历史后，下一轮仍会被送回模型。

### 修复建议

1. `eventMapper` 在 `tool_call` 阶段先校验 `function.name`。
2. 对空工具名、空 call id、非 function 类型 tool call，不创建 tools 卡片。
3. 如果需要暴露错误，也应发送一条可闭合的错误 tool response，而不是只发 tool call。
4. `tool_call` 与 `tool_response` 的过滤规则必须一致。

## 问题 2：上下文转换缺少 tool call 结构校验

### 现象

已经落库的异常 tools 记录会被重新转换为 OpenAI tool call 格式，继续污染模型上下文。

### 根因

历史消息转换时，对 tools 结构信任过高。

相关位置：

- `packages/global/core/chat/adapt.ts`
- `chats2GPTMessages` 在 `reserveTool=true` 时，会把 `value.tools` 或 `value.tool` 转成 `tool_calls` 和 `tool` message。
- 当前转换过程没有校验：
  - `tool.id` 是否存在。
  - `tool.functionName` 是否为空。
  - `tool.params` 是否为合法字符串。
  - `tool.response` 是否与 tool call 成对存在。

### 影响

- 旧脏数据会反复进入模型上下文。
- 模型可能学习到错误工具调用格式。
- 下游工具执行器可能收到空工具名或空参数。
- 用户看到的上下文异常难以定位，因为错误源头可能来自历史消息，而不是当前模型输出。

### 修复建议

1. 在 `chats2GPTMessages` 的工具历史转换处增加校验。
2. 丢弃空 `id` 或空 `functionName` 的工具调用。
3. 对 `params` 兜底为 `{}`，但不能为缺失工具名兜底。
4. 如果 `tool_calls` 与 `toolResponse` 无法成对，则不要把不完整工具上下文送回模型。

## 问题 3：prompt tool call 解析会制造非法工具调用

### 根因

相关位置：

- `packages/service/core/ai/llm/promptCall/index.ts`
- `parsePromptToolCall` 解析 JSON 后，直接使用 `toolCall.name` 和 `toolCall.arguments` 生成 `ChatCompletionMessageToolCall`。

当前没有校验：

- `toolCall.name` 是否为非空字符串。
- `toolCall.arguments` 是否存在。
- `toolCall.arguments` 是否是可序列化对象。

已有测试里甚至保留了 `1: {}` 也会生成非法 tool call 的行为，这说明这个问题不是偶发，而是当前 parser 的显式行为。

### 影响

- prompt-call 模式可以直接制造 `function.name=undefined` 或空字符串的 tool call。
- 这些 tool call 后续会进入统一 request 处理和历史记录。
- 一旦和 streaming tool delta 合并逻辑叠加，就可能出现工具名和参数错位。

### 修复建议

1. `parsePromptToolCall` 中校验 `name`，非法时返回普通错误文本，而不是生成 tool call。
2. `arguments` 缺失时可兜底 `{}`，但不能放过空工具名。
3. 更新相关测试，明确 `1: {}` 不应再生成 tool call。

## 问题 4：发起 LLM request 前只补参数，不校验工具名

### 根因

相关位置：

- `packages/service/core/ai/llm/request.ts`

当前逻辑会把空 `arguments` 补成 `{}`，以兼容部分模型不支持空参数的问题。

但它没有校验：

- `tool.function.name` 是否存在。
- `tool.function.name` 是否为空字符串。
- tool call id 是否存在。

### 影响

上游任何环节生成的非法 tool call 都可能继续进入：

- `accumulatedToolCalls`
- agent loop 工具执行阶段
- assistantMessages
- 历史上下文

### 修复建议

在 request 层增加最后一道防线：

1. 过滤空工具名 tool call。
2. 过滤空 id tool call。
3. 对被过滤的非法 tool call 记录 warning 日志，方便排查 provider 或 parser 问题。

## 问题 5：`parallel_tool_calls=true` 破坏控制类工具语义

### 现象

统一 agent loop 允许并行 tool calls，但 `ask_agent`、`update_plan` 这类控制工具本身具有状态机语义，不适合和普通 runtime tool 并行。

相关位置：

- `packages/service/core/ai/llm/agentLoop/loop/unified.ts`
- 当前 request body 中设置了 `parallel_tool_calls: true`。

工具执行位置：

- `packages/service/core/ai/llm/agentLoop/loop/base.ts`
- `for await (const tool of toolCalls)` 顺序执行工具。
- 某个工具返回 `stop: true` 后，只是设置 `stopAgentLoop=true`，没有立即停止处理同批次后续工具。

### 风险场景

场景一：`ask_agent` 和普通工具同轮出现。

1. 模型同一轮返回 `ask_agent` 和 runtime tool。
2. `ask_agent` 表示需要等待用户回答。
3. 但同批次其他 runtime tool 仍可能继续执行。
4. 结果是用户尚未回答，工具副作用已经发生。

场景二：runtime tool 和 `update_plan` 同轮出现。

1. 模型先调用 runtime tool，再同轮调用 `update_plan`。
2. `update_plan` 没有真正观察到 runtime tool response。
3. `runtimeToolCalledSinceLastPlanUpdate` 可能被错误清零。
4. stop gate 的计划约束可能被绕过。

### 影响

- `ask_agent` 的暂停语义不可靠。
- plan 更新可能记录了模型尚未实际看到的工具结果。
- 有副作用工具时，可能产生用户确认前的执行。

### 修复建议

优先选择保守方案：

1. 当存在 `ask_agent`、`update_plan` 等控制工具时，不允许并行工具调用。
2. 或在执行 toolCalls 前预扫描：
   - `ask_agent` 必须独占本轮。
   - runtime tool 执行后，下一次 `update_plan` 必须发生在模型看到 tool response 之后的新一轮。
3. `stop: true` 后应立即停止同批次后续工具处理，或明确丢弃后续工具并记录原因。

## 问题 6：stop gate 与流式输出语义确认

### 结论

统一 agent loop 会实时把 `answer_delta` 推给前端，包括之后被 stop gate 打回的草稿输出。这是当前产品期望，不再作为待修复漏洞处理。

相关位置：

- `packages/service/core/ai/llm/agentLoop/loop/unified.ts`
- `onStreaming` 立即发出 `answer_delta`。

stop gate 位置：

- `packages/service/core/ai/llm/agentLoop/loop/base.ts`
- `onStopCandidate` 在本轮 LLM 响应结束、且无工具调用时才判断是否允许停止。

当 stop gate 拒绝时，代码会把本轮 assistant message 从 `assistantMessages` 中移除，保证刷新恢复和最终 answer 不包含被拒绝草稿。但实时 SSE 中已经推给前端的过程输出不撤回。

### 影响边界

- 用户会看到模型中间过程，包括 stop gate 后续打回的草稿。
- 最终持久化 answer 仍以 `assistantMessages` 为准，不保存被 stop gate 打回的 assistant message。
- stop gate 不承担输出撤回、安全审核或最终统一推送职责，只负责继续 loop 和最终持久化边界。

### 保持策略

1. 保持 `answer_delta`、`reasoning_delta` 实时透传。
2. 不增加 final answer 缓存、flush 或撤回逻辑。
3. 测试继续覆盖 rejected answer 也会先流给前端的行为。
4. 若未来需要安全审核，应新增专门审核链路，不能复用当前 stop gate 作为输出拦截器。

## 问题 7：PiAgent 失败请求可能丢失 requestId 与 nodeResponse

### 现象

PiAgent adapter 会在请求发起时创建 pending request，但只有收到 assistant `message_end` 时才落 request record 和 nodeResponse。

相关位置：

- `packages/service/core/workflow/dispatch/ai/agent/piAgent/adapter/runtime.ts`
- `onPayload` 创建 pending request。
- `message_end` 消费 pending request 并写入 Agent 节点运行详情。
- `turn_end` 遇到 error 时仅保留日志入口，默认认为错误已经在 `message_end` 中记录。

### 风险

如果 provider 在 assistant `message_end` 之前失败：

- pending request 不会被消费。
- request record 不会落库。
- nodeResponse 不会记录这次失败。
- 用户排查时只能看到外层错误，看不到对应 requestId。

### 修复建议

1. `turn_end` 出现 error 时，检查并 flush 所有 pending requests。
2. 为失败请求写入 error request record。
3. 追加错误 nodeResponse，至少包含：
   - `requestId`
   - `modelName`
   - `runningTime`
   - `errorText`
   - 原始 request body 的必要摘要
4. dispatch catch 也应兜底 flush pending requests。

## 问题 8：`history=0` 会导致 ask_agent 恢复上下文失败

### 根因

相关位置：

- `packages/service/core/workflow/dispatch/ai/agent/index.ts`
- `getHistories(history, histories)` 先根据节点 history 配置裁剪历史。
- `readWorkflowAgentLoopMemory` 再从裁剪后的 `chatHistories` 中恢复 ask pending memory。

`getHistories` 当前逻辑：

- `history=0` 时直接返回 `[]`。

### 影响

如果 agent 节点配置了 `history=0`：

- 用户回答 `ask_agent` 后，系统可能找不到上一轮写入的 pending memory。
- Agent 无法恢复原始 loop context。
- 追问/回答链路会退化成一次普通新请求。

### 修复建议

`ask_agent` pending memory 的恢复不应依赖节点 history window。

可选方案：

1. 从完整 `histories` 中读取最近一次 interactive memory。
2. history 裁剪只影响送模聊天历史，不影响 agent loop control memory。
3. 对 memory 增加 nodeId、toolCallId、轮次等更强匹配条件，避免误恢复。

## 问题 9：Markdown 导出 tools 内容可能出现逗号和 undefined

### 根因

相关位置：

- `projects/app/src/components/core/chat/ChatContainer/ChatBox/hooks/useChatBox.tsx`

导出时对 `item.value` 使用 `map` 得到数组，然后直接 `result + content`。

### 影响

- 多段内容会被数组默认 `toString()` 用逗号拼接。
- 没有返回值的分支可能输出 `undefined`。
- tools、reasoning、answer 混合消息导出的 Markdown 结构不稳定。

### 修复建议

1. 使用 `.filter(Boolean).join('\n')`。
2. 对 tool call、tool response、reasoning、answer 明确分段。

## usage 检查结论

目前没有发现明显重复计费问题。

观察到的计费路径：

- 主 Agent LLM usage 通过 agent loop 的 usage push 进入统一 usage sink。
- runtime tool 返回的 usages 会在 base loop 中单独 push。
- PiAgent 工具 points 不应再叠加到主 Agent 节点上。

需要继续保持的原则：

1. 主模型 usage 只归主 Agent 请求。
2. 工具 usage 只归工具或子应用运行详情。
3. response 记录可以展示聚合信息，但不要重复累计 points。
4. 压缩工具响应产生的 LLM usage 需要作为独立 child usage 记录，不应混入主回答模型 usage。

## response 记录检查结论

新版 PiAgent 不需要 `childrenResponses` 作为 Agent 节点的嵌套结构，使用平铺 `nodeResponses` 是正确方向。

但 response 记录还需要补强：

1. 工具没有原生 nodeResponse 时，必须生成 fallback 工具 response。
2. 工具校验失败、工具不存在、工具执行异常，也必须闭合工具 response。
3. 主模型失败请求也必须有 request record 和 nodeResponse。
4. `toolCall`、`toolParams`、`toolResponse` 需要使用同一个 call id。
5. `assistantResponses.tools` 中的工具记录必须能和 SSE 事件一一对应。

## 修复 TODO

### P0：修复非法 tool call 防线

- [ ] `eventMapper` 中 `tool_call` 阶段过滤空 `function.name` 和空 call id。
- [ ] `eventMapper` 中统一 `tool_call` 与 `tool_response` 的过滤规则。
- [x] `chats2GPTMessages` 转换历史 tools 时过滤非法工具记录。
- [ ] `parsePromptToolCall` 拒绝生成空工具名 tool call。
- [ ] `request.ts` 在 request 层兜底过滤非法 tool call。
- [ ] 增加单测覆盖空工具名、空 call id、参数错位、历史脏数据恢复。

### P1：修复控制类工具并行问题

- [ ] 限制 `ask_agent` 与普通 runtime tool 同轮执行。
- [ ] 限制 runtime tool 与 `update_plan` 同轮完成计划更新。
- [ ] `stop: true` 后停止处理同批次后续工具。
- [ ] 增加单测覆盖 `ask_agent + runtime tool`、`runtime tool + update_plan` 的组合场景。

### P2：补齐 PiAgent 失败请求记录

- [ ] `turn_end` error 时 flush pending requests。
- [ ] dispatch catch 时兜底写入失败 request record。
- [ ] 错误 nodeResponse 带上 requestId、modelName、runningTime、errorText。

### P2：修复 ask_agent memory 与 history window 耦合

- [ ] `readWorkflowAgentLoopMemory` 从完整 histories 或专用 memory 来源恢复。
- [ ] `history=0` 只影响聊天历史，不影响 agent-loop control memory。
- [ ] 增加 `history=0` 下 ask/answer 恢复测试。

### P3：修复 Markdown 导出格式

- [ ] `map` 后使用 `.filter(Boolean).join('\n')`。
- [ ] 增加包含 tools/reasoning/answer 的导出测试或手工验证。

## 建议修复顺序

1. 先修 P0 非法 tool call 防线，优先解决 tools 卡片异常和上下文污染。
2. 再修 P1 控制类工具并行问题，避免 ask/plan 状态机被绕过。
3. 最后补齐 PiAgent 失败 request 记录、`history=0` ask 恢复和 Markdown 导出。

## 验证建议

### 单元测试

需要新增或调整以下测试：

- `parsePromptToolCall` 遇到 `1: {}` 不生成 tool call。
- `chats2GPTMessages` 过滤空 `functionName` 的历史 tools。
- `eventMapper` 对空工具名不发送悬空 `toolCall`。
- `ask_agent` 与 runtime tool 同轮时不会执行 runtime tool。
- runtime tool 与 `update_plan` 同轮时不会错误清空计划状态。
- stop gate 拒绝后，SSE 过程流仍可看到草稿，但刷新恢复不包含被拒绝草稿。
- PiAgent provider 失败但没有 assistant `message_end` 时，仍生成 request record 和 nodeResponse。

### 浏览器测试

建议复测以下场景：

1. 正常工具调用：前端依次收到 `toolCall`、`toolParams`、`toolResponse`。
2. 工具参数 streaming：参数增量能合并到同一个 call id。
3. 工具执行失败：tools 卡片能显示错误并闭合。
4. 空工具名脏历史：不再产生悬空 tools 卡片。
5. `ask_agent`：用户回答前不执行同轮 runtime tool。
6. PiAgent 失败请求：运行详情里能看到失败 requestId。

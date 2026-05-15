# 历史上下文 Checkpoint 压缩设计方案

## 背景

当前 Agent 历史上下文压缩由 `compressRequestMessages` 完成，触发后让 LLM 返回 `compressed_messages: ChatCompletionMessageParam[]`，再把该数组继续作为后续 `requestMessages` 使用。

这个方案的主要问题是：旧历史仍然保持 message array 形态，尤其包含历史 `assistant.tool_calls` 与 `tool` message 时，压缩结果必须维护 tool call id 的配对关系；LLM 一旦漏删、漏保留、改写 id 或改变顺序，就可能导致后续请求结构不合法或上下文语义断裂。

本方案只调整“历史上下文压缩”。不改大文本压缩、工具响应压缩、文件读取压缩、知识库结果筛选，也不改变系统提示词生成逻辑。

## 目标

将历史上下文压缩改为 Codex / Claude Code 风格的 checkpoint：

```text
System / 固定提示词
历史上下文 checkpoint string
当前问题
```

压缩后示例：

```ts
[
  ...systemMessages,
  {
    role: 'user',
    content: `<context_checkpoint>
    # Context Checkpoint
    ...
    </context_checkpoint>`,
    hideInUI: true
  }
]
```

核心原则：

1. 旧历史压缩为单条 string，不再让 LLM 输出 message array。
2. 触发压缩后，所有非 `system/developer` 历史都会整体进入 checkpoint；下一轮的新历史由持久化 checkpoint 之后的 history 自然补上。
3. 旧工具调用不保留为 `tool_call/tool` message，只把关键工具结果总结进 checkpoint string。
4. 系统提示词不参与压缩，也不把 checkpoint 提升为 system 优先级。
5. 原始聊天记录仍以数据库/历史记录为准，checkpoint 只是 LLM request context 的运行时材料。

## 非目标

1. 不接入 provider-specific compact API，例如 OpenAI Responses API compact。
2. 不修改 `compressLargeContent` 和 `compressToolResponse` 的大文本压缩策略。
3. 不修改模型配置、计费规则和运行详情展示名。
4. 不将历史上下文压缩结果作为用户可见聊天内容展示。

## 当前链路

关键入口：

- `packages/service/core/ai/llm/compress/index.ts`
  - `compressRequestMessages`
  - 当前返回 `messages: ChatCompletionMessageParam[]`
- `packages/service/core/ai/llm/agentLoop/loop/base.ts`
  - `onCompressContext`
  - 每轮 Agent LLM 请求前调用压缩
  - 压缩结果会覆盖 `requestMessages`
- `packages/service/core/ai/llm/agentLoop/loop/unified.ts`
  - 交互式 ask 场景会把 `pendingMainContext.messages` 持久化到 workflow memory，用于恢复

需要保留的现有能力：

1. 压缩调用仍产生 usage 与 requestId，用于计费和运行详情。
2. 压缩失败时返回原始 messages。
3. 被压缩后的 `requestMessages` 可以继续进入 tool call loop。
4. 交互中断时，`memoryRequestMessages` / `pendingMainContext.messages` 仍可恢复。

需要补齐的新能力：

1. checkpoint 不能只存在于本轮 `requestMessages`，否则下一轮从 `histories -> chats2GPTMessages` 重建 messages 时会丢失。
2. checkpoint 应跟随历史记录持久化，成为一种特殊的 AI history value。
3. 下一轮 `chats2GPTMessages` 遇到 checkpoint 后，应丢弃它之前已被压缩覆盖的消息，只保留 `checkpoint + checkpoint 之后的 recent histories + 当前问题`。

## 推荐方案

### 1. 消息分层

压缩前先把 messages 分为两段：

```ts
type SplitContextMessagesResult = {
  systemMessages: ChatCompletionMessageParam[];
  checkpointMessages: ChatCompletionMessageParam[];
};
```

分层规则：

1. 连续开头的 `system` / `developer` message 归入 `systemMessages`。
2. 剩余非系统消息全部归入 `checkpointMessages`。
3. 只根据 `checkpointMessages` 的 token 数判断是否触发压缩，避免很长的 system/developer prompt 误触发历史压缩。
4. 压缩时不再保留 recent tail；模型自行决定 checkpoint 摘要粒度。

### 2. Checkpoint message role

推荐使用 `user` role：

```ts
const checkpointMessage: ChatCompletionMessageParam = {
  role: ChatCompletionRequestMessageRoleEnum.User,
  content: checkpointContent,
  hideInUI: true
};
```

原因：

1. checkpoint 是给下一轮模型看的历史上下文注入，用 `user` role 更容易被模型当成当前请求的背景材料。
2. 不放入 system，避免把历史事实提升为最高优先级规则。
3. checkpoint 内容通过 `<context_checkpoint>` 包裹，并放在真实当前问题之前，避免和最新用户问题混淆。

### 3. Checkpoint 内容格式

checkpoint 使用可读 Markdown，并用 XML-like 标签包裹：

```md
<context_checkpoint>
# Context Checkpoint

## User Goal
...

## Current Task
...

## Important Constraints
...

## Decisions Made
...

## Facts / Data To Preserve
...

## Tool Results Worth Remembering
...

## Files / Resources Mentioned
...

## Open Questions
...

## Next Steps
...
</context_checkpoint>
```

压缩 prompt 的核心要求：

1. 只输出 checkpoint string，不输出 JSON，不输出 message array。
2. 保留用户目标、当前任务、关键约束、已做决策、关键事实、重要工具结果和下一步。
3. 旧工具调用只总结结果，不保留 tool call id，不伪造工具执行。
4. 对失败/无价值工具结果只在影响后续决策时保留。
5. 不引入原文不存在的事实；允许概括，但必须表达不确定性。
6. 为提高 prompt cache 命中率，固定 system prompt 不包含 histories；动态 histories 由单独 user message 通过 `<histories>...</histories>` 注入。

### 4. 增量压缩

压缩应支持旧 checkpoint 继续滚动更新：

```text
旧 checkpoint string + 本次非系统 messages => 新 checkpoint string
```

实现方式：

1. 判断 `oldMessages` 开头是否已经存在 `<context_checkpoint>` message。
2. 如果存在，提取旧 checkpoint string。
3. 压缩 prompt 输入分为：
   - previousCheckpoint
   - messagesToMerge
4. LLM 输出新的 checkpoint string。
5. 最终 request messages 只保留一个 checkpoint message，避免多个 checkpoint 叠加。

### 5. Checkpoint 持久化与恢复

推荐把 checkpoint 存在 history value 中，而不是存在 `responseData` 或单独的 `memories.contextCheckpoint` 中。

原因：

1. checkpoint 描述的是“这条历史之后的上下文状态”，跟随 history 时间线更自然。
2. `chats2GPTMessages` 本来就是 history 到 LLM messages 的统一入口，在这里处理 checkpoint 可以避免各节点重复注入。
3. checkpoint 作为专用 value 字段，不会被误当作普通 assistant answer，也可以通过 `hideInUI` 控制展示。

新增 AI value 字段，只存 checkpoint 文本：

```ts
export const ContextCheckpointValueSchema = z.string();

export const AIChatItemValueSchema = z.object({
  // existing fields...
  contextCheckpoint: ContextCheckpointValueSchema.nullish()
});
```

写入时机：

1. `compressRequestMessages` 生成新 checkpoint 后，将 checkpoint text 返回给 `runAgentLoop`。
2. `runAgentLoop` 在结果中返回最新 `contextCheckpoint`。
3. `dispatchRunAgent` 把它追加到本轮 AI `assistantResponses` 中，形成一个隐藏的结构化 value：

```ts
assistantResponses.push({
  contextCheckpoint: result.contextCheckpoint,
  hideInUI: true
});
```

4. `saveChat` 会像保存其他 AI value 一样把它落到 AI chat item 的 `value` 数组里。

恢复时机：

1. `dispatchRunAgent` 先用 `getAgentHistories` 从完整 histories 里反向查找最后一个包含 `contextCheckpoint` 的 AI history。
2. 如果找到 checkpoint，返回 `system histories + checkpoint 所在 history + 它之后的 histories`；更早的普通 histories 整段丢弃。
3. 如果没有找到 checkpoint，再沿用当前“最近 N 轮”的 `getHistories` 策略。
4. `chats2GPTMessages` 会再次从传入 histories 中反向定位最后一个 checkpoint，精确切到 checkpoint 所在 value，下标之前的 value 也不再解析。
5. `chats2GPTMessages` 在解析 AI value 时识别 `value.contextCheckpoint`，并把它转换为 hidden user checkpoint message。
6. 当前 value 命中 `contextCheckpoint` 后，不再解析该 value 上的其他字段；同一个 AI chat item 的后续 value 仍可继续解析。

当前实现的 checkpoint-aware history 选择函数：

```ts
const getAgentHistories = ({
  history,
  histories
}: {
  history?: ChatItemMiniType[] | number;
  histories: ChatItemMiniType[];
}) => {
  if (Array.isArray(history)) return getHistories(history, histories);
  if (!history) return [];

  for (let index = histories.length - 1; index >= 0; index--) {
    if (hasContextCheckpoint(histories[index])) {
      const firstNonSystemIndex = histories.findIndex((item) => item.obj !== ChatRoleEnum.System);
      const systemHistories =
        firstNonSystemIndex > 0 ? histories.slice(0, firstNonSystemIndex) : [];

      return [...systemHistories, ...histories.slice(index)];
    }
  }

  return getHistories(history, histories);
};
```

```ts
if (value.contextCheckpoint) {
  const checkpoint = value.contextCheckpoint;
  const checkpointMessage = {
    role: ChatCompletionRequestMessageRoleEnum.User,
    content: checkpoint,
    hideInUI: true
  } satisfies ChatCompletionMessageParam;

  results.push(checkpointMessage);

  // Do not parse text/tools/reasoning/etc. on this value.
  return;
}
```

这个“checkpoint 优先解析”的规则非常重要：

1. 通过前置裁剪，不需要再 parse checkpoint 之前的大量旧 histories。
2. 因为只保留最后一个 checkpoint 开始的 history，天然避免“旧历史原文 + checkpoint 摘要”重复进入上下文。
3. 同一批 history 中如果出现多个 checkpoint，只有最后一个 checkpoint 会进入 adapt。
4. checkpoint 所在 AI history 中，checkpoint 后面的普通 text/tools/agentAsk 等 value 仍正常解析，作为 checkpoint 之后的新 history 的一部分。
5. checkpoint 之后的新 history 仍必须解析，因为这些是 checkpoint 生成之后的真实新对话，不包含在 checkpoint 中。
6. 注意不要先按“最近 N 轮”截断再找 checkpoint，否则 checkpoint 可能被裁掉，长程记忆会丢失。

推荐恢复流程：

```text
checkpoint-aware getHistories
if checkpoint exists: return checkpoint history and later histories
else: return recent N rounds
chats2GPTMessages scans sliced histories
when contextCheckpoint value is found: append checkpoint message and skip other fields on this value
continue parsing histories after checkpoint
append current user message
run unified agent loop
```

注意事项：

1. `contextCheckpoint` 必须是独立 value，不要和最终回答 text 放在同一个 value 对象里。
2. 解析时应先判断 `contextCheckpoint`，命中后不再解析该 value 上的其他字段。
3. `GPTMessages2Chats` 默认不应把运行时 checkpoint 转回普通可见 text，避免保存/展示污染；checkpoint 只由压缩链路显式写入。
4. `memories` 仍只保留 `pendingMainContext` 这类“未完成 loop 状态”，不再负责持久化正常完成后的 checkpoint。
5. 如果 checkpoint 与最终回答存在同一个 AI chat item，建议 checkpoint value 排在最终回答 text value 之前；这样下一轮解析时是 `checkpoint -> 本轮最终回答 -> 后续用户问题`。
6. 不额外保存 `coveredDataIds`、usage、requestId 等 metadata；恢复路径只依赖 checkpoint 文本本身和它所在的 history 位置。

### 6. 压缩输出校验

LLM 输出是 string，校验比当前 JSON message array 简单：

1. 非空。
2. 包含 `<context_checkpoint>` 和 `</context_checkpoint>`，或由代码补齐标签。
3. token 数不超过 `checkpointTargetTokens * 1.25`。
4. 如超限，优先二次压缩；仍超限则截断低优先级 section，而不是截断 XML 标签。
5. 输出中不得包含 `tool_calls` / `tool_call_id` 伪结构。

失败降级：

1. LLM 无输出或中止：返回原始 messages。
2. 输出严重超限：返回原始 messages，并记录 warn；不要生成破损 checkpoint。
3. 解析旧 checkpoint 失败：把旧 checkpoint 当普通 old message 重新汇总。

### 7. 返回结构

`compressRequestMessages` 的外部签名可以暂时不变：

```ts
Promise<{
  messages: ChatCompletionMessageParam[];
  usage?: ChatNodeUsageType;
  requestIds?: string[];
  contextCheckpoint?: string;
}>
```

内部从“返回 compressed_messages”改为“构造 checkpoint message”：

```ts
const finalMessages = [
  ...systemMessages,
  checkpointMessage
];
```

这样 `runAgentLoop`、usage 统计、运行详情展示不用大改。

### 8. 对保存与展示的影响

Agent 节点当前主要保存最终 `assistantResponses`，不会把 `result.completeMessages` 直接作为用户可见回答保存。但 ask/pending 场景会持久化 `pendingMainContext.messages` 用于恢复。

要求：

1. checkpoint message 必须设置 `hideInUI: true`。
2. `GPTMessages2Chats` 已透传 `hideInUI`，如未来某条链路把 complete messages 转成 history，也不应前端展示 checkpoint。
3. pending ask 恢复时允许携带 checkpoint message，避免用户回答后上下文丢失。
4. 历史预览可以显示“上下文已压缩”运行详情，但不展示完整 checkpoint 文本，避免混淆用户。

### 9. 与现有运行详情兼容

保留 `account_usage:compress_llm_messages`：

1. `onAfterCompressContext` 继续 emit `child_llm_request_end`。
2. `CONTEXT_COMPRESS_USAGE_NAMES` 不变。
3. `compressInputTokens` / `compressOutputTokens` 仍累计本次 checkpoint 生成调用的 usage。
4. 日志新增：
   - originalTokens
   - checkpointTokens
   - compressionMode: `checkpoint_summary`

## 实施步骤

### 阶段 1：新增 checkpoint 压缩能力

1. 在 `packages/service/core/ai/llm/compress/` 新增 checkpoint prompt。
2. 新增 checkpoint prompt，并拆成固定 system prompt + 动态 histories user prompt。
3. 改造 `compressRequestMessages`，先走 checkpoint summary 模式。
4. 扩展 `AIChatItemValueSchema`，新增 `contextCheckpoint`。
5. 新增 checkpoint-aware history 裁剪逻辑，只解析最后一个 checkpoint 起始后的 history。
6. 改造 `chats2GPTMessages`，遇到 `contextCheckpoint` 时插入 checkpoint message 并跳过同 value 的其他字段。
7. 保留旧 `compressed_messages` prompt 作为临时 fallback，便于灰度。

### 阶段 2：补齐测试

重点测试：

1. 未超过阈值时原样返回。
2. 超过阈值时返回 `system + checkpoint`。
3. checkpoint message 使用 assistant role 且 `hideInUI: true`。
4. 压缩 LLM 空输出时返回原始 messages。
5. ask/pendingMainContext 恢复时 checkpoint 不丢。
6. usage/requestIds/运行详情事件保持原行为。
7. 下一轮恢复时只 parse 最后一个 checkpoint 起始后的 history。
8. checkpoint 之后的新 history 仍会正常进入上下文。
9. checkpoint 不会因为“最近 N 轮”截断而被提前裁掉。

### 阶段 3：清理旧 message-array 压缩

灰度稳定后：

1. 删除旧 `getCompressRequestMessagesPrompt` 中 `compressed_messages` JSON 输出逻辑，或重命名为 legacy。
2. 删除对 `parseJsonArgs<{ compressed_messages }>` 的依赖。
3. 清理 recent tail 与 target token 相关配置。
4. 更新相关注释与测试快照。

## 风险与处理

### 风险 1：summary 遗漏早期关键事实

处理：

1. checkpoint prompt 固定关键 section。
2. 固定 system prompt 与动态 histories 拆开，提高缓存命中并降低 prompt 波动。
3. 增量压缩时传入旧 checkpoint，避免每次从残缺上下文重建。

### 风险 2：模型把 checkpoint 当成当前任务输出

处理：

1. 用 `<context_checkpoint>` 包裹。
2. checkpoint 放在当前问题之前，且当前问题始终最后。
3. system prompt 中可增加一句：“context_checkpoint 是历史摘要，不是当前用户输入。”

### 风险 3：checkpoint 摘要过度压缩

处理：

1. prompt 固定要求保留当前任务、未解决问题、下一步和重要工具结果。
2. 后续可增加 checkpoint 输出 token 校验与二次压缩/降级策略。

### 风险 4：交互恢复上下文丢失

处理：

1. pending context 允许保存 checkpoint message。
2. 恢复时不要 strip 掉 `hideInUI` checkpoint。
3. checkpoint 之后的新 history 必须继续正常解析，不能被 checkpoint 截断掉。

### 风险 5：checkpoint 被 UI 展示

处理：

1. 设置 `hideInUI: true`。
2. 如发现某些 preview 不尊重 hideInUI，再在 preview 层过滤 `<context_checkpoint>`。

## 待确认问题

1. checkpoint 默认 role 是否确认使用 `assistant`？
2. 触发阈值是否先采用 65%，还是沿用当前 80%？
3. 是否需要保留旧 message-array 压缩作为环境变量灰度开关？

## TODO

- [x] 将 request message 压缩 prompt 改为 checkpoint string 输出：`packages/service/core/ai/llm/compress/prompt.ts`
- [x] 改造 `compressRequestMessages` 为 `system + checkpoint`
- [x] 扩展 `AIChatItemValueSchema`，增加 `contextCheckpoint`
- [x] 在 `runAgentLoop` / `runUnifiedAgentLoop` 返回最新 checkpoint text
- [x] 在 `dispatchRunAgent` 正常完成和 ask 暂停时把 checkpoint 作为隐藏 AI value 写入 history
- [x] 新增 Agent 入口 checkpoint-aware history 选择逻辑，避免先按最近 N 轮裁掉 checkpoint
- [x] 改造 `chats2GPTMessages`，从最新 checkpoint value 开始解析，插入 checkpoint message 并跳过同 value 其他字段
- [x] checkpoint 存储收敛为纯 string，不再依赖 history `dataId` 生成元信息
- [x] `filterGPTMessageByMaxContext` 保留 leading checkpoint，避免二次上下文裁剪丢失 summary
- [x] 补充 `packages/service/test/core/ai/llm/compress` 单元测试
- [x] 补充 global chat schema/adapt、LLM utils、base loop、unified loop 传播测试
- [x] 运行局部测试：global chat + service compress/utils/agentLoop
- [ ] 增加已有 checkpoint 的显式提取与增量合并测试
- [ ] 增加 checkpoint 输出 token 上限校验和二次压缩/降级策略
- [ ] 补充 workflow dispatch 级集成测试，覆盖 assistantResponses 持久化顺序

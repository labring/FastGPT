# Agent 本轮上下文注入设计

## 背景

当前 Agent 节点会把部分本轮上下文分散到不同位置：

- 用户本轮上传文件：由 Agent 专用 `formatFileInput` 生成 `<available_files>`，再拼到当前 user message 前面。
- 已选知识库：由 `parseUserSystemPrompt` 生成 `<preset_resources>`，注入 system prompt。
- 当前时间：未在 Agent 主模型 user message 中显式注入，主要依赖 workflow 变量体系。

这会导致同一轮请求的“本轮事实上下文”分散在 system/user/工具描述里。用户希望统一放进本轮 user message，结构接近 ToolCall/普通 Chat 的 `<system-reminder>`。

## 目标

把本轮动态上下文注入到当前 user message，形态统一为：

```xml
<system-reminder>
# Input Files
...

# Input datasets
...

# Current time
...

原始问题
</system-reminder>
```

这里的“本轮动态上下文”包括：

- 本轮输入文件
- 当前 Agent 节点可用知识库
- 当前时间

## 非目标

- 不改变用户配置的 system prompt 语义。
- 不在第一步强制改掉 Agent 内部 `file_read` 的工具参数协议。
- 不改变普通 AI Chat 和 ToolCall 的现有行为，除非后续明确要统一所有节点。
- 不把完整文件内容直接塞进 Agent user message；Agent 仍应通过文件解析工具按需读取，避免上下文膨胀。

## 当前实现差异

### Agent 文件输入

当前结构：

```xml
<available_files>
当前对话中用户已上传以下文件：

- 文件1: a.pdf(document)
- 文件2: pic.png(image)
...
</available_files>
```

特点：

- 文件使用数字 index。
- `file_read` 工具参数是 `file_indexes`。
- `sandbox_fetch_user_file` 参数是 `file_index`。
- 文档文件可通过 `file_read` 读取正文。
- skill 模式下图片也会出现在提示词里，并可通过 sandbox fetch 写入沙箱。

### ToolCall 文件输入

ToolCall 使用 `formatUserQueryWithFiles`，结构更接近：

```xml
<system-reminder>
As you answer the user's questions, you can use the following context:

# Input Files
用户本次上传的文件：

<file>
<id>xxx-0</id>
<name>a.pdf</name>
<sandboxPath>user_files/a.pdf</sandboxPath>
</file>
</system-reminder>

原始问题
```

特点：

- 文件使用 id。
- `read_files` 工具参数是 `ids`。
- sandbox 文件路径可提前出现在 prompt 中。

## 建议方案

### 1. 新增 Agent user reminder builder

在 Agent adapter 层增加一个纯函数，专门构造本轮 user message：

```ts
buildAgentUserReminderInput({
  query,
  filePrompt,
  selectedDatasets,
  currentTime
})
```

输出：

```xml
<system-reminder>
# Input Files
...

# Input datasets
...

# Current time
...

原始问题
</system-reminder>
```

如果没有任何上下文段，则返回原始 `query`。

### 2. 文件段改为 `# Input Files`

Agent 的 `formatFileInput` 保留当前 index 体系，但输出从 `<available_files>` 改为：

```xml
# Input Files
用户本次上传的文件：

<file>
<id>1</id>
<name>a.pdf</name>
<type>document</type>
</file>
```

这里先用 `<id>` 承载当前 index，避免一次性迁移工具协议。后续如果要完全对齐 ToolCall，可以再把内部 map 从 index 改成 file id。

### 3. 知识库段从 system prompt 移到 user reminder

`parseUserSystemPrompt` 不再把 `selectedDataset` 格式化成 `<preset_resources>`。

改为在 user message 中注入：

```xml
# Input datasets
用户当前可用的知识库：

<dataset>
<id>dataset_id</id>
<name>知识库名称</name>
</dataset>
```

模型仍通过 `dataset_search` 工具检索知识库，`# Input datasets` 只说明当前可用资源。

### 4. 当前时间段

使用 workflow runtime 已有 `timezone`，通过 `getSystemTime(timezone)` 生成：

```xml
# Current time
2026-05-13 17:30:00 Wednesday
```

这个值只注入当前轮 user message，不写入 system prompt。

### 5. Agent 与 PiAgent 共用

自定义 `agent-loop` 与 `PiAgent` 都应调用同一个 builder，避免两套提示词漂移。

调用位置：

- `dispatchRunAgent` 构造 `currentUserMessage` 前。
- `dispatchPiAgent` 调用 `agent.prompt(...)` 前。

## 兼容策略

第一阶段建议只统一 user message 结构，不改工具入参：

- `file_read` 继续接受 `file_indexes`。
- `sandbox_fetch_user_file` 继续接受 `file_index`。
- prompt 中 `<id>1</id>` 的值仍然等于当前 index。

这样历史上下文、已有模型调用习惯和工具执行器都不会断。

第二阶段如需完全对齐 ToolCall，再做协议迁移：

- `file_read` 增加 `ids`，兼容 `file_indexes`。
- `sandbox_fetch_user_file` 增加 `id`，兼容 `file_index`。
- `filesMap/allFilesMap` 改为同时支持 file id 和 index alias。
- Tool 描述统一成 `id from # Input Files`。

## 风险点

- 知识库从 system prompt 移到 user message 后，模型对 `dataset_search` 的触发率可能变化，需要浏览器集成测试验证。
- 当前时间每轮都会变化，会影响 request messages 的完全复现；这是预期行为，但测试里不要写死实时值。
- 如果 prompt 同时包含文件、知识库和时间，user message 会变长，需要确认压缩逻辑仍能保留本轮 user message。
- PiAgent 自己维护 messages，必须确认 `agent.prompt(...)` 收到的是注入后的完整文本。

## TODO

- [ ] 增加 `buildAgentUserReminderInput` 纯函数和单测。
- [ ] 将 Agent 文件 prompt 输出改为 `# Input Files` XML 块。
- [ ] 将 `parseUserSystemPrompt` 中的 selectedDataset 迁移到 user reminder。
- [ ] 在 `dispatchRunAgent` 注入文件、知识库、当前时间。
- [ ] 在 `dispatchPiAgent` 注入文件、知识库、当前时间。
- [ ] 补 Agent request messages 测试：确认当前 user message 包含三段 context 和原始问题。
- [ ] 补 PiAgent prompt 测试：确认传入 `agent.prompt` 的文本一致。
- [ ] 浏览器测试：上传文件 + 选知识库 + 问时间相关问题，确认工具调用和最终回答正常。

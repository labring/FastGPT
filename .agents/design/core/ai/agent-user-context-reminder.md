# Agent 文件上下文与 read_files 对齐方案

## 背景

Agent 旧文件上下文有两类不一致：

- 文件提示词使用 `<available_files>` 和数字序号。
- Agent 文件读取工具是 `file_read`，参数是 `{ file_indexes }`，而 ToolCall 已使用 `read_files` + `{ ids }`。

这会让同一套文件能力在 Agent、ToolCall、Sandbox 中出现不同语义，也不利于历史 request messages 恢复后继续命中上一轮 tool call 参数。

## 目标

本次把 Agent 文件上下文对齐到 ToolCall 风格：

- 新请求只暴露 `read_files`。
- 新工具参数为 `{ ids: string[] }`。
- 用户本轮动态上下文统一注入当前 Human message 的 `<system-reminder>`。
- 历史 Human message 每轮恢复时只补 `# Input Files`，避免历史中混入当前知识库和当前时间。
- 保留 runtime legacy fallback，兼容旧 pending context 或旧历史里的 `file_read` / `{ file_indexes }`；旧 id 仅作为内部字符串兼容，不再出现在 `SubAppIds` 或系统工具列表。

## 上下文结构

当前轮 Human message：

```xml
<system-reminder>
# Input Files
用户本次可用的文件：

<file>
<id>current_ai_id-0</id>
<name>a.pdf</name>
<type>document</type>
</file>

# Input datasets
用户当前可用的知识库：

<dataset>
<id>dataset_id</id>
<name>知识库名称</name>
</dataset>

# Current time
2026-05-14 12:00:00 Thursday

原始问题
</system-reminder>
```

历史 Human message：

```xml
<system-reminder>
# Input Files
用户本次可用的文件：

<file>
<id>history_ai_id-0</id>
<name>old.pdf</name>
<type>document</type>
</file>

历史原始问题
</system-reminder>
```

历史只注入文件段，原因是：

- 文件 id 需要在每一轮历史恢复时稳定重建，保证历史 assistant tool call 的 `ids` 可继续命中。
- datasets 和 current time 是当前轮动态上下文，不应该回写到历史轮次。

## 文件 id 规则

当前轮文件 id 使用当前 AI response chat item id 作为前缀：

```text
{responseChatItemId}-{index}
```

历史 Human 文件 id 优先使用同轮后续 AI message 的 `dataId` 作为前缀：

```text
{pairedAiDataId}-{index}
```

如果找不到同轮 AI message，则 fallback 到 Human message 的 `dataId` 或历史下标。

这个规则保证：

- 当前轮模型调用 `read_files({ ids: ["responseChatItemId-0"] })`。
- 下一轮从 chat history 恢复时，历史 Human 会被重写出同样的文件 id。
- 上一轮 assistant tool call 的参数不需要被重写，也能继续和恢复后的 `filesMap` 对上。

## 新增聚合入口

文件：

`packages/service/core/workflow/dispatch/ai/agent/adapter/userContext.ts`

导出函数：

```ts
buildAgentInputFilesPrompt(...)
buildAgentUserReminderInput(...)
rewriteAgentUserMessagesWithFiles(...)
buildAgentUserContextInput(...)
```

职责：

- `buildAgentInputFilesPrompt`：生成 `# Input Files` XML 块。
- `buildAgentUserReminderInput`：生成当前轮 `<system-reminder>`。
- `rewriteAgentUserMessagesWithFiles`：遍历历史 Human，只改写文件上下文。
- `buildAgentUserContextInput`：聚合入口，统一产出 rewritten histories、current user message、`filesMap`、`allFilesMap`。

`filesMap` 只包含 document 类型文件，供 `read_files` 解析正文。

`allFilesMap` 包含 document/image 等所有可用文件，供 `sandbox_fetch_user_file` 写入沙箱。

## read_files 协议

Agent 内置文件工具：

```ts
SubAppIds.readFiles = 'read_files'
```

新 schema：

```ts
z.object({
  ids: z.array(z.string())
})
```

模型看到的 function call：

```json
{
  "name": "read_files",
  "arguments": {
    "ids": ["current_ai_id-0"]
  }
}
```

执行器：

- `toolId === SubAppIds.readFiles` 时走文件解析。
- 从 `params.ids` 读取文件 id。
- 通过 `filesMap[id]` 找到 URL。
- 调用 `dispatchFileRead({ files: [{ id, url }] })`。
- 返回内容中使用 `id` 字段，不再使用 `index`。

兼容：

- runtime handler 继续接受旧 `file_read` + `{ file_indexes }`，但只用内部 legacy 字符串兼容，不再保留 `SubAppIds.fileRead`。
- 新 tool schema、prompt、HelperBot 资源列表和 ChatAgent UI 不再暴露 `file_read` / `file_indexes`。

## Agent 接入

`dispatchRunAgent`：

- 删除旧 `formatFileInput(...)` 和手动拼接文件 prompt。
- 调用 `buildAgentUserContextInput(...)`。
- 使用 `rewrittenHistories + currentUserMessage` 生成 `chats2GPTMessages({ reserveTool: true })`。
- 将 `filesMap` 传给 `read_files` 执行器。
- 将 `allFilesMap` 传给 sandbox capability。

`dispatchPiAgent`：

- 同样调用 `buildAgentUserContextInput(...)`。
- 第一阶段只把当前轮完整 reminder 文本传给 `agent.prompt(...)`。
- PiAgent 历史 messages 仍由现有 memory 恢复，不迁移成 workflow chat history。

`parseUserSystemPrompt(...)`：

- 移除 selectedDataset 的 `<preset_resources>` 注入。
- datasets 改由当前轮 user reminder 的 `# Input datasets` 承载。

## Sandbox 关系

`sandbox_fetch_user_file` 本次不改参数名，仍然是：

```ts
{
  file_index: string,
  target_path: string
}
```

但 `file_index` 的语义已更新为：

```text
File id from # Input Files
```

即参数名为历史兼容保留，参数值使用新的 file id。

## 测试覆盖

已覆盖：

- `buildAgentInputFilesPrompt(...)` 生成 `<id>`，并进行 XML escape。
- 历史 Human 只改写文件段，不包含 datasets/time。
- 当前 Human 包含 files、datasets、current time、原始问题。
- 历史 Human 文件 id 优先使用同轮 AI `dataId`，保证历史 tool call 参数稳定。
- 当前文件按 request origin 归一化后去重。
- Agent 暴露的文件工具名是 `read_files`，参数是 `{ ids }`。
- Agent 执行器能按 `ids` 找文件并解析。
- legacy fallback：旧 `file_read` / `{ file_indexes }` 可执行，但不会出现在新 schema。
- Agent dispatch mock：进入 loop 的 messages 已统一改写。
- PiAgent mock：`agent.prompt(...)` 收到完整 current reminder。

局部测试命令：

```bash
pnpm --filter @fastgpt/service test test/core/workflow/dispatch/ai/agent/adapter/userContext.test.ts test/core/workflow/dispatch/ai/agent/utils.test.ts test/core/workflow/dispatch/ai/agent/index.test.ts test/core/workflow/dispatch/ai/agent/piAgent/index.test.ts test/core/workflow/dispatch/ai/agent/sub/file.test.ts
```

## TODO

- [x] 新增 Agent context 聚合入口。
- [x] Agent 文件 prompt 改为 `# Input Files` XML。
- [x] 当前轮 user reminder 注入 files、datasets、current time、原始问题。
- [x] 历史 Human 每轮重写文件上下文。
- [x] Agent 文件工具迁移到 `read_files` + `{ ids }`。
- [x] runtime 保留旧 `file_read` + `{ file_indexes }` fallback，旧工具不再作为系统工具暴露。
- [x] `parseUserSystemPrompt` 移除 selectedDataset 注入。
- [x] `dispatchRunAgent` 接入统一上下文。
- [x] `dispatchPiAgent` 接入当前轮 reminder。
- [x] HelperBot / ChatAgent UI 改为暴露 `read_files`。
- [x] 补充核心单测。
- [ ] 浏览器集成测试：上传文件 + 选择知识库 + 当前时间 + `read_files` 工具调用。

## 2026-06-10 补充：文件 URL 与工具调用参数

### 问题

Agent 和 AgentV2 的文件上下文只把上传文件暴露为内部 `id`。模型可以用这个 `id`
调用内置 `read_files`，但当用户选择的外部工具需要文件链接时，模型容易把 `id`
填进工具参数，工具无法访问真实文件。

### 方案

- `AgentInputFile` 继续保留稳定 `id`，同时在文件 reminder 中暴露 `type` 和 `url`。
- `fileUrlMap` 登记所有可用上传文件，覆盖 document/image/audio/video。
- `filesMap` 继续只登记 document 文件，专供 `read_files` 使用。
- 用户工具执行前调用 `replaceAgentFileIdsWithUrls(...)`，只把完整命中的字符串、数组项、
  对象字段值从文件 `id` 替换为 `url`。
- 不做长文本 substring 替换，避免普通业务文本里出现同名字符串时被误改。

### 边界

- 内置 `read_files` 仍使用文件 `id`，不走 URL 替换。
- 当前 `url` 来自聊天上传时保存的 `previewUrl` 或外部变量传入的链接；本次不额外刷新
  已过期的 S3 signed URL。
- 后续如果要彻底解决历史长会话中的过期链接，应把 `AgentInputFile` 扩展为保留 `key`，
  在构建本轮 reminder 时用 `key` 重新签发新的 access URL。

### 新增测试

- 文件 reminder 包含 `<id>`、`<name>`、`<type>`、`<url>`。
- `fileUrlMap` 覆盖 document/image/audio/video，`filesMap` 只覆盖 document。
- Unified Agent 和 PiAgent prompt 都包含文件 URL。
- `replaceAgentFileIdsWithUrls(...)` 只替换完整命中的 id，不替换长文本里的局部命中。

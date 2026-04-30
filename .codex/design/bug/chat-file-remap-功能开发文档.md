# 功能开发文档

## 文档标识

- 任务前缀：`chat-file-remap`
- 文档文件名：`chat-file-remap-功能开发文档.md`
- 更新时间：2026-04-24
- 文档定位：实现对齐与验收口径（运行时逐条 user file 注入）

## 0. 开发目标与约束

- 功能目标：修复 file-only user message 发给模型时退化为 `null` 的问题，并确保历史记录中每条带 file URL 的 human message 在运行时把文件内容注入回自己的 user message。
- 代码范围：`v1/v2/chatTest` 保存层回退、`chat/tool` 运行时消息构造、文件解析 helper、相关测试与文档同步。
- 非目标：历史数据回填、`file_url` 直传模型、API/DB schema 调整、前端交互调整。
- 实现原则：保存层不污染原始输入；运行时只改 LLM messages 副本；文件内容进 user message，不进 system prompt。
- 文件上限：每条 user query 的文件解析数量沿用 `chatConfig.fileSelectConfig.maxFiles`，不做跨 message URL 去重。
- 必须遵循规范：`references/style-standards-entry.md`。
- 适用维度：API[ ] DB[ ] Front[ ] Logger[ ] Package[x] BugFix[x] DocUpdate[x] DocI18n[ ]。

## 1. 实施任务拆解（可直接执行）

| 任务ID | 任务名称 | 责任层 | 输入 | 输出 | 完成定义（DoD） |
|---|---|---|---|---|---|
| T1 | 保存层回退为原始输入 | API/Service | `userQuestion` | 原始保存参数 | `v1/v2/chatTest` 不再保存 `enrichedUserQuestion` |
| T2 | 运行时单条 user query 文件重写 helper | Service | 单条 human `value`、`maxFiles`、文件读取 helper | 增强后的 user query 副本 | 每条 human file 的 `<FilesContent>` 回填到所属 user message |
| T3 | Chat node 接入运行时注入 | Service | Chat node runtime props | LLM messages | 文件内容进入 user message，system 不含文件内容 |
| T4 | Tool node 接入运行时注入 | Service | Tool node runtime props | Tool-call LLM messages | 无 `readFiles` tool 时注入；有 `readFiles` tool 时跳过 |
| T5 | 测试与清理 | Test/Service | T1-T4 改动 | 可执行测试 + 干净 import | 覆盖当前轮、历史逐条、`maxFiles`、system 纯净、保存层不污染 |

## 2. 文件级改动清单

| 文件路径 | 改动类型 | 变更摘要 | 关键代码（可伪代码） | 关联任务ID |
|---|---|---|---|---|
| `projects/app/src/pages/api/v1/chat/completions.ts` | 修改 | 移除保存前增强使用，保存原始 `userQuestion` | `userContent: userQuestion` | T1 |
| `projects/app/src/pages/api/v2/chat/completions.ts` | 修改 | 同 v1，`prepare/finalize/updateInteractive` 使用原始输入 | `userContent: userQuestion` | T1 |
| `projects/app/src/pages/api/core/chat/chatTest.ts` | 修改 | 修复 review 评论点，不再改写输入问题 | `userContent: userQuestion` | T1 |
| `packages/service/core/chat/utils.ts` | 修改 | 删除或回退保存前 `enrichUserContentWithParsedFiles` 新增能力 | 移除未使用导入/函数 | T1 |
| `packages/service/core/workflow/dispatch/ai/chat.ts` | 修改 | 并行处理 human messages，逐条重写 user query，文件内容不进 system | `Promise.all(...rewriteUserQueryWithFileContent(...))` | T2/T3 |
| `packages/service/core/workflow/dispatch/ai/tool/index.ts` | 修改 | Tool LLM messages 同步并行重写；保留 `hasReadFilesTool` skip | `skip: hasReadFilesTool` | T2/T4 |
| `packages/service/core/workflow/utils/context.ts` | 修改/复用 | 承载单条 user query 文件内容重写 helper | `rewriteUserQueryWithFileContent(...)` | T2 |
| `packages/service/core/workflow/dispatch/tools/readFiles.ts` | 修改/复用 | 保留可读文件 URL 标准化、读文件与解析文件能力，供 readFiles tool 和重写 helper 复用 | `normalizeReadableFileUrl(...)` / `parseFileContentFromUrls(...)` | T2 |
| `packages/service/core/ai/llm/utils.ts` | 修改/测试驱动 | 保持 `file_url` 过滤，确保同条 text 保留 | 不改协议行为 | T5 |
| `test/cases/...` | 修改/新增 | 替换保存前增强测试，新增运行时逐条注入测试 | 当前轮/历史/Tool/maxFiles | T5 |

## 2.1 关键代码片段（用于规划核对）

```ts
// 保存层：禁止保存增强后的 userContent
await finalizeChatRound({
  ...params,
  userContent: userQuestion
});
```

```ts
// 运行时：只增强发给 LLM 的 messages 副本
const userMessages = await Promise.all(
  rawUserMessages.map(async (message) => {
    if (message.obj !== ChatRoleEnum.Human) return message;

    return {
      ...message,
      value: await rewriteUserQueryWithFileContent({
        userQuery: message.value,
        requestOrigin,
        maxFiles,
        customPdfParse,
        parseFileContentFromUrls,
        teamId,
        tmbId
      })
    };
  })
);
```

```ts
// 注入规则：文件内容回填到所属 user message，不集中塞到最后一条
const finalText = [originText, filePrompt].filter(Boolean).join('\n\n===---===---===\n\n');
```

## 3. 后端实施说明

### 3.1 API 改动

N/A（无对外接口结构变化）。

内部保存链路要求：

1. `prepareChatRound`、`finalizeChatRound`、`pushChatRecords`、`updateInteractiveChat` 均使用原始 `userQuestion`。
2. 不在 API handler 中解析文件并改写 `userQuestion`。
3. 不新增请求/响应字段。

### 3.2 Service/Core 改动

| 模块 | 函数/类型 | 具体改动 | 依赖关系 |
|---|---|---|---|
| `packages/service/core/workflow/dispatch/ai/chat.ts` | `getChatMessages` 附近 | 构造 LLM messages 前，对历史 human 与当前轮 user 做文件内容注入 | 依赖 `parseFileContentFromUrls` |
| `packages/service/core/workflow/dispatch/ai/chat.ts` | `getMultiInput` | 不再把文件正文作为 system quote；当前轮文件参与逐条注入 | 与 token 裁剪链路协同 |
| `packages/service/core/workflow/dispatch/ai/tool/index.ts` | `dispatchRunTools` | 与 Chat 路径一致；无 `readFiles` tool 时注入，有则跳过 | 避免与 readFiles tool 重复预解析 |
| `packages/service/core/workflow/utils/context.ts` | `rewriteUserQueryWithFileContent` | 单条 user query 重写 `<FilesContent>`，外层负责并行处理 history/current messages | 通过入参复用 `parseFileContentFromUrls` |
| `packages/service/core/workflow/dispatch/tools/readFiles.ts` | `normalizeReadableFileUrl` / `parseFileContentFromUrls` | 统一负责 URL 标准化、过滤、文件读取与解析；按单条 query URL 顺序与 `maxFiles` 控制解析量 | 保持现有错误兜底 |
| `packages/service/core/ai/llm/utils.ts` | `loadRequestMessages` | 保持 `file_url` 过滤；回归验证 text part 不丢 | 最终模型请求安全过滤 |

### 3.3 运行时注入算法

1. 输入为 `chatHistories` 与当前轮 user prompt，先 clone 或新建消息数组，不能 mutate 原对象。
2. Chat/Tool 外层通过 `Promise.all` 并行处理运行时 messages。
3. 非 human message 原样返回；human message 调用 `rewriteUserQueryWithFileContent`。
4. 单条 user query 内只收集本条 `file.url`，不做跨 message URL 去重或共享缓存。
5. 调用 `parseFileContentFromUrls` 统一完成 URL 标准化、过滤、`maxFiles` 截断与文件解析。
6. 将解析结果回填到当前 user query：
   - message 原本有 text：追加分隔符和 `<FilesContent>`。
   - message 原本无 text：新增 text part。
7. 构造最终 `chats2GPTMessages` / tool-call messages。
8. 进入 `loadRequestMessages` 后，`file_url` 可以继续被过滤，但 text 中的文件正文必须保留。

### 3.4 数据层改动

N/A（不改 schema、索引、迁移逻辑）。

### 3.5 Bug 修复实施

| 项目 | 内容 |
|---|---|
| 问题点文件 | `packages/service/core/ai/llm/utils.ts`、`projects/app/src/pages/api/v1/chat/completions.ts`、`projects/app/src/pages/api/v2/chat/completions.ts`、`projects/app/src/pages/api/core/chat/chatTest.ts`、`packages/service/core/workflow/dispatch/ai/chat.ts`、`packages/service/core/workflow/dispatch/ai/tool/index.ts` |
| 问题点函数/代码段 | `loadRequestMessages`、三个路由的保存参数组装、`getMultiInput/getChatMessages/dispatchRunTools` |
| 触发条件 | 当前轮或历史 human message 中存在 file-only / file+text |
| 根因（直接原因） | `file_url` 被过滤后没有可供模型消费的文件正文 |
| 根因（深层原因） | 文件正文注入位置放错到保存层或 system prompt，没有在消费输入的 node 内逐条处理 user message |
| 修复动作 | 保存层回退原始输入；运行时逐条 user message 注入文件正文 |
| 影响范围 | Chat/Tool LLM 请求构造与历史 file 后续对话 |

修复关键伪代码：

```ts
const userMessages = await Promise.all(
  rawUserMessages.map(async (message) =>
    message.obj === ChatRoleEnum.Human
      ? {
          ...message,
          value: await rewriteUserQueryWithFileContent({
            userQuery: message.value,
            maxFiles,
            requestOrigin,
            customPdfParse,
            parseFileContentFromUrls,
            teamId,
            tmbId
          })
        }
      : message
  )
);

const messages = [
  ...getSystemPrompt_ChatItemType(concatenateSystemPrompt),
  ...userMessages
];
```

回归验证：

1. 当前轮 file-only 不再变 `null`。
2. 历史每条 human file 都注入回自己的 user message。
3. 保存层不新增 `<FilesContent>`。
4. 无 file 场景无回归。

## 4. 前端实施说明

N/A（本期无前端改动）。

## 5. 日志与可观测性

| 触发点 | 日志级别 | category | 字段 | 备注 |
|---|---|---|---|---|
| 本次修复 | N/A | N/A | N/A | 不新增日志点，不打印文件正文 |

注意事项：

- 不新增观测方案。
- 不在日志中输出用户文件正文、解析文本或完整 prompt。

## 6. 文档更新提醒

| 文档路径 | 文档类型 | 更新原因 | 计划更新内容 | 负责人 | 截止时间 | 状态 |
|---|---|---|---|---|---|---|
| `chat-file-remap-需求设计文档.md` | 研发设计文档 | PR review 后方案口径调整 | 改为运行时逐条 user file 注入 | Codex | 2026-04-24 | 本次完成 |
| `chat-file-remap-功能开发文档.md` | 研发开发文档 | 实施任务与测试口径需同步 | 更新任务拆解、改动清单、测试计划 | Codex | 2026-04-24 | 本次完成 |

## 7. 文档 i18n 实施说明

N/A，原因：本次只改 `.claude/design` 研发文档，不改 `document/content/docs` 目录。

## 8. 测试与验证

### 8.1 测试文件映射

| 源文件路径 | 文件类型 | 目标测试文件路径 | 是否跳过 | 跳过理由 |
|---|---|---|---|---|
| `packages/service/core/workflow/dispatch/ai/chat.ts` | packages | 新增/复用 dispatch chat 相关测试 | 否 | 运行时注入核心逻辑 |
| `packages/service/core/workflow/dispatch/ai/tool/index.ts` | packages | 新增/复用 dispatch tool 相关测试 | 否 | Tool 分支需覆盖 |
| `packages/service/core/ai/llm/utils.ts` | packages | `test/cases/service/core/ai/llm/utils.test.ts` | 否 | 回归 `file_url` 过滤后 text 保留 |
| `projects/app/src/pages/api/v1/chat/completions.ts` | projects | `-` | 是 | 当前仓库无路由级测试，本期以代码走查和核心单测覆盖 |
| `projects/app/src/pages/api/v2/chat/completions.ts` | projects | `-` | 是 | 当前仓库无路由级测试，本期以代码走查和核心单测覆盖 |
| `projects/app/src/pages/api/core/chat/chatTest.ts` | projects | `-` | 是 | 当前仓库无路由级测试，本期以代码走查和核心单测覆盖 |

### 8.2 自动化测试设计

| 类型 | 用例 | 预期结果 |
|---|---|---|
| 单元测试 | 当前轮 file-only | LLM user message 包含 `<FilesContent>`，`loadRequestMessages` 后不为 `null` |
| 单元测试 | 当前轮 file+text | 原问题与文件正文都在当前轮 user message |
| 单元测试 | 多条历史 human 均有 file | 每条历史 user message 各自注入自己的文件正文 |
| 单元测试 | 单条 user query 超过 `maxFiles` | 只解析并注入该 query 内前 `maxFiles` 个文件 |
| 单元测试 | Tool node 无 `readFiles` tool | 并行执行逐条 user query 重写 |
| 单元测试 | Tool node 有 `readFiles` tool | 跳过预解析注入 |
| 回归测试 | system prompt 检查 | system message 不包含 `<FilesContent>` |
| 回归测试 | 保存层检查 | 保存参数仍为原始 `userQuestion` |

### 8.3 场景覆盖核对

| 场景 | 是否覆盖 | 对应用例/describe |
|---|---|---|
| 基础场景 | 是 | 当前轮 file-only、file+text |
| 历史场景 | 是 | 多条历史 human file 逐条注入 |
| 边界值 | 是 | 单条 query `maxFiles`、重复 URL 分别读取、空解析 |
| Tool 场景 | 是 | 有/无 `readFiles` tool |
| 安全边界 | 是 | 不打印正文、不改 API/DB schema |
| 异常场景 | 是 | 文件解析失败时不污染原 userContent |

### 8.4 执行命令

```shell
pnpm -s vitest run test/cases/service/core/ai/llm/utils.test.ts
```

实现新增运行时注入测试后，同步补充对应 test file 命令。

### 8.5 手工验证（可选）

| 场景 | 操作步骤 | 预期结果 |
|---|---|---|
| 正常流程 | 首轮上传文件并提问，次轮继续文本提问 | 次轮 LLM 请求中首轮 user message 仍带文件正文 |
| 多历史文件 | 连续多轮分别上传文件，再继续追问 | 每条历史 user message 各自带对应文件正文 |
| 调试流程 | 使用 chatTest 发送 file-only | 保存层不改原始输入，LLM 请求 user message 不为 `null` |

## 9. 质量自检清单

- [ ] 保存链路三入口（v1/v2/chatTest）均回退为原始 `userQuestion`
- [ ] 未改动 API/DB schema
- [ ] 未引入 `file_url` 直传模型逻辑
- [ ] 文件内容不进入 system prompt
- [ ] 历史 human file 逐条注入到所属 user message
- [ ] 当前轮 user file 同样注入到当前轮 user message
- [ ] `maxFiles` 作为单条 user query 的解析上限
- [ ] Tool node 有 `readFiles` tool 时跳过预解析
- [ ] 测试覆盖当前轮、历史轮、Tool、`maxFiles`、保存层不污染
- [ ] 文档更新提醒已填写

## 10. 发布与回滚

### 10.1 发布步骤

1. 完成 T1-T4 代码实现与测试。
2. 执行自动化测试并记录结果。
3. 合并发布。

### 10.2 回滚触发条件

- LLM 请求构造异常。
- 历史文件解析导致明显性能问题。
- Tool node 文件读取行为与 `readFiles` tool 冲突。

### 10.3 回滚步骤

1. 回退运行时逐条文件注入 helper 与调用点。
2. 保持保存层原始 `userQuestion` 逻辑不变。
3. 重新验证 file_url 过滤回归测试。

## 11. AI 实施提示（给执行模型）

- 先做保存层回退，再做运行时注入，不要反过来糊一锅。
- 注入对象是 LLM messages 副本，禁止 mutate `userQuestion`、`histories` 原对象。
- 历史文件内容必须回填到所属 user message，不能统一拼到最后一条。
- system prompt 禁止出现 `<FilesContent>`。
- 不扩展到历史回填、协议调整或前端 UI。

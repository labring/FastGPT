# 需求设计文档

## 0. 文档标识

- 任务前缀：`chat-file-remap`
- 文档文件名：`chat-file-remap-需求设计文档.md`
- 更新时间：2026-04-24
- 文档定位：对齐 PR review 后的最终口径（运行时注入，不污染保存层）

## 1. 需求背景与目标

### 1.1 背景

当前问题来自消息整理链路的既有行为：

1. 用户文件会在适配阶段转成 `file_url`（`packages/global/core/chat/adapt.ts` 的 `chats2GPTMessages`）。
2. `packages/service/core/ai/llm/utils.ts` 的 `loadRequestMessages` 会过滤 `file_url`：`if (item.type === 'file_url') return;`。
3. 当某条 user message 只有文件、没有文本时，过滤后模型侧内容可能退化为 `content: 'null'`。
4. PR review 明确指出：不能在 API 保存层直接改写输入问题，只能在真正使用该输入的 node 内做运行时处理。

用户确认的最终目标边界：

1. 文件解析内容必须出现在发给模型的 user message 中，而不是 system prompt 中。
2. 历史记录中每一条带 file URL 的 human message，都要在运行时把自己的文件内容注入回自己的 user message。
3. 保存层保持原始 `userQuestion`，不把 `<FilesContent>` 固化入库。
4. 不做历史数据回填，不走 `file_url` 直传模型方案。
5. 每条 user query 的文件解析数量沿用 `chatConfig.fileSelectConfig.maxFiles`，不做跨 message URL 去重或共享缓存。

### 1.2 目标

- 业务目标：模型请求中，每条包含文件的 user message 都能携带对应文件正文；前面轮次的 user file 在后续聊天中继续可用。
- 技术目标：在 AI Chat node / Tool node 构造 LLM messages 前，对运行时消息副本进行逐条 user 文件内容注入，不修改 API 请求体和 MongoDB 保存内容。
- 成功指标：
  - file-only 的当前轮 user message 发给模型前包含 `<FilesContent>`，不再退化为 `null`。
  - 历史中每条带 file 的 human message，在后续请求里各自注入对应 `<FilesContent>`，不集中塞到最后一条 user message。
  - system prompt 不包含文件解析内容。
  - MongoDB 中 human 原始消息不新增 `<FilesContent>`。

## 2. 当前项目事实基线（基于代码）

| 能力项 | 现有实现位置（文件路径） | 现状说明 | 结论（复用/修改/新增） |
|---|---|---|---|
| 用户消息整理 | `packages/service/core/ai/llm/utils.ts` (`loadRequestMessages`) | 过滤 `file_url`，但保留同条消息中的 text | 复用，补回归测试 |
| v1 保存链路 | `projects/app/src/pages/api/v1/chat/completions.ts` | 当前 PR 中存在保存前增强 `enrichedUserQuestion` 的倾向 | 需回退，保存原始 `userQuestion` |
| v2 保存链路 | `projects/app/src/pages/api/v2/chat/completions.ts` | 当前 PR 中存在保存前增强 `enrichedUserQuestion` 的倾向 | 需回退，保存原始 `userQuestion` |
| chatTest 保存链路 | `projects/app/src/pages/api/core/chat/chatTest.ts` | review 评论点：不应保存增强后的输入 | 需回退，保存原始 `userQuestion` |
| 保存实现 | `packages/service/core/chat/saveChat.ts` | 每轮只持久化当前轮 Human/AI；并会清理 file.url | 复用，不改 schema |
| 历史文件收集 | `packages/service/core/workflow/dispatch/tools/readFiles.ts` (`getHistoryFileLinks`) | 已能从历史 human message 中提取 file URL | 复用，但需要支持逐条消息归属 |
| Chat 运行时拼接 | `packages/service/core/workflow/dispatch/ai/chat.ts` | 当前 PR 已把当前轮文件内容改到 user，但历史文件逐条注入不足 | 修改为逐条运行时注入 |
| Tool 运行时拼接 | `packages/service/core/workflow/dispatch/ai/tool/index.ts` | 与 Chat 类似；有 `readFiles` tool 时应跳过预解析 | 修改为逐条运行时注入，保留 skip 分支 |

## 3. 需求澄清记录

| 维度 | 已确认内容 | 待确认内容 | 备注 |
|---|---|---|---|
| 业务目标 | 文件内容进入 LLM user message，不进 system prompt | 无 | 已确认 |
| 历史行为 | 历史记录里每条 file URL 都需要注入回对应 user message | 无 | 已确认 |
| 文件上限 | 每条 user query 文件解析数量沿用 `maxFiles` | 无 | 已确认 |
| 保存层 | 不改写 `userQuestion`，不把 `<FilesContent>` 入库 | 无 | 对齐 PR review |
| 数据模型 | 不改 DB schema，不新增字段 | 无 | 已确认 |
| API 行为 | 对外请求/响应协议不变 | 无 | 已确认 |
| 前端交互 | 无页面改动要求 | 无 | 已确认 |
| 文档更新 | 更新本任务两份研发文档 | 无 | 已确认 |
| 文档 i18n | 不命中 `document/content/docs` | 无 | 本文档更新不涉及 docs 站点 |

## 3.1 影响域判定

| 维度 | 是否命中 | 证据（需求/代码锚点） | 结论 |
|---|---|---|---|
| API | No | 不新增/修改对外路由协议；仅回退保存层增强接入 | 协议不变 |
| DB | No | 不改 `MongoChatItem` schema 与索引 | 无结构改动 |
| Front | No | 未涉及前端组件与页面行为改造 | N/A |
| Logger | No | 不新增观测方案 | N/A |
| Package | Yes | 涉及 `packages/service` 与 `projects/app` 既有调用链对齐 | 最小改动 |
| BugFix | Yes | `file_url` 过滤导致 file-only 退化 `null` | 命中 |
| DocUpdate | Yes | 用户明确要求更新设计/开发文档 | 命中 |
| DocI18n | No | 本文档不改 docs 站点目录 | N/A |

## 4. 范围定义

### 4.1 In Scope（本期必须）

1. 回退 `v1/v2/chatTest` 保存前增强：保存链路统一使用原始 `userQuestion`。
2. Chat node 构造 LLM messages 前，对历史 human messages 与当前轮 user message 做运行时文件内容注入。
3. Tool node 在无 `readFiles` tool 时执行同样的逐条 user message 注入；有 `readFiles` tool 时跳过预解析。
4. 文件内容只注入 user message，不进入 system prompt。
5. 按 message 并行重写 user query，单条 user query 内文件解析数量受 `maxFiles` 控制。
6. 补齐对应回归测试与文档说明。

### 4.2 Out of Scope（本期不做）

1. 历史数据回填（批处理/迁移脚本）。
2. `file_url` 透传到模型。
3. API/DB schema 变更。
4. 不为超过 `maxFiles` 的文件新增特殊提示或额外 UI。
5. 不重构完整 chat message adapter。

## 5. 方案对比

| 方案 | 核心思路 | 优点 | 风险 | 实施成本 | 结论 |
|---|---|---|---|---|---|
| 方案A：保存前固化 | 在保存前把 file 解析文本拼到 `userContent` 并入库 | 后续回放天然复用 | 污染原始输入，已被 review 指出不合适 | 中 | 放弃 |
| 方案B：运行时逐条 user 注入（推荐） | 发给模型前增强 messages 副本，每条 human file 回填到自己的 user message，messages 并行处理 | 不污染保存层，满足 user 而非 system，历史文件后续可用 | 每次请求可能重新解析，受单条 query `maxFiles` 限制 | 中 | 推荐 |
| 方案C：直传 `file_url` 给模型 | 去掉过滤，依赖模型直接处理文件链接 | 表面改动少 | 多模型/OpenAI 兼容实现不稳定，容易报参错 | 中 | 放弃 |
| 方案D：历史回填 + 新流量修复 | 批量补齐旧库，再修新流量 | 历史一致性最好 | 工程面大、风险高、超出本期目标 | 高 | 本期不做 |

推荐方案：方案B（运行时逐条 user 注入）。

## 6. 推荐方案详细设计

### 6.1 API 设计

- 对外 API：无变化。
- 内部链路调整：`v1/v2/chatTest` 的保存入参保持原始 `userQuestion`，不再使用 `enrichedUserQuestion`。

### 6.2 数据设计

- DB 字段：无新增。
- DB 索引：无变化。
- 兼容策略：历史旧数据不迁移；运行时只要历史 human message 仍能提供 file key/url，就按当前策略解析注入。

### 6.3 核心代码设计

| 模块 | 关键函数/类型 | 变更说明 | 上下游影响 |
|---|---|---|---|
| `projects/app/src/pages/api/v1/chat/completions.ts` | `handler` | 移除保存前 `enrichUserContentWithParsedFiles` 使用，保存原始 `userQuestion` | 对外响应不变，避免污染历史 |
| `projects/app/src/pages/api/v2/chat/completions.ts` | `handler` | 同 v1，`prepare/finalize/updateInteractive` 使用原始 `userQuestion` | 对齐 review |
| `projects/app/src/pages/api/core/chat/chatTest.ts` | `handler` | 同 v1/v2，调试链路也不保存增强内容 | 修复 review 评论点 |
| `packages/service/core/workflow/dispatch/ai/chat.ts` | `getMultiInput/getChatMessages` | 构造 LLM messages 前增强运行时副本：历史和当前轮每条 user message 注入自己的文件内容；文件内容不进 system | Chat node 满足历史逐条注入 |
| `packages/service/core/workflow/dispatch/ai/tool/index.ts` | `getMultiInput/dispatchRunTools` | 无 `readFiles` tool 时同 Chat；有 `readFiles` tool 时跳过预解析 | 避免与 readFiles tool 职责冲突 |
| `packages/service/core/workflow/utils/context.ts` | `rewriteUserQueryWithFileContent` | 承载单条 user query 的文件内容重写逻辑，外层并行处理 history/current messages | 不污染 readFiles tool 职责 |
| `packages/service/core/workflow/dispatch/tools/readFiles.ts` | `normalizeReadableFileUrl` / `getFileContentFromLinks` | `getFileContentFromLinks` 统一负责 URL 标准化、过滤、文件读取与解析；`normalizeReadableFileUrl` 仅作为底层清洗工具 | 不改对外 API |
| `packages/service/core/ai/llm/utils.ts` | `loadRequestMessages` | 保持 `file_url` 过滤逻辑；确保同条消息 text 不被过滤 | 回归保障 |

### 6.4 运行时注入规则

1. 使用消息副本，不修改 `histories`、`query`、`userQuestion` 原对象。
2. Chat/Tool 外层用 `Promise.all` 并行处理运行时 messages。
3. 单条 user query 只收集本条 `file.url`；不做跨 message URL 去重，不共享解析缓存。
4. `getFileContentFromLinks` 负责 URL 标准化、过滤、`maxFiles` 截断和文件解析。
5. 文件解析结果回填到原本所属的 user message：
   - 原 message 已有 text：追加 `\n\n===---===---===\n\n<FilesContent>...`。
   - 原 message 只有 file：新增一个 text part 存放 `<FilesContent>`。
6. 不把历史文件内容集中拼到最后一条 user message。
7. system prompt 只保留模型默认 system、用户配置 system、dataset system quote。

### 6.5 日志与观测设计

- 不新增日志点。
- 不打印用户文件正文或解析结果。

### 6.6 文档 i18n 设计

N/A（未命中 docs 站点目录）。

## 7. Bug 修复分析

| 项目 | 内容 |
|---|---|
| Bug 现象 | file-only user message 发给模型时可能退化为 `content: 'null'`，历史 file 在后续聊天中无法稳定保留语义 |
| 复现步骤 | 首轮只传 file -> 后续轮次继续聊天 -> 模型请求中过滤 `file_url` 后缺少文件正文 |
| 期望行为 | 每条带 file 的 user message 在 LLM 请求中都有自己的 `<FilesContent>` 文本 |
| 实际行为 | `file_url` 被过滤，文件正文未逐条注入 user message |
| 定位证据 | `loadRequestMessages` 过滤 `file_url`；当前保存前增强方案被 review 指出不应改原始输入 |
| 问题点文件与函数 | `loadRequestMessages`、`v1/v2/chatTest` 保存链路、`chat.ts/tool/index.ts` 运行时消息构造 |
| 根因分析（直接原因） | file URL 不是模型可直接消费的文本，过滤后缺少正文 |
| 根因分析（深层原因） | 保存层与运行时层职责混淆；文件正文应该在消费输入的 node 内注入，而不是改写保存内容 |
| 影响范围 | Chat/Tool node 的 LLM 请求构造、file-only 与历史 file 后续对话 |

回归验证要点：

1. file-only 当前轮发给模型不再退化 `null`。
2. 历史每条带 file 的 user message 各自获得文件正文。
3. 保存后的 human 原始内容不包含新增 `<FilesContent>`。
4. 无 file 轮次无行为变化。

## 8. 风险、迁移与回滚

### 8.1 风险清单

1. 每次请求可能重新解析历史文件，存在额外耗时；通过单条 user query `maxFiles` 控制风险，并通过 messages 并行处理降低串行等待。
2. 文件正文进入 user message 后 token 增加，可能触发上下文裁剪；沿用现有 `filterGPTMessageByMaxContext`。
3. 历史文件若只剩 key 而无可解析 URL，需要实现时确认是否可通过现有 key 生成可读地址。

### 8.2 迁移策略

- 本期不迁移历史数据。
- 修复通过运行时消息增强生效，不改历史存量内容。

### 8.3 回滚策略

1. 回滚运行时逐条注入 helper 与调用点。
2. 保持保存层原始输入逻辑不变。
3. `loadRequestMessages` 原过滤逻辑保持不变。

## 9. 验收标准

| 验收项 | 验收方式 | 通过标准 |
|---|---|---|
| 当前轮 file-only 可用 | 单测/联调 | LLM 请求最后一条 user message 含 `<FilesContent>`，不为 `null` |
| 历史逐条注入 | 单测/联调 | 多条历史 human file 分别注入到各自 user message |
| 不污染保存层 | 单测/代码走查 | `prepare/finalize/push/updateInteractive` 保存原始 `userQuestion` |
| system prompt 纯净 | 单测/代码走查 | system message 不包含 `<FilesContent>` |
| `maxFiles` 生效 | 单测 | 单条 user query 文件解析数不超过 `maxFiles` |
| Tool readFiles 分支 | 单测/代码走查 | 有 `readFiles` tool 时不提前注入 |
| 普通轮次无回归 | 回归测试 | 无 file 请求与修复前行为一致 |

## 10. MECE 核查结论

### 10.1 相互独立检查结果

发现问题：保存前固化与运行时注入职责混淆。
影响范围：容易污染原始用户输入，并触发 review 反对。
修订动作：保存层只保存原始输入，运行时只增强 LLM messages 副本。
修订后结果：职责边界清晰。

### 10.2 完全穷尽检查结果

发现问题：只处理当前轮文件无法满足“历史记录每条 file URL 都注入回来”。
影响范围：后续聊天中前面 user file 仍可能丢语义。
修订动作：历史 human messages 与当前轮 user message 统一按条注入。
修订后结果：当前轮、历史轮、tool 场景均覆盖。

### 10.3 修订动作与最终边界

发现问题：历史文件过多时可能带来解析成本和 token 风险。
影响范围：性能、成本、上下文窗口。
修订动作：确认采用 `maxFiles` 作为单条 user query 的解析上限，并通过 messages 并行处理降低串行等待。
修订后结果：需求完整且有明确成本边界。

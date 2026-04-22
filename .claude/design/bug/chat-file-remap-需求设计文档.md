# 需求设计文档

## 0. 文档标识

- 任务前缀：`chat-file-remap`
- 文档文件名：`chat-file-remap-需求设计文档.md`
- 更新时间：2026-04-22
- 文档定位：对齐当前代码实现事实与验收口径（仅修新流量，不回填历史）

## 1. 需求背景与目标

### 1.1 背景

当前问题来自消息整理链路的既有行为：

1. 用户文件会在适配阶段转成 `file_url`（`packages/global/core/chat/adapt.ts` 的 `chats2GPTMessages`）。
2. `packages/service/core/ai/llm/utils.ts` 的 `loadRequestMessages` 会过滤 `file_url`：`if (item.type === 'file_url') return;`。
3. 当某轮用户输入只有文件、没有文本时，过滤后用户内容可能退化为 `content: 'null'`。

用户确认的目标边界：

1. 仅修复新流量，确保新轮次文件内容被固化到当前轮 user 消息中。
2. 不做历史数据回填。
3. 不走 `file_url` 直传模型方案，保持当前多模型兼容策略。

### 1.2 目标

- 业务目标：新轮次中，只要用户消息包含 file，入库前就把可解析文件正文补到该轮 user 文本，后续历史回放可直接复用。
- 技术目标：统一在保存前增强 `userContent`，覆盖 `v1/v2/chatTest` 三条保存链路。
- 成功指标（可量化）：
  - 首轮 file-only 消息落库后 human 内容含 `<FilesContent>` 文本块，不再退化为 `null`。
  - 次轮继续对话后，首轮 human 内容保持不变（不被重写）。
  - 无 file 轮次行为保持不变。

## 2. 当前项目事实基线（基于代码）

| 能力项 | 现有实现位置（文件路径） | 现状说明 | 结论（复用/修改/新增） |
|---|---|---|---|
| 用户消息整理 | `packages/service/core/ai/llm/utils.ts` (`loadRequestMessages`) | 过滤 `file_url`，file-only 轮次可能写入 `content: 'null'` | 复用，作为问题根因锚点 |
| v1 保存链路 | `projects/app/src/pages/api/v1/chat/completions.ts` | 已在保存前构造 `enrichedUserQuestion` 并用于保存入口（`ensurePendingChatRoundItems/pushChatRecords/updateInteractiveChat`） | 已完成，继续复用 |
| v2 保存链路 | `projects/app/src/pages/api/v2/chat/completions.ts` | 已在保存前构造 `enrichedUserQuestion` 并用于保存入口（`prepareChatRound/finalizeChatRound/updateInteractiveChat`） | 已完成，继续复用 |
| chatTest 保存链路 | `projects/app/src/pages/api/core/chat/chatTest.ts` | 已与 v1/v2 对齐，保存时使用 `enrichedUserQuestion` | 已完成，继续复用 |
| 保存实现 | `packages/service/core/chat/saveChat.ts` | 每轮只持久化当前轮 Human/AI；并会清理 file.url | 复用，不改 schema |
| 文件增强能力 | `packages/service/core/chat/utils.ts` (`enrichUserContentWithParsedFiles`) | 已有“当前轮解析并拼接 `<FilesContent>`”能力 | 复用并作为统一入口 |
| Chat 运行时拼接 | `packages/service/core/workflow/dispatch/ai/chat.ts` (`getMultiInput/getChatMessages`) | 文件内容拼接到当前轮 `finalUserInput`，不再拼进 `systemPrompt`；URL 只取当前轮 `fileLinks` 或 `inputFiles` | 已完成，继续复用 |
| Tool 运行时拼接 | `packages/service/core/workflow/dispatch/ai/tool/index.ts` (`getMultiInput/dispatchRunTools`) | 与 Chat 路径一致：文件内容进当前轮 user；不读取历史文件 URL；有 readFiles 工具时跳过预解析 | 已完成，继续复用 |

## 3. 需求澄清记录

| 维度 | 已确认内容 | 待确认内容 | 备注 |
|---|---|---|---|
| 业务目标 | 文件内容要固化到 user 当前提示词并进入历史 | 无 | 已确认 |
| 范围边界 | 仅修新流量，不回填历史 | 无 | 已确认 |
| 权限模型 | 沿用现有接口鉴权，不新增角色 | 无 | 已确认 |
| 数据模型 | 不改 DB schema，不新增字段 | 无 | 已确认 |
| API 行为 | 对外请求/响应协议不变 | 无 | 已确认 |
| 前端交互 | 无页面改动要求 | 无 | 已确认 |
| Bug 修复分析 | 属于行为回归修复 | 无 | 已确认 |
| 文档更新 | 仅更新本任务两份研发文档 | 无 | 已确认 |
| 文档 i18n | 不命中 `document/content/docs` | 无 | 已确认 |

## 3.1 影响域判定（先判定，再核对规范）

| 维度 | 是否命中 | 证据（需求/代码锚点） | 核对规范 | 结论 |
|---|---|---|---|---|
| API | No | 不新增/修改对外路由协议；仅内部保存参数处理 | `references/style/api.md` | N/A（协议不变） |
| DB | No | 不改 `MongoChatItem` schema 与索引 | `references/style/db.md` | N/A（无结构改动） |
| Front | No | 未涉及前端组件与页面行为改造 | `references/style/front.md` | N/A |
| Logger | No | 本次只做清理调试输出，不新增观测方案 | `references/style/logger.md` | N/A |
| Package | Yes | 涉及 `packages/service` 与 `projects/app` 既有调用链对齐 | `references/style/package.md` | 命中（仅最小改动） |
| BugFix | Yes | `file_url` 过滤导致 file-only 退化 `null` | `references/bug-fix-workflow.md` | 命中 |
| DocUpdate | Yes | 用户明确要求更新两份设计/开发文档 | `references/doc-update-reminder.md` | 命中 |
| DocI18n | No | 未改 docs 站点目录 | `references/doc-i18n-standards.md` | N/A |

## 4. 范围定义

### 4.1 In Scope（本期必须）

1. `v1/v2/chatTest` 新流量保存前统一执行 `enrichUserContentWithParsedFiles`。
2. 保存链路使用 `enrichedUserContent`，保证文件正文被固化到该轮 user 文本。
3. Chat/Tool 运行时统一改为“文件内容拼到当前轮 user input，不再拼 system prompt”，且只处理当前轮文件 URL。
4. 补齐与本行为对应的回归测试口径与文档说明。

### 4.2 Out of Scope（本期不做）

1. 历史数据回填（批处理/迁移脚本）。
2. `file_url` 透传到模型。
3. API/DB schema 变更。
4. 文件解析预算截断等扩展治理。

## 5. 方案对比

| 方案 | 核心思路 | 优点 | 风险 | 实施成本 | 结论 |
|---|---|---|---|---|---|
| 方案A：保存前固化（推荐） | 在保存前把 file 解析文本拼到当前轮 `userContent` | 与现有架构最兼容、改动最小、可直接解决 `null` 退化 | 解析失败时该轮不固化（保持现有行为） | 低 | 推荐 |
| 方案B：直传 `file_url` 给模型 | 去掉过滤，依赖模型直接处理文件链接 | 表面改动少 | 多模型/OpenAI 兼容实现不稳定，容易报参错 | 中 | 放弃 |
| 方案C：历史回填 + 新流量修复 | 批量补齐旧库，再修新流量 | 历史一致性最好 | 工程面大、风险高、超出本期目标 | 高 | 本期不做 |

推荐方案：方案A（保存前固化）。

## 6. 推荐方案详细设计

### 6.1 API 设计

- 对外 API：无变化。
- 内部链路调整：`v1/v2/chatTest` 的保存入参由 `userQuestion` 改为 `enrichedUserContent`。

### 6.2 数据设计

- DB 字段：无新增。
- DB 索引：无变化。
- 兼容策略：仅影响修复上线后的新轮次；历史旧数据保持原状。

### 6.3 核心代码设计

| 模块 | 关键函数/类型 | 变更说明 | 上下游影响 |
|---|---|---|---|
| `packages/service/core/chat/utils.ts` | `enrichUserContentWithParsedFiles` | 作为统一保存前增强入口，抽取当前轮 file URL，解析后拼接 `<FilesContent>` 到 user 文本 | 下游保存可直接持久化文本 |
| `projects/app/src/pages/api/v1/chat/completions.ts` | `handler` | 保存前构造 `enrichedUserQuestion`；`ensure/push/updateInteractive` 用增强值 | 不改对外响应 |
| `projects/app/src/pages/api/v2/chat/completions.ts` | `handler` | 保存前构造 `enrichedUserQuestion`；`prepare/finalize/updateInteractive` 用增强值 | 不改对外响应 |
| `projects/app/src/pages/api/core/chat/chatTest.ts` | `handler` | 与 v1/v2 一致接入增强，避免测试链路继续产生 `null` 历史 | 调试链路与线上口径一致 |
| `packages/service/core/workflow/dispatch/ai/chat.ts` | `getMultiInput/getChatMessages` | 去除历史文件回读，URL 来源限定为当前轮 `fileLinks/inputFiles`；文件提示词拼接到 `finalUserInput`，不进入 system | 运行时消息与保存策略一致 |
| `packages/service/core/workflow/dispatch/ai/tool/index.ts` | `getMultiInput/dispatchRunTools` | 与 chat 路径对齐；不再把文件内容写入 system；不读取历史文件 URL | tool 场景行为与 chat 一致 |
| `packages/service/core/ai/llm/utils.ts` | `loadRequestMessages` | 保持 `file_url` 过滤逻辑不变 | 通过上游固化避免 file-only 退化 |

### 6.4 前端设计

N/A（本期无前端改造）。

### 6.5 日志与观测设计

- 不新增日志点。
- 清理调试阶段 `console.log/console.dir`，避免污染运行日志。

### 6.6 文档 i18n 设计（命中时必填）

N/A（未命中 docs 站点目录）。

### 6.7 文档更新提醒（必填）

| 文档路径 | 文档类型 | 更新原因 | 计划更新内容 | 负责人 | 截止时间 | 状态 |
|---|---|---|---|---|---|---|
| `chat-file-remap-需求设计文档.md` | 研发设计文档 | 口径需收敛到“仅修新流量” | 重写背景、范围、方案对比、验收口径 | Codex | 2026-04-22 | 本次完成（2026-04-22） |
| `chat-file-remap-功能开发文档.md` | 研发开发文档 | 实施任务与测试口径需同步 | 重写任务拆解、文件改动、测试章节 | Codex | 2026-04-22 | 本次完成（2026-04-22） |

### 6.8 Bug 修复分析（命中时必填）

| 项目 | 内容 |
|---|---|
| Bug 现象 | file-only 轮次在历史回放时出现 `content: 'null'` |
| 复现步骤 | 首轮只传 file -> 发送到模型或历史回放时用户内容退化 |
| 期望行为 | 首轮落库时 human 消息包含可回放的 `<FilesContent>` 文本 |
| 实际行为 | `file_url` 被过滤，且无文本时写 `null` |
| 定位证据 | `packages/service/core/ai/llm/utils.ts` 中 `if (item.type === 'file_url') return;` 与 `content: 'null'` 分支 |
| 问题点文件与函数 | `loadRequestMessages`、`v1/v2/chatTest` 保存链路组装逻辑、`chat.ts/tool/index.ts` 的运行时文件拼接逻辑 |
| 根因分析（直接原因） | 文件语义未在保存前固化，运行时过滤后无文本 |
| 根因分析（深层原因） | 文件消息在保存层与运行时层策略不一致（历史文件重复读取、system 注入与 user 固化目标冲突） |
| 影响范围 | 新产生的 file-only 会话轮次、Chat/Tool 运行时提示词拼接与后续历史回放 |

修复方案：

| 方案 | 思路 | 优点 | 风险 | 结论 |
|---|---|---|---|---|
| A（本期） | 保存前增强当前轮 userContent 并入库 | 最小改动、兼容性最好 | 解析失败时该轮不固化 | 采用 |
| B（不采用） | 放开 file_url 直传模型 | 改动点少 | 模型兼容性不可控 | 放弃 |

回归验证要点：

1. file-only 新轮次不再落 `null`。
2. 次轮后首轮内容不被重写。
3. 无 file 轮次无行为变化。

## 7. 风险、迁移与回滚

### 7.1 风险清单

1. 文件解析失败时无法固化正文（保持现状，不新增报错行为）。
2. 文本体积增加可能带来 token 增长。

### 7.2 迁移策略

- 本期不迁移历史数据。
- 修复仅对新产生轮次生效。

### 7.3 回滚策略

1. 回滚保存前增强接入点（`v1/v2/chatTest`）。
2. 保持 `loadRequestMessages` 原逻辑不变，系统可恢复到旧行为。

## 8. 验收标准

| 验收项 | 验收方式 | 通过标准 |
|---|---|---|
| file-only 新轮次固化 | 回归测试 | Human 入库内容含 `<FilesContent>` 文本 |
| 后续轮次不重写首轮 | 回归测试 | 次轮后首轮内容字面值保持一致 |
| 多文件顺序稳定 | 回归测试 | 固化文本中多文件段顺序稳定且可预期 |
| 普通轮次无回归 | 回归测试 | 无 file 请求与修复前行为一致 |
| 运行时 system 纯净 | 代码走查/联调 | 文件内容不再拼接到 system prompt |
| 仅当前轮文件参与解析 | 代码走查/联调 | `chat.ts/tool/index.ts` 不再读取 histories 文件 URL |
| 历史边界声明 | 文档核对 | 明确“历史旧数据不承诺回填” |

## 9. MECE 核查结论

### 9.1 相互独立检查结果

发现问题：历史回填与新流量修复容易混成一个任务。  
影响范围：实施范围膨胀、上线风险扩大。  
修订动作：明确本期只修新流量，历史回填独立立项。  
修订后结果：任务边界清晰，执行路径唯一。

### 9.2 完全穷尽检查结果

发现问题：若只改 v1/v2，`chatTest` 仍会产出 `null`。  
影响范围：调试链路与线上链路行为不一致。  
修订动作：将 `chatTest` 纳入同一保存前增强策略。  
修订后结果：三条链路口径一致。

### 9.3 修订动作与最终边界

发现问题：运行时路径（`chat.ts/tool/index.ts`）改动未被纳入文档锚点。  
影响范围：排查时无法从文档直接定位“system 不再接收文件内容、历史文件不再重读”的事实。  
修订动作：补充运行时模块锚点与验收项。  
修订后结果：保存层与运行时层口径在文档中一致可追溯。

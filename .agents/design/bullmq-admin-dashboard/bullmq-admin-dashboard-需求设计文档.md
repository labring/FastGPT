# BullMQ 管理面板（pro/admin mini dashboard）需求设计文档

## 0. 文档标识

- 任务前缀：`bullmq-admin-dashboard`
- 文档文件名：`bullmq-admin-dashboard-需求设计文档.md`
- 更新时间：2026-08-13
- 文档状态：`v1.0 初稿，待确认`
- 文档定位：在 `pro/admin` 增加简易 BullMQ 任务管理页面，解决队列失败任务不可见、无法运维的问题。

## 1. 需求背景与目标

### 1.1 背景

FastGPT 的异步任务（S3 文件删除、知识库/应用/团队删除、数据集同步、评测等）通过 BullMQ 队列执行。当前缺少可视化入口：

- 失败任务静默堆积在 Redis 的 failed 集合中，没有界面可以查看；
- 运维只能通过 Redis/BullMQ 命令行排查；
- 以 `s3FileDelete` 为例，历史遗留的非规范对象 key 导致删除任务持续失败，若没有排查入口，问题会长期潜伏（对象无法删除、存储残留）。

### 1.2 最新确认口径

| 编号 | 维度 | 最新确认结果 | 设计结论 |
|---|---|---|---|
| C1 | 数据展示范围 | 不做脱敏，管理员可见全部 `job.data` | 完整展示任务数据（含对象 key、消息内容等），仅限超级管理员访问 |
| C2 | 功能范围 | 查看 + failed 重试/删除 | 不做 drain/obliterate/清空队列、不编辑任务、不调整队列配置 |
| C3 | 队列范围 | 白名单展示运维相关队列 | 只展示配置清单内的队列，避免误操作内部队列 |
| C4 | 写操作安全 | 需要二次确认 + 审计 | 前端二次确认弹窗；后端写操作记录审计日志 |
| C5 | 数据刷新 | 手动刷新即可 | 可选 30s 轮询，首版不做实时推送 |

### 1.3 业务目标

- 管理员在一个页面看到所有队列的任务状态分布（waiting / active / delayed / failed / completed）。
- 管理员可以查看 failed 任务的完整数据与失败原因，定位问题（如某个 S3 key 删除失败）。
- 管理员可以对 failed 任务进行单条/批量重试，或删除失败记录。
- 所有写操作有确认与审计，避免误操作。

### 1.4 非目标

- 不做完整的 Bull Board 式功能（任务编辑、延迟任务管理、队列暂停/清空、重复任务管理、指标图表）。
- 不做实时 WebSocket 推送。
- 不做数据脱敏（见 C1）。

## 2. 影响域

- 前端：`pro/admin` 新增管理页面（含 i18n、路由入口）。
- 后端：`pro/admin` 新增 admin API 路由与服务层。
- 复用：`@fastgpt/dal/redis/bullmq` 的 `QueueNames` 与各 `*MQService.getQueue()`、`bullMQ` binding、`adminCert` 鉴权。
- 不改动：worker、SDK、队列配置、主应用。

## 3. 功能需求

### F1 队列概览

- 展示白名单内每个队列：队列名、友好名、各状态计数（waiting/active/delayed/failed/completed）、最近失败时间。
- failed > 0 的队列高亮，便于发现问题。

### F2 failed 任务列表

- 支持按队列查看 failed 任务，分页展示。
- 每行展示：jobId、任务名（name）、尝试次数（attemptsMade）、数据预览（JSON 完整，可展开/复制）、失败原因、失败时间。
- 支持按失败原因或数据内容子串过滤；数据量超过阈值时引导先过滤再分页。

### F3 操作

- 单条重试：把该 failed 任务移回 waiting。
- 批量重试：勾选多条后重试。
- 删除失败记录：单条/批量删除 failed 记录（仅 failed 状态，不影响已存在的对象）。
- 所有写操作二次确认；成功后刷新列表。

### F4 任务详情

- 点击任务查看详情弹窗：完整 `data`、失败原因、错误栈（如有）、attemptsMade、创建/失败时间。

## 4. 队列白名单（建议）

| 队列名 | 友好名 | JobData | 备注 |
|---|---|---|---|
| `s3FileDelete` | S3 文件删除 | key/keys/prefix + bucketName | 本次修复的队列 |
| `datasetDelete` | 知识库删除 | teamId + datasetId | |
| `appDelete` | 应用删除 | teamId + appId | |
| `agentSkillDelete` | Skill 删除 | teamId + skillId | |
| `teamDelete` | 团队删除 | teamId | |
| `datasetSync` | 知识库同步 | datasetId | admin 进程也运行该 worker |
| `evaluation` | 应用评测 | appId/evalId | admin 进程也运行该 worker |
| `collectionUpdate` | 集合更新 | collectionId | |
| `agentSkillCreate` | Skill 创建 | teamId + skillId | |
| `wechatReply` | 微信公众号回复 | 消息数据 | 含用户消息内容，属敏感数据（C1 已确认展示） |
| `wechatPoll` | 微信公众号轮询 | shareId | |

> 白名单在代码中以常量维护（队列名 → 友好名），便于后续增删；不在清单内的队列不展示、不可操作。

## 5. 风险与注意事项

- **敏感数据展示**：C1 已确认不做脱敏，页面与 API 仅限超级管理员（`adminCert`），写操作审计。
- **重试语义**：`retryJobs` / `job.retry` 不会重置 `attemptsMade`，重放后任务只有一次执行机会（成功即完成，失败即回 failed），不会造成重试风暴；文档中需提示管理员"重试前确认 worker 已修复/运行正常"。
- **删除记录 vs 删除对象**：删除 failed 记录只清 Redis 里的任务记录，不会删除任务指向的 S3 对象/数据库数据；UI 文案需说清。
- **大数据量**：failed 最多保留 10000 条，列表必须分页 + 过滤，避免一次全量拉取。

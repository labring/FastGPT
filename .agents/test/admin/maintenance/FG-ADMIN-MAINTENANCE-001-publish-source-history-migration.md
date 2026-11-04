---
case_version: 1
id: "FG-ADMIN-MAINTENANCE-001"
title: "publishSource 历史回填、兼容上线与断点恢复"
business: "admin/maintenance"
types:
  - "api"
  - "integration"
category: "boundary"
scenario: "special"
priority: "P1"
status: "ready"
tags:
  - "customuid-publishsource"
  - "phase2"
  - "publishSource"
  - "migration"
  - "覆盖基础场景"
  - "覆盖异常场景"
  - "覆盖边界场景"
evidence:
  - "database"
  - "ui"
sources:
  - "projects/app/src/pages/api/admin/migrations/failedRecords.ts"
  - "projects/app/src/pages/api/admin/migrations/retry.ts"
  - "projects/app/src/pages/api/admin/migrations/start.ts"
  - "projects/app/src/pages/api/admin/migrations/list.ts"
  - "packages/global/migration/schema.ts"
  - "projects/app/src/migration/tasks/4180/20261104_backfill_chat_publish_source/utils.ts"
  - "projects/app/src/migration/tasks/4180/20261104_backfill_chat_publish_source/service.ts"
  - "projects/app/src/migration/tasks/4180/20261104_backfill_chat_publish_source/index.ts"
  - "packages/service/core/chat/publishSource/utils.ts"
  - "packages/service/core/chat/publishSource/service.ts"
  - "packages/global/core/chat/publishSource/type.ts"
  - "projects/app/src/migration/registry.ts"
  - "projects/app/src/migration/runner.ts"
  - "projects/app/src/migration/plan.ts"
  - "projects/app/src/migration/startup.ts"
  - "projects/app/src/migration/tasks/README.md"
  - "packages/service/core/chat/chatSchema.ts"
  - "packages/service/core/app/logs/chatLogsSchema.ts"
  - "packages/service/core/chat/saveChat.ts"
  - "packages/service/support/outLink/schema.ts"
  - "packages/service/common/mongo/indexManager.ts"
routes:
  - "GET /api/admin/migrations/list"
  - "POST /api/admin/migrations/start"
  - "POST /api/admin/migrations/retry"
  - "GET /api/admin/migrations/failedRecords"
related:
  - "FG-CHAT-CONVERSATION-001"
  - "FG-PERMISSION-RESOURCE-001"
  - "FG-CHAT-HISTORY-FEEDBACK-002"
baseline: "c413874c6a1cf47f3c35fc94d8b074130db50f8a"
---

# publishSource 历史回填、兼容上线与断点恢复

## 用例简介

升级后需要将可确定的历史来源回填为 publishSource，同时保留旧名称并允许无法恢复渠道 ID 的对话继续使用。本例检查可信关联、并发新来源保护、迁移重试和统计不失真，避免把当前 Chat 来源错误填回历史统计桶。

## 前置准备

- 版本为 4.18.0 及以上，按设计先暂停新运行、排空旧写入、全部写节点升级后恢复，再手动回填。固定任务 ID=`20261104_backfill_chat_publish_source`，目录 `projects/app/src/migration/tasks/4180/20261104_backfill_chat_publish_source/`；任务不阻塞启动，无前置依赖，按主库 chats / 日志库 chatLogs 两阶段分批断点续跑，最终 validation 校验。
- Root 管理员通过 `GET /api/admin/migrations/list` 确认任务处于 waiting，再调用 `POST /api/admin/migrations/start`，body 为 `{migrationId:"20261104_backfill_chat_publish_source"}`。失败重试为 `POST /api/admin/migrations/retry`，相同 body；按 `GET /api/admin/migrations/failedRecords?migrationId=20261104_backfill_chat_publish_source&stageKey=chats` 读取错误，chatLogs 阶段使用对应 stageKey。按 NextAPI 的 code/data 与实际任务状态判断成功，不直接修改框架状态集合。
- 必须用独立可回收环境/库，包含主库和实际日志库。记录部署拓扑，能暂停/重启单个迁移 worker、读取任务进度/错误与 checkpoint，并控制一批业务写入提交后至 checkpoint 前的中断；缺观测或故障注入能力时相关行阻塞。
- 夹具 H：H1 source=share、shareId 能在同 T/W 唯一匹配现存 S1；H2 为已删除外链；H3 为旧 api/mcp，无 Key ID但名称与多个 Key 相同；H4 online/test/cronJob，online 额外带残留 shareId；H5 已有最新完整 publishSource，并备一份已有合法 type-only 来源；H6 跨团队/类型冲突或无法唯一匹配的异常数据。第三方外链补一份对应 type 的有效引用及类型冲突对照。均保留 sourceName 原值及完整前快照。
- 在 app_chat_logs 放两个不同历史时间桶，分别保留 source=share/api；对应 Chat 当前来源为 API B。记录所有计数、总积分、token、时间等原值。统计桶只允许使用自身已有分类，不从当前 Chat 逆推 ID。
- 建立精确 appId/chatId/_id 白名单；主库 `db.chats.find({teamId:ObjectId(T),appId:ObjectId(W),chatId:{$in:manifest}},{publishSource:1,source:1,sourceName:1,shareId:1,tmbId:1,outLinkUid:1})`，日志库 `db.app_chat_logs.find({teamId:ObjectId(T),appId:ObjectId(W),chatId:{$in:manifest}})` 保存对应计数/时间快照。索引用只读 getIndexes/explain，区分代码管理索引与客户自建索引。
- 清理：销毁独立测试资源或按 manifest 回收，保留脱敏进度/失败证据；故障注入后恢复节点与开关。未执行本例，不代表迁移通过。

## 测试步骤

| 子场景 | 类型与起始状态 | 操作 |
| --- | --- | --- |
| C1 | 回填；H 初态 | 所有相关节点已运行兼容版本后，通过已注册任务的实际管理员入口触发，轮询进度每 2 秒、最长 10 分钟；超时保存状态不擅自重置。 |
| C2 | 并发；恢复 H | 扫描读取 H5/某旧记录后，用真实授权 API 运行保存新的来源，再让迁移提交该批。 |
| C3 | 重试；独立 H 副本 | 在业务批次已提交、checkpoint 尚未保存时中断 worker，恢复后重新调度；再演练存在失败记录且 checkpoint 已前进的重试。 |
| C4 | 错误恢复；H6 | 观察结构异常记录和任务终态；通过确定的业务修复/测试夹具修复后，使用框架重试入口，不直接修改任务状态集合。 |
| C5 | 上线兼容；升级前后同 H | 保存升级前快照；暂停新运行并确认旧请求/队列排空，全部相关写节点升级后恢复流量，再按实际入口触发回填。升级后回填前、回填后分别查询来源/名称、筛选与统计；旧 API 会话以授权 API 续聊，旧 MCP 缺 ID 的访问兼容复用 RESOURCE-001 真实服务集成，不给 toolCall 虚构 chatId。 |
| C6 | 保留与回滚；回填完成后的独立副本 | 检查旧字段及 defineIndex 当前/废弃定义、真实索引；核对兼容查询仍需的旧索引及预置客户自建索引保留。回到已确定的兼容版本，读取同一 H 和迁移恢复数据；不执行后续物理清理任务。 |

## 预期结果

公共断言：迁移仅追加可靠来源，不改凭证、身份归属、消息正文或历史计数；未解决结构错误与“历史 ID 不可恢复”分别报告。已存在/并发写入的最新 publishSource 不被扫描旧值覆盖。进度/错误不包含密钥和正文。

| 子场景 | 特有预期 | 证据 |
| --- | --- | --- |
| C1 | H1→share/S1._id；H2保留分类无 id；H3仅分类不按名称猜 Key；H4保留原分类且不由残留 shareId 重判；H5 完整及合法 type-only 均保留；H6记录异常，第三方引用也须唯一且类型一致。统计桶只回填自身 type，无当前 Chat 的新渠道 ID；所有历史数值计数不变。 | H→目标逐条投影、各分类计数和任务结果。 |
| C2 | CAS 冲突后重读/核验，不用旧来源覆盖新运行；不能把未验证的跳过项直接算成功。 | 并发时间线、前后来源与 task 进度。 |
| C3 | 重放幂等、不重复计数；完整未解决错误快照在断点推进前持久化，恢复时先重试已跳过错误，再续扫，Checkpoint 不含业务正文。 | 实际 checkpoint/错误快照和不重复的目标数据。 |
| C4 | 未解决结构问题不能标记成功；修复并重试后达到声明的完成条件，框架收敛结果/错误。无法恢复的历史 id 不被伪造。 | 管理页面终态及精确错误记录。 |
| C5 | 新旧写节点不并行改来源；回填不是业务启动前置。回填前缺 type 显示 `-`，名称可回退，旧 source 仍可筛选/统计。旧 API 无 ID 可按原权限续聊，preChat 写本次真实 Key ID；MCP 只在真实服务路径验证缺字段兼容。外部请求仍传 shareId，不改成渠道数据库 ID。 | 排空/节点版本记录、各阶段快照、真实续聊响应与统计差集。 |
| C6 | 本期不清除旧字段，尤其 sourceName 保留；仍用于兼容的索引及客户自建索引不删，新索引通过 defineIndex 声明并核对查询计划。兼容版本可读新旧来源并保留断点；不把只懂旧字段的版本作为已验证回滚目标。 | 字段/索引精确差集、Schema 定义、兼容版本读取与 checkpoint 快照。 |

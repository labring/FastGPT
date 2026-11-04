---
case_version: 1
id: "FG-ADMIN-MAINTENANCE-002"
title: "历史 API Key 分类回填与绑定语义一致性"
business: "admin/maintenance"
types: [api, integration]
category: boundary
scenario: special
priority: P0
status: ready
tags: [phase3, app-api-key, customuid-publishsource, 历史兼容, 自动迁移, 覆盖基础场景, 覆盖异常场景, 覆盖边界场景]
evidence: [response, database]
sources:
  - ".agents/design/api/app-api-key.md"
  - "packages/service/support/openapi/schema.ts"
  - "packages/service/support/openapi/auth.ts"
  - "packages/service/support/permission/auth/openapi.ts"
  - "projects/app/src/pages/api/support/openapi/list.ts"
  - "projects/app/src/pages/api/support/openapi/health.ts"
  - "packages/service/support/openapi/tag/service.ts"
  - "projects/app/src/migration/registry.ts"
  - "projects/app/src/migration/tasks/4180/20261104_backfill_openapi_key_type/index.ts"
  - "projects/app/src/migration/tasks/4180/20261104_backfill_openapi_key_type/service.ts"
  - "projects/app/src/migration/runner.ts"
  - "projects/app/src/migration/plan.ts"
  - "projects/app/src/migration/startup.ts"
  - "projects/app/src/migration/tasks/README.md"
  - "packages/global/migration/schema.ts"
  - "packages/global/openapi/admin/system/migrations/index.ts"
  - "packages/service/common/mongo/indexManager.ts"
routes:
  - "GET /api/admin/migrations/list"
  - "GET /api/admin/migrations/failedRecords"
  - "POST /api/admin/migrations/retry"
  - "GET /api/support/openapi/list"
  - "GET /api/support/openapi/health"
  - "POST /api/v2/chat/completions"
related:
  - "FG-ADMIN-MAINTENANCE-001"
  - "FG-INTEGRATION-OPENAPI-002"
  - "FG-PERMISSION-RESOURCE-002"
baseline: "d09b4e8849d051182ef4011470945d2b71085807"
---

# 历史 API Key 分类回填与绑定语义一致性

## 用例简介

历史记录缺少 type 时，以已有 appId 确定个人密钥或应用 Key，并保证回填前后运行时推断、管理列表和实际调用遵循同一规则。回填只补分类，不更换凭证或删除旧字段；异常数据、并发变化及中断恢复不得让应用凭证降级成个人凭证。

## 前置准备

- 正式任务为 4.18.0 的 `20261104_backfill_openapi_key_type`，独立自动、非阻塞；阶段为 keys/validation。

- 必须用独立可回收 Mongo/日志库、真实 Redis 与匹配 App 节点，不能在共享开发库插入坏 Key 或重置系统迁移。记录管理员身份、任务 ID、节点版本与运行时归属；准备能在指定批次提交后、checkpoint 前中断 worker 的能力。
- H0 的 Key 均有合法 teamId/tmbId，凭证仅在执行器内存保存；从实际 MongoOpenApi 模型取得物理集合 Ckey。各行使用独立 H0 副本，保存原 BSON 快照，快照对外脱敏。API 调用可能改变 lastUsedTime/usagePoints，因此迁移字段不变的比较在暂停业务请求的窗口进行。

| 夹具 | 原始 type / appId | 分类依据 |
| --- | --- | --- |
| H1 | type 缺失；appId=W 的合法 String | app，保留 W |
| H2 | type 缺失；appId 分别缺失/null/空串 | personal；不删除原空字段 |
| H3 | 已有 type=app、有效 W；已有 type=personal、无绑定 | 不覆盖已声明类型 |
| H4 | type 缺失；appId 合法但应用已删除 | app，凭证不可调用，不降级 personal |
| H5 | type 缺失+非空非法 appId；未知 type；type=app 缺 appId；type=personal 带有效绑定 | 异常，禁止静默回退 |
| H6 | 与 H1 相同，带 appName/source 类历史附加字段、tagIds、limit、usagePoints | 只增加 type；旧字段保留 |

- 为 H1 的归属成员 A 取消 W 的应用 ACL；另外保留 A 对 X/D 的权限，验证 H1 即使回填前也按应用凭证只允许 W 对话。H2 对照仍按个人权限调用。借用 RESOURCE-002 的可控工作流和响应验证，不复制其全部输入矩阵。
- 观测：管理员 GET migrations/list 观察 pending/running/succeeded/failed；独立自动任务不调用 start。失败后按正式 task/stage 读取 failedRecords，再 POST retry 的 `{migrationId:正式ID}`。每 2 秒轮询、最长 10 分钟；超时保存状态，不直接写迁移状态集合。
- 只读投影示例：`db.getCollection(Ckey).find({_id:{$in:keyObjectIds}},{type:1,appId:1,teamId:1,tmbId:1,name:1,appName:1,tagIds:1,limit:1,usagePoints:1,createTime:1,lastUsedTime:1})`；明文只在私有测试进程中比较恒等或摘要，checkpoint/日志/失败记录中不得出现 apiKey。查询与错误数据均按本例白名单定位。
- 清理销毁本例数据库/团队和故障配置；不手工重置真实迁移任务，不执行不理解 type 的版本回滚。测试 API 行与纯迁移行分开副本，防止业务调用的合法更新干扰回填比较。

## 测试步骤

| 子场景 | 类型与起始状态 | 输入与操作 |
| --- | --- | --- |
| H-C1 | 分类；独立 H0，暂停回填后先观察 | 启动新版本并控制 worker 尚未处理本例记录，读取 H1～H6 的运行时分类、列表和 health；放行自动任务并等终态，读取记录与失败清单。 |
| H-C2 | 权威语义；H1/H2 的独立副本 | 分别在实际回填前后执行 H1 对 W/X/D 的调用，以及 H2 的成员权限对照；查询应用/个人列表和个人标签计数。确保夹具调用只在该副本进行。 |
| H-C3 | CAS；独立 H1/H3 | 扫描读完一条记录后，通过隔离数据库故障夹具使该条已被合法填 type、删除记录，或改变尚未分类记录的原始 appId，再放行条件写入。记录每个实际并发变更；这不是对外开放修改绑定的接口。 |
| H-C4 | 恢复；独立 H0，含 H5 | 复用 MAINTENANCE-001 的批次提交后/checkpoint 前中断方法，替换为当前正式任务；恢复 worker。确保失败记录已被游标越过，再修复本例 H5 并通过框架 retry。 |
| H-C5 | 幂等与晚到记录；纯迁移副本 | 在合法完成的独立副本通过框架测试入口重放同一业务任务，检查 H3/H6；固定扫描上界后另建一条缺 type 的历史形态记录，检查运行时分类，不擅自改已成功任务状态。 |
| H-C6 | 查询计划与上线；有效数据副本 | 核对实际 defineIndex 声明、getIndexes，预置一条不冲突的客户自建索引；对当前应用列表和个人列表的真实过滤使用 explain。记录所有鉴权节点版本，完成升级后再验收对外应用 Key 入口。 |

## 预期结果

公共断言：迁移只给需要的历史记录补 type，不改 Key._id/明文、appId/tmbId、历史标签、额度、用量、时间或旧字段；与并发写入比较时逐项扣除已记录的真实外部变更。运行时、列表、CRUD 和 health 的类型判定一致，未知或冲突数据不能取得个人权限；任务未结束不代表业务必须阻塞。

| 子场景 | 特有预期 | 证据获取方式 |
| --- | --- | --- |
| H-C1 | H1/H6→app，H2 各空形态→personal，H3 保留；H4 保留 app 且不能调用；H5 形成精确失败清单，存在未处理异常时任务不能 succeeded。列表在回填前后不串类型，旧字段逐项保留。 | H0→目标映射、列表/health、任务进度与失败记录；新增字段契约以正式实现为准。 |
| H-C2 | H1 回填前后均能在 A 无 ACL 时调用 W 对话，但不能访问 X/D 或非对话接口；H2 仍受成员权限约束。合法历史绑定 Key 出现在 W 应用列表，个人标签计数不继续统计它。不能靠“所有旧 Key 默认 personal”暂时放行。 | 前后相同请求、实际执行资源与消息、两类列表及标签计数。 |
| H-C3 | 条件未命中后重读分类/确认删除；不覆盖已填 type，不覆盖新的 appId，不把未验证记录直接算成功。改变 appId 的故障夹具最终分类与当前权威值一致；新接口本身仍禁止改绑定。 | 实际条件命中情况、并发时间线和最终字段差集。 |
| H-C4 | 提交后中断可安全重放；优先重试已跳过失败项，完整失败快照先于 checkpoint 持久化。修复后框架收敛 succeeded 和错误清单；整个过程中明文及旧字段不变，无凭证进入错误/断点。 | 中断前后 checkpoint/错误摘要、任务终态及私有恒等比较。 |
| H-C5 | 再次执行分类结果不漂移、不生成新 Key、不重复修改统计；晚到的缺 type 记录仍可按同一规则推断，即使不在已固定扫描上界内。已有 type 不被丢掉或强制重写。 | 重放前后 BSON 差集、记录数量、晚到记录的实际调用/列表。 |
| H-C6 | 实际查询只命中目标类型/应用/本人；索引与代码声明一致，未经确认的旧索引和客户索引不被删。记录所选索引、扫描量和数据规模，不自定未确认的耗时门槛。回填不能使旧节点自动理解权限边界，未升级节点不得被计入已完成安全验收。 | 真实查询/explain、精确索引差集、节点版本与上线顺序。 |

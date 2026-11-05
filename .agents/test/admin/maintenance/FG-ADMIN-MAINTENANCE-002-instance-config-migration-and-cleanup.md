---
case_version: 1
id: "FG-ADMIN-MAINTENANCE-002"
title: "4.18 实例配置迁移：旧值回填、幂等重跑与废弃字段清理"
business: "admin/maintenance"
types:
  - "integration"
  - "ui"
category: "boundary"
scenario: "special"
priority: "P0"
status: "draft"
tags:
  - "instance-config"
  - "migration"
  - "legacy-env"
  - "backfill"
  - "idempotency"
  - "deprecated-fields"
  - "block-startup"
  - "覆盖基础场景"
  - "覆盖异常场景"
  - "覆盖边界场景"
evidence:
  - "database"
  - "log"
  - "response"
  - "ui"
sources:
  - "projects/app/src/migration/registry.ts"
  - "projects/app/src/migration/runner.ts"
  - "projects/app/src/migration/startup.ts"
  - "projects/app/src/migration/entity.ts"
  - "projects/app/src/migration/mongoSchema.ts"
  - "projects/app/src/migration/tasks/4180/20260928_migrate_instance_configs/index.ts"
  - "projects/app/src/migration/tasks/4180/20260928_migrate_instance_configs/service.ts"
  - "projects/app/src/migration/tasks/4180/20260928_migrate_instance_configs/env.ts"
  - "projects/app/src/migration/tasks/4180/20260929_cleanup_instance_config_deprecated_fields/index.ts"
  - "projects/app/src/migration/tasks/4180/20260929_cleanup_instance_config_deprecated_fields/service.ts"
  - "projects/app/src/instrumentation-node.ts"
  - "projects/app/src/service/common/system/index.ts"
  - "packages/service/common/system/systemInstanceConfig/controller.ts"
  - "packages/service/common/system/systemInstanceConfig/schema.ts"
  - "packages/service/common/system/systemInstanceConfig/runtime.ts"
  - "packages/global/common/system/config/schema.ts"
  - "packages/global/common/system/config/schemas/performance.ts"
  - "projects/app/src/pageComponents/admin/config/Migration.tsx"
  - "projects/app/src/pages/api/admin/migrations/list.ts"
  - "projects/app/src/pages/api/admin/migrations/retry.ts"
  - "projects/app/src/pages/api/admin/migrations/failedRecords.ts"
  - "projects/app/test/migration/tasks/4180/20260928_migrate_instance_configs/progress.test.ts"
  - "projects/app/test/migration/tasks/4180/20260929_cleanup_instance_config_deprecated_fields/service.test.ts"
routes:
  - "GET /api/admin/migrations/list"
  - "POST /api/admin/migrations/retry"
  - "GET /api/admin/migrations/failedRecords"
related:
  - "FG-ADMIN-CONFIG-001"
  - "FG-ADMIN-CONFIG-003"
  - "FG-ADMIN-MAINTENANCE-001"
baseline: "27d88d71f44614d89aef7d7d04fe65431ea19288"
---

# 4.18 实例配置迁移：旧值回填、幂等重跑与废弃字段清理

## 用例简介

升级到 4.18 时，系统要先把旧 `system_configs` 和历史上由环境变量提供的配置搬进 11 个 `system_instance_configs` 域，再清理已被 Schema 移除的字段；迁移必须阻塞节点就绪，避免运行时先读到默认值。本例重点验证旧库优先、只补缺失、管理员已保存值不被覆盖、重复执行无副作用，以及失败时只暴露字段路径而不泄露密钥。

## 前置准备

- 环境与版本：使用可销毁的 4.17 存量库副本和同版本 Pro 子模块，准备可停止/启动节点、控制环境变量、读取启动日志和 Mongo 的权限。必须能观察“迁移成功前业务未 ready”，不能仅以进程存活判断启动成功。
- 旧数据夹具：`system_configs` 中准备 fastgpt 文档（`feConfigs.systemTitle=DB-TITLE`、`feConfigs.limit`、`systemEnv` 若干字段）和 fastgptPro 文档（censor、fastLogin、支付/套餐、企微配置）。准备与环境变量冲突的值，例如 ENV `SYSTEM_NAME=ENV-TITLE`、`WORKFLOW_MAX_LOOP_TIMES=10`、`ALLOWED_ORIGINS=https://env.example`、`STORAGE_DOWNLOAD_URL_MODE=short-redirect`、`STORAGE_EXTERNAL_ENDPOINT=https://s3.example`、`AIPROXY_API_ENDPOINT=http://aiproxy.local`、`AIPROXY_API_TOKEN=run-aiproxy-token`、`CODE_SANDBOX_TOKEN=run-sandbox-token`、`PLUGIN_BASE_URL=http://plugin.local`、`PLUGIN_TOKEN=run-plugin-token`、`DOCUMENT_PARSE_PROVIDER=sangfor` 及同组 URL/KEY；MinIO 环境下 external endpoint 用于避免 short-redirect 在迁移后触发启动校验失败。
- 部分迁移夹具：预先写入 8 个 domain 文档，其中一个 site 文档已有管理员保存的 `name=ADMIN-SITE` 且 `explicitDefaultPaths=["description"]`；performance 文档已有 `workflow.parallelMaxConcurrency=20`；providers/auth 等域缺若干叶子。记录每个文档的 revision、overrides、explicitDefaultPaths。
- 废弃字段夹具：在对应 domain 的 overrides 写入 `site.systemTitle`、`storage.downloadRedirectTtlSeconds`、`feature.showGit`、`feature.showEmptyChat`、`vector.hnswMaxScanTuples`、`subservice.plugin.enabled`、`subservice.plugin.baseUrl`、`subservice.plugin.token`、`subservice.plugin.remoteDebugUrl`、`subservice.codeSandbox.token`、`subservice.aiProxy.token`、`subservice.mcp.enabled`、`commercial.agentSandboxFreeTip`、`commercial.payment.alipay.notifyUrl`、`commercial.billingNotify.paymentReceived`、`auth.loginProviders.dingtalk` 等本 PR 声明废弃的路径，并保留一个正常字段作为对照。
- 复位与清理：使用独立库/独立对象存储前缀；失败注入后恢复节点与 ENV；测试结束后销毁库副本或按 run 前缀清理，保留脱敏后的 `system_migration_states`、日志和前后快照。
- 验证能力：Mongo 只读查询 `system_instance_configs`、`system_configs`、`system_migration_states`、`system_migration_failed_records`；日志按启动时间窗检索 “Instance config migration/cleanup” 与错误字段；`/admin/migration` 页面可读状态/进度/结果/失败明细。
- 阻塞项：必须使用真实 4.18 注册表，不能用当前 main 的旧注册顺序替代；若 Pro 子模块或旧库副本不可用，C2/C9 的 Pro 来源场景阻塞。迁移进度轮询间隔 2 秒、最长 10 分钟，超时记录为失败，不擅自重置状态。

## 测试步骤

| 子场景 | 类型与起始状态 | 输入与操作 |
| --- | --- | --- |
| C1 | 基础；空库、无旧 ENV | 启动 4.18，等待阻塞迁移完成；只读查询 11 个 domain 文档、迁移状态和启动日志；打开首页与 Admin 基本配置页。 |
| C2 | 基础；旧库+旧 ENV 均存在 | 启动升级，等待 ready；逐项读取 site.name、security.allowedOrigins、performance.workflow.maxLoopTimes、storage.downloadMode、subservice.aiProxy.enabled、providers.documentParse.provider、auth.defaultTeamBasicPermissionsEnabled 和 agentSandbox.common.maxPerTeam；与旧库/ENV 对照，并检查 ENV 中 AI Proxy/code sandbox/plugin 的连接 Token 与 plugin baseUrl 是否被误写进 DB。 |
| C3 | 边界；承接 C2，已有管理员值与 explicitDefaultPaths | 启动后检查 site.description 是否被 ENV 回填、site.name 是否保持 ADMIN-SITE、auth 缺失字段是否补齐、已有 passwordExpiredMonth 是否被覆盖；记录 revision 与 explicitDefaultPaths。 |
| C4 | 边界；完整实例 | 4a：直接重启，记录 migrate 是否 skipped、revision 是否变化。4b：删除一个 domain 文档后重启，记录新建范围和其余 domain revision。 |
| C5 | 异常；performance 跨字段冲突 | 保持已有 `parallelMaxConcurrency=20`，注入 `WORKFLOW_MAX_LOOP_TIMES=10` 与独立的 `PARSE_FILE_TIMEOUT_SECONDS=1200`，启动；查看 performance 的最终值、explicitDefaultPaths、日志告警和 ready 状态。 |
| C6 | 异常；非法 ENV 与可净化旧值 | 6a：注入 `PASSWORD_LOGIN_MINUTE_LIMIT_COUNT=abc`，启动并记录错误、节点 ready 状态；修复后重启。6b：另一副本注入 `WORKFLOW_PARALLEL_MAX_CONCURRENCY=0`（旧 IntSchema 可读、新 Schema 要求正整数），启动并记录 sanitized warning 与生效值。 |
| C7 | 边界；废弃字段夹具 | 启动后检查各 domain 的废弃路径是否删除、正常字段是否保留、revision 是否只在删除时递增；再次重启，比较第二次的 revision 和日志。 |
| C8 | 基础；迁移 UI | 打开 `/admin/migration`，记录两个任务的状态、progress、result；打开失败明细（如有），检查是否只显示字段路径/脱敏信息。 |

## 预期结果

公共断言：迁移成功后 `system_instance_configs` 必须恰好覆盖 11 个 domain；已有管理员值优先于旧库和 ENV，旧库优先于 ENV，二者都缺时使用 Schema 默认值；重复执行不覆盖已有值、只补缺失域/字段。blockStartup 任务完成前节点不得进入 ready；失败、超时或残留废弃字段时不能伪造 succeeded。日志、迁移结果和 UI 不得出现密钥原文。

| 子场景 | 验证方式 | 特有预期 | 证据获取方式 |
| --- | --- | --- | --- |
| C1 | DB + log + UI | 11 个文档均存在，revision=1，overrides 为空或仅含非默认 seed，updatedBy.actor=migration；`20260928_migrate_instance_configs` 与 `20260929_cleanup_instance_config_deprecated_fields` 均为 succeeded，inspect/migrate/validate/cleanup/validation 阶段成功；首页和配置页使用默认值正常打开。 | 文档计数/投影、迁移状态、启动日志。 |
| C2 | DB + log | `site.name=DB-TITLE`，不是 ENV-TITLE；ENV 的 allowedOrigins 转为去重数组；workflow.maxLoopTimes=10；storage.mode=short-redirect；AI Proxy 因 endpoint 存在而 enabled=true；Sangfor provider 被选中且 URL/KEY 来自同一来源组，不拼接旧库 URL+ENV KEY；maxPerTeam 的旧库 `null` 保持“不限量”，不被 ENV 配额覆盖。`subservice` 只保存运行策略，不出现 `plugin.baseUrl/token`、`codeSandbox.token`、`aiProxy.token`；这些 ENV 值不能被迁移或 API 读取回 DB 快照。等于默认值的旧值被剪枝，不写入 overrides。 | 各 domain overrides/effective、旧库与 ENV 对照表、subservice 文档字段集合。 |
| C3 | DB | `site.name` 保持 ADMIN-SITE；`site.description` 因 explicitDefaultPaths 不被 ENV 补写，保持用户清空后的默认值；auth 只补缺失的 openApiKeyMaxCount，已有 passwordExpiredMonth 不变；发生补写的 domain revision 递增，未补写的不变。 | site/auth 文档、revision 与 explicitDefaultPaths。 |
| C4 | DB + log | 4a：`skipped=true`，migratedDomainCount=0，validate 仍标记 succeeded，所有 revision 不变。4b：仅缺失 domain 被新建，其余域的 overrides/revision 不变，最终仍为 11 个；进度 current 不超过 total=11。 | 迁移 result、domain 差集、revision。 |
| C5 | DB + log | 冲突字段 `workflow.maxLoopTimes` 不被写入，保持默认/已有值；`workflow.parallelMaxConcurrency=20` 保留；独立字段 `parse.fileTimeoutSeconds=1200` 正常迁入；冲突路径写入 explicitDefaultPaths，日志有 “skipped conflicting field” 告警；最终 validate 成功、节点 ready，不死循环重启。 | performance 文档、explicitDefaultPaths、日志、ready 时间线。 |
| C6 | log + DB | 6a：迁移 failed，错误只包含变量名 `PASSWORD_LOGIN_MINUTE_LIMIT_COUNT`，不包含值；节点未 ready；修正后重跑成功。6b：非法 `parallelMaxConcurrency=0` 被剔除并记录 sanitized warning，不阻塞启动，生效值回落到 Schema 默认值；不得把 `0` 留给运行时。 | 失败状态/错误文本、日志、performance 文档。 |
| C7 | DB + log | 所有声明的废弃路径被删除，正常字段保留；仅实际删除的 domain revision+1，清理任务 validation 通过且无 remaining/invalid；第二次启动不写库、revision 不变。未在 deprecated 列表中的字段不被该任务主动删除；若其导致 strictObject 不可解析，任务必须 failed 并保留现场，而不是静默通过。 | 清理前后文档 diff、revision、validation 状态。 |
| C8 | UI | 两个任务展示 succeeded/进度/结果；进度 current/total 合理，失败明细只包含路径/阶段/脱敏数据；页面不展示 Token、密钥或请求正文。 | 页面截图、`/api/admin/migrations/list` 与 failedRecords 响应。 |

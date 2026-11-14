---
case_version: 1
id: "FG-INFRA-DATABASE-002"
title: "启动期索引同步：补建当前索引与精确清理废弃索引"
business: "infra/database"
types:
  - "integration"
category: "boundary"
scenario: "special"
priority: "P1"
status: "draft"
tags:
  - "mongo-index"
  - "sync-index"
  - "deprecated-index"
  - "startup"
  - "customer-index-protection"
  - "覆盖基础场景"
  - "覆盖异常场景"
  - "覆盖边界场景"
evidence:
  - "database"
  - "log"
sources:
  - "packages/service/common/mongo/index.ts"
  - "packages/service/common/mongo/indexManager.ts"
  - "packages/service/common/mongo/schemaIndexes.ts"
  - "packages/service/support/user/team/teamMemberSchema.ts"
  - "packages/service/test/common/mongo/indexManager.test.ts"
  - "document/content/self-host/config/env.mdx"
routes: []
related:
  - "FG-INFRA-DATABASE-001"
  - "FG-ADMIN-MAINTENANCE-002"
baseline: "27d88d71f44614d89aef7d7d04fe65431ea19288"
---

# 启动期索引同步：补建当前索引与精确清理废弃索引

## 用例简介

4.18 起 MongoDB 索引在启动时固定同步，不再提供关闭开关。节点加载模型后应补建 Schema 声明的当前索引，并只删除 Schema 明确登记且 name+key 匹配的历史索引；客户自建索引、同名但不匹配的索引和当前索引创建失败的场景都必须保留现场。

## 前置准备

- 环境与版本：独立可销毁 Mongo 实例和同 commit 应用；使用默认启动配置，验证索引同步固定执行。记录启动时间、Mongo 连接串只读账号和日志采集位置。
- 测试集合：使用 `team_members`。当前 Schema 声明 `teamId_1` 与唯一索引 `userId_1_teamId_1`，并显式登记废弃索引 `userId_1`（`{userId:1}`，`deprecated:true`）。测试前删除/重建索引，使 `userId_1_teamId_1` 缺失、`teamId_1` 存在、`userId_1` 存在；另建客户自建索引 `customer_keep_1`，记录 `getIndexes()` 完整快照和每个索引的 key/name/unique/partialFilterExpression。
- 故障夹具：C3 建一个名为 `userId_1` 但 key 为 `{teamId:1}` 的索引；C4 建一个名为 `teamId_1` 但 key 不匹配的冲突索引。两者都在独立副本执行，不污染基线。
- 验证能力：Mongo `getIndexes()`、`explain()`（只读）和启动日志；索引同步为异步、非阻塞，轮询每 2 秒、最长 60 秒，超时记录为阻塞而不是“索引已存在”。不要对生产库执行删除索引的破坏性步骤。
- 复位与清理：测试后按 run 前缀重建/删除测试索引，恢复数据库副本；保留脱敏的索引快照和日志。若环境不允许创建/删除索引，C1-C4 全部阻塞。

## 测试步骤

| 子场景 | 类型与起始状态 | 输入与操作 |
| --- | --- | --- |
| C1 | 基础；缺失当前索引 | 启动应用并登录 root/访问成员列表以加载 `team_members` 模型；等待模型加载和索引同步完成；轮询 `db.team_members.getIndexes()`，记录新增索引；同时检查启动日志。 |
| C2 | 基础；废弃索引与客户索引并存 | 在 C1 基线上保留 `userId_1` 和 `customer_keep_1`，重启应用并再次触发成员模型加载；记录两者在同步后的存在性、日志中的 dropped 数量和 warning。 |
| C3 | 边界；同名不同 key | 用独立副本创建 `userId_1`（key=`{teamId:1}`），启动；记录该索引是否保留、warning/错误日志和 `getIndexes()`。 |
| C4 | 异常；当前索引创建失败 | 创建名为 `teamId_1` 的冲突索引（key 不匹配），保留废弃 `userId_1`，启动；记录 `createIndexes` 失败、废弃索引是否仍存在、错误日志和后续重试行为。 |
| C5 | 边界；并发模型加载 | 启动后同时触发多个会加载 `team_members` 模型的 API 请求；记录索引同步日志次数、错误数、最终索引快照。 |
| C6 | 边界；无变更重启 | 在 C1/C2 成功状态直接重启，记录是否重复删除/创建、revision/业务数据是否变化、客户索引是否仍在。 |

## 预期结果

公共断言：启动时固定执行安全索引同步；当前索引必须先创建成功，之后才允许清理废弃索引。只有 Schema 通过 `defineIndex(..., { deprecated: true })` 登记、且数据库中 name 与 key 精确匹配的索引才可删除；text 索引的 `_fts/_ftsx` 形态按实现兼容。任何 Schema 外未知索引只在日志中报告，不删除。索引同步失败不得回滚业务配置或阻塞已声明的非索引启动步骤，但必须留下可定位的错误日志。

| 子场景 | 验证方式 | 特有预期 | 证据获取方式 |
| --- | --- | --- | --- |
| C1 | DB + log | 60 秒内出现 `userId_1_teamId_1`（unique）和缺失的当前索引；启动后自动执行；日志有索引同步记录，业务请求不因等待索引而失败。 | `getIndexes()`、启动日志。 |
| C2 | DB + log | `userId_1` 被删除；`teamId_1`、`userId_1_teamId_1` 保留；`customer_keep_1` 不被删除；日志 `dropped=1`，不出现客户索引删除记录。 | 索引前后差集、日志。 |
| C3 | DB + log | 同名但 key 不匹配的 `userId_1` 保留，不能被删除；出现 definition mismatch warning；当前索引仍正常创建。 | 索引 key/name、warning 日志。 |
| C4 | DB + log | `createIndexes` 失败，废弃 `userId_1` 不得被清理；有明确错误日志；后续重启仍会重试当前索引，不能把清理成功凌驾于建索引失败之上。 | 日志、索引快照、重启后重试记录。 |
| C5 | DB + log | 同一进程/Model 的并发调用复用同一同步任务，不出现重复 drop 或重复创建错误；最终索引集与单次启动一致。若日志无法区分任务次数，本行记录为观测不足。 | 日志时序、最终索引。 |
| C6 | DB + log | 无变更重启不重复删除、不产生新的索引变更；客户索引仍存在；业务数据/配置 revision 不受影响。 | 两次 `getIndexes()` 对比、日志、DB 快照。 |

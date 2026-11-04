---
case_version: 1
id: "FG-INFRA-DATABASE-001"
title: "Mongo 历史对话状态兼容与废弃索引安全清理"
business: "infra/database"
types: [api, integration]
category: boundary
scenario: special
priority: P1
status: ready
automation:
  - runner: node
    script: .agents/test/infra/database/FG-INFRA-DATABASE-001.mjs
    items: [C1, C2, C3]
tags: [pr-8044, mongo-index, legacy-chat-status, 覆盖基础场景, 覆盖边界场景]
evidence: [response, database, cache, log]
sources:
  - packages/service/core/chat/chatSchema.ts
  - packages/service/core/chat/chatItemSchema.ts
  - packages/service/core/chat/generationLease.ts
  - packages/service/core/chat/utils/prepare.ts
  - packages/service/core/chat/constants.ts
  - packages/service/common/mongo/index.ts
  - packages/service/common/mongo/indexManager.ts
  - packages/service/test/common/mongo/indexManager.test.ts
  - projects/app/src/pages/api/core/chat/history/getHistories.ts
  - projects/app/src/pages/api/core/chat/history/getHistoryStatus.ts
routes:
  - "POST /api/v2/chat/completions"
  - "POST /api/core/chat/history/getHistories"
  - "POST /api/core/chat/history/getHistoryStatus"
related: [FG-CHAT-CONVERSATION-001, FG-CHAT-HISTORY-001]
baseline: "5a5211f70998f5311cd40b0e5362a1414be6fbdf"
---

# Mongo 历史对话状态兼容与废弃索引安全清理

## 用例简介

历史会话仍可能保留 Mongo 状态字段及旧扫描索引。新版本应只使用 Redis lease 决定运行状态，同时安全删除明确废弃的项目索引，保留客户自建索引和历史业务数据。

## 前置准备

- 脚本配置见 [流、列表与数据库测试配置](../../../skills/system/fastgpt-integration-test-runner/references/stream-history-database.md)。环境准备器同时建立数据库名称与 marker 保护；历史变量需在测试应用中声明，避免产品正常过滤未声明变量被误判为兼容问题。索引脚本复用当前 Chat Schema，不能复制 Schema 丢失废弃索引声明。

- 必须使用独立 Mongo 测试库/集合和专用进程；索引是集合级操作，不能因为文档带 RUN 就在共享 DEV 集合中测试删除索引。准备和清理均只在私有库进行。
- 使用新建测试应用和正常入口创建记录，再用原生 collection 写入测试专有历史字段：分别为 `chatGenerateStatus=0/1/2`，包含有/无 sourceType 的 App 历史文档。保存完整文档和 `getIndexes()` 快照；避免 Mongoose strict 模式丢弃待构造字段。
- 索引基线 I0：旧项目索引 `chatGenerateStatus_1_updateTime_1`，key 为 `{chatGenerateStatus:1, updateTime:1}`，partialFilterExpression 为 `{chatGenerateStatus:0}`；另有名称不同的自建索引。I1 独立私有库：使用同名但 key 不同的索引。I2：旧索引已经缺失。
- 启动新版本导入真实 Chat model，观察自动索引同步完成；自动同步需启用 `SYNC_INDEX` 且不处于 test/production-build 阶段。也可显式调用 `MongoIndexManager.syncModelIndexes({model: MongoChat})` 独立复验，返回后读取真实索引清单。禁止 `syncIndexes()` 一键删除 schema 外索引代替本项目管理器。
- API/Redis/日志取证沿用相关用例；索引同步最长等待 60 秒，未完成记阻塞并保存管理器结果。测试后删除私有库和测试应用，不迁移或全表 unset 共享环境。

## 测试步骤

| 子场景 | 类型与起始状态 | 输入与操作 |
| --- | --- | --- |
| C1 | 边界场景；旧字段为 0/1/2 的独立会话 | 保持无 lease 时读取列表/状态并发起新生成；另在 Mongo 旧值为 1 或 2 时启动健康 A lease，读取状态。完成后比较原文档和新消息字段。 |
| C2 | 基础场景；I0 | 运行真实索引同步，保存清理报告及索引差集；再运行一次确认重复执行安全。 |
| C3 | 边界场景；I1、I2 分别复位 | 对同名不同 key、旧索引缺失两种状态运行同步，比较实际数据库索引和结果；检查其他当前索引仍可用。 |

## 预期结果

公共断言：查询按测试团队/资源/chatId 限定，索引验证按独立库限定。成功生成保留正常标题、变量、已读、用量和消息错误语义，不因移除会话状态而清除历史内容；旧字段不需要全表删除。

| 子场景 | 验证方式 | 特有预期与证据 |
| --- | --- | --- |
| C1 | API、数据库、缓存 | 无 lease 一律返回状态 1，历史 generating 不阻止下一轮；有 lease 返回 0，不受旧 idle/error 值影响。不返回会话 error 枚举，新文档不新增状态字段，旧字段可以原样保留且不再作为心跳更新。原消息、变量和错误仍可读取。 |
| C2 | 数据库、日志 | 当前索引先创建成功，再删除 name+key 精确匹配的旧项目索引；差集只包含本次合法变更，自建索引保留。重复执行不误删、不报旧索引必须存在。保存 cleanupReport 和前后 getIndexes。 |
| C3 | 数据库、日志 | 同名不同 key 为 `skip_mismatch` 且不删除，缺失为 `skip_missing`；不把所有 Schema 未声明索引当废弃项，当前索引及自建索引继续保留。 |

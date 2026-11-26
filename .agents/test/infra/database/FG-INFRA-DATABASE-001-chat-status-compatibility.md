---
case_version: 1
id: "FG-INFRA-DATABASE-001"
title: "Mongo 历史对话状态兼容"
business: "infra/database"
types: [api, integration]
category: boundary
scenario: special
priority: P1
status: ready
automation:
  - runner: node
    script: .agents/test/infra/database/FG-INFRA-DATABASE-001.mjs
    items: [C1]
tags: [pr-8044, legacy-chat-status, 覆盖基础场景, 覆盖边界场景]
evidence: [response, database, cache, log]
sources:
  - packages/service/core/chat/chatSchema.ts
  - packages/service/core/chat/chatItemSchema.ts
  - packages/service/core/chat/generationLease.ts
  - packages/service/core/chat/utils/prepare.ts
  - packages/service/core/chat/constants.ts
  - projects/app/src/pages/api/core/chat/history/getHistories.ts
  - projects/app/src/pages/api/core/chat/history/getHistoryStatus.ts
routes:
  - "POST /api/v2/chat/completions"
  - "POST /api/core/chat/history/getHistories"
  - "POST /api/core/chat/history/getHistoryStatus"
related: [FG-CHAT-CONVERSATION-001, FG-CHAT-HISTORY-001]
baseline: "5a5211f70998f5311cd40b0e5362a1414be6fbdf"
---

# Mongo 历史对话状态兼容

## 用例简介

历史会话可能保留 Mongo 状态字段。新版本应只使用 Redis lease 决定运行状态，保留历史业务数据。集合索引升级由 indexManager 旁的专项测试验证，不在业务用例中执行。

## 前置准备

- 使用现有本地 dev 和 Mongo/Redis，不新建独立实例或数据库。配置见[流、列表与数据库测试配置](../../../skills/system/fastgpt-integration-test-runner/references/stream-history-database.md)。历史变量需在本轮测试应用声明，避免正常过滤被误判为兼容问题。
- 用正常入口创建本轮测试应用和记录，再按 teamId/appId/chatId 精确限定，使用原生 collection 写入 `chatGenerateStatus=0/1/2`，分别保留/移除 sourceType。保存完整文档，不修改其他 dev 记录。
- 通过真实 API、gate、Redis 和 Mongo 核对运行状态，结束按本轮 ID 回收会话和应用。不改共享索引，不全表 unset。

## 测试步骤

| 子场景 | 类型与起始状态 | 输入与操作 |
| --- | --- | --- |
| C1 | 边界场景；旧字段为 0/1/2 的独立会话 | 保持无 lease 时读取列表/状态并发起新生成；另在 Mongo 旧值为 1 或 2 时启动健康 A lease，读取状态。完成后比较原文档和新消息字段。 |

## 预期结果

公共断言：查询按测试团队/资源/chatId 限定。成功生成保留正常标题、变量、已读、用量和消息错误语义，不因移除会话状态而清除历史内容；旧字段不需要全表删除。

| 子场景 | 验证方式 | 特有预期与证据 |
| --- | --- | --- |
| C1 | API、数据库、缓存 | 无 lease 一律返回状态 1，历史 generating 不阻止下一轮；有 lease 返回 0，不受旧 idle/error 值影响。不返回会话 error 枚举，新文档不新增状态字段，旧字段可以原样保留且不再作为心跳更新。原消息、变量和错误仍可读取。 |

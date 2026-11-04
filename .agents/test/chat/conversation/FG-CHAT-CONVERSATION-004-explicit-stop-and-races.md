---
case_version: 1
id: "FG-CHAT-CONVERSATION-004"
title: "主动停止的跨实例传递与迟到清理保护"
business: "chat/conversation"
types: [api, ui, integration]
category: abnormal
scenario: failure
priority: P1
status: ready
tags: [pr-8044, workflow-stop, generation-lease, 覆盖基础场景, 覆盖异常场景, 覆盖边界场景]
evidence: [response, ui, database, cache, log]
sources:
  - packages/service/core/chat/stop.ts
  - packages/dal/redis/caches/workflowStopSignal.ts
  - packages/dal/redis/lease/chat/chatGenerationLease.ts
  - packages/service/core/chat/generationLease.ts
  - projects/app/src/pages/api/v2/chat/stop.ts
  - packages/global/openapi/core/chat/controler/api.ts
  - pro/admin/src/pages/api/core/chat/chatAgentHelper/completions.ts
  - pro/admin/src/service/core/ai/workflowBuilder/handler.ts
routes:
  - "POST /api/v2/chat/stop"
  - "POST /api/v2/chat/completions"
related: [FG-CHAT-CONVERSATION-005, FG-INFRA-RUNTIME-002]
baseline: "5a5211f70998f5311cd40b0e5362a1414be6fbdf"
---

# 主动停止的跨实例传递与迟到清理保护

## 用例简介

主动停止通过共享 Redis 信号通知执行端，停止确认和执行收尾是两个时刻。准备阶段和迟到 Redis 操作都不能删除后来发出的停止请求，正常结束后的下一轮也不应误用上一轮停止标记。

## 前置准备

- 复用 FG-CHAT-CONVERSATION-005 的独立资源、查询和清理。两个测试实例共享私有 Mongo/Redis，能分别指定发起生成及停止的实例；Workflow、Helper、Builder 各准备一个有可控等待的任务。
- stop logical key 为 `agent_runtime_stopping:{sourceType}:{sourceId}:{chatId}`，物理前缀通过 adapter 确认；记录每次 `GET/PTTL`。新值是不同的版本字符串，TTL 60 秒；历史值 `1` 单独验证。
- 私有 Redis 协议代理能够只延迟本轮获取 Lua 的执行/返回，或只延迟比较清理 Lua；记录命令发出、实际执行、回复时刻，区分“响应迟到”和“命令迟到”。不能靠固定 sleep 推断竞态已发生。
- 正常停止的 gate 放行后，最长 30 秒观察协作停止与收尾；工具执行本身不能强杀时记录实际边界，不要求 100ms 内整条任务退出。日志仅使用测试进程已配置的 sink，按 sourceType/sourceId/chatId 和测试时间窗关联。
- 竞态变体要观察清理后的 key、控制器是否收到停止及最终任务结果，不能只看停止 API 成功。结束后撤除代理规则并清理本轮标记。

## 测试步骤

| 子场景 | 类型与起始状态 | 输入与操作 |
| --- | --- | --- |
| C1 | 基础场景；A 已在实例一运行 | 从实例二调用停止 API；分别对 Workflow、Helper、Builder 重复，确认实际生成来源。停止确认后放行可协作工具，等待收尾，再启动下一轮。 |
| C2 | 边界场景；独立新会话 | 分别预置上一轮 stop、历史 stop 值 `1` 后启动；另在 lease 获取完成、停止控制器首次读取之前发出新停止。 |
| C3 | 边界场景；新 D0 | 使获取 Lua 超过 3 秒才执行或返回；接口已降级放行后写入新 stop，再交付迟到获取结果。 |
| C4 | 边界场景；存在旧 stop=S0 | 获取成功读到 S0 后暂停 CAS 清理；重新停止写入 S1，再执行旧清理。独立变体让本次旧 stop 清理报错。 |
| C5 | 异常场景；A 在 gate，Redis 代理按命令隔离 | 分别使 stop 写入失败、stop 读取失败；读取失败后撤除故障重新读取/重新发停止。避免同时破坏 lease 以混淆结果。 |

## 预期结果

公共断言：主动停止以真实停止标记及后续任务收尾判定，断开 SSE 不能代替停止确认。所有操作只影响同一完整会话标识；sourceId 大小写与 lease 一致。停止成功不等于后台结果已经保存。

| 子场景 | 验证方式 | 特有预期与证据 |
| --- | --- | --- |
| C1 | API、缓存、数据库、UI | 写入确认返回 `success=true, completed=false`，`chatGenerateStatus` 是当时 lease 快照，不承诺已经空闲。执行端跨实例观察并锁存停止，finally 清理控制器与 lease；下一轮不会被旧停止误伤。 |
| C2 | API、缓存 | 确认新获取成功后只清旧快照；历史 `1` 可识别。准备阶段后来发出的新 stop 被控制器首次读取并保留，不能在 workflow 启动时被无条件清空。 |
| C3 | 缓存、日志、API | 超时放行后不会因迟到成功启动续租、释放或旧 stop 清理；迟到获取 Lua 本身不删除新 stop，停止信号仍能被执行端读取。若产生 lease，按原 TTL 自然回收。 |
| C4 | 缓存、日志 | S0 的迟到 CAS 不删除 S1，S1 仍可见；清理报错仅记录 `Workflow stop signal clear failed`，不把已确认租约变成获取失败，不吞新停止。 |
| C5 | API、缓存、日志 | 写失败必须返回错误，客户端不能伪装停止成功；读失败按未停止降级并记录 `Workflow stop signal read failed open`，不声称已经停止，恢复后有效 stop 可被观察。停止一旦锁存，不因后续读取或 key 消失变回 false。 |

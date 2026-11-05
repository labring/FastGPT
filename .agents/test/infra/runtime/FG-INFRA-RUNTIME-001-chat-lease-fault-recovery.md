---
case_version: 1
id: "FG-INFRA-RUNTIME-001"
title: "生成租约在进程退出与 Redis 故障下的降级和回收"
business: "infra/runtime"
types: [api, integration]
category: abnormal
scenario: failure
priority: P1
status: ready
tags: [pr-8044, generation-lease, redis-fault, accepted-boundary, 覆盖异常场景, 覆盖边界场景]
evidence: [response, database, cache, log]
sources:
  - .agents/design/bug/stream-resume-stale-reset.md
  - packages/service/core/chat/generationLease.ts
  - packages/dal/redis/lease/chat/chatGenerationLease.ts
  - packages/dal/redis/adapter.ts
  - packages/service/core/chat/resume.ts
  - projects/app/src/pages/api/core/chat/resume.ts
  - projects/app/src/pages/api/core/chat/history/getHistoryStatus.ts
  - packages/service/common/logger/client.ts
routes:
  - "POST /api/v2/chat/completions"
  - "POST /api/core/chat/history/getHistoryStatus"
  - "GET /api/core/chat/resume"
related: [FG-CHAT-CONVERSATION-001, FG-CHAT-CONVERSATION-002, FG-CHAT-HISTORY-001]
baseline: "5a5211f70998f5311cd40b0e5362a1414be6fbdf"
---

# 生成租约在进程退出与 Redis 故障下的降级和回收

## 用例简介

执行进程退出后，租约通过 TTL 回收而不等待 Mongo 状态扫描。Redis 故障时，生成获取优先降级放行，默认状态读取按空闲回退，而专用轮询读取抛错；本例验证这些已确认策略及其恢复边界。

## 前置准备

- 复用 FG-CHAT-CONVERSATION-001 的确定性工作流、限定查询和清理，但必须使用可重启的专用实例和私有 Redis。另一个观察进程直连 Redis，不经过故障代理；不能重启共享 Redis 或阻断整台 DEV 的网络。
- RESP 协议代理按本轮 key 和获取/续租/释放/MGET 命令分别注入错误、超时、延迟执行、延迟响应。记录单调时间、实际执行及回复，故障只作用指定命令；Mongo、gate 和观察连接保持健康。
- 每个场景使用新 chatId，开始前保存 owner 值、PTTL 和消息快照。观察 `GET/PTTL` 每秒一次，以消失或恢复为判据；TTL 从最后一次实际成功续租/迟到获取执行时计算，而非从发起请求时计算。
- 时间上限：租约回收为最后成功写入后 60 秒加 5 秒观察余量；恢复流无终止事件时，再允许一个 30 秒 XREAD 阻塞周期及 5 秒网络余量。获取等待上限来自 DAL 默认 3 秒，不要求整个生成请求 3 秒结束。
- 日志使用已配置的本地进程输出或 logger sink，保存测试时间窗和 sourceType/sourceId/chatId；确认当前日志级别可见 warn。没有日志读取能力时该项证据记阻塞，不以 trace 缺失证明未执行。
- 已接受边界：失租不会取消旧任务或隔离其后续共享流/变量写入；获取故障也可能与有效 owner 并发。不要把“绝不污染新轮”写成通过条件。故障数据必须隔离，观察到的影响如实记录，不能扩展到其他会话。
- 完成后撤销所有代理规则、恢复直连配置，结束或放行遗留任务，并确认本轮 lease 回收；进程崩溃遗留 AI 占位不等于生成成功。

## 测试步骤

| 子场景 | 类型与起始状态 | 输入与操作 |
| --- | --- | --- |
| C1 | 异常场景；A lease 正常续期且有恢复连接 | 记录最后续租时刻，终止仅执行 A 的测试进程，使它无法写 finally/DONE；观察 Redis、状态 API 和恢复连接，之后重启并发送下一轮。 |
| C2 | 异常场景；获取前，无 lease | 仅让获取 Lua 报错，确认请求继续进入 gate；完成一轮，观察租约命令与 Mongo。独立变体保留健康 A owner，再让 B 获取报错以确认当前放行边界。 |
| C3 | 边界场景；无 lease | 两个独立变体：获取命令在超过 3 秒后才执行；或先成功 SET、仅将回复延迟到 3.5 秒。接口已降级后交付迟到结果，完成生成并持续观察 key。 |
| C4 | 异常场景；A 有有效 lease | 先让一次续租报错，再于 TTL 内恢复；独立变体持续失败直至 lease 过期；第三个变体在私有 Redis 替换 owner 后让旧进程续租、收尾。 |
| C5 | 异常场景；A 已完成业务保存、即将释放 | 仅使释放 Lua 失败；记录最终响应和消息后恢复 Redis，观察旧 lease 自然到期。 |
| C6 | 异常场景；A lease 有效、Mongo 可读 | MGET 分别报错、超过 3 秒无响应、由测试代理返回类型或数量不匹配的结果；每个变体新建会话。分别调用列表/初始化/恢复及严格状态轮询；保持 gate 不放行，待恢复连接结束后撤除故障，再读取状态并从页面发送 B。客户端回填细节引用 FG-CHAT-CONVERSATION-002。 |

## 预期结果

公共断言：生成 lease 是 busy/idle 判据，不是执行成功证明。错误按策略分类，不将获取故障等同明确占用，不将恢复完成事件当作后台一定已完成；以直连 Redis、实际命令执行记录、数据库和响应共同判断。

| 子场景 | 验证方式 | 特有预期与证据 |
| --- | --- | --- |
| C1 | API、缓存、数据库 | 无续租后按 60 秒 TTL 回收；严格查询健康时变为 1，无需 Mongo stale cleaner。恢复连接在下一个空 XREAD 检查后退出、补持久化记录及完成事件，不永久阻塞；不得伪造最终答案。新进程下一轮可取得 lease。 |
| C2 | API、缓存、日志、数据库 | 记录 `Chat generation lease acquisition failed; proceeding without lease`，进入真实执行且正常保存；未确认 lease 不续租/释放。不要求故障期间互斥；有健康 A 时 B 也可能执行，分别记录后果而不改写为拒绝预期。 |
| C3 | API、缓存、日志 | DAL 获取约 3 秒结束等待后放行；迟到成功不启动续租、不追加释放，也不改变放行决定。迟到创建的 key 按其实际 SET 起点 60 秒到期，不能因后台仍活着继续延长；恢复后状态为空闲。 |
| C4 | 缓存、日志、API | 短故障不终止任务，恢复后同值继续续期；持续失败会过期，记录 renewal failed。确认 renew=false 后停止本地续租并记录 expired warning，旧任务仍可继续。替换 owner 的 lease 不被旧 token 续期或释放，跨轮流/变量未隔离是已接受风险，记录实际观察。 |
| C5 | API、数据库、缓存、日志 | 释放异常仅 warn，不覆盖已保存业务结果；不再续租，残余 key 由 TTL 回收。这段残留期可能仍显示 busy，不能要求立即 idle。 |
| C6 | API、缓存、数据库 | 默认读取降级为空闲，resume 可发送 `resumeCompleted`/DONE 提前结束；直连 lease 仍有效且任务未结束，不能记为后台完成。严格轮询返回错误，客户端状态保持规则见历史用例。Redis 恢复且 A lease 仍有效时又返回 busy，后续 B 明确占用可触发恢复；持续故障或 lease 已失效时不保证此补救。 |

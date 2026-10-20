# 流恢复 stale cleaner 误判与生成 lease 修复任务

## 状态

- 评审基线：主仓 `origin/main` / `340e4b677374f51ed3679afde7bb5c3487339a90`
- `pro` 子模块：主仓固定 `a1783aa6822572b7e748b20c62e7d3820a28abcd`；当前工作树为 dirty，实际提交为 `43b8a3d`，下文涉及 `pro` 的结论已对照固定提交确认
- 当前阶段：核心修复、入口接入和局部测试已完成，待最终验收与发布编排
- 结论：确认问题存在；原结论需要扩大范围；否决“继续用 `stream:resume:active` 判断生成是否存活”

## 结论摘要

当前实现把**可选的、绑定 HTTP 连接的 resume mirror 活动**，错误地当成了**后台生成任务的 lease**。

`chatGenerateStatus=generating` 同时承担两个职责：

1. 前端和恢复接口看到的生成状态；
2. 阻止同一会话进入下一轮的并发生成锁。

真正决定 cleaner 是否把会话改成 `done` 的，是 `stream:resume:active.updatedAt`。但这个 Redis key：

- 只有请求带 `x-fastgpt-stream-resume`、`stream=true` 且 Redis 未处于内存压力时才创建 mirror；
- 只在 mirror `enqueueRaw` 成功后才刷新；
- 依赖 SSE 心跳或业务事件持续写入；
- 客户端断开后会随 SSE cleanup 停止刷新；
- 在 v1、非流式、外部 API、OutLink、MCP、cron 等路径可能根本不存在。

因此 cleaner 的判据不是“后台任务是否还活着”，而是“最近有没有人往 resume mirror 写东西”。超过 2 分钟后，仍在执行的长 tool 会被误判为完成。

## 评审后的结论调整

| 事项 | 初始判断 | 专家复核后的结论 |
| --- | --- | --- |
| 触发条件 | v2 断连 + 长 tool | v1、非流式、无 resume header、OutLink、MCP、cron、Redis memory pressure 等路径同样可触发 |
| 2 分钟判定 | 依赖缺失或过期 active | 判定本身成立，但 active 不是可靠的生成存活信号 |
| 30 分钟兜底 | 可避免长期卡在 generating | 当前实现会绕过 active 检查，正常超过 30 分钟的任务也会被误判 |
| 主要风险 | 恢复流提前结束 | 还会释放生成锁，引入新旧 run 并发、状态覆盖、记录和 mirror 串流 |
| 修复思路 | 修正 SSE 心跳生命周期 | SSE 心跳只能解决部分路径，必须引入独立 generation lease 和 runId fencing |

## 方案取舍

### 否决：把 2 分钟继续调大

只能降低概率，不能解决 active 缺失、断连后停止刷新、30 分钟 fallback 和 finalizer 无 fencing 的问题。

### 否决：客户端断开后继续跑 SSE 心跳

可以覆盖部分 v2 浏览器请求，但仍然依赖 resume header 和 mirror 是否创建，也无法覆盖 v1、非流式、外部 API、OutLink、MCP、cron，且会持续向 resume stream 写入空事件。

### 否决：继续复用 `stream:resume:active`

该 key 的生命周期天然绑定 resume mirror。即使补上独立 heartbeat，也会继续混淆“生成是否存活”和“是否需要恢复流”，并阻碍后续按 run 隔离 mirror。

### 采用：`generationRunId` + 独立 lease + fencing

这是唯一能同时覆盖所有入口、后台断连执行、cleaner 误判和新旧 run 竞态的方案。代价是需要修改 Mongo schema、生成入口、finalize/fail、cleaner、resume mirror 和测试矩阵，属于跨模块修复，不适合做成只改一个常量的热修。

## 高严重度问题

### P0-1：missing active 被直接当成 stale

证据：

- `packages/service/core/workflow/utils/streamResponseContext.ts:128` 只有 `stream && enableStreamResume` 才创建 mirror。
- `packages/service/core/chat/resume.ts:209` 还要求请求头 opt-in。
- `packages/dal/redis/caches/streamResume.ts:199` 只有在 `appendStreamEntry` 成功后触发 `touchState`，见同文件 `:126`。
- `packages/service/core/chat/resume.ts:185` 中 `isStreamResumeActiveStale(undefined)` 返回 `true`。
- `packages/service/core/chat/cleanStaleGeneratingChats.ts:102` 对 stale 或 missing active 直接执行 `markChatAsDone`。

影响范围：

- v2 SSE 客户端断开后，后台 workflow 继续执行，但进入 2 分钟以上无事件的 tool。
- 客户端已经重新连接 `/resume`，但 resume 连接本身不会刷新 active。
- `stream=false` 的 v1/v2 请求。
- 不带 `x-fastgpt-stream-resume` 的外部 API。
- v1 固定 `enableStreamResume=false`，见 `projects/app/src/pages/api/v1/chat/completions.ts:348`。
- Redis memory pressure 导致 mirror 被禁用，见 `packages/service/core/chat/resume.ts:211`。
- Redis key 被 eviction、TTL 过期，或 mirror 写入失败。

### P0-2：生成锁没有 owner，cleaner 和 finalizer 可以互相覆盖

证据：

- 抢占只使用 `chatGenerateStatus != generating`，见 `packages/service/core/chat/chatGenerateStatus.ts:76` 和 `:84`。
- `finalizeChatRound` 只按 source + chatId 更新，并无条件写 `done`，见 `packages/service/core/chat/saveChat.ts:364` 和 `:387`。
- `failChatRound` 同样只按 source + chatId 更新，并无条件写 `error`，见 `packages/service/core/chat/saveChat.ts:496` 和 `:500`。
- `updateChatGenerateStatus` 没有 expected status 或 run token，见 `packages/service/core/chat/chatGenerateStatus.ts:113`。
- cleaner 的 `markChatAsDone` 只匹配 `_id + generating`，见 `packages/service/core/chat/cleanStaleGeneratingChats.ts:31`。

具体竞态：

```text
cleaner 读到旧 run 的 generating 候选
旧 run 正常结束并把状态写为 done
新请求通过 tryStartGenerateChat 进入并写为 generating
cleaner 执行 markChatAsDone，只匹配 _id + generating
=> 新 run 被错误写成 done
```

这不是单纯的状态误报。误写 `done` 会立即释放并发锁；旧任务和新任务随后可以同时写 chat 级字段、变量、统计和 mirror。

### P0-3：30 分钟 Mongo fallback 会绕过 active 检查

`packages/service/core/chat/cleanStaleGeneratingChats.ts:81` 先判断 `updateTime` 是否超过 30 分钟，`:83` 到 `:87` 直接 `markChatAsDone` 并 `continue`，不会执行 `:94` 的 Redis 检查。

`updateTime` 只在 `preChatRound` 开始时写入，见 `packages/service/core/chat/utils/prepare.ts:179`，生成过程中不会持续刷新。因此：

- 任何超过 30 分钟的正常 workflow 都会被直接判 `done`；
- 即使 active key 刚刚刷新，也无法阻止；
- 代码注释所称的“Redis 异常时兜底”与实现不一致。

### P1-1：`/api/core/chat/resume` 把 Mongo 状态当成绝对终态

`projects/app/src/pages/api/core/chat/resume.ts:181` 读取 `chatGenerateStatus`，`:184` 只要不是 `generating` 就返回 completed snapshot，并发送 `[DONE]`。

这会带来两个用户可见问题：

1. 前端 auto resume 只在 `chatGenerateStatus === generating` 时触发，见 `projects/app/src/components/core/chat/ChatContainer/ChatBox/hooks/useChatResume.ts:253`。一旦 cleaner 误写 done，刷新后不会再自动恢复。
2. cleaner 只改了 chat，没有补齐 AI item。resume 可能返回空 AI placeholder，表现为“已完成但没有回答”。旧任务稍后 finalize 时，答案又会突然写回历史。

### P1-2：mirror key 没有 run 级隔离

`packages/dal/redis/caches/streamResume.ts:109` 和 `:115` 的 key 只包含 `team/source/chat`，不包含 runId。

一旦 cleaner 误释放锁、用户立即发起下一轮：

- 新请求创建 mirror 时会清空同一组 key，见 `streamResume.ts:183`；
- 旧任务的 mirror 对象仍持有同一组 key，继续追加事件，见 `streamResume.ts:194`；
- 旧任务完成时还会对新任务的 stream/active TTL 执行 `shrinkTTLAfterComplete`，见 `streamResume.ts:220`。

结果是新旧 SSE 事件混在同一个 Redis stream，`/resume` 可能回放错误轮次的 answer/tool/done 事件。

### P1-3：ChatAgentHelper 与 v2 workflow 的断连语义不同

- v2 workflow 只在 `apiVersion === 'v1'` 创建 client abort tracker，见 `packages/service/core/workflow/dispatch/index.ts:229`。v2 的 `checkIsStopping` 只检查 Redis stop sign，见 `:259`，所以客户端断开后 workflow 继续执行。
- ChatAgentHelper 的 `runAuxiliaryGeneration` 在 `res.close` 时把 `stopping` 设为 true，见 `packages/service/core/ai/auxiliaryGeneration/service.ts:61`，processor 通过 `checkIsStopping` 协作式停止。

两者不能统一用“SSE 心跳存活”判断生成存活。ChatAgentHelper 还启用了 `autoResume`，但普通网络断开又会被当作停止信号，产品语义存在冲突。

### P1-4：stop sign 只看 chatId，且 TTL 只有 60 秒

`/api/v2/chat/stop` 只写 Redis stop sign，见 `projects/app/src/pages/api/v2/chat/stop.ts:30`；stop sign TTL 为 60 秒，见 `packages/dal/redis/caches/workflowStopSignal.ts:7`。

如果 in-flight tool 在 60 秒内不检查 `checkIsStopping`，stop 信号可能过期，任务继续执行。run 重叠时，chatId 级别的 stop sign 也可能影响错误的一轮。

### P2：现有测试和设计文档固化了错误假设

- `projects/app/test/service/core/chat/cleanStaleGeneratingChats.test.ts:49` 明确期望 missing active 被改成 done。
- `packages/service/test/core/workflow/utils/streamResponseContext.test.ts:96` 只验证 heartbeat 在 finish 后停止，没有验证断连后后台继续。
- 原设计文档把“stream 模式会持续写 Redis 并维持心跳”当作所有 stream 请求的事实，但 mirror 实际是 opt-in 且可被内存压力关闭。

## 修复架构

### 1. 三层职责彻底拆开

| 层 | 职责 | 不应承担 |
| --- | --- | --- |
| SSE heartbeat | 保持 HTTP/SSE 连接、刷新 mirror | 生成是否存活 |
| Resume mirror | 缓存并回放当前 run 的 SSE 输出 | 并发锁、stale cleaner 判据 |
| Generation lease | 表示当前 run 的执行者是否存活，提供并发互斥和 fencing | 客户端连接保活 |

### 2. 每次生成使用唯一 `generationRunId`

已在 `MongoChat` 增加：

- `generationRunId: string`
- `generationResponseChatItemId?: string`
- `generationHeartbeatAt: Date`
- `generationLeaseExpiresAt: Date`

`generationRunId` 在该轮开始时生成，并和 `chatGenerateStatus=generating` 在同一次 Mongo 写入中落库。`generationResponseChatItemId` 用于 cleaner 精确定位当前 AI placeholder。所有 finalize/fail/update 都已接收并校验该 runId。

### 3. Redis lease 为主，Mongo heartbeat 为持久兜底

优先复用现有能力：

- `packages/dal/redis/caches/lease.ts:107` 已实现自动续租、token 校验、`assertValid()` 和 lease lost AbortSignal；
- `packages/dal/redis/adapter.ts:670`、`:712`、`:743` 已提供原子 acquire/renew/release；
- 不要另写裸 `SET`/`EXPIRE`。

已实现：

- lease TTL 90 秒，每 30 秒续租；
- 同一个 heartbeat 每 30 秒更新 Mongo 的 `generationHeartbeatAt` 和 `generationLeaseExpiresAt`；
- Mongo heartbeat 失败不能立即判死，至少容忍 2 个心跳周期；
- Redis 丢失或重启时，Mongo heartbeat 仍可证明任务存活，避免全量误判；
- lease 获取失败时按“已有生成”处理，不静默降级为无锁执行。

独立 heartbeat 从 `preChatRound` 成功后开始，不依赖 HTTP response、SSE、ChatAgentHelper `res.close` 或 resume mirror。

### 4. `chatGenerateStatus` 只作为 UI 投影

不再把 `generating` 本身当作唯一并发锁。并发互斥由 lease 负责，Mongo 负责：

- 前端状态投影；
- runId / heartbeat / expiry 持久化；
- finalizer 的 fencing 条件；
- clean 操作的 CAS 判断。

### 5. finalize/fail 必须 fencing

所有 chat 级写入条件至少包含：

```ts
{
  ...chatSourceQuery,
  chatId,
  chatGenerateStatus: ChatGenerateStatusEnum.generating,
  generationRunId
}
```

如果 `modifiedCount === 0`：

- 记录 `generation ownership lost`；
- 不再写 chatGenerateStatus、variables、metadata、sourceName、updateTime；
- 不再更新 chat 级 summary/usage 投影；
- chat CAS 必须前移到 Human/AI item 写入之前，失配时抛错回滚事务；
- 不写 chat item、不处理文件、不写 app log；
- 不能覆盖新 run 的状态。

### 6. cleaner 只依据 heartbeat/lease

推荐判定：

```text
generationRunId 不存在：legacy 会话，走保守 30 分钟路径
generationHeartbeatAt 新鲜：跳过
Redis lease 存在：跳过
两者都过期/缺失：CAS 后纠正状态
```

建议把“异常中断”写成 `error`，并给 AI item 补一条可展示的错误信息，而不是写 `done`。如果产品要求写 `done`，必须有证据表明输出已经完整 finalize。

cleaner CAS 成功后还会向当前 run 的 resume stream 写入 `error + done` 终止事件，让已经连接的恢复请求立即结束，而不是继续阻塞等待。

### 7. mirror 按 run 隔离并按执行体保活

`StreamResumeParams` 增加可选 `generationRunId`，key 建议变成：

```text
stream:resume:data:{teamId}:{sourceType}:{sourceId}:{chatId}:{generationRunId}
stream:resume:active:{teamId}:{sourceType}:{sourceId}:{chatId}:{generationRunId}
stream:resume:unavailable:{teamId}:{sourceType}:{sourceId}:{chatId}:{generationRunId}
```

`/resume` 从当前 chat 读取 `generationRunId`，只读取当前 run 的 mirror。没有 runId 的旧记录继续使用 legacy key，保证灰度兼容。

Resume mirror 的 TTL 额外由 30 秒一次的 keepalive 续期。该 keepalive 在 workflow/auxiliary generation 收尾时停止，不依赖客户端 SSE 连接，因此长 tool 静默超过 mirror TTL 时历史输出不会提前丢失。

### 8. stop signal 按 run 隔离并保留滚动发布兼容

- `/api/v2/chat/stop` 从当前 chat 读取 `generationRunId`，写 run 级 stop key。
- run 级 key TTL 为 24 小时，工作流收尾主动删除，避免长 tool 期间 60 秒 stop signal 提前过期。
- 同时写 60 秒 legacy key，滚动发布期间旧实例仍能识别停止请求。
- 新实例同时检查 run 级和 legacy key。

### 9. ChatAgentHelper 断连语义

普通网络断开不再被 ChatAgentHelper 当作显式停止。只有 `/v2/chat/stop` 或 lease lost 才会终止 processor，与 `autoResume` 和工作流 v2 语义保持一致。

## 修复任务

任务依赖建议：

- T0/T1 是立即止血，可以先独立上线。
- T3/T4/T5 必须作为一个原子改造完成，不能出现 Mongo 已有 runId 但执行体没有 lease 的中间态。
- T6/T7 决定后台任务能否正确续租和防止旧 run 覆盖，必须与 T5 同批验证。
- T8 只有在 T3 到 T7 完成后才能重新开启快速清理。
- T9 可以在核心 lease 稳定后单独灰度，但必须先于新旧 run 重叠场景的规模化放开。
- T11 需要产品确认，未确认前不要改变 ChatAgentHelper 的断连停止行为。

### P0：立即止血（不含完整修复）

- [x] T0. 关闭 `stream:resume:active` 对 stale cleaner 的快速判定。
  - 在 lease + fencing 上线前，不允许 missing/stale active 直接触发 `done`。
  - 可以保留 active 供诊断，但 cleaner 不使用它。
  - 验收：v1、无 resume header、非流式请求运行超过 2 分钟不会被 cleaner 改状态。

- [x] T1. 修正 30 分钟 fallback 的顺序和 CAS。
  - 先检查 lease/heartbeat；fresh 时绝不进入 fallback。
  - `markChatAsDone` 增加 expected `generationRunId`、`updateTime` 或 heartbeat 条件。
  - 验收：cleaner 读到候选后新 run 启动，cleaner 的 CAS 必须失败或跳过。

- [x] T2. 临时将错误完成改为可观察行为。
  - 至少记录 cleaner 误判候选、旧任务后续 finalize、owner lost。
  - 增加 `/resume` 返回 completed 但 AI item 仍为空或未 finalize 的告警；完整防护依赖 T8 和 T9。

### P1：核心 lease 与 fencing

- [x] T3. 扩展 Mongo schema。
  - 新增 `generationRunId`、`generationHeartbeatAt`、`generationLeaseExpiresAt`，可选 `generationOwner`。
  - 调整 partial index，使用 `defineIndex`；旧索引按仓库规范登记 `deprecated: true`。
  - 补充 schema / indexManager 测试。

- [x] T4. 扩展 lease 生命周期。
  - 基于现有 `LeaseCache`/Redis adapter 增加可手动持有的 generation lease context，至少暴露 `runId`、`signal`、`assertValid()`、`renew()`、`release()`。
  - 保证 renew/release 使用 token CAS，不误删新 run 的 lease。
  - 补充 lease lost、renew 失败、release 竞态测试。

- [x] T5. 改造 `preChatRound`。
  - 生成 chatId 后获取 per-chat generation lease。
  - 将 runId 和 `generating` 状态在同一 Mongo 写入中落库。
  - 获取失败转换为 `chatIsGenerating`；Mongo 写入失败必须释放 lease。
  - `PreChatRoundResult` 返回 `generationRunId` 和 lease 生命周期控制接口。
  - 所有调用方都必须消费该 runId。

- [x] T6. 增加独立 heartbeat。
  - heartbeat 只能依赖生成执行体，不依赖 `res`、SSE 或 resume mirror。
  - 每 30 秒续 Redis lease，并更新 Mongo heartbeat/expiry。
  - 进程结束、异常、fence 丢失时在 finally 停止 timer 并释放 lease。
  - 非流式、外部 API、OutLink、MCP、cron 也必须启动。

- [x] T7. 给 finalize/fail 加 runId 条件。
  - `finalizeChatRound`、`failChatRound`、`updateInteractiveChat`、`updateChatGenerateStatus` 全部接收 expected runId。
  - chat 级更新使用 CAS；owner lost 时只记录并跳过。
  - AI item 更新按自己的 `dataId` 隔离，不能覆盖新 run。
  - 增加旧 run 在新 run 启动后 finalize/fail 的并发测试。

- [x] T8. 重写 stale cleaner。
  - 只使用 generation heartbeat/lease。
  - 区分 legacy runId 缺失和当前 run。
  - Redis 读失败时不执行快速清理。
  - CAS 条件包含 runId + heartbeat at read time。
  - 默认写 `error` 并补齐 AI item 错误；状态语义需产品确认。

### P1：恢复链路与路径覆盖

- [x] T9. mirror key 按 runId 隔离。
  - 修改 DAL `StreamResumeParams`、key 生成、mirror、resume、unavailable state。
  - `/resume` 从 chat 读取当前 `generationRunId`。
  - 旧记录 fallback 到 legacy key。
  - 测试旧 run 不能清理、缩短或污染新 run 的 key。

- [x] T10. 覆盖所有生成入口。
  - `projects/app/src/pages/api/v1/chat/completions.ts`
  - `projects/app/src/pages/api/v2/chat/completions.ts`
  - `projects/app/src/pages/api/core/chat/chatTest.ts`
  - `packages/service/core/ai/skill/debugChat/handler.ts`
  - `packages/service/support/outLink/runtime/service.ts`
  - `projects/app/src/service/support/mcp/utils.ts`
  - `projects/app/src/service/core/app/utils.ts`（schedule trigger）
  - `pro/admin/src/pages/api/core/chat/chatHome.ts`
  - `pro/admin/src/pages/api/core/chat/chatAgentHelper/completions.ts`
  - 验收：每条路径在 stream/non-stream、断连、长 tool 下都有 lease。

- [x] T11. 统一断连与 stop 语义。
  - 明确 v2 workflow 断连后是否继续；当前行为是继续。
  - 明确 ChatAgentHelper 是否应该因 `res.close` 自动停止；当前行为是停止。
  - 推荐：有 `autoResume` 的链路只在显式 `/v2/chat/stop` 时停止，普通网络断开不作为用户停止意图。
  - lease lost 要传入 workflow/agent loop 的 `checkIsStopping`，避免旧 run 继续产生不可逆副作用。
  - 评估 stop sign 的 runId 隔离和 TTL。

### P2：验证、灰度与观测

- [x] T12. 测试矩阵。
  - 两个请求并发抢同一 chat，只能有一个 lease。
  - generating + fresh lease 时拒绝新请求。
  - lease expired 时允许 takeover，旧 run finalize 不覆盖新状态。
  - SSE 断开后进入 2 分钟静默 tool，状态仍保持 generating。
  - v2 非流式、v1、无 header、OutLink、MCP、cron 长任务不被 cleaner 误判。
  - Redis memory pressure、key eviction、Redis 重启不导致 2 分钟误判。
  - 旧 run 和 resume mirror 交叉清理/pollution 测试。
  - Redis 故障、Mongo heartbeat 失败、进程崩溃恢复。
  - ChatAgentHelper 断连和显式 stop 的最终状态。

- [x] T13. 增加日志与关键路径可观测性。
  - lease acquire conflict / renew failure / lease lost。
  - cleaner candidate / skipped by heartbeat / corrected / CAS conflict。
  - finalizer ownership lost。
  - resume completed but missing AI item。
  - 旧 run 在新 run 启动后仍 finalize 的次数。

- [ ] T14. 分阶段发布。
  - 阶段 1：只写入 runId、heartbeat、lease，cleaner 保持保守。
  - 阶段 2：cleaner 只对带 runId 的会话启用快速清理。
  - 阶段 3：开启 run 级 mirror key 和 ownership lost 告警。
  - 阶段 4：旧实例全部下线后，再清理 legacy active key 逻辑。
  - 不要修改任何部署 `.yml`/`.yaml`；如需环境变量或部署变更，先取得明确确认。

## 已采用的决策

1. v2 workflow 和 ChatAgentHelper 在普通网络断开后继续执行并支持恢复；只有显式 stop 或 lease lost 才停止。
2. stale cleaner 的异常终态写 `error`，并给当前 AI placeholder 补错误信息，避免空回答被当成成功。
3. Redis lease 获取失败时不静默执行无锁生成；本轮按失败收口，避免并发状态失控。
4. 30 分钟 fallback 只服务没有 `generationRunId` 的 legacy 数据，新 run 只按 lease/heartbeat 判断。
5. stop signal 使用 24 小时 run 级 TTL，同时保留 60 秒 legacy key 兼容滚动发布。

## OCR 复审修复

OCR 首轮和补跑共覆盖主仓 30 个代码文件及 Pro 3 个文件。针对有效评论已补充以下修复：

- cleaner 的所有 CAS 使用读取时 lease/updateTime；补齐有 runId 但 lease 字段缺失的 fallback；AI item 回填失败不阻断后续清理。
- Redis token 丢失但 Mongo runId 仍有效时重建 token，不 abort 任务；新 run 接管时显式 abort 旧 lease signal。
- chat 状态 fencing 只允许从 `generating` 流转；finalize/fail/updateInteractiveChat 和 Pro ChatAgentHelper 都在 item 写入前做 chat CAS，失配时回滚事务。
- workflow dispatch 显式接收 `generationRunId`，不再按 chatId 反查进程内 lease。
- Auxiliary generation 启动阶段只清理 legacy stop key；每次停止检查都校验当前 runId 对应的 lease。
- stop API 的 Mongo 查询失败时降级写 legacy key；仅查询 generating 会话。
- resume 遇到旧 heartbeat 对应的 stale runId 时回退 legacy mirror。
- stop signal 双 key 并行读取；keepalive 间隔按 mirror TTL 动态计算。
- 过渡期继续写 `stream:resume:active` 仅供旧实例 cleaner 读取，新 cleaner 不依赖该 key。
- resume mirror keepalive 在 SSE context 创建后启动，并在终态、flush、`res.finish` 时幂等停止。

## 验证结果

- DAL：mirror run 隔离、run 级 stop key、滚动发布兼容、Redis lease CAS。
- Service：generation lease 续租/释放/owner lost、workflow stop 语义、resume mirror 断连保活。
- App：stale cleaner 的 legacy、heartbeat、Redis 失败、CAS 竞态、旧实例滚动发布场景。
- 入口：v1/v2、chatTest、skill debug、OutLink、MCP、schedule trigger、ChatAgentHelper 已接入 runId。
- 局部回归共 343 个测试通过；ESLint 和 `@fastgpt/dal` typecheck 通过。
- `projects/app` typecheck 仅剩仓库既有的 sandbox adapter 类型错误和缺失的 rehype 依赖；`pro/admin` typecheck/测试受当前 dirty 子模块与主仓固定版本差异影响，相关改动已通过 ESLint。

## 发布建议

本次按完整修复交付，不再拆成“只改 2 分钟”或“只延长 SSE 心跳”的临时方案。

发布时按 T14 分阶段执行：

1. 先发布 runId、heartbeat、lease、fencing 和 cleaner 改动。
2. 确认新 generating 记录都带 `generationRunId` 后，再依赖快速 cleaner。
3. 观察 ownership lost、keepalive failed、lease renew failed 和 cleaner CAS conflict 日志。
4. 旧实例全部下线后，再移除 legacy stop key 和 legacy 30 分钟路径。

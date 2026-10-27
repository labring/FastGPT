# 流恢复 stale cleaner 误判与生成 runner lease 修复

## 状态

- 当前分支：`xqvvu/refactor/chat-runner-lease`
- 基线：已合并最新 `origin/main`
- 当前阶段：Redis runner token 重构、入口接入和局部验证已完成
- 发布要求：Redis 是生成存活硬依赖，采用分阶段发布

## 问题根因

原实现把 resume mirror 的 `stream:resume:active` 错当成后台生成任务的存活信号：

- 只有开启 resume mirror 的 SSE 请求才刷新 active key。
- v1、非流式、OutLink、MCP、cron、无 resume header 等路径可能根本没有 mirror。
- 客户端断开后 mirror 停止刷新，长 tool 会被 cleaner 误判为完成。
- cleaner 误写 `done` 后会释放生成槽，旧任务继续执行并与新任务并发。
- finalize/fail 没有 owner 条件，旧任务可以覆盖新任务的 chat 状态、summary 和记录。

因此不能继续扩大 active key TTL 或心跳窗口，必须把连接心跳、恢复流和生成生命周期拆开。

## 最终设计

### 职责拆分

| 层 | 职责 |
| --- | --- |
| SSE heartbeat | 维护 HTTP/SSE 连接和 resume mirror |
| Resume mirror | 缓存并回放当前 runner 的 SSE 输出 |
| Redis runner lease | 跨实例互斥、runner 存活和 fencing |
| Mongo `chatGenerateStatus` | 客户端展示和持久化状态投影 |

### Redis runner

同一个 chat 只允许一个 runner：

```text
chat:generation:runner:{sourceType}:{sourceId}:{chatId} = runnerId
TTL 90s
```

- 获取使用 `SET NX`，已有 runner 时拒绝新请求。
- 每 30 秒按 token 续租。
- token 不匹配、key 丢失或续租超过本地 TTL 时，runner signal 立即 abort。
- 不再维护 Mongo `generationHeartbeatAt`、`generationLeaseExpiresAt`。
- Redis 作为硬依赖，不再使用 Mongo heartbeat 做第二套存活真源。

### Mongo 字段

只保留：

- `generationRunnerId`：当前 runner 的 fencing token，也用于 resume stream 隔离。
- `generationResponseChatItemId`：cleaner 精确定位当前 AI placeholder。
- `chatGenerateStatus`：`generating / done / error` 展示状态。

进入 `done/error` 时在同一个 CAS 更新中清空 runner 字段。

### 启动流程

1. 生成 `generationRunnerId`。
2. Redis `SET NX` 获取 runner token。
3. Mongo 条件占用生成状态并写入 `generating + generationRunnerId`。
4. 启动 Redis 续租。
5. 进入 `prepareChatRound` / workflow / auxiliary generation。

Mongo 条件占用仍保留一次，用于：

- 拒绝已经处于 generating 的会话；
- 滚动升级时兼容仍只读取 Mongo 状态的旧实例；
- 确保拒绝的请求不会刷新 `updateTime` 或覆盖 source 信息。

Mongo 状态不是 runner 存活判据。

### 终态 fencing

`finalizeChatRound`、`failChatRound`、`updateInteractiveChat` 和终态状态更新：

- 以 `generationRunnerId` 作为 chat 级 CAS owner。
- 不要求 Mongo 展示状态仍为 `generating`，避免旧 cleaner 错写展示状态后正常结果无法落库。
- chat CAS 位于 AI/Human item、文件和 summary 写入之前。
- owner lost 时事务回滚，不写任何本轮数据。
- 终态成功后清空 `generationRunnerId` 和 `generationResponseChatItemId`。
- 最后按 token 释放 Redis runner key。

### Cleaner

候选条件：

- 旧数据没有 runner token：`updateTime` 超过 30 分钟。
- 新数据有 runner token：`updateTime` 超过 2 分钟后进入 Redis 检查。

清理流程：

1. 尝试用同一个 Redis key 获取短 TTL cleanup token。
2. 获取失败说明仍有 runner 或其他 cleaner 正在处理，直接跳过。
3. 获取成功后按读取到的 runnerId / updateTime 做 Mongo CAS。
4. 写入 `error`，清空 runner 字段，标记 AI item 错误。
5. 向当前 runner 的 resume stream 写入 `error + done` 终止事件。
6. 释放 cleanup token。

Redis 不可用时不执行快速清理。cleaner 和新 runner 使用同一个 key，因此 cleanup 期间新 runner 无法启动；cleaner 和 finalizer 通过 Mongo CAS 竞争，只有一个能成功。

### Resume

- mirror key 按 `generationRunnerId` 隔离。
- 每次 touch 同时刷新 run 级 active key 和 legacy active key，兼容滚动升级中的旧 cleaner。
- mirror keepalive 不依赖客户端连接，长 tool 期间持续续期。
- `/resume` 先读 Mongo，再读 Redis runner token；Redis token 存在时覆盖过期的 Mongo 展示状态。
- 已完成会话直接返回数据库记录。
- 没有 runnerId 的旧数据继续使用 legacy key。

### Stop

- stop API 查询当前 `generationRunnerId`。
- 新协议写 run 级 stop key，TTL 24 小时。
- 同时写 60 秒 legacy key，兼容旧实例。
- 新实例同时检查 run 级和 legacy key。

### 断连语义

- v2 workflow 和 ChatAgentHelper 普通网络断开后继续后台执行。
- 只有显式 stop、runner lease lost 或任务自身完成才终止。
- workflow、auxiliary generation 和 Pro Workflow Builder 都消费 lease lost signal。

## 入口覆盖

- `projects/app/src/pages/api/v1/chat/completions.ts`
- `projects/app/src/pages/api/v2/chat/completions.ts`
- `projects/app/src/pages/api/core/chat/chatTest.ts`
- `packages/service/core/ai/skill/debugChat/handler.ts`
- `packages/service/support/outLink/runtime/service.ts`
- `projects/app/src/service/support/mcp/utils.ts`
- `projects/app/src/service/core/app/utils.ts`
- Pro `chatHome`
- Pro `ChatAgentHelper`
- Pro `Workflow Builder` handler 和 runner

## 任务

- [x] T1. 将生成存活真源收敛为 Redis runner lease。
- [x] T2. 删除 Mongo heartbeat / lease expiry 字段和索引。
- [x] T3. `preChatRound` 先抢 Redis runner，再占用 Mongo 生成状态。
- [x] T4. finalize/fail/interactive 使用 `generationRunnerId` fencing。
- [x] T5. cleaner 使用 cleanup token，按 runnerId/updateTime CAS。
- [x] T6. resume mirror 按 runner token 隔离，并兼容 legacy active key。
- [x] T7. `/resume` 使用 Redis runner 覆盖过期展示状态。
- [x] T8. stop signal 使用 run 级 key，并保留 legacy key。
- [x] T9. 主仓全部生成入口透传 runner token。
- [x] T10. Pro ChatHome、ChatAgentHelper、Workflow Builder 同步接入。
- [x] T11. 补充 runner lease、cleaner、resume、finalize fencing 和 Pro Builder 测试。
- [x] T12. 更新设计文档和 PR 说明。
- [ ] T13. 分阶段发布与线上观测。

## 发布顺序

1. 发布 Redis runner token、runnerId fencing 和 legacy key 双写。
2. 确认所有实例都已退出“只依赖 Mongo/stream active”逻辑。
3. 再将快速 cleaner 作为主清理路径。
4. 观察 lease acquire conflict、renew lost、cleanup CAS conflict、cleanup token failure。
5. 旧实例全部下线后再删除 legacy active / stop / 30 分钟路径。

Redis 续租失败按 runner lost 处理，不再降级为 Mongo heartbeat 继续执行。

## 验证

- DAL：runner token 隔离、legacy active key 双写、stop signal 双 key。
- Service：runner acquire/renew/lost、prepare 启动顺序、finalize/fail/interactive fencing、长任务 mirror keepalive。
- App：cleaner cleanup token、CAS 竞态、Redis 失败跳过、resume 使用 Redis 覆盖过期状态、stop API。
- Pro：ChatHome、ChatAgentHelper、Workflow Builder 全部透传 runner token，runner 消费 lease lost 和 run 级 stop key。

不修改任何部署 `.yml` / `.yaml`。

# 微信个人号（ClawBot）设计

> 本文是微信个人号发布渠道、轮询链路和消息回复语义的唯一设计文档。
> BullMQ/Redis 的通用基础设施边界见 [FastGPT Data Access Layer 设计](../common/dal/data-access-layer.md)。

## 1. 目标与边界

微信渠道通过 iLink 长轮询接收消息，经 FastGPT OutLink 工作流生成回复，再调用 iLink 发送给用户。

设计目标：

- 每个 `shareId` 同一时刻只有一条 poll 链。
- 拉取与回复解耦，慢回复不阻塞后续消息摄入。
- enqueue、stalled retry、多实例恢复不会产生重复回复。
- 推进 `syncBuf` 前保证消息已经进入 reply queue。
- 渠道下线、登出或连续错误后能够停止续链。

DAL 只拥有 Redis Cache 和 BullMQ 数据合同；iLink client、Mongo 状态、消息解析、工作流调用和渠道编排保留在 service/project。

## 2. 总体架构

```text
Wechat Publish UI
      |
      v
QR Login API ---- WechatQrLoginCache
      |
      v
MongoOutLink.app = { bindingId, token, baseUrl, syncBuf, status }
      |
      v
wechatPoll Queue ---- getUpdates ---- groupMessagesByUser
                                      |
                                      v
                                wechatReply Queue
                                      |
                                      v
                           provider adapter -> runOutlinkRuntime -> sendMessage
```

队列合同位于 `packages/dal/redis/bullmq/services/wechat.ts`，领域 processor 位于 `packages/service/support/outLink/wechat/mq.ts`。

## 3. 渠道状态

`WechatAppType` 的稳定字段：

| 字段 | 含义 |
| --- | --- |
| `token` | iLink 登录 token |
| `baseUrl` | iLink API 地址 |
| `accountId`、`userId` | 登录身份 |
| `syncBuf` | 下一次 `getUpdates` 的消费游标 |
| `status` | `online`、`offline`、`error` |
| `bindingId` | 每次扫码绑定生成的唯一标识，旧记录可无此字段 |
| `bindingFingerprint` | 该绑定对应的登录快照哈希，用于识别旧版本重绑后残留的绑定标识 |
| `qrAttemptId` | 当前可确认的扫码会话。登出撤销该会话 |
| `loginTime` | 最近登录时间 |
| `lastError` | 停止轮询的最近错误 |

状态转换：

```text
offline --扫码确认--> online --主动登出/停用--> offline
                         |
                         +--连续失败达到阈值--> error

offline/error --重新扫码--> 清空 syncBuf --> online
```

扫码先登记新的会话标识，再把二维码写入该会话的 Redis key。确认只更新仍指向该会话的渠道，同一会话只绑定一次。缓存保留至 TTL 到期，便于在落库成功但入队失败时重试。升级前在途的二维码需要重新生成。

Worker 每次执行前读取可运行的 MongoOutLink。渠道不可运行是正常结束。遇到正常结束或异常时，事件处理器重新检查当前绑定，避免旧任务结束时漏掉并行完成的重绑。

## 4. Queue 合同

### 4.1 Poll Queue

| 属性 | 合同 |
| --- | --- |
| Queue | `wechatPoll` |
| Job name | `wechatPublishPoll` |
| Job data | `{ shareId }` |
| Job ID | `wechat-poll:${shareId}` |
| Concurrency | 固定 `1000` |
| Lock | 120 秒 |
| Hard timeout | 120 秒 |
| Stalled interval | 30 秒 |
| Terminal retention | completed/failed 立即删除 |

Poll job 主要等待约 35 秒的长轮询，不执行工作流。入队筛选和回复消费复用同一套消息项解析规则。队列保存原始 iLink 消息项，供 v4.17.4 的回复 Worker 读取。媒体在获得工作流文件限制后下载。

有消息时 completed listener 立即续链；空响应延迟 10 秒，避免上游秒回空包形成热循环；failed listener 在渠道仍 online 时延迟 10 秒重试。

### 4.2 Reply Queue

| 属性 | 合同 |
| --- | --- |
| Queue | `wechatReply` |
| Job name | `wechatPublishReply` |
| Job data | `shareId`、`bindingKey`、`userId`、`items`、`contextToken`、`lastMsgId` |
| Job ID | `wechat-reply:${shareId}:${lastMsgId}`，撞到其他绑定或无绑定的存量任务时使用 `wechat-reply:${shareId}:${bindingKey}:${lastMsgId}` |
| Concurrency | 固定 `1000` |
| Lock | 30 分钟 |
| Stalled interval | 60 秒 |
| Completed retention | 最长 24 小时，最多 10,000 条 |
| Failed retention | 最近 10,000 条 |

Reply processor 使用 provider adapter 调用 `runOutlinkRuntime`，并传入稳定的 `messageId=lastMsgId`。正常任务 ID 与 v4.17.4 一致，游标写入失败后重拉时，BullMQ 可以复用仍在队列中的任务或已完成记录。完成保留策略设置在任务上，停机回滚后的旧 Worker 也能保留该记录。同一消息 ID 被另一绑定占用时，新轮询确认归属后按自己的绑定入队，已有任务继续保留。

## 5. Poll 处理顺序

一次成功 poll 的顺序固定为：

```text
1. 校验渠道状态和 token
2. 使用当前 syncBuf 调用 getUpdates
3. 判断 API ret/errcode
4. 核对拉取时的登录和游标仍然有效，按 userId 聚合消息
5. 并行投递 reply jobs
6. 全部投递成功后更新 Mongo syncBuf
7. completed listener 调度下一条 poll job
```

第五步失败时不得推进 `syncBuf`。下一次 poll 会从原游标重新拉取，BullMQ 按任务 ID 复用仍在队列中的任务或已完成记录。

poll processor 本身不续链。续链统一由 Worker 的 completed/failed listener 负责，避免 return、throw 和 timeout 分支各自维护调度逻辑。

## 6. 消息合并语义

`groupMessagesByUser` 在单个 poll 响应内按 `userId` 聚合：

- 文本使用换行拼接。
- `lastMsgId` 使用该用户最后一条有效消息的 ID，`contextToken` 使用最后一个非空值。
- 同一用户在同一 poll 周期只生成一个 reply job 和一次合并回复。
- 跨 poll 周期生成独立 reply job，但共享 `chatId=wechat_${shareId}_${userId}`，上下文连续。
- 多个用户生成多个 reply job，并行处理。

图片、文件和视频按声明的消息类型进入 OutLink 文件处理流程。语音使用微信提供的转写文本。

## 7. Redis 与持久化合同

| 数据 | Physical key / 存储 | TTL/语义 |
| --- | --- | --- |
| QR Login | `fastgpt:cache:publish:wechat:qrcode:${outLinkId}:${tmbId}:${attemptId}` | 二维码标识 JSON，480 秒 |
| Poll failure | `fastgpt:cache:wechat:publish:failures:${shareId}:${bindingKey}` | integer，300 秒 |
| 渠道配置 | `MongoOutLink.app` | token、syncBuf、status 的事实来源 |

失败计数使用 `INCRBY + EXPIRE NX`，从首次失败开始计时，后续失败保留原有 TTL。收到成功响应删除计数键。收到响应头前达到长轮询时限时继续轮询，保留已有计数。连续失败达到 5 次时：

1. 将 Mongo `app.status` 设为 `error`。
2. 写入 `app.lastError` 受控错误码，上游详情保留在日志。
3. 删除失败计数 key。
4. 抛错进入 failed listener；listener 因渠道已非 online 不再续链。

固定窗口与旧版每次失败刷新 TTL 的滑动窗口不同，属于明确业务语义，发布时必须保留对应测试和说明。

## 8. 并发与恢复

- `pollJobId` 保证多实例启动、重复扫码和启动恢复不会并行创建两条 poll 链。
- 相同 jobId 的回复任务仍在队列中时，BullMQ 会合并重复投递。
- 失败计数、游标和排队的回复归属于拉取时的绑定。没有有效绑定 ID 的历史连接，进行新轮询时用登录时间和 token 的哈希标记任务。投递和更新游标都检查拉取前的绑定和游标。回复开始时校验绑定，缺少绑定键的旧任务进入失败队列，保留待核对。
- `syncBuf` 只在 reply jobs 全部入队后推进，避免 enqueue 失败丢消息。
- 服务启动时扫描 online 渠道并调用幂等调度；已有 active/waiting job 时 BullMQ 保持原任务。
- 登出撤销待确认二维码，由 worker 读取离线状态后结束轮询。删除渠道后清理等待中的 poll job。
- Poll hard timeout 防止 processor 卡住后固定 jobId 永久占用。已发出的 I/O 可能结束，后续阶段会在计数、入队和游标写入前检查任务是否已过期。
- Reply 使用长 lock 避免慢回复被误判为 stalled。普通消息还由工作流入口按 messageId 和对话历史检查重复。

## 9. 故障与观测

| 故障 | 结果 |
| --- | --- |
| getUpdates 网络/API 错误 | 增加失败计数，job failed，10 秒退避 |
| Reply enqueue 失败 | 不推进 syncBuf，下次 poll 重拉 |
| Mongo syncBuf 更新失败 | job failed，下次重拉，replyJobId 去重 |
| provider adapter、runOutlinkRuntime 或 sendMessage 失败 | reply job failed，保留失败记录 |
| 渠道下线或 token 缺失 | 当前 job 停止，后续不续链 |
| Redis/BullMQ 不可用 | processor/调度失败，依赖基础设施告警和恢复流程 |

核心观测项包括 poll/reply waiting、active、failed 数量，poll 延迟，reply 处理时长，连续失败渠道数和 syncBuf 更新错误。基础设施告警按 DAL SigNoz 手册配置，业务失败按渠道 dashboard 和 SLA 处理。

## 10. 验证与回滚原则

无需微信、MongoDB 或 Redis 即可运行 iLink Mock 回归：

```sh
pnpm --dir projects/app test:wechat
```

Mock 覆盖取码、待扫码、已扫码、确认、轮询收消息、获取并解密媒体、回发和登出。测试调用路由处理函数、iLink 客户端和微信 worker，使用测试替身提供鉴权、数据库、队列与工作流结果。实际连接地址检查由独立请求策略用例覆盖。

验证必须覆盖重复启动、重复扫码、多实例恢复、空响应退避、enqueue 失败不推进 syncBuf、stalled retry 不重复回复、连续失败转 error、主动停止不再续链，以及慢回复期间 poll 仍能持续摄入。

停机切换按 [V4.17.5 升级说明](../../../document/content/self-host/upgrading/4-17/4175.mdx) 核对 Redis 存量回复任务和 Mongo 游标。v4.17.4 能读取原始消息项，但不会校验绑定键。回滚前先在新版确认失败批次的游标已补交、回复已处理，并保留两边共用的 Mongo 和 Redis 数据。完成记录达到保留边界后，不能再靠队列记录验证去重。

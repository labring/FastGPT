# SigNoz Redis / BullMQ 告警整理

> 状态：与当前 DAL Redis/BullMQ 重构代码同步
>
> 目的：给 SigNoz 管理员提供可以直接创建 Log Based Alert 的查询、阈值和降噪建议。
>
> 范围：`RedisRuntime`、DAL Redis Cache、DAL BullMQ Runtime，以及直接依赖这些能力的 Redis/BullMQ 业务日志。

## 1. 使用前提

### 1.1 Service name

本文示例使用：

```text
service.name = 'fastgpt-cn-client'
```

实际值由 `OTEL_SERVICE_NAME` 决定。当前 logger 的默认值是 `fastgpt-client`，部署环境如果没有显式设置 `OTEL_SERVICE_NAME`，需要将本文所有查询中的 service name 替换为实际值。

建议先在 SigNoz 中执行下面的查询，确认生产环境的值：

```text
severity_text IN ('error', 'warn')
AND (
  body.__log_message CONTAINS 'Redis'
  OR body.__log_message CONTAINS 'redis'
  OR body.__log_message CONTAINS 'BullMQ'
)
```

如果应用和 Pro 使用不同的 service name，应分别创建告警；不要为了复用查询把两个进程强行合并到同一个 service name。

### 1.2 OTel 字段

OTel logger 将 LogTape 记录转换为以下结构：

| SigNoz 字段 | 当前来源 | 说明 |
| --- | --- | --- |
| `service.name` | OTel resource | 应用/进程的服务名 |
| `severity_text` | LogTape level | 当前使用小写 `error`、`warn`、`info`、`debug` |
| `body.__log_message` | logger 第一个字符串参数 | 告警应优先按这个稳定消息匹配 |
| `body.*` | logger properties | `role`、`name`、`teamId`、`error` 等结构化字段 |
| `category` | LogTape category | OTel attribute；当前会被序列化为数组值，例如 `['infra', 'redis']` |

`error` 只用于排查，不应作为 Group By 或高基数筛选条件。不要把密码、完整 Redis URL、sessionId、jobId 等动态值加入通知模板。

### 1.3 category 当前并不统一

这是当前告警设计最容易出错的地方。Redis Runtime 和 BullMQ Runtime 的 logger 由 instrumentation 注入；当前 app/pro instrumentation 使用的是 `LogCategories.SYSTEM`，因此这类日志实际通常是：

```text
category = '["system"]'
```

而不是用户示例中的：

```text
category = '["infra","redis"]'
```

当前主要分布如下：

| 日志来源 | 调用方 category | 当前是否会被 `category = '["infra","redis"]'` 命中 |
| --- | --- | --- |
| Redis Runtime、Redis reconnect、Redis shutdown | `['system']` | 否 |
| DAL BullMQ queue/worker runtime | 继承 Runtime logger，通常 `['system']` | 否 |
| `TeamVectorCountCache` | `['infra', 'redis']` | 是 |
| Fixed window rate limit helper | `['infra', 'redis']` | 是 |
| `DailyActiveDedupeCache` | `['event', 'track']` | 否 |
| `DingtalkAccessTokenCache` | `['dataset', 'api-dataset']` | 否 |
| `SessionCache` | `['user', 'account']` | 否 |
| `StreamResumeCache` | `['chat', 'resume']` | 否 |
| `TeamPointCache` | `['wallet', 'sub']` | 否 |
| `LeaseCache` | `['ai', 'agent']` | 否 |
| `WorkflowStopSignalCache` | `['workflow', 'status']` | 否 |
| Pro `WecomPendingOrderCache` | `['wallet']` | 否 |

因此本文的当前推荐查询默认不增加 category 条件。只有在确认某条消息当前确实由 `['infra', 'redis']` 发出时，才使用 category 版本。

## 2. SigNoz 配置依据

官方文档：

- [Alerts Management](https://signoz.io/docs/userguide/alerts-management/)
- [Log-Based Alerts](https://signoz.io/docs/alerts-management/log-based-alerts/)
- [Query Builder v5](https://signoz.io/docs/userguide/query-builder-v5/)

当前 SigNoz 支持的能力足以覆盖本次 Redis 告警：

- Filter 支持 `AND`、`OR`、`IN`、`NOT IN`、`CONTAINS`、`EXISTS`。
- Log Based Alert 可以对日志做 `count()`、`count_distinct()`、`rate()` 等聚合。
- 可以按低基数字段 Group By，例如 `body.role`、`body.name`、`service.name`。
- 可以设置 Rolling 或 Cumulative evaluation window、evaluation frequency、minimum data 和 no-data 行为。
- Match Type 可使用 `at least once`；对于计数型告警，应在 Aggregate/Threshold 中设置事件数，而不是在 Filter 中模拟计数。

本文的查询代码块只包含 Filter。Aggregate、Group By、阈值和窗口在每条规则中单独列出，便于在 SigNoz UI 中配置。

## 3. 告警规则

### R1. Redis 连接错误

- 严重度：P1
- 目的：发现 command、queue、worker、blocking 任一角色的 Redis 连接错误。
- Filter：

```text
service.name = 'fastgpt-cn-client'
AND severity_text = 'error'
AND body.__log_message = 'Redis connection error'
```

- `category` 版本（仅当现场确认 Runtime 已统一为 infra category 后使用）：

```text
service.name = 'fastgpt-cn-client'
AND category = '["infra","redis"]'
AND severity_text = 'error'
AND body.__log_message = 'Redis connection error'
```

- Aggregate：`count()`
- Group By：`body.role`、`service.name`
- 建议阈值：同一 `role` 在 5 分钟内 `>= 3` 条。
- Evaluation：Rolling 5 分钟，1 分钟评估一次，Match Type 使用 `at least once`。
- 降噪：发布、重启、Redis 主从切换期间临时静默；`role` 只会是 `command`、`blocking`、`queue`、`worker`，适合作为分组。
- 处理：先确认 Redis 网络、实例状态、连接数和认证；再检查同一时间窗口的 `Redis reconnect scheduled`、BullMQ worker error 和应用错误率。

### R2. Redis 进程关闭失败

- 严重度：P1（通常代表进程退出路径异常）
- Filter：

```text
service.name = 'fastgpt-cn-client'
AND severity_text = 'error'
AND body.__log_message = 'Redis runtime close failed after process shutdown signal'
```

- Aggregate：`count()`
- Group By：`service.name`
- 建议阈值：5 分钟内 `>= 1` 条。
- Evaluation：Rolling 5 分钟，1 分钟评估一次。
- 降噪：部署期间如果平台会主动发送 SIGTERM，可将部署窗口加入维护静默；非部署期间出现应与进程重启、退出码和 BullMQ close 日志一起排查。

### R3. Redis 重连抖动

- 严重度：P2
- 目的：发现连接反复断开或命令错误触发重连。单条 `close` 可能是一次正常 reconnect，不建议单条告警。
- Filter：

```text
service.name = 'fastgpt-cn-client'
AND severity_text = 'warn'
AND (
  body.__log_message = 'Redis connection closed'
  OR body.__log_message = 'Redis reconnect scheduled'
  OR body.__log_message = 'Redis reconnect requested by command error'
)
```

- Aggregate：`count()`
- Group By：`body.role`、`service.name`
- 建议阈值：同一 `role` 在 5 分钟内 `>= 5` 条。
- Evaluation：Rolling 5 分钟，1 分钟评估一次。
- 降噪：不要把 `body.attempt`、`body.message` 或 `error` 分组；发布和 Redis 故障演练期间静默。
- 处理：如果 R1 同时触发，优先按连接故障处理；如果只有 R3 触发，检查网络抖动、Redis failover 和连接池压力。

### R4. BullMQ queue/worker 运行时错误

- 严重度：P1
- 目的：发现队列连接错误、worker 处理器错误和自动重启持续失败。
- Filter：

```text
service.name = 'fastgpt-cn-client'
AND severity_text = 'error'
AND (
  body.__log_message = 'BullMQ queue error'
  OR body.__log_message = 'BullMQ worker error'
  OR body.__log_message = 'BullMQ worker restart failed, will retry'
)
```

- Aggregate：`count()`
- Group By：`body.name`、`service.name`
- 建议阈值：同一 queue/worker name 在 5 分钟内 `>= 3` 条。
- Evaluation：Rolling 5 分钟，1 分钟评估一次。
- 降噪：`body.name` 是固定队列名，适合作为分组；不要按 `jobId`、`evalId`、`shareId` 分组。
- 处理：先判断是否与 R1 同时发生；若 Redis 正常，检查具体 processor、BullMQ 版本和 job payload。

### R5. BullMQ 生命周期关闭/强制断开异常

- 严重度：P2；在非部署窗口可提升到 P1。
- Filter：

```text
service.name = 'fastgpt-cn-client'
AND severity_text = 'warn'
AND (
  body.__log_message = 'BullMQ worker closed, attempting restart'
  OR body.__log_message = 'BullMQ worker resume failed'
  OR body.__log_message = 'BullMQ queue close failed'
  OR body.__log_message = 'BullMQ worker close failed'
  OR body.__log_message = 'BullMQ queue connection forced disconnect failed'
  OR body.__log_message = 'BullMQ worker connection forced disconnect failed'
  OR body.__log_message = 'Failed to release Redis connection after BullMQ queue creation error'
  OR body.__log_message = 'Failed to release Redis connection after BullMQ worker creation error'
)
```

- Aggregate：`count()`
- Group By：`body.name`、`body.__log_message`
- 建议阈值：5 分钟内 `>= 3` 条；`close failed` 和 `forced disconnect failed` 可单独设置 1 条即告警。
- Evaluation：Rolling 5 分钟。
- 降噪：部署期间静默；`worker closed, attempting restart` 单条不代表故障，只有与 `restart failed` 或错误计数同时出现才升级。

### R6. Redis Cache 故障降级

- 严重度：P2
- 目的：发现 Cache 读写持续失败。Cache 本身不是事实源，单次失败通常会降级或回源，不应和 Redis 连接告警共用 P1 阈值。
- Filter：

```text
service.name = 'fastgpt-cn-client'
AND severity_text IN ('error', 'warn')
AND (
  body.__log_message = 'Daily active dedupe failed open'
  OR body.__log_message = 'DingTalk accessToken cache read failed'
  OR body.__log_message = 'DingTalk accessToken cache write failed'
  OR body.__log_message = 'Invalid Redis session record'
  OR body.__log_message = 'Failed to delete invalid Redis session record'
  OR body.__log_message = 'Redis lease renew failed'
  OR body.__log_message = 'Redis lease renew failed because token no longer matches'
  OR body.__log_message = 'Redis lease acquire failed'
  OR body.__log_message = 'Redis lease release failed'
  OR body.__log_message = 'Failed to get team point cache'
  OR body.__log_message = 'Failed to set team point cache'
  OR body.__log_message = 'Failed to increment team point cache'
  OR body.__log_message = 'Failed to clear team point cache'
  OR body.__log_message = 'Workflow stop signal read failed open'
  OR body.__log_message = 'Workflow stop signal clear failed'
  OR body.__log_message = 'Failed to get team vector count cache'
  OR body.__log_message = 'Failed to set team vector count cache'
  OR body.__log_message = 'Failed to invalidate team vector count cache'
)
```

- Aggregate：`count()`
- Group By：`body.__log_message`、`service.name`
- 建议阈值：5 分钟内 `>= 10` 条；`Invalid Redis session record`、`Redis lease acquire failed` 可单独设置为 3 条/5 分钟。
- Evaluation：Rolling 5 分钟，1 分钟评估一次。
- 降噪：不要按 `teamId`、`userId`、`key`、`sessionId`、`sandboxId` 分组；这些字段只保留在日志详情中用于抽样排查。
- 处理：先判断是否同时触发 R1；如果没有，重点检查单一 Cache 的业务数据格式、TTL 和调用方降级逻辑。

> `Skipped invalid team point cache value` 是输入/数据校验信号，不一定代表 Redis 故障。建议单独建立 P2 数据质量告警，而不是放进 R6。

### R7. Stream resume 镜像失败

- 严重度：P1（影响流式响应恢复）；内存压力状态变化为 P2。
- Filter：

```text
service.name = 'fastgpt-cn-client'
AND severity_text = 'error'
AND (
  body.__log_message = 'Failed to clear stream resume redis keys before mirror'
  OR body.__log_message = 'Failed to mirror stream response to redis'
  OR body.__log_message = 'Failed to shrink stream resume redis ttl'
)
```

- Aggregate：`count()`
- Group By：`body.__log_message`、`service.name`
- 建议阈值：5 分钟内 `>= 5` 条；如果恢复接口是核心 SLA，可将 `>= 1` 条设置为低频通知。
- Evaluation：Rolling 5 分钟。
- 处理：检查 Redis memory、`maxmemory`、stream key 数量、写入失败原因和客户端连接状态。

内存压力和 stale stream 相关告警：

```text
service.name = 'fastgpt-cn-client'
AND severity_text = 'warn'
AND (
  body.__log_message = 'Disabling new stream resume mirrors due to Redis memory pressure'
  OR body.__log_message = 'Failed to inspect Redis memory pressure for stream resume mirror'
  OR body.__log_message = 'Failed to persist stream resume unavailable state'
  OR body.__log_message = 'cleanStaleGeneratingChats: failed to inspect stream resume activity'
)
```

- Aggregate：`count()`
- Group By：`body.__log_message`
- 建议阈值：内存压力状态变更 `>= 1` 条/10 分钟；检查失败或 unavailable 状态写入失败 `>= 3` 条/5 分钟。
- 降噪：`Disabling...` 只在状态从未阻塞变为阻塞时记录一次，不要设置过高的重复通知频率。

### R8. 限流服务 fail-closed

- 严重度：P1
- 目的：Redis 计数失败时接口会主动返回 429，属于直接用户影响。
- Filter：

```text
service.name = 'fastgpt-cn-client'
AND severity_text = 'error'
AND (
  body.__log_message = 'Fixed window rate limit failed closed'
  OR body.__log_message = 'Team QPM configuration lookup failed closed'
  OR body.__log_message = 'Team QPM rate limit failed closed'
)
```

- Aggregate：`count()`
- Group By：`body.__log_message`、`body.type`
- 建议阈值：5 分钟内 `>= 1` 条；如果多租户环境噪声较大，使用 `>= 3` 条/5 分钟。
- Evaluation：Rolling 5 分钟，1 分钟评估一次。
- 降噪：不要按 `teamId` 或 `key` 分组；`body.type` 只有少量限流类型，适合作为分组。
- category 版本只适用于 `Fixed window rate limit failed closed`：

```text
service.name = 'fastgpt-cn-client'
AND category = '["infra","redis"]'
AND severity_text = 'error'
AND body.__log_message = 'Fixed window rate limit failed closed'
```

`Team QPM ...` 当前使用 HTTP response category，不能加 `['infra', 'redis']` 条件。

### R9. Pro 企微订单 Cache 故障

- 严重度：P1（支付流程）
- Filter：

```text
service.name = 'fastgpt-cn-client'
AND severity_text = 'error'
AND (
  body.__log_message = 'Failed to get WeChat Work pending order cache'
  OR body.__log_message = 'Failed to set WeChat Work pending order cache'
  OR body.__log_message = 'Failed to clean WeChat Work pending order cache'
)
```

- Aggregate：`count()`
- Group By：`body.__log_message`、`service.name`
- 建议阈值：5 分钟内 `>= 1` 条；如果只希望告警持续故障，设置为 `>= 3` 条/5 分钟。
- 降噪：不要按 `teamId` 或 `orderId` 分组。读取失败会按 miss 继续创建订单，写入/清理失败不会阻断支付主流程，因此可根据支付错误率决定是否升级。

### R10. BullMQ 业务任务失败（独立于 Redis 可用性）

下面这些消息使用业务 logger 或 processor logger。它们说明某个任务失败，但不能单独证明 Redis 不可用，应与 R1/R4 分开配置：

```text
service.name = 'fastgpt-cn-client'
AND severity_text = 'error'
AND (
  body.__log_message = 'Failed to push collection update job'
  OR body.__log_message = 'Failed to update collection'
  OR body.__log_message = 'Failed to check evaluation job status'
  OR body.__log_message = 'Failed to remove evaluation job'
  OR body.__log_message = 'Failed to enqueue skill creation job, marked skill creation failed'
  OR body.__log_message = 'Failed to resume pending skill creation jobs'
  OR body.__log_message = 'Failed to resume marked skill delete jobs'
  OR body.__log_message = 'Reply job failed'
  OR body.__log_message = 'Wechat getUpdates request failed'
  OR body.__log_message = 'getUpdates API error'
  OR body.__log_message = 'Schedule next poll (completed) failed'
  OR body.__log_message = 'Schedule next poll (failed) failed'
)
```

- Aggregate：`count()`
- Group By：`body.__log_message`、业务 category 或 `body.shareId` 的去重计数（不要直接按 shareId 建立通知组）。
- 建议阈值：按业务 SLA 配置，默认 `>= 3` 条/5 分钟。
- 处理：先查看同一时间窗口是否有 R1/R4；若没有，应按业务 processor、第三方 API 或 job payload 排查。

下面这些 warning 通常是幂等、补偿或用户状态分支，不建议单独建立基础设施告警：

```text
No evaluation job found to remove
Evaluation job not found in queue
Cannot remove active or completed evaluation job
Pending skill missing owner info, skip resume
Pending skill not found, skip creation job
Remove old wechat poll job before start failed (job may be active)
Remove poll job failed (job may be active)
```

如果业务团队需要监控这些信号，应建立业务 dashboard，而不是 Redis 告警。

## 4. 不建议告警的 Redis/BullMQ 日志

以下日志用于生命周期或状态观测，不应直接触发通知：

```text
Redis connection established
Redis connection ready
Redis runtime closed after process shutdown signal
BullMQ worker ready
BullMQ worker restarted successfully
BullMQ workers initialization started
BullMQ poll/reply workers initialized
Collection Update worker initialized
Dataset sync scheduler reconcile finished
Redis memory pressure recovered; stream resume mirror creation resumed
Evaluation job removed successfully
Collection update job pushed
```

以下 warning 只适合 dashboard 或低频趋势：

```text
Redis connection closed
BullMQ worker closed, attempting restart
BullMQ worker paused
Redis reconnect scheduled
Redis reconnect requested by command error
Skipped invalid team point cache value
Redis lease renew failed because token no longer matches
```

`Redis connection closed` 和 reconnect 相关消息在一次正常重连中可能成对出现；必须使用时间窗口计数，不能按单条 warning 通知。

## 5. 全量消息盘点

### 5.1 Redis Runtime

| Level | `body.__log_message` | 处理建议 |
| --- | --- | --- |
| error | `Redis connection error` | R1 |
| error | `Redis runtime close failed after process shutdown signal` | R2 |
| warn | `Redis connection closed` | R3 的输入 |
| warn | `Redis reconnect scheduled` | R3 的输入 |
| warn | `Redis reconnect requested by command error` | R3 的输入 |
| warn | `Redis graceful close failed, disconnecting socket` | 关闭异常，纳入低频 dashboard 或 R5 辅助 |
| warn | `Redis forced disconnect failed` | 关闭异常，建议 1 条/5 分钟低频通知 |
| warn | `Redis before-close hook failed` | 关闭钩子失败，排查 BullMQ 生命周期 |
| warn | `Redis metrics callback failed` | 观测系统异常，不代表 Redis 故障 |
| info | `Redis connection established` | 不告警 |
| info | `Redis connection ready` | 不告警 |
| info | `Redis runtime closed after process shutdown signal` | 不告警 |

### 5.2 DAL BullMQ Runtime

| Level | `body.__log_message` | 处理建议 |
| --- | --- | --- |
| error | `BullMQ queue error` | R4 |
| error | `BullMQ worker error` | R4 |
| error | `BullMQ worker restart failed, will retry` | R4 |
| warn | `BullMQ worker closed, attempting restart` | R5 输入 |
| warn | `BullMQ worker paused` | 默认不告警，按业务需要 dashboard |
| warn | `BullMQ worker resume failed` | R5 |
| warn | `BullMQ queue close failed` | R5 |
| warn | `BullMQ worker close failed` | R5 |
| warn | `BullMQ queue connection forced disconnect failed` | R5 |
| warn | `BullMQ worker connection forced disconnect failed` | R5 |
| warn | `Failed to release Redis connection after BullMQ queue creation error` | R5 输入 |
| warn | `Failed to release Redis connection after BullMQ worker creation error` | R5 输入 |
| info | `BullMQ worker ready` | 不告警 |
| info | `BullMQ worker restarted successfully` | 不告警 |

### 5.3 DAL Redis Cache

| Level | `body.__log_message` | 处理建议 |
| --- | --- | --- |
| warn | `Daily active dedupe failed open` | R6，持续发生才告警 |
| warn | `DingTalk accessToken cache read failed` | R6，结合 DingTalk API 错误率 |
| warn | `DingTalk accessToken cache write failed` | R6，结合 DingTalk API 错误率 |
| error | `Invalid Redis session record` | R6 或数据质量告警 |
| warn | `Failed to delete invalid Redis session record` | R6 输入 |
| warn | `Failed to remove redundant sessions` | 业务 account dashboard |
| warn | `Redis lease renew failed because token no longer matches` | 默认不告警，可能是正常锁丢失 |
| warn | `Redis lease renew failed` | R6，持续发生才告警 |
| warn | `Redis lease acquire failed` | R6，可能阻断 sandbox 初始化 |
| warn | `Redis lease release failed` | R6 输入 |
| warn | `Skipped invalid team point cache value` | 数据质量告警，不是 Redis 可用性 |
| warn | `Failed to get team point cache` | R6 |
| warn | `Failed to set team point cache` | R6 |
| warn | `Failed to increment team point cache` | R6 |
| warn | `Failed to clear team point cache` | R6 |
| error | `Failed to clear stream resume redis keys before mirror` | R7 |
| error | `Failed to mirror stream response to redis` | R7 |
| error | `Failed to shrink stream resume redis ttl` | R7 |
| warn | `Workflow stop signal read failed open` | R6，持续发生才告警 |
| warn | `Workflow stop signal clear failed` | R6 输入 |
| warn | `Failed to get team vector count cache` | R6 |
| warn | `Failed to set team vector count cache` | R6 |
| warn | `Failed to invalidate team vector count cache` | R6 |

### 5.4 直接依赖 Redis Cache 的 Service/Pro 日志

| Level | `body.__log_message` | 处理建议 |
| --- | --- | --- |
| error | `Fixed window rate limit failed closed` | R8 |
| error | `Team QPM configuration lookup failed closed` | R8 |
| error | `Team QPM rate limit failed closed` | R8 |
| warn | `Disabling new stream resume mirrors due to Redis memory pressure` | R7 内存压力规则 |
| warn | `Failed to inspect Redis memory pressure for stream resume mirror` | R7 |
| warn | `Failed to persist stream resume unavailable state` | R7 |
| warn | `cleanStaleGeneratingChats: failed to inspect stream resume activity` | R7 |
| warn | `Failed to clear team plan cache after enterprise auth verified` | Pro 钱包业务 dashboard |
| warn | `Failed to retry clearing team plan cache after enterprise auth verified` | Pro 钱包业务 dashboard |
| error | `Failed to get WeChat Work pending order cache` | R9 |
| error | `Failed to set WeChat Work pending order cache` | R9 |
| error | `Failed to clean WeChat Work pending order cache` | R9 |

### 5.5 BullMQ 业务日志

这些日志的共同点是“任务或 processor 失败”，不是 Redis Runtime 连接事件：

```text
Failed to push collection update job
Failed to update collection
Failed to check evaluation job status
Failed to remove evaluation job
Failed to enqueue skill creation job, marked skill creation failed
Failed to resume pending skill creation jobs
Failed to resume marked skill delete jobs
Reply job failed
Wechat getUpdates request failed
getUpdates API error
Schedule next poll (completed) failed
Schedule next poll (failed) failed
```

建议将这类日志按业务服务和任务名称分别放进 BullMQ 业务 dashboard；只有在与 R1/R4 同时出现时，才把根因归因于 Redis/BullMQ 基础设施。

## 6. 告警配置的通用降噪参数

建议初始统一使用：

| 参数 | 建议值 | 原因 |
| --- | --- | --- |
| Evaluation window | Rolling 5 分钟 | 能捕获持续故障，又不会把单次瞬时错误放大 |
| Evaluation frequency | 1 分钟 | 与 Redis reconnect 和业务响应时间匹配 |
| No-data | No alert / OK | 日志告警没有日志是正常状态 |
| Minimum data | 1 条（单事件 P1）或按规则阈值 | 避免空窗口误判 |
| Repeat notification | P1 15 分钟，P2 60 分钟 | 防止每分钟重复通知 |
| Group By | `body.__log_message`、`body.role`、`body.name` | 低基数、便于定位 |
| 禁止分组 | `teamId`、`userId`、`sessionId`、`shareId`、`jobId`、`evalId`、`key`、`error` | 高基数和敏感值会造成告警风暴 |

部署、Redis 维护、故障演练应通过 SigNoz maintenance window 或通知路由静默，不要修改告警 Filter 以绕过一次发布。

## 7. category 统一后的迁移方案

当前代码可以先使用本文的 categoryless 查询。后续如果要让基础设施告警统一使用 category，建议：

1. instrumentation 使用独立 logger：
   - Redis Runtime / health / shutdown：`getLogger(LogCategories.INFRA.REDIS)`。
   - BullMQ Runtime / queue / worker 生命周期：`getLogger(LogCategories.INFRA.QUEUE)`。
2. 保留业务 Cache 的业务 category，便于按领域定位；需要基础设施聚合时，额外提供低基数的 `component` 属性，不要依赖字符串化 category 做跨域 OR。
3. 将 `body.__log_message` 提取为稳定常量，重命名日志时同步更新告警文档和 SigNoz rule。
4. 统一后重新验证 `category` 在 SigNoz 中的实际存储类型，再把查询改成：

```text
service.name = 'fastgpt-cn-client'
AND category = '["infra","redis"]'
AND severity_text = 'error'
AND body.__log_message = 'Redis connection error'
```

不要在 category 尚未统一前直接给所有规则加这个条件，否则会漏报 Runtime、BullMQ 和大部分业务 Cache 日志。

## 8. 已废弃日志名

以下是旧 service Redis facade 的日志名，当前 PR 已不再产生：

```text
Global Redis connection error
Redis cache set failed
Redis cache append failed
```

以这些字符串创建的新告警不会命中当前代码；历史 dashboard 可以保留，但不应作为新告警规则。

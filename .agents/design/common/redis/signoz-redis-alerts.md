# SigNoz Redis / BullMQ 告警手册

> 本文面向 SigNoz 管理员，记录可直接配置的 Redis/BullMQ 日志告警、阈值和降噪规则。
> DAL 架构、失败合同和发布约束见 [FastGPT Data Access Layer 设计](../dal/data-access-layer.md)。

## 1. 使用前提

### 1.1 Service name

示例统一使用：

```text
service.name = 'fastgpt-cn-client'
```

实际值由 `OTEL_SERVICE_NAME` 决定。App 与 Pro 使用不同 service name 时分别创建规则，不要为了复用查询合并两个进程。

### 1.2 OTel 字段

| SigNoz 字段 | 用途 |
| --- | --- |
| `service.name` | 应用/进程边界 |
| `severity_text` | `error`、`warn`、`info`、`debug` |
| `body.__log_message` | 稳定日志消息，告警的主要匹配字段 |
| `body.*` | `role`、`name` 等低基数 metadata |
| `category` | LogTape category，目前不同 Cache/Runtime 尚未统一 |

`error`、完整 Redis URL、teamId、userId、sessionId、shareId、jobId、key 等字段只用于排查，不得用于通知分组或模板。

Runtime 与 BullMQ logger 当前通常继承 `['system']`，业务 Cache 使用各自领域 category。category 统一前，以下规则默认不增加 category 条件，否则会漏掉 Runtime、BullMQ 和多数 Cache 日志。

## 2. 通用配置

| 参数 | 默认值 |
| --- | --- |
| Evaluation window | Rolling 5 分钟 |
| Evaluation frequency | 1 分钟 |
| No-data | No alert / OK |
| Match type | `at least once` |
| Repeat notification | P1 15 分钟；P2 60 分钟 |
| 推荐 Group By | `body.__log_message`、`body.role`、`body.name`、`service.name` |

发布、Redis 维护和故障演练使用 SigNoz maintenance window 或通知路由静默，不修改 Filter 绕过一次发布。

## 3. 告警规则

### R1. Redis 连接错误

- 严重度：P1
- Filter：

```text
service.name = 'fastgpt-cn-client'
AND severity_text = 'error'
AND body.__log_message = 'Redis connection error'
```

- Aggregate：`count()`；Group By：`body.role`、`service.name`。
- 阈值：同一 role 5 分钟内 `>= 3`。
- 处理：检查 Redis 实例、网络、认证和连接数，并关联 R3/R4。

### R2. Redis 进程关闭失败

- 严重度：P1
- Filter：

```text
service.name = 'fastgpt-cn-client'
AND severity_text = 'error'
AND body.__log_message = 'Redis runtime close failed after process shutdown signal'
```

- Aggregate：`count()`；Group By：`service.name`。
- 阈值：5 分钟内 `>= 1`。
- 处理：关联部署信号、进程退出码、Next.js drain 和 BullMQ close 日志。

### R3. Redis 重连抖动

- 严重度：P2
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

- Aggregate：`count()`；Group By：`body.role`、`service.name`。
- 阈值：同一 role 5 分钟内 `>= 5`；单条 close 不告警。
- 处理：R1 同时触发时按连接故障处理，否则检查 failover、网络抖动和连接压力。

### R4. BullMQ Queue/Worker 错误

- 严重度：P1
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

- Aggregate：`count()`；Group By：`body.name`、`service.name`。
- 阈值：同一 queue/worker 5 分钟内 `>= 3`。
- 处理：先排除 R1；Redis 正常时检查 processor、job payload 和 BullMQ 版本。

### R5. BullMQ 生命周期异常

- 严重度：P2；非部署窗口可提升到 P1。
- Filter 消息：

```text
BullMQ worker closed, attempting restart
BullMQ worker resume failed
BullMQ queue close failed
BullMQ worker close failed
BullMQ queue connection forced disconnect failed
BullMQ worker connection forced disconnect failed
Failed to release Redis connection after BullMQ queue creation error
Failed to release Redis connection after BullMQ worker creation error
```

- Filter 叠加 `severity_text = 'warn'`，用 OR 匹配上述 `body.__log_message`。
- Aggregate：`count()`；Group By：`body.name`、`body.__log_message`。
- 阈值：5 分钟内 `>= 3`；close/forced-disconnect failure 可单独设置 `>= 1`。
- 降噪：部署期间静默；单条 worker closed 不代表故障。

### R6. Redis Cache 持续降级

- 严重度：P2
- 关注消息：

```text
Daily active dedupe failed open
DingTalk accessToken cache read failed
DingTalk accessToken cache write failed
Invalid Redis session record
Failed to delete invalid Redis session record
Redis lease renew failed
Redis lease acquire failed
Redis lease release failed
Failed to get team point cache
Failed to set team point cache
Failed to increment team point cache
Failed to clear team point cache
Workflow stop signal read failed open
Workflow stop signal clear failed
Failed to get team vector count cache
Failed to set team vector count cache
Failed to invalidate team vector count cache
```

- Filter 叠加 `severity_text IN ('error', 'warn')`，用 OR 匹配上述消息。
- Aggregate：`count()`；Group By：`body.__log_message`、`service.name`。
- 阈值：5 分钟内 `>= 10`；session 损坏或 lease acquire failure 可设 `>= 3`。
- 处理：R1 未触发时，检查单一 Cache 的数据格式、TTL 和降级路径。

`Skipped invalid team point cache value` 属于数据质量信号，不并入 Redis 可用性告警。

### R7. Stream Resume 镜像失败

- 严重度：P1；内存压力状态变化为 P2。
- P1 消息：

```text
Failed to clear stream resume redis keys before mirror
Failed to mirror stream response to redis
Failed to shrink stream resume redis ttl
```

- 阈值：合计 5 分钟内 `>= 5`；恢复能力属于核心 SLA 时可低频通知单次失败。
- P2 消息：

```text
Disabling new stream resume mirrors due to Redis memory pressure
Failed to inspect Redis memory pressure for stream resume mirror
Failed to persist stream resume unavailable state
cleanStaleGeneratingChats: failed to inspect stream resume activity
```

- 阈值：内存压力状态变化 `>= 1/10 分钟`；检查或状态写入失败 `>= 3/5 分钟`。

### R8. 限流服务 Fail-closed

- 严重度：P1，因为错误会直接转换为 429。
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

- Aggregate：`count()`；Group By：`body.__log_message`、`body.type`。
- 阈值：5 分钟内 `>= 1`；高流量环境可使用 `>= 3`。
- 禁止按 teamId 或 key 分组。

### R9. Pro 企微订单 Cache 故障

- 严重度：P1，由支付错误率决定是否降为 P2。
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

- Aggregate：`count()`；Group By：`body.__log_message`、`service.name`。
- 阈值：5 分钟内 `>= 1`，只关注持续故障时使用 `>= 3`。
- 禁止按 teamId 或 orderId 分组。

### R10. BullMQ 业务任务失败

这类错误不能单独证明 Redis 不可用，应与 R1/R4 分开配置：

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

- 严重度和阈值按业务 SLA，默认 `>= 3/5 分钟`。
- Group By 使用稳定消息或业务 category；shareId 只能做去重计数，不能形成通知组。
- R1/R4 未触发时，按 processor、第三方 API 或 job payload 排查。

## 4. Dashboard 与告警边界

以下信息只用于 dashboard 或趋势，不直接通知：

```text
Redis connection established
Redis connection ready
Redis runtime closed after process shutdown signal
BullMQ worker ready
BullMQ worker restarted successfully
BullMQ worker paused
Collection update job pushed
Dataset sync scheduler reconcile finished
Redis memory pressure recovered; stream resume mirror creation resumed
```

幂等补偿、资源已不存在和 active job 无法删除等 warning 也属于业务 dashboard。只有它们与 R1/R4 或明确业务 SLA 同时满足时才升级。

## 5. Category 统一约束

基础设施 category 统一后，Redis Runtime/health/shutdown 使用 `LogCategories.INFRA.REDIS`，BullMQ Runtime 使用 `LogCategories.INFRA.QUEUE`；业务 Cache 保留领域 category，并额外提供低基数 `component` 字段。

在 SigNoz 中确认 category 的实际存储类型前，不批量修改现有规则。日志消息重命名必须同步更新对应规则；本文不维护一份与源码重复的全量消息清单。

# FastGPT 可观测性 runbook

## 目标

建立企业内部部署的日志、指标、追踪和告警基线，让运维能发现问题、定位问题、评估容量。

## 环境变量

```env
LOG_ENABLE_OTEL=true
LOG_OTEL_LEVEL=info
LOG_OTEL_URL=https://otel.internal.example.com/v1/logs
METRICS_ENABLE_OTEL=true
METRICS_OTEL_URL=https://otel.internal.example.com/v1/metrics
TRACING_ENABLE_OTEL=true
TRACING_OTEL_URL=https://otel.internal.example.com/v1/traces
```

## 核心指标

| 指标 | 说明 |
| --- | --- |
| HTTP 请求量 | 按 path、status、method |
| HTTP 错误率 | 4xx、5xx |
| API 延迟 | p50、p95、p99 |
| 模型调用量 | 按模型、应用、团队 |
| 模型错误率 | 供应商错误、超时、限流 |
| token 用量 | 输入、输出、总量 |
| 知识库导入任务 | 成功、失败、耗时 |
| 向量库查询延迟 | p95、p99 |
| MongoDB 连接数 | 当前连接、慢查询 |
| PostgreSQL 连接数 | 当前连接、慢查询 |
| Redis 内存 | used_memory/maxmemory |
| MinIO 错误 | 上传、下载、签名 URL |
| 沙盒执行 | 次数、失败率、超时 |

## 告警建议

| 告警 | 阈值 |
| --- | --- |
| FastGPT Web 不可用 | 1 分钟健康检查失败 |
| MongoDB 不可用 | 1 分钟健康检查失败 |
| PostgreSQL 不可用 | 1 分钟健康检查失败 |
| Redis 不可用 | 1 分钟健康检查失败 |
| MinIO 不可用 | 1 分钟健康检查失败 |
| HTTP 5xx 错误率 | 5 分钟内超过 5% |
| 模型调用失败率 | 10 分钟内超过 10% |
| p95 延迟 | 10 分钟内超过 5 秒 |
| Redis 内存水位 | 超过 80% |
| 知识库导入失败 | 连续失败 3 次 |
| 沙盒超时 | 10 分钟内超过 10 次 |

## 日志分类

重点关注：

1. `system`
2. `http.error`
3. `infra.mongo`
4. `infra.redis`
5. `infra.vector`
6. `infra.s3`
7. `module.ai`
8. `module.dataset`
9. `module.app`
10. `module.chat`

## Dashboard

第一版 dashboard 至少包含：

1. 服务健康状态。
2. HTTP 请求量和错误率。
3. p95/p99 延迟。
4. 模型调用量、错误率、token 用量。
5. 知识库导入任务状态。
6. 数据库连接与慢查询。
7. Redis 内存。
8. MinIO 请求错误。
9. 沙盒执行错误。

## 排障流程

### 用户反馈回答慢

1. 看 HTTP p95/p99。
2. 看模型供应商延迟和错误率。
3. 看向量库查询延迟。
4. 看知识库召回数量和 rerank 是否慢。
5. 看 Redis/MongoDB 是否有慢查询。

### 知识库导入失败

1. 看 dataset training 日志。
2. 看文件解析 worker。
3. 看对象存储上传/下载。
4. 看 embedding 模型调用。
5. 看向量库写入。

### 模型调用失败

1. 看 AIProxy 状态。
2. 看模型供应商返回码。
3. 看 API Key 配额。
4. 看应用模型配置。
5. 看网络出口策略。

## 验收

1. 服务异常能在 1 到 5 分钟内告警。
2. 能按应用、模型、团队看调用量和错误率。
3. 能定位知识库导入失败原因。
4. 能查看最近管理员操作和审计事件。

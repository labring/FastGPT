# SigNoz 系统配置校验失败告警手册

> 本文面向 SigNoz 管理员，记录针对 FastGPT 运行时系统配置校验失败（FastGPT system config validation failed）的日志告警规则配置。

## 1. 告警背景

在 FastGPT 启动和全局配置挂载（`initFastGPTConfig`）阶段，系统会通过 `FastGPTConfigFileSchema.safeParse` 对合并后的系统配置（`feConfigs`、`systemEnv`）进行严格校验。
当数据库或环境变量中存在非预期的非法类型数据时，系统会触发降级兜底挂载，并通过 `logger.error` 打印带有稳定标识的错误日志：

```text
FastGPT system config validation failed
```

该告警用于在系统配置格式异常时第一时间通知运维与开发人员介入，避免脏配置引发下游业务隐患。

## 2. 告警规则详细配置

在 SigNoz 控制台（**Alerts** -> **New Alert**）中选择 **Logs** 告警类型，按以下参数配置：

### 2.1 基本信息
- **Alert Name**: `FastGPT System Config Validation Failed`
- **Severity**: `Critical` / `P1`
- **Description**: `FastGPT 运行时系统配置结构校验失败，已触发兜底降级挂载，请立即检查 DB 或环境变量配置`

### 2.2 查询条件 (Query Builder)

| 配置项 | 推荐值 | 说明 |
| --- | --- | --- |
| **Data Source** | `Logs` | 基于日志流告警 |
| **Filter** | `body.__log_message = 'FastGPT system config validation failed'` | 匹配稳定错误消息 |
| **Log Level Filter** | `severity_text = 'error'` | 仅匹配 error 等级 |
| **Service Name Filter** | `service.name = 'fastgpt-client'` (或生产实际 `OTEL_SERVICE_NAME`) | 区分服务边界（可选） |
| **Aggregate** | `count()` | 统计发生频次 |
| **Group By** | `body.__log_message`, `service.name` | 按消息和实例聚合 |

#### 原始查询语句 (ClickHouse / LogQL 参考)

```sql
SELECT
    count() as count
FROM signoz_logs.distributed_logs
WHERE
    severity_text = 'error'
    AND body ILIKE '%FastGPT system config validation failed%'
```

### 2.3 触发条件 (Alert Condition)

- **Evaluation Window**: `1 minute` (1分钟滚动窗口)
- **Evaluation Frequency**: `1 minute` (每1分钟检查一次)
- **Condition**: `IS ABOVE OR EQUALS (>=) 1` (只要出现1次即触发)
- **No-data Behavior**: `Keep State` 或 `OK`

### 2.4 通知与排查处理

- **Repeat Notification**: `15 分钟`
- **排查步骤**:
  1. 在 SigNoz **Logs** 页面中搜索 `body.__log_message: "FastGPT system config validation failed"`；
  2. 展开对应日志行，查看 `body.error` 字段获取详细的 Zod Schema 校验报错路径（如 `systemEnv.datasetParseMaxProcess` 或 `feConfigs.xxx`）；
  3. 确认是数据库中的 `system_configs` 集合数据格式异常，还是容器环境变量传入了非法值并修复。

# @fastgpt-sdk/metrics

FastGPT 的通用 metrics SDK，基于 OpenTelemetry Metrics：

- OTLP HTTP metrics exporter
- 环境变量驱动初始化
- 暴露通用 `getMeter()` 能力

## 安装

```bash
pnpm add @fastgpt-sdk/metrics
```

## 快速开始

```ts
import { configureMetricsFromEnv, getMeter } from '@fastgpt-sdk/metrics';

await configureMetricsFromEnv({
  env: process.env,
  defaultServiceName: 'fastgpt-client'
});

const meter = getMeter('fastgpt-client');
```

## 支持的环境变量

- `METRICS_ENABLE_OTEL`
- `METRICS_OTEL_SERVICE_NAME`
- `METRICS_OTEL_URL`
- `METRICS_EXPORT_INTERVAL`

同时兼容以下标准 OTEL 变量作为 fallback：

- `OTEL_SERVICE_NAME`
- `OTEL_EXPORTER_OTLP_METRICS_ENDPOINT`
- `OTEL_EXPORTER_OTLP_ENDPOINT`
- `OTEL_METRIC_EXPORT_INTERVAL`
- `OTEL_METRICS_EXPORTER`

## 说明

- 这个 SDK 只放通用 metrics 能力。
- 业务指标，例如 workflow 节点级耗时与内存监控，应放在 FastGPT 服务层实现。

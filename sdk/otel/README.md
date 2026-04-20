# @fastgpt-sdk/otel

FastGPT 的统一 OpenTelemetry / observability SDK。

这个包的目标是作为未来的迁移目标，把现有的：

- `@fastgpt-sdk/logger`
- `@fastgpt-sdk/metrics`
- tracing 能力

收拢到一个统一入口里，但目前不强制迁移现有代码。

它现在是一个自包含包：

- 内部自带 logger 实现
- 内部自带 metrics 实现
- 内部自带 tracing 实现
- 不依赖 `@fastgpt-sdk/logger` 或 `@fastgpt-sdk/metrics`

同时支持两种使用方式：

- 统一入口：`@fastgpt-sdk/otel`
- 渐进迁移入口：`@fastgpt-sdk/otel/logger`、`@fastgpt-sdk/otel/metrics`、`@fastgpt-sdk/otel/tracing`

## 包含内容

- 内置 logger 能力
- 内置 metrics 能力
- 内置通用 tracing 能力
- 提供统一的 `configureOtel()` / `configureOtelFromEnv()` 入口

## 快速开始

```ts
import {
  configureOtelFromEnv,
  getLogger,
  getMeter,
  getTracer
} from '@fastgpt-sdk/otel';

await configureOtelFromEnv({
  defaultServiceName: 'fastgpt-client'
});

const logger = getLogger(['system']);
const meter = getMeter('fastgpt-client');
const tracer = getTracer('fastgpt-client');
```

也可以渐进迁移：

```ts
import { configureLoggerFromEnv, getLogger } from '@fastgpt-sdk/otel/logger';
import { configureMetricsFromEnv, getMeter } from '@fastgpt-sdk/otel/metrics';
import { configureTracingFromEnv, getTracer } from '@fastgpt-sdk/otel/tracing';
```

## 迁移思路

未来可以分阶段迁移：

1. 先只把初始化入口从多个 SDK 收拢到 `@fastgpt-sdk/otel`
2. 再逐步把 import 从 `logger/metrics` 改成 `otel`
3. 最后按业务需要补 traces

## tracing 环境变量

- `TRACING_ENABLE_OTEL`
- `TRACING_OTEL_SERVICE_NAME`
- `TRACING_OTEL_URL`
- `TRACING_OTEL_SAMPLE_RATIO`

同时兼容标准 OTEL fallback：

- `OTEL_SERVICE_NAME`
- `OTEL_EXPORTER_OTLP_TRACES_ENDPOINT`
- `OTEL_EXPORTER_OTLP_ENDPOINT`
- `OTEL_TRACES_EXPORTER`
- `OTEL_TRACES_SAMPLER`
- `OTEL_TRACES_SAMPLER_ARG`

## 说明

- 这个包当前是“整理好的统一入口”，不是“已经迁移完成的替换方案”。
- 现有 `logger` 与 `metrics` 包仍然可继续独立使用，后续可以逐步迁移到这个包。

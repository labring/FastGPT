# @fastgpt-sdk/logger

FastGPT 的通用日志 SDK，基于 `@logtape/logtape`，内置：

- Console pretty log
- OpenTelemetry OTLP log sink
- `AsyncLocalStorage` 上下文透传
- 兼容 FastGPT 现有 `getLogger(...).info('msg', {...})` 调用风格

## 安装

```bash
pnpm add @fastgpt-sdk/logger
```

## 快速开始

```ts
import { configureLogger, getLogger, withContext } from '@fastgpt-sdk/logger';

await configureLogger({
  defaultCategory: ['my-app'],
  console: {
    enabled: true,
    level: 'info'
  },
  otel: {
    enabled: true,
    serviceName: 'my-app',
    url: 'http://localhost:4318/v1/logs',
    level: 'info'
  },
  sensitiveProperties: ['password', 'token']
});

const logger = getLogger(['my-app', 'worker']);

await withContext({ requestId: 'req_123' }, async () => {
  logger.info('worker started', { jobId: 'job_001' });
});
```

## API

### `configureLogger(options)`

```ts
type LoggerConfigureOptions = {
  defaultCategory?: readonly string[];
  console?: boolean | { enabled?: boolean; level?: LogLevel };
  otel?: false | {
    enabled?: boolean;
    level?: LogLevel;
    serviceName: string;
    url?: string;
    loggerName?: string;
  };
  sensitiveProperties?: readonly string[];
  contextLocalStorage?: AsyncLocalStorage<Record<string, unknown>>;
  loggers?: Config['loggers'];
};
```

- `defaultCategory`: 默认 category，不传时默认 `['system']`
- `console`: 控制台输出配置
- `otel`: OpenTelemetry 输出配置；启用时需要 `serviceName`
- `sensitiveProperties`: 命中这些字段的日志不会发往 OTEL sink
- `contextLocalStorage`: 可注入自己的上下文存储实例
- `loggers`: 可覆盖默认的 LogTape logger 路由配置

### `getLogger(category?)`

```ts
const logger = getLogger(['app', 'api']);

logger.info('request completed', { status: 200 });
logger.error('request failed', { error });
```

`category` 不需要预注册；传任意字符串数组即可。

### `withContext(context, fn)`

```ts
await withContext({ requestId: 'req_123' }, async () => {
  logger.info('handling request');
});
```

## Env Helper

如果项目已经使用环境变量管理日志配置，也可以直接用 SDK 提供的转换助手：

```ts
import { configureLoggerFromEnv } from '@fastgpt-sdk/logger';

await configureLoggerFromEnv({
  env: process.env,
  defaultCategory: ['my-app'],
  defaultServiceName: 'my-app',
  sensitiveProperties: ['password', 'token']
});
```

支持读取这些环境变量：

- `LOG_ENABLE_CONSOLE`
- `LOG_CONSOLE_LEVEL`
- `LOG_ENABLE_OTEL`
- `LOG_OTEL_LEVEL`
- `LOG_OTEL_SERVICE_NAME`
- `LOG_OTEL_URL`

## OpenTelemetry

启用 `otel` 后，SDK 会创建 OTLP HTTP log exporter。

```ts
await configureLogger({
  otel: {
    enabled: true,
    serviceName: 'my-app',
    loggerName: 'my-app',
    url: 'http://localhost:4318/v1/logs'
  }
});
```

也可以直接从 `@fastgpt-sdk/logger` 导入 `getOpenTelemetrySink` 进行更细粒度集成。

## FastGPT 迁移建议

如果你在 FastGPT 仓库内部使用：

- 通用能力放到 `sdk/logger`
- 业务分类常量继续放在 service 侧
- service 侧保留一层 `configureLoggerFromEnv` 风格的兼容封装


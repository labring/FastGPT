# FastGPT Logger 使用规范

> 基于当前项目实现（`packages/service/common/logger`）整理的统一日志规范与使用指引。

## 1. 统一入口

**后端统一使用** `@fastgpt/service/common/logger`，不要直接用 `console.*`。

```ts
import { configureLogger, getLogger, LogCategories } from '@fastgpt/service/common/logger';

await configureLogger();
const logger = getLogger(LogCategories.MODULE.DATASET.QUEUES);
logger.info('Vector queue task started', { teamId, datasetId, queueSize });
```

**注意**:
- `configureLogger()` 仅需调用一次，通常在服务启动/入口处初始化。
- `getLogger()` 不传 category 时默认 `['system']`，但建议显式传 `LogCategories`。

## 2. 分类（Category）规范

**必须使用项目内置的 `LogCategories`**，不要自定义字符串数组。

类别选择建议:
- `LogCategories.SYSTEM`：系统级初始化、全局状态。
- `LogCategories.INFRA.*`：数据库、缓存、对象存储、队列等基础设施。
- `LogCategories.HTTP.*`：HTTP 请求、响应、错误。
- `LogCategories.MODULE.*`：业务模块（参考 `pages/api` 路径，省略 `core/support` 前缀）。
- `LogCategories.EVENT.*`：事件/埋点类日志。
- `LogCategories.ERROR`：跨模块的错误汇总日志。

当现有类别不足时:
- 在 `packages/service/common/logger/categories.ts` 中补充。
- 保持层级语义清晰，避免过深或过宽。

## 3. 日志等级使用建议

- `trace`：极高频、细粒度流程追踪（默认仅开发环境开启）。
- `debug`：调试信息、队列长度、循环状态、重试过程。
- `info`：关键流程节点、成功状态、启动与完成。
- `warn`：可恢复异常、可忽略的异常条件。
- `error`：失败、异常退出、需要定位的问题。
- `fatal`：不可恢复错误，通常伴随进程退出。

## 4. 结构化日志规范

**日志由「稳定消息 + 结构化字段」组成**，避免在消息里拼大段 JSON。

推荐写法:
```ts
logger.info('Schedule trigger scan completed', { dueCount, durationMs });
```

不推荐:
```ts
logger.info(`Scan completed: ${JSON.stringify({ dueCount, durationMs })}`);
```

**自动补齐规则**:
- 当调用 `logger.info('msg', { ... })` 时，会自动将消息格式化为 `msg: {*}`。
- 如果不希望追加 `{*}`，可添加 `verbose: false`:
```ts
logger.info('Request received', { verbose: false, requestId, method, url });
```

## 5. 请求链路与上下文

服务端推荐通过 `withContext` 注入 `requestId` 等上下文:
```ts
import { withContext } from '@fastgpt/service/common/logger';

return withContext({ requestId }, async () => {
  logger.info('Request received', { requestId, method, url });
});
```

Next.js API 入口已在 `packages/service/common/middle/entry.ts` 统一处理请求日志与 `requestId`。

## 6. 错误日志规范

**统一使用 `error` 字段记录错误对象**，并补充上下文:
```ts
try {
  await doSomething();
} catch (error) {
  logger.error('Do something failed', { error, appId, userId });
  throw error;
}
```

避免:
- 用 `err`、`e` 等不一致字段名。
- 只记录 `error.message` 丢失堆栈。
- 捕获后不记录、不抛出。

## 7. 敏感信息与 OTEL

**禁止记录敏感信息**: token、密钥、密码、完整聊天内容、隐私数据等。

如确需记录用于调试:
- 做脱敏或截断。
- 可添加 `fastgpt` 属性，避免 OTEL 导出（由 `sensitiveProperties` 过滤）。

```ts
logger.warn('Payload truncated for debug', {
  fastgpt: true,
  payloadPreview: payload.slice(0, 200)
});
```

## 8. 配置项（环境变量）

日志系统由 `configureLogger()` 读取环境变量:
- `LOG_ENABLE_CONSOLE` 是否开启控制台输出
- `LOG_CONSOLE_LEVEL` 控制台最低等级
- `LOG_ENABLE_OTEL` 是否开启 OTEL
- `LOG_OTEL_LEVEL` OTEL 最低等级
- `LOG_OTEL_SERVICE_NAME` OTEL 服务名
- `LOG_OTEL_URL` OTEL 收集器地址

## 9. 推荐示例

```ts
import { getLogger, LogCategories } from '@fastgpt/service/common/logger';

const logger = getLogger(LogCategories.INFRA.MONGO);

logger.info('Mongo change stream watch started');

try {
  await watchMongo();
} catch (error) {
  logger.error('Mongo watch failed', { error, collection: 'system_config' });
}
```

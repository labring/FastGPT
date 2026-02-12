# 日志与可观测性审查标准

FastGPT 后端统一使用 `@fastgpt/service/common/logger`。日志需要可检索、可聚合、可回放，且避免敏感信息泄露。

## 1. 统一 Logger 接入

**审查要点**:
- ✅ 服务端统一使用 `@fastgpt/service/common/logger`，避免 `console.log`
- ✅ 启动入口只初始化一次 `configureLogger()`
- ✅ 使用 `getLogger(LogCategories.XXX)` 指定分类
- ✅ 未经讨论不要自定义 category 字符串数组

**示例**:
```ts
import { configureLogger, getLogger, LogCategories } from '@fastgpt/service/common/logger';

await configureLogger();
const logger = getLogger(LogCategories.SYSTEM);
logger.info('System initialized successfully');
```

## 2. 分类（Category）选择

**审查要点**:
- ✅ `SYSTEM` 用于系统级初始化与全局状态
- ✅ `INFRA.*` 用于数据库/缓存/队列/存储等
- ✅ `HTTP.*` 用于请求、响应、请求错误
- ✅ `MODULE.*` 用于业务模块（参考 `pages/api` 路径）
- ✅ 缺少分类时补充到 `packages/service/common/logger/categories.ts`

**问题示例**:
```ts
// ❌ 不规范：自定义字符串分类
const logger = getLogger(['custom', 'random']);
```

## 3. 结构化日志与消息规范

**审查要点**:
- ✅ 消息短、稳定、可检索
- ✅ 关键字段放在结构化对象中（id、状态、耗时、数量）
- ✅ 避免 `JSON.stringify` 拼接到消息里
- ✅ 避免在消息中包含用户输入或大段文本

**示例**:
```ts
// ✅ 推荐
logger.info('Vector queue task finished', { taskId, durationMs, count });

// ❌ 不推荐
logger.info(`Task finished: ${JSON.stringify({ taskId, durationMs, count })}`);
```

## 4. 错误日志标准

**审查要点**:
- ✅ 使用 `error` 字段记录 `Error` 对象，保留堆栈
- ✅ 错误日志包含关键上下文（teamId、datasetId、jobId 等）
- ✅ 捕获后必须记录或向上抛出，避免静默失败

**示例**:
```ts
try {
  await doSomething();
} catch (error) {
  logger.error('Do something failed', { error, teamId, datasetId });
  throw error;
}
```

## 5. 日志等级规范

**审查要点**:
- ✅ `info` 用于阶段开始/完成
- ✅ `warn` 用于可恢复异常
- ✅ `error` 用于失败或影响流程的异常
- ✅ 高频循环日志必须使用 `debug/trace`

**示例**:
```ts
logger.info('Training started', { datasetId });
logger.debug('Training progress', { datasetId, step, total });
logger.warn('Retrying batch', { batchId, retryLeft });
logger.error('Training failed', { datasetId, error });
```

## 6. 请求/任务链路上下文

**审查要点**:
- ✅ HTTP 请求日志应带 `requestId`，优先使用 `withContext`
- ✅ 队列/定时任务日志应带 `jobId`/`queueName`
- ✅ 跨模块调用尽量保持同一上下文字段名

**示例**:
```ts
return withContext({ requestId }, async () => {
  logger.info('Request received', { requestId, method, url });
});
```

## 7. 敏感信息与 OTEL

**审查要点**:
- ✅ 禁止输出 token、密钥、密码、完整对话内容
- ✅ 必须记录敏感信息时做脱敏或截断
- ✅ 需要阻止 OTEL 导出时，可添加 `fastgpt` 属性

**示例**:
```ts
logger.warn('Payload truncated for debug', {
  fastgpt: true,
  payloadPreview: payload.slice(0, 200)
});
```

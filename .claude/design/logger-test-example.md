# Logger 测试示例

## 测试目的

验证新的 logger 系统是否正常工作，特别是 MongoDB 相关的日志输出。

## 测试环境配置

在 `.env.local` 中配置以下环境变量：

```bash
# 启用控制台日志输出
LOG_ENABLE_CONSOLE=true

# 启用调试级别（可选，用于查看 debug 级别日志）
LOG_ENABLE_DEBUG_LEVEL=true

# OpenTelemetry 配置（可选）
LOG_ENABLE_OTEL=false
LOG_OTEL_SERVICE_NAME=fastgpt
# LOG_OTEL_URL=http://localhost:4318/v1/logs
```

## 测试步骤

### 1. 启动应用

```bash
cd /Users/chuanhu9/projects/fastgpt-pro/FastGPT
pnpm dev
```

### 2. 观察日志输出

启动时应该能看到类似以下的日志：

```
✓ Logtape console sink enabled
[INFO] 2026-02-09 11:30:00 infra:mongo Starting MongoDB connection
[INFO] 2026-02-09 11:30:01 infra:mongo MongoDB connected successfully
[DBG]  2026-02-09 11:30:02 infra:mongo Loading MongoDB model { modelName: "users" }
[DBG]  2026-02-09 11:30:02 infra:mongo Loading MongoDB model { modelName: "teams" }
```

### 3. 测试慢查询日志

执行一个需要较长时间的数据库查询，应该能看到慢查询警告：

```
[WARN] 2026-02-09 11:31:00 infra:mongo MongoDB slow query (>500ms) { duration: 750, collectionName: "users", op: "find", query: {...} }
```

### 4. 测试错误日志

如果 MongoDB 连接失败或出现错误，应该能看到错误日志：

```
[ERR]  2026-02-09 11:30:00 infra:mongo MongoDB connection error { error: "...", stack: "..." }
```

## 预期结果

✅ 日志输出格式统一，使用 logtape 的格式
✅ 日志包含 category 信息 (如 `infra:mongo`)
✅ 日志包含时间戳
✅ 日志包含结构化数据 (JSON 格式的 properties)
✅ 不同级别的日志使用不同的标识 ([DBG], [INFO], [WARN], [ERR])

## 日志级别说明

- **DEBUG**: 调试信息，如模型加载
- **INFO**: 一般信息，如连接成功
- **WARN**: 警告信息，如慢查询
- **ERROR**: 错误信息，如连接失败

## Category 使用情况

当前已替换的 MongoDB 相关日志使用的 category:

- `infra:mongo` - 所有 MongoDB 相关日志
  - 连接/断开日志
  - 模型加载日志
  - 慢查询日志
  - 索引同步错误

## 验证 logtape 功能

### 1. Context 功能测试

可以使用 `withContext` 添加上下文信息：

```typescript
import { getLogger, LogCategories, withContext } from '@fastgpt/service/common/logger';

const logger = getLogger(LogCategories.INFRA.MONGO);

// 添加请求上下文
await withContext({ requestId: '123', userId: 'user-456' }, async () => {
  logger.info('Processing request');
  // 日志会自动包含 requestId 和 userId
});
```

### 2. Category Prefix 测试

可以使用 `withCategoryPrefix` 添加子分类：

```typescript
import { getLogger, LogCategories, withCategoryPrefix } from '@fastgpt/service/common/logger';

const baseLogger = getLogger(LogCategories.INFRA.MONGO);
const queryLogger = withCategoryPrefix(baseLogger, 'query');

queryLogger.info('Executing query');
// Category 会变成: infra:mongo:query
```

## 与旧系统的兼容性

当前实现保持了与旧 `addLog` 系统的兼容性：
- 新 logger 调用已添加
- 旧 `addLog` 调用暂时保留
- 双写确保过渡期的稳定性

后续可以逐步移除 `addLog` 调用。

## 性能影响

Logtape 的性能特性：
- 支持 non-blocking 写入
- 支持 buffer (8192 条)
- 支持 lazy 初始化
- 每 5 秒自动 flush

这些特性确保日志系统对应用性能影响最小。

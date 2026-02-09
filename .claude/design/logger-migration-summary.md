# Logger 标准化与迁移工作总结

## ✅ 已完成的工作

### 1. 标准化 Category 定义 (P0)

**文件**: `packages/service/common/logger/categories.ts`

创建了完整的 category 层级结构：
- `APP` - 应用层日志
- `INFRA.*` - 基础设施层 (mongo, postgres, redis, vector)
- `HTTP.*` - HTTP 层 (request, response, error)
- `MODULE.*` - 业务模块层 (workflow, dataset, ai, user, wallet, team, outlink)
- `ERROR` - 错误层
- `EVENT.*` - 事件层 (outlink, feishu, wechat)

### 2. 更新 Logger 配置

**文件**: `packages/service/common/logger/loggers.ts`

添加了 `event` category 的配置。

### 3. 导出标准化 Category

**文件**: `packages/service/common/logger/index.ts`

导出了 `LogCategories` 和 `LogCategory` 类型，方便其他模块使用。

### 4. 替换 MongoDB 相关日志 (P0)

#### 文件 1: `packages/service/common/mongo/init.ts`
替换内容：
- ✅ MongoDB 连接开始日志: `console.log` → `logger.info`
- ✅ MongoDB 连接成功日志: `console.log` → `logger.info`
- ✅ MongoDB 连接错误日志: `console.error` → `logger.error`
- ✅ MongoDB 断开连接日志: `console.error` → `logger.warn`
- ✅ MongoDB 连接失败重试日志: `addLog.error` → `logger.error` (保留 addLog)

#### 文件 2: `packages/service/common/mongo/index.ts`
替换内容：
- ✅ 模型加载日志: `console.log` → `logger.debug`
- ✅ 慢查询日志: 添加 `logger.warn` (保留 addLog)
- ✅ 索引同步错误日志: 添加 `logger.error` (保留 addLog)

#### 文件 3: `projects/app/src/instrumentation.ts`
替换内容：
- ✅ 系统初始化成功日志: `console.log` → `logger.info` (APP category)
- ✅ 系统初始化失败日志: `console.log` → `logger.error` (ERROR category)

### 5. 创建文档

- ✅ 设计文档: `.claude/design/logger-standardization.md`
- ✅ 测试示例: `.claude/design/logger-test-example.md`
- ✅ 工作总结: `.claude/design/logger-migration-summary.md`

## 📊 迁移状态

### 已迁移模块
- ✅ MongoDB 连接管理 (`common/mongo/init.ts`)
- ✅ MongoDB 模型管理 (`common/mongo/index.ts`)
- ✅ 系统初始化 (`projects/app/src/instrumentation.ts`)

### 保留的兼容性
为了确保平滑过渡，以下位置保留了旧的 `addLog` 调用：
- MongoDB 连接错误 (init.ts:69)
- 慢查询警告 (index.ts:78-80)
- 索引同步错误 (index.ts:159)

这些双写确保了：
1. 新 logger 系统立即生效
2. 旧系统功能不受影响 (如 MongoDB 存储)
3. 可以安全地验证新系统的正确性

## 🎯 测试建议

### 1. 基础功能测试

```bash
# 启动应用
cd /Users/chuanhu9/projects/fastgpt-pro/FastGPT
pnpm dev
```

预期看到的日志：
```
✓ Logtape console sink enabled
[INFO] 2026-02-09 11:30:00 infra:mongo Starting MongoDB connection
[INFO] 2026-02-09 11:30:01 infra:mongo MongoDB connected successfully
[INFO] 2026-02-09 11:30:05 app System initialized successfully
```

### 2. 调试模式测试

在 `.env.local` 中设置：
```bash
LOG_ENABLE_DEBUG_LEVEL=true
```

预期能看到 DEBUG 级别的日志：
```
[DBG]  2026-02-09 11:30:02 infra:mongo Loading MongoDB model { modelName: "users" }
```

### 3. 慢查询测试

执行一个较慢的数据库查询，预期能看到：
```
[WARN] 2026-02-09 11:31:00 infra:mongo MongoDB slow query (>500ms) { duration: 750, ... }
```

### 4. 错误测试

故意配置错误的 MongoDB 连接字符串，预期能看到：
```
[ERR]  2026-02-09 11:30:00 infra:mongo MongoDB connection error { error: "...", stack: "..." }
[ERR]  2026-02-09 11:30:01 infra:mongo MongoDB connection failed, retrying... { ... }
```

## 📝 后续工作建议

### P1 - 近期实施 (1-2周内)

1. **替换其他基础设施日志**
   - Redis 相关日志 → `LogCategories.INFRA.REDIS`
   - PostgreSQL 相关日志 → `LogCategories.INFRA.POSTGRES`
   - 向量数据库日志 → `LogCategories.INFRA.VECTOR`

2. **替换 HTTP 相关日志**
   - 请求日志 → `LogCategories.HTTP.REQUEST`
   - 响应日志 → `LogCategories.HTTP.RESPONSE`
   - HTTP 错误 → `LogCategories.HTTP.ERROR`

3. **添加请求上下文**
   使用 `withContext` 为每个请求添加 requestId、userId 等上下文：
   ```typescript
   import { withContext, getLogger, LogCategories } from '@fastgpt/service/common/logger';

   // 在中间件中
   await withContext({ requestId, userId }, async () => {
     // 所有这里的日志都会自动包含 requestId 和 userId
     logger.info('Processing request');
   });
   ```

### P2 - 逐步实施 (1-3个月)

1. **替换业务模块日志**
   - Workflow 模块 → `LogCategories.MODULE.WORKFLOW`
   - Dataset 模块 → `LogCategories.MODULE.DATASET`
   - AI 模块 → `LogCategories.MODULE.AI`
   - User 模块 → `LogCategories.MODULE.USER`
   - Wallet 模块 → `LogCategories.MODULE.WALLET`
   - Team 模块 → `LogCategories.MODULE.TEAM`

2. **添加 MongoDB Sink (可选)**
   如果需要保留日志存储到 MongoDB 的功能，创建自定义 sink：
   ```typescript
   // packages/service/common/logger/sinks/mongo.ts
   export function getMongoSink(): Sink {
     return async (record) => {
       if (connectionMongo.connection.readyState === 1) {
         await getMongoLog().create({
           timestamp: record.timestamp,
           level: record.level,
           category: record.category.join(':'),
           message: record.message,
           properties: record.properties
         });
       }
     };
   }
   ```

3. **移除旧的 addLog 系统**
   当所有模块都迁移到新 logger 后：
   - 移除 `packages/service/common/system/log.ts` 中的 `addLog` 实现
   - 移除所有 `addLog` 调用
   - 更新相关文档

### P3 - 优化增强 (可选)

1. **日志聚合与分析**
   - 配置 OpenTelemetry 将日志发送到 Signoz/Grafana
   - 设置日志告警规则
   - 创建日志分析仪表板

2. **性能监控**
   - 监控日志系统的性能影响
   - 调整 buffer 大小和 flush 间隔
   - 优化日志结构和大小

3. **日志规范**
   - 编写日志记录规范文档
   - 创建 ESLint 规则禁止直接使用 console.log
   - 培训团队成员使用新的 logger 系统

## 🔧 环境变量配置

当前 logger 支持的环境变量：

```bash
# 启用控制台输出
LOG_ENABLE_CONSOLE=true

# 启用调试级别 (显示 debug 日志)
LOG_ENABLE_DEBUG_LEVEL=false

# 启用 OpenTelemetry
LOG_ENABLE_OTEL=false
LOG_OTEL_SERVICE_NAME=fastgpt
LOG_OTEL_URL=http://localhost:4318/v1/logs
```

## 🎓 最佳实践

### 1. Category 选择

```typescript
// ✅ 正确 - 使用预定义的 category
import { getLogger, LogCategories } from '@fastgpt/service/common/logger';
const logger = getLogger(LogCategories.INFRA.MONGO);

// ❌ 错误 - 硬编码 category
const logger = getLogger(['infra', 'mongo']);
```

### 2. 结构化日志

```typescript
// ✅ 正确 - 使用结构化数据
logger.info('User logged in', { userId, username, ip });

// ❌ 错误 - 拼接字符串
logger.info(`User ${username} logged in from ${ip}`);
```

### 3. 错误日志

```typescript
// ✅ 正确 - 包含完整错误信息
logger.error('Failed to save user', {
  error: error.message,
  stack: error.stack,
  userId
});

// ❌ 错误 - 只记录错误对象
logger.error('Failed to save user', error);
```

### 4. 日志级别

- **DEBUG**: 开发调试信息，生产环境不输出
- **INFO**: 重要的业务流程节点
- **WARN**: 需要关注但不影响功能的问题
- **ERROR**: 影响功能的错误

## 📈 预期收益

1. **统一的日志格式**: 所有日志使用相同的格式和结构
2. **更好的可观测性**: 通过 category 快速定位问题
3. **灵活的输出**: 支持 console、OpenTelemetry 等多种输出
4. **性能优化**: non-blocking 和 buffer 机制
5. **易于扩展**: 可以轻松添加新的 sink 和 filter
6. **类型安全**: TypeScript 类型检查确保正确使用

## 🔄 回滚方案

如果新 logger 出现问题：
1. 旧的 `addLog` 系统仍然保留并运行
2. 可以通过注释掉新 logger 调用快速回滚
3. 不影响核心业务功能

## 📞 支持

如有问题或需要帮助，请参考：
- 设计文档: `.claude/design/logger-standardization.md`
- 测试示例: `.claude/design/logger-test-example.md`
- Logtape 官方文档: https://logtape.org

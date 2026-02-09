# Logger 标准化设计文档

## 1. 背景

当前系统中存在两套日志系统：
1. **旧系统**: `packages/service/common/system/log.ts` 中的 `addLog` 对象
   - 使用 console.log/console.error 输出
   - 支持将日志存储到 MongoDB
   - 支持 OpenTelemetry (Signoz)

2. **新系统**: `packages/service/common/logger/` 中基于 `@logtape/logtape` 的实现
   - 更现代的日志库
   - 支持多种 sink (console, OTEL)
   - 使用 category 分类日志
   - 支持结构化日志和上下文

## 2. 目标

1. 标准化 logger 的 category 定义
2. 使用新的 logger 系统替换旧系统
3. 保持 MongoDB 日志存储功能(如需要)
4. 统一日志输出格式和级别控制

## 3. Category 标准化设计

### 3.1 Category 层级结构

```typescript
// 顶层 categories
const CATEGORIES = {
  // 应用层日志
  APP: ['app'],                      // 通用应用日志

  // 基础设施层
  INFRA: {
    MONGO: ['infra', 'mongo'],       // MongoDB 相关
    POSTGRES: ['infra', 'postgres'], // PostgreSQL 相关
    REDIS: ['infra', 'redis'],       // Redis 相关
    VECTOR: ['infra', 'vector'],     // 向量数据库相关
  },

  // HTTP 层
  HTTP: {
    REQUEST: ['http', 'request'],    // HTTP 请求
    RESPONSE: ['http', 'response'],  // HTTP 响应
    ERROR: ['http', 'error'],        // HTTP 错误
  },

  // 业务模块层
  MODULE: {
    WORKFLOW: ['mod', 'workflow'],   // 工作流模块
    DATASET: ['mod', 'dataset'],     // 数据集模块
    AI: ['mod', 'ai'],               // AI 模块
    USER: ['mod', 'user'],           // 用户模块
    WALLET: ['mod', 'wallet'],       // 钱包模块
    TEAM: ['mod', 'team'],           // 团队模块
  },

  // 错误层
  ERROR: ['error'],                  // 通用错误日志

  // 事件层 (保留原有事件类型)
  EVENT: {
    OUTLINK: ['event', 'outlink'],   // 外链事件
    FEISHU: ['event', 'feishu'],     // 飞书事件
    WECHAT: ['event', 'wechat'],     // 微信事件
  },
} as const;
```

### 3.2 Category 使用规范

1. **基础设施日志**: 使用 `INFRA.*` 分类
   - MongoDB 连接、断开、错误 → `infra:mongo`
   - PostgreSQL 操作 → `infra:postgres`
   - Redis 操作 → `infra:redis`

2. **HTTP 日志**: 使用 `HTTP.*` 分类
   - 请求日志 → `http:request`
   - 响应日志 → `http:response`
   - HTTP 错误 → `http:error`

3. **业务模块日志**: 使用 `MODULE.*` 分类
   - 每个业务模块使用独立的子分类
   - 可以进一步细分，如 `mod:workflow:execute`

4. **错误日志**: 使用 `ERROR` 分类
   - 系统级错误、未捕获异常

## 4. 迁移策略

### 4.1 阶段 1: 创建标准化 categories 文件

创建 `packages/service/common/logger/categories.ts`:
```typescript
export const LogCategories = {
  APP: ['app'],
  INFRA: {
    MONGO: ['infra', 'mongo'],
    POSTGRES: ['infra', 'postgres'],
    REDIS: ['infra', 'redis'],
    VECTOR: ['infra', 'vector'],
  },
  // ... 其他分类
} as const;
```

### 4.2 阶段 2: 替换 MongoDB 日志

替换文件：
- `packages/service/common/mongo/init.ts` - MongoDB 连接日志
- 其他使用 `console.log` 的 MongoDB 相关代码

替换方式：
```typescript
// 旧代码
console.log('MongoDB start connect');
console.error('mongo error', error);

// 新代码
import { getLogger } from '@fastgpt/service/common/logger';
import { LogCategories } from '@fastgpt/service/common/logger/categories';

const logger = getLogger(LogCategories.INFRA.MONGO);
logger.info('MongoDB start connect');
logger.error('MongoDB connection error', { error });
```

### 4.3 阶段 3: 添加 MongoDB Sink (可选)

如果需要保留日志存储到 MongoDB 的功能，可以创建自定义 sink:
```typescript
// packages/service/common/logger/sinks/mongo.ts
export function getMongoSink(): Sink {
  return async (record) => {
    if (connectionMongo.connection.readyState === 1) {
      await getMongoLog().create({
        text: record.message,
        level: record.level,
        category: record.category.join(':'),
        metadata: record.properties
      });
    }
  };
}
```

### 4.4 阶段 4: 逐步替换 addLog

1. 保持 `addLog` 作为临时兼容层
2. 逐步替换各模块中的 `addLog` 调用为新 logger
3. 最终移除 `addLog` 实现

## 5. 实施优先级

### P0 - 立即实施
1. 创建 `categories.ts` 标准定义
2. 替换 MongoDB 相关日志 (`mongo/init.ts`)

### P1 - 近期实施
1. 替换其他基础设施日志 (Redis, PostgreSQL)
2. 替换 HTTP 相关日志

### P2 - 逐步实施
1. 替换业务模块日志
2. 添加 MongoDB sink (如需要)
3. 完全移除 `addLog` 系统

## 6. 测试策略

1. **单元测试**: 测试 logger 的各个 category 是否正确输出
2. **集成测试**: 测试 MongoDB 连接时的日志输出
3. **观察日志**: 在开发环境验证日志格式和内容是否符合预期

## 7. 回滚方案

如果新 logger 出现问题：
1. 保留旧的 `addLog` 系统不删除
2. 可以通过环境变量切换回旧系统
3. 监控日志输出，确保没有丢失重要信息

## 8. 配置说明

新 logger 的配置项 (已在 `.env` 中):
```bash
# 启用控制台输出
LOG_ENABLE_CONSOLE=true

# 启用调试级别
LOG_ENABLE_DEBUG_LEVEL=false

# 启用 OpenTelemetry
LOG_ENABLE_OTEL=false
LOG_OTEL_SERVICE_NAME=fastgpt
LOG_OTEL_URL=http://localhost:4318/v1/logs
```

## 9. 注意事项

1. **性能**: logtape 支持 non-blocking 和 buffer，对性能影响较小
2. **兼容性**: 保持与现有日志级别的兼容 (debug/info/warn/error)
3. **上下文**: 充分利用 logtape 的 context 功能，添加请求 ID、用户 ID 等上下文信息
4. **格式化**: 使用 pretty formatter 确保控制台输出易读
5. **存储**: 如需保留 MongoDB 存储，考虑性能和存储成本

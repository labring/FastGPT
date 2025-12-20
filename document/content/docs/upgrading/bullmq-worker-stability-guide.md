# BullMQ Worker 稳定性配置指南

## 问题描述

在生产环境中，BullMQ Worker 可能会在运行一段时间后停止工作，主要原因包括：

1. **Redis 连接断开**：网络波动或 Redis 重启导致连接断开
2. **未捕获的异常**：Worker 进程崩溃
3. **资源耗尽**：内存或连接数耗尽
4. **配置不当**：重试策略、超时配置等不合理

## 已实施的解决方案

### 1. Redis 连接无限重试策略

**文件位置**: `FastGPT/packages/service/common/redis/index.ts`

**改进内容**:
- ✅ 移除了 10 次重试后停止的限制
- ✅ 采用指数退避策略，最长间隔 2 秒
- ✅ 永久重试，确保 Redis 恢复后自动重连

```typescript
retryStrategy: (times: number) => {
  const delay = Math.min(times * 50, 2000);
  return delay; // 永不放弃重试
}
```

### 2. 完善的 Worker 事件处理

**文件位置**: `FastGPT/packages/service/common/bullmq/index.ts`

**新增事件监听**:
- ✅ `error`: 捕获 Worker 错误
- ✅ `failed`: 记录失败的任务
- ✅ `stalled`: 监控停滞的任务
- ✅ `closed`: 检测 Worker 意外关闭
- ✅ `ioredis:close`: Redis 连接关闭
- ✅ `ioredis:reconnecting`: Redis 重连中
- ✅ `ready`: Worker 准备就绪

### 3. 自动健康检查机制

**功能**:
- ✅ 每 60 秒检查所有 Worker 状态
- ✅ 自动重启已停止的 Worker
- ✅ 自动恢复暂停的 Worker
- ✅ 详细的日志记录

**使用方法**:
```typescript
import { startWorkerHealthCheck } from '@fastgpt/service/common/bullmq';

// 在应用启动时调用
startWorkerHealthCheck();
```

### 4. 优化的 Worker 配置

```typescript
{
  lockDuration: 600000,      // 10分钟锁定时间，适用于大文件操作
  stalledInterval: 30000,     // 每30秒检查停滞任务
  maxStalledCount: 3,         // 3次停滞后标记为失败
  autorun: true,              // 自动开始处理任务
  concurrency: 1-6            // 根据任务类型设置并发数
}
```

## 监控和诊断

### 1. 查看 Worker 状态

```typescript
import { workers } from '@fastgpt/service/common/bullmq';

// 检查所有 Worker
for (const [name, worker] of workers.entries()) {
  const isRunning = await worker.isRunning();
  const isPaused = await worker.isPaused();
  console.log(`Worker [${name}]: running=${isRunning}, paused=${isPaused}`);
}
```

### 2. 日志监控

健康检查会自动记录以下日志：

```
✅ 正常: Worker health check started
✅ 正常: MQ Worker [xxx] is ready and running
⚠️ 警告: MQ Worker [xxx] is paused, resuming...
❌ 错误: MQ Worker [xxx] is not running, attempting restart...
❌ 错误: MQ Worker [xxx] closed unexpectedly
```

### 3. 建议的监控指标

在生产环境中，建议监控以下指标：

1. **Worker 存活时间**：确保 Worker 长期运行
2. **Redis 重连次数**：频繁重连可能表示网络问题
3. **停滞任务数量**：`stalled` 事件频率
4. **失败任务数量**：`failed` 事件频率
5. **处理速度**：任务等待时间和处理时间

## 故障排查步骤

### 问题：Worker 频繁重启

1. 检查 Redis 连接稳定性
2. 检查内存使用情况
3. 查看是否有未捕获的异常
4. 增加 `lockDuration` 值

### 问题：任务停滞

1. 检查 `lockDuration` 是否足够
2. 查看处理器是否有死锁
3. 增加 `stalledInterval` 检查频率
4. 检查 Redis 性能

### 问题：任务重复执行

1. 确保使用 `jobId` 去重
2. 检查 `removeOnComplete` 配置
3. 查看是否有多个 Worker 实例

## 最佳实践

### 1. 任务设计

```typescript
// ✅ 推荐：使用 jobId 防止重复
await queue.add('task', data, {
  jobId: `unique-id-${data.id}`,
  removeOnComplete: true
});

// ❌ 不推荐：没有去重机制
await queue.add('task', data);
```

### 2. 错误处理

```typescript
// ✅ 推荐：在 processor 中捕获所有异常
const processor = async (job) => {
  try {
    await doWork(job.data);
  } catch (error) {
    addLog.error('Task failed', error);
    throw error; // 抛出以便 BullMQ 重试
  }
};
```

### 3. 并发控制

```typescript
// 文件删除：高并发
getWorker(QueueNames.s3FileDelete, processor, {
  concurrency: 6
});

// 数据库删除：低并发，避免锁冲突
getWorker(QueueNames.datasetDelete, processor, {
  concurrency: 1
});
```

### 4. 重试策略

```typescript
await queue.add('task', data, {
  attempts: 10,              // 最多重试 10 次
  backoff: {
    type: 'exponential',     // 指数退避
    delay: 5000              // 起始延迟 5 秒
  }
});
```

## 优雅关闭

在应用关闭时，应该优雅地关闭所有 Worker：

```typescript
import { closeAllWorkers } from '@fastgpt/service/common/bullmq';

process.on('SIGTERM', async () => {
  console.log('Shutting down gracefully...');
  await closeAllWorkers();
  process.exit(0);
});
```

## 配置环境变量

```bash
# Redis 连接
REDIS_URL=redis://localhost:6379

# 可选：Redis 集群配置
REDIS_CLUSTER_NODES=redis1:6379,redis2:6379

# 可选：启用 TLS
REDIS_TLS=true
```

## 总结

通过以上配置，BullMQ Worker 现在具备：

1. ✅ **永不放弃**：Redis 断开后自动重连
2. ✅ **自我修复**：健康检查自动重启失败的 Worker
3. ✅ **全面监控**：完整的事件日志和状态追踪
4. ✅ **优雅降级**：任务失败后自动重试
5. ✅ **防止重复**：使用 jobId 去重机制

这些改进确保了 Worker 在生产环境中的长期稳定运行。

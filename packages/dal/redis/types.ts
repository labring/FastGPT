/** Redis 结构化日志 metadata 的最小约定。 */
export type RedisLogMetadata = Record<string, unknown>;

/** Redis Runtime/Cache 共用的日志方法签名。 */
export type RedisLogMethod = (message: string, metadata?: RedisLogMetadata) => void;

/** Runtime 使用完整日志能力；Cache 通过泛型只声明实际使用的级别。 */
export type RedisRuntimeLogger = {
  info: RedisLogMethod;
  warn: RedisLogMethod;
  error: RedisLogMethod;
};

/** Redis Runtime 健康检查的 metrics 结果。metrics 不参与业务错误处理。 */
export type RedisRuntimeHealthMetric = {
  success: boolean;
  latencyMs: number;
};

/** Redis Runtime 关闭耗时的 metrics 结果。 */
export type RedisRuntimeShutdownMetric = {
  durationMs: number;
};

/** Redis Runtime 的可选观测 port；实现方可以接入 OpenTelemetry 或测试 recorder。 */
export type RedisRuntimeMetrics = {
  connectionCreated?: (role: string) => void;
  connectionClosed?: (role: string) => void;
  connectionError?: (role: string) => void;
  healthCheck?: (result: RedisRuntimeHealthMetric) => void;
  shutdownCompleted?: (result: RedisRuntimeShutdownMetric) => void;
};

export type RedisCacheLoggerLevel = 'warn' | 'error';

export type RedisCacheLogger<Level extends RedisCacheLoggerLevel = RedisCacheLoggerLevel> = Pick<
  RedisRuntimeLogger,
  Level
>;

declare const redisLogicalKeyBrand: unique symbol;
declare const redisPhysicalKeyBrand: unique symbol;

export type RedisLogicalKey = string & { readonly [redisLogicalKeyBrand]: true };
export type RedisPhysicalKey = string & { readonly [redisPhysicalKeyBrand]: true };

/** Redis INFO MEMORY operation 的 typed 结果。 */
export type RedisMemoryInfo = {
  usedMemory?: number;
  maxMemory?: number;
};

/** Redis Stream entry 的 normalized 结果，不向 Cache 暴露 raw ioredis response。 */
export type RedisStreamEntry = {
  id: string;
  fields: Record<string, string>;
};

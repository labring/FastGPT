import { getRedisRuntime } from './runtime/connection';

export { closeRedisRuntime, configureRedisRuntime } from './runtime/connection';
export type { RedisRuntimeLogger, RedisRuntimeOptions } from './runtime/connection';
export type {
  RedisCacheLogger,
  RedisLogMetadata,
  RedisLogMethod,
  RedisRuntimeHealthMetric,
  RedisRuntimeMetrics,
  RedisRuntimeShutdownMetric
} from './types';
export { RedisConfigurationError, parseRedisConnectionConfig } from './runtime/config';
export type { RedisConnectionConfig } from './runtime/config';
export {
  isRedisOperationError,
  RedisInvalidArgumentError,
  RedisInvalidResponseError,
  RedisOperationError,
  RedisOperationExecutionError,
  RedisOperationTimeoutError
} from './runtime/errors';
export type {
  RedisOperationErrorCode,
  RedisOperationOutcome,
  RedisOperationRole
} from './runtime/errors';
export { asRedisLogicalKey, createRedisLogicalKey } from './runtime/keyspace';
export type { RedisLogicalKey } from './runtime/keyspace';

/** 检查已经由应用配置的默认 Redis Runtime，不在 DAL 内隐式读取环境变量。 */
export const checkRedisHealth = () => getRedisRuntime().checkHealth();

export {
  closeRedisRuntime,
  configureRedisRuntime,
  RedisRuntime,
  getConfiguredRedisRuntime,
  getRedisRuntime
} from './connection';
export type {
  RedisBeforeCloseHook,
  RedisClient,
  RedisClientFactory,
  RedisConnectionRole,
  RedisConnectionSnapshot,
  RedisConnectionState,
  RedisEndpoint,
  RedisRuntimeLogger,
  RedisRuntimeOptions
} from './connection';
export type {
  RedisRuntimeHealthMetric,
  RedisRuntimeMetrics,
  RedisRuntimeShutdownMetric
} from '../types';
export { registerRedisRuntimeShutdown } from './shutdown';
export type { RedisRuntimeShutdownOptions } from './shutdown';
export { RedisConfigurationError, parseRedisConnectionConfig } from './config';
export type { RedisConnectionConfig } from './config';
export {
  FiniteNumberSchema,
  NonNegativeSafeIntegerSchema,
  PositiveSafeIntegerSchema
} from './schema';
export {
  isRedisOperationError,
  RedisInvalidArgumentError,
  RedisInvalidResponseError,
  RedisOperationError,
  RedisOperationExecutionError,
  RedisOperationTimeoutError
} from './errors';
export type { RedisOperationErrorCode, RedisOperationOutcome, RedisOperationRole } from './errors';
export {
  asRedisLogicalKey,
  createChildRedisScanPattern,
  createRedisLogicalKey,
  FASTGPT_REDIS_PREFIX,
  toLogicalRedisKey,
  toPhysicalRedisKey
} from './keyspace';
export type { RedisLogicalKey, RedisPhysicalKey } from './keyspace';

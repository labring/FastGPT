export {
  checkRedisHealth,
  closeRedisConnections,
  createBlockingRedisConnection,
  createQueueRedisConnection,
  createWorkerRedisConnection,
  getGlobalRedisConnection,
  getRedisConnectionSnapshot
} from './runtime';
export type {
  RedisClient,
  RedisConnectionRole,
  RedisConnectionSnapshot,
  RedisConnectionState,
  RedisEndpoint
} from '@fastgpt/dal/redis/runtime';
export { RedisConfigurationError, parseRedisConnectionConfig } from '@fastgpt/dal/redis';
export type { RedisConnectionConfig } from '@fastgpt/dal/redis';
export {
  isRedisOperationError,
  RedisInvalidArgumentError,
  RedisInvalidResponseError,
  RedisOperationError,
  RedisOperationExecutionError,
  RedisOperationTimeoutError
} from '@fastgpt/dal/redis';
export type {
  RedisOperationErrorCode,
  RedisOperationRole,
  RedisOperationOutcome
} from '@fastgpt/dal/redis';
export { asRedisLogicalKey, createRedisLogicalKey } from '@fastgpt/dal/redis';
export type { RedisLogicalKey } from '@fastgpt/dal/redis';
export { getAllKeysByPrefix } from './scan';

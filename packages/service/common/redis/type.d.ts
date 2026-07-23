import type Redis from 'ioredis';
import type { RedisRuntime } from './runtime/connection';

declare global {
  /** @deprecated Phase 1 仅为测试和热重载兼容保留，业务代码不得直接访问。 */
  var redisClient: Redis | null;
  var redisRuntime: RedisRuntime | undefined;
}

export {};

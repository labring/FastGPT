import type { RedisClient } from '../runtime/connection';
import { RedisInvalidArgumentError, RedisInvalidResponseError } from '../runtime/errors';
import type { RedisLogicalKey } from '../runtime/keyspace';
import { toPhysicalRedisKey } from '../runtime/keyspace';
import { executeRedisOperation } from '../runtime/operation';
import { assertOptionalTtlMs } from '../runtime/validation';
import type { RedisScriptRegistry } from '../script';

type RedisStringClient = Pick<RedisClient, 'del' | 'get' | 'pttl' | 'set'>;

export type RedisTtlState =
  | { state: 'missing' }
  | { state: 'persistent' }
  | { state: 'expiring'; ttlMs: number };

/** 创建 string capability；所有 key 都在内部显式转换为 physical key。 */
export const createRedisStringCapability = ({
  getClient,
  scripts
}: {
  getClient: () => RedisStringClient;
  scripts: RedisScriptRegistry;
}) => ({
  get: (key: RedisLogicalKey) =>
    executeRedisOperation({
      operation: 'string.get',
      execute: async () => {
        const value = await getClient().get(toPhysicalRedisKey(key));
        if (value !== null && typeof value !== 'string') {
          throw new RedisInvalidResponseError({
            operation: 'string.get',
            message: 'Redis GET returned an unsupported response'
          });
        }
        return value;
      }
    }),
  set: ({ key, value, ttlMs }: { key: RedisLogicalKey; value: string; ttlMs?: number }) => {
    const operation = 'string.set';
    if (typeof value !== 'string') {
      throw new RedisInvalidArgumentError({ operation, message: 'value must be a string' });
    }
    assertOptionalTtlMs({ ttlMs, operation });
    return executeRedisOperation({
      operation,
      execute: async () => {
        const physicalKey = toPhysicalRedisKey(key);
        const result = await (ttlMs === undefined
          ? getClient().set(physicalKey, value)
          : getClient().set(physicalKey, value, 'PX', ttlMs));
        if (result !== 'OK') {
          throw new RedisInvalidResponseError({
            operation,
            message: 'Redis string set returned an unsupported response'
          });
        }
      }
    });
  },
  setIfAbsent: ({ key, value, ttlMs }: { key: RedisLogicalKey; value: string; ttlMs?: number }) => {
    const operation = 'string.setIfAbsent';
    if (typeof value !== 'string') {
      throw new RedisInvalidArgumentError({ operation, message: 'value must be a string' });
    }
    assertOptionalTtlMs({ ttlMs, operation });
    return executeRedisOperation({
      operation,
      execute: async () => {
        const physicalKey = toPhysicalRedisKey(key);
        const result = await (ttlMs === undefined
          ? getClient().set(physicalKey, value, 'NX')
          : getClient().set(physicalKey, value, 'PX', ttlMs, 'NX'));
        if (result !== 'OK' && result !== null) {
          throw new RedisInvalidResponseError({
            operation,
            message: 'Redis SET NX returned an unsupported response'
          });
        }
        return result === 'OK';
      }
    });
  },
  delete: (key: RedisLogicalKey) =>
    executeRedisOperation({
      operation: 'string.delete',
      execute: async () => {
        const deleted = await getClient().del(toPhysicalRedisKey(key));
        if (deleted !== 0 && deleted !== 1) {
          throw new RedisInvalidResponseError({
            operation: 'string.delete',
            message: 'Redis delete returned an unsupported response'
          });
        }
        return deleted > 0;
      }
    }),
  getTtl: (key: RedisLogicalKey) =>
    executeRedisOperation({
      operation: 'string.ttl',
      execute: async (): Promise<RedisTtlState> => {
        const ttlMs = await getClient().pttl(toPhysicalRedisKey(key));
        if (ttlMs === -2) return { state: 'missing' };
        if (ttlMs === -1) return { state: 'persistent' };
        if (Number.isSafeInteger(ttlMs) && ttlMs >= 0) return { state: 'expiring', ttlMs };
        throw new RedisInvalidResponseError({
          operation: 'string.ttl',
          message: 'Redis PTTL returned an unsupported response'
        });
      }
    }),
  append: ({ key, value, ttlMs }: { key: RedisLogicalKey; value: string; ttlMs?: number }) =>
    scripts.appendString({ key, value, ttlMs })
});

export type RedisStringCapability = ReturnType<typeof createRedisStringCapability>;

import type { RedisClient } from '../runtime/connection';
import { RedisInvalidArgumentError, RedisInvalidResponseError } from '../runtime/errors';
import type { RedisLogicalKey } from '../runtime/keyspace';
import { toPhysicalRedisKey } from '../runtime/keyspace';
import { executeRedisOperation } from '../runtime/operation';
import { assertFiniteNumber } from '../runtime/validation';

type RedisCounterClient = Pick<RedisClient, 'incrby' | 'incrbyfloat'>;

/** 创建 counter capability；自增操作结果不确定时禁止自动重试。 */
export const createRedisCounterCapability = ({
  getClient
}: {
  getClient: () => RedisCounterClient;
}) => ({
  increment: ({ key, amount = 1 }: { key: RedisLogicalKey; amount?: number }) => {
    const operation = 'counter.increment';
    if (!Number.isSafeInteger(amount)) {
      throw new RedisInvalidArgumentError({
        operation,
        message: 'amount must be a safe integer'
      });
    }
    return executeRedisOperation({
      operation,
      execute: async () => {
        const value = await getClient().incrby(toPhysicalRedisKey(key), amount);
        if (!Number.isSafeInteger(value)) {
          throw new RedisInvalidResponseError({
            operation,
            message: 'Redis INCRBY returned an unsupported response'
          });
        }
        return value;
      }
    });
  },
  incrementFloat: ({ key, amount }: { key: RedisLogicalKey; amount: number }) => {
    const operation = 'counter.incrementFloat';
    assertFiniteNumber({ value: amount, operation, field: 'amount' });
    return executeRedisOperation({
      operation,
      execute: async () => {
        const result = await getClient().incrbyfloat(toPhysicalRedisKey(key), amount);
        const value = Number(result);
        if (typeof result !== 'string' || !Number.isFinite(value)) {
          throw new RedisInvalidResponseError({
            operation,
            message: 'Redis INCRBYFLOAT returned an unsupported response'
          });
        }
        return value;
      }
    });
  }
});

export type RedisCounterCapability = ReturnType<typeof createRedisCounterCapability>;

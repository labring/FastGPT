import type { RedisClient } from '../runtime/connection';
import { RedisInvalidResponseError } from '../runtime/errors';
import type { RedisLogicalKey } from '../runtime/keyspace';
import {
  createChildRedisScanPattern,
  toLogicalRedisKey,
  toPhysicalRedisKey
} from '../runtime/keyspace';
import { executeRedisOperation } from '../runtime/operation';
import { assertPositiveInteger } from '../runtime/validation';

type RedisScanClient = Pick<RedisClient, 'scan' | 'unlink'>;

const DEFAULT_SCAN_BATCH_SIZE = 1_000;
const MAX_SCAN_BATCH_SIZE = 10_000;

/** 创建基于 SCAN/UNLINK 的 best-effort keyspace capability。 */
export const createRedisScanCapability = ({ getClient }: { getClient: () => RedisScanClient }) => {
  const iterate = async function* ({
    prefix,
    batchSize = DEFAULT_SCAN_BATCH_SIZE
  }: {
    prefix: RedisLogicalKey;
    batchSize?: number;
  }): AsyncGenerator<RedisLogicalKey[]> {
    assertPositiveInteger({
      value: batchSize,
      operation: 'scan.iterate',
      field: 'batchSize',
      maximum: MAX_SCAN_BATCH_SIZE
    });
    const pattern = createChildRedisScanPattern(prefix);
    const client = getClient();
    let cursor = '0';

    do {
      const [nextCursor, logicalKeys] = await executeRedisOperation({
        operation: 'scan.iterate',
        execute: async () => {
          const result = await client.scan(cursor, 'MATCH', pattern, 'COUNT', batchSize);
          if (
            !Array.isArray(result) ||
            result.length !== 2 ||
            typeof result[0] !== 'string' ||
            !Array.isArray(result[1]) ||
            result[1].some((key) => typeof key !== 'string')
          ) {
            throw new RedisInvalidResponseError({
              operation: 'scan.iterate',
              message: 'Redis SCAN returned an unsupported response'
            });
          }
          const logicalKeys = result[1].map((key) => {
            try {
              return toLogicalRedisKey(key);
            } catch {
              throw new RedisInvalidResponseError({
                operation: 'scan.iterate',
                message: 'Redis SCAN returned a key outside the FastGPT keyspace'
              });
            }
          });
          return [result[0], logicalKeys] as const;
        }
      });
      cursor = nextCursor;
      if (logicalKeys.length > 0) {
        yield logicalKeys;
      }
    } while (cursor !== '0');
  };

  return {
    iterate,
    deleteByPrefix: async ({
      prefix,
      batchSize
    }: {
      prefix: RedisLogicalKey;
      batchSize?: number;
    }) => {
      let deletedCount = 0;
      for await (const logicalKeys of iterate({ prefix, batchSize })) {
        const physicalKeys = logicalKeys.map(toPhysicalRedisKey);
        const deleted = await executeRedisOperation({
          operation: 'scan.unlink',
          execute: () => getClient().unlink(...physicalKeys)
        });
        if (!Number.isSafeInteger(deleted) || deleted < 0 || deleted > physicalKeys.length) {
          throw new RedisInvalidResponseError({
            operation: 'scan.unlink',
            message: 'Redis UNLINK returned an unsupported response'
          });
        }
        deletedCount += deleted;
      }
      return deletedCount;
    }
  };
};

export type RedisScanCapability = ReturnType<typeof createRedisScanCapability>;

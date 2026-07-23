import type { RedisClient } from '../runtime/connection';
import {
  RedisInvalidArgumentError,
  RedisInvalidResponseError,
  RedisOperationExecutionError
} from '../runtime/errors';
import type { RedisLogicalKey } from '../runtime/keyspace';
import { toPhysicalRedisKey } from '../runtime/keyspace';
import { executeRedisOperation } from '../runtime/operation';
import { assertNonEmptyString, assertPositiveInteger } from '../runtime/validation';

type RedisStreamClient = Pick<RedisClient, 'pexpire' | 'xadd' | 'xrange' | 'xtrim'>;
type RedisBlockingStreamClient = Pick<RedisClient, 'xread'>;

export type RedisStreamEntry = {
  id: string;
  fields: Record<string, string>;
};

const MAX_STREAM_READ_COUNT = 1_000;
const MAX_STREAM_FIELD_COUNT = 128;
const MAX_STREAM_BLOCK_MS = 60_000;
const BLOCKING_CLIENT_DEADLINE_PADDING_MS = 1_000;

const parseStreamEntries = ({
  result,
  operation
}: {
  result: unknown;
  operation: 'stream.readBlocking' | 'stream.readRange';
}): RedisStreamEntry[] => {
  if (!Array.isArray(result)) {
    throw new RedisInvalidResponseError({
      operation,
      message: `Redis operation ${operation} returned an unsupported response`,
      role: operation === 'stream.readBlocking' ? 'blocking' : 'command'
    });
  }

  return result.map((entry) => {
    if (
      !Array.isArray(entry) ||
      entry.length !== 2 ||
      typeof entry[0] !== 'string' ||
      !Array.isArray(entry[1]) ||
      entry[1].length % 2 !== 0 ||
      entry[1].some((value) => typeof value !== 'string')
    ) {
      throw new RedisInvalidResponseError({
        operation,
        message: `Redis operation ${operation} returned malformed stream fields`,
        role: operation === 'stream.readBlocking' ? 'blocking' : 'command'
      });
    }
    const fields: Record<string, string> = {};
    for (let index = 0; index < entry[1].length; index += 2) {
      fields[entry[1][index]] = entry[1][index + 1];
    }
    return { id: entry[0], fields };
  });
};

/** 创建 Redis Stream capability，blocking client 的创建与释放必须成对注入。 */
export const createRedisStreamCapability = ({
  getClient,
  createBlockingClient
}: {
  getClient: () => RedisStreamClient;
  createBlockingClient: () => {
    client: RedisBlockingStreamClient;
    release: () => Promise<void>;
  };
}) => ({
  append: ({ key, fields }: { key: RedisLogicalKey; fields: Readonly<Record<string, string>> }) => {
    const operation = 'stream.append';
    if (!fields || typeof fields !== 'object' || Array.isArray(fields)) {
      throw new RedisInvalidArgumentError({
        operation,
        message: 'fields must be a record'
      });
    }
    const entries = Object.entries(fields);
    if (entries.length === 0 || entries.length > MAX_STREAM_FIELD_COUNT) {
      throw new RedisInvalidArgumentError({
        operation,
        message: `fields must contain between 1 and ${MAX_STREAM_FIELD_COUNT} entries`
      });
    }
    for (const [field, value] of entries) {
      assertNonEmptyString({ value: field, operation, field: 'stream field' });
      if (typeof value !== 'string') {
        throw new RedisInvalidArgumentError({
          operation,
          message: 'stream field values must be strings'
        });
      }
    }
    return executeRedisOperation({
      operation,
      execute: async () => {
        const id = await getClient().xadd(toPhysicalRedisKey(key), '*', ...entries.flat());
        if (typeof id !== 'string' || id.length === 0) {
          throw new RedisInvalidResponseError({
            operation,
            message: 'Redis XADD returned an unsupported response'
          });
        }
        return id;
      }
    });
  },
  readRange: ({
    key,
    start = '-',
    end = '+',
    count = 100
  }: {
    key: RedisLogicalKey;
    start?: string;
    end?: string;
    count?: number;
  }) => {
    const operation = 'stream.readRange';
    assertNonEmptyString({ value: start, operation, field: 'start' });
    assertNonEmptyString({ value: end, operation, field: 'end' });
    assertPositiveInteger({
      value: count,
      operation,
      field: 'count',
      maximum: MAX_STREAM_READ_COUNT
    });
    return executeRedisOperation({
      operation,
      execute: async () => {
        const result = await getClient().xrange(
          toPhysicalRedisKey(key),
          start,
          end,
          'COUNT',
          count
        );
        return parseStreamEntries({ result, operation });
      }
    });
  },
  readBlocking: async ({
    key,
    afterId,
    blockMs,
    count = 1
  }: {
    key: RedisLogicalKey;
    afterId: string;
    blockMs: number;
    count?: number;
  }) => {
    const operation = 'stream.readBlocking';
    assertNonEmptyString({ value: afterId, operation, field: 'afterId' });
    assertPositiveInteger({
      value: blockMs,
      operation,
      field: 'blockMs',
      maximum: MAX_STREAM_BLOCK_MS
    });
    assertPositiveInteger({
      value: count,
      operation,
      field: 'count',
      maximum: MAX_STREAM_READ_COUNT
    });
    const { client, release } = (() => {
      try {
        return createBlockingClient();
      } catch (error) {
        throw new RedisOperationExecutionError({
          operation,
          role: 'blocking',
          attempt: 1,
          outcome: 'failed',
          cause: error
        });
      }
    })();
    const physicalKey = toPhysicalRedisKey(key);
    try {
      return await executeRedisOperation({
        operation,
        role: 'blocking',
        timeoutMs: blockMs + BLOCKING_CLIENT_DEADLINE_PADDING_MS,
        execute: async () => {
          const result = await client.xread(
            'COUNT',
            count,
            'BLOCK',
            blockMs,
            'STREAMS',
            physicalKey,
            afterId
          );
          if (result === null) return [];
          if (
            !Array.isArray(result) ||
            result.length !== 1 ||
            !Array.isArray(result[0]) ||
            result[0].length !== 2 ||
            result[0][0] !== physicalKey ||
            !Array.isArray(result[0][1])
          ) {
            throw new RedisInvalidResponseError({
              operation,
              message: 'Redis XREAD returned an unsupported response',
              role: 'blocking'
            });
          }
          return parseStreamEntries({ result: result[0][1], operation });
        }
      });
    } finally {
      await release();
    }
  },
  trim: ({ key, maxLength }: { key: RedisLogicalKey; maxLength: number }) => {
    const operation = 'stream.trim';
    assertPositiveInteger({ value: maxLength, operation, field: 'maxLength' });
    return executeRedisOperation({
      operation,
      execute: async () => {
        const trimmed = await getClient().xtrim(toPhysicalRedisKey(key), 'MAXLEN', '~', maxLength);
        if (!Number.isSafeInteger(trimmed) || trimmed < 0) {
          throw new RedisInvalidResponseError({
            operation,
            message: 'Redis XTRIM returned an unsupported response'
          });
        }
        return trimmed;
      }
    });
  },
  expire: ({ key, ttlMs }: { key: RedisLogicalKey; ttlMs: number }) => {
    const operation = 'stream.expire';
    assertPositiveInteger({ value: ttlMs, operation, field: 'ttlMs' });
    return executeRedisOperation({
      operation,
      execute: async () => {
        const result = await getClient().pexpire(toPhysicalRedisKey(key), ttlMs);
        if (result !== 0 && result !== 1) {
          throw new RedisInvalidResponseError({
            operation,
            message: 'Redis PEXPIRE returned an unsupported response'
          });
        }
        return result === 1;
      }
    });
  }
});

export type RedisStreamCapability = ReturnType<typeof createRedisStreamCapability>;

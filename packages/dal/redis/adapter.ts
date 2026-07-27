import type { RedisClient } from './runtime/connection';
import { RedisInvalidArgumentError, RedisInvalidResponseError } from './runtime/errors';
import type { RedisLogicalKey } from './runtime/keyspace';
import {
  createChildRedisScanPattern,
  toLogicalRedisKey,
  toPhysicalRedisKey
} from './runtime/keyspace';
import { executeRedisOperation } from './runtime/operation';
import { parseOptionalTtlMs, parsePositiveInteger } from './runtime/validation';
import { getRedisRuntime } from './runtime/connection';
import { FiniteNumberSchema, NonNegativeSafeIntegerSchema } from './runtime/schema';
import { z } from 'zod';

type RedisStoreClient = Pick<
  RedisClient,
  'call' | 'del' | 'eval' | 'expire' | 'get' | 'hgetall' | 'multi' | 'scan' | 'set'
>;

export type RedisStreamEntry = {
  id: string;
  fields: Record<string, string>;
};

type RedisStreamClient = Pick<RedisClient, 'call'>;

export type RedisStoreAdapterDependencies = {
  getCommandClient: () => RedisStoreClient;
  createBlockingConnection?: () => RedisStreamClient;
  releaseConnection?: (client: RedisStreamClient) => Promise<void> | void;
};

const DEFAULT_SCAN_BATCH_SIZE = 1_000;
const MAX_SCAN_BATCH_SIZE = 10_000;

const parseStreamFields = ({
  operation,
  rawFields
}: {
  operation: 'stream.range' | 'stream.read';
  rawFields: unknown;
}): Record<string, string> => {
  if (
    !Array.isArray(rawFields) ||
    rawFields.length % 2 !== 0 ||
    rawFields.some((field) => typeof field !== 'string')
  ) {
    throw new RedisInvalidResponseError({
      operation,
      message: 'Redis Stream fields returned an unsupported response'
    });
  }

  const fields: Record<string, string> = {};
  for (let index = 0; index < rawFields.length; index += 2) {
    fields[rawFields[index] as string] = rawFields[index + 1] as string;
  }
  return fields;
};

const parseStreamEntries = ({
  operation,
  rawEntries
}: {
  operation: 'stream.range' | 'stream.read';
  rawEntries: unknown;
}): RedisStreamEntry[] => {
  if (!Array.isArray(rawEntries)) {
    throw new RedisInvalidResponseError({
      operation,
      message: 'Redis Stream entries returned an unsupported response'
    });
  }

  return rawEntries.map((entry) => {
    if (!Array.isArray(entry) || entry.length !== 2 || typeof entry[0] !== 'string') {
      throw new RedisInvalidResponseError({
        operation,
        message: 'Redis Stream entry returned an unsupported response'
      });
    }

    return {
      id: entry[0],
      fields: parseStreamFields({ operation, rawFields: entry[1] })
    };
  });
};

const RENEW_LEASE_SCRIPT = `
if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("pexpire", KEYS[1], ARGV[2])
end
return 0
`;

const RELEASE_LEASE_SCRIPT = `
if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("del", KEYS[1])
end
return 0
`;

/**
 * 创建供 Redis-backed Repository 使用的最小协议 adapter。
 *
 * Adapter 只接收 logical key，并集中完成 physical key 转换、operation policy 和返回值校验；
 * 构造过程不会创建 Redis 连接。新增命令必须由真实 Repository 迁移驱动，不能提前扩展为通用客户端。
 */
export const createRedisStoreAdapter = ({
  getCommandClient,
  createBlockingConnection,
  releaseConnection
}: RedisStoreAdapterDependencies) => {
  const iterateByPrefix = async function* ({
    prefix,
    batchSize = DEFAULT_SCAN_BATCH_SIZE
  }: {
    prefix: RedisLogicalKey;
    batchSize?: number;
  }): AsyncGenerator<RedisLogicalKey[]> {
    const parsedBatchSize = parsePositiveInteger({
      value: batchSize,
      operation: 'scan.iterate',
      field: 'batchSize',
      maximum: MAX_SCAN_BATCH_SIZE
    });
    const pattern = createChildRedisScanPattern(prefix);
    const client = getCommandClient();
    let cursor = '0';

    do {
      const [nextCursor, logicalKeys] = await executeRedisOperation({
        operation: 'scan.iterate',
        execute: async () => {
          const result = await client.scan(cursor, 'MATCH', pattern, 'COUNT', parsedBatchSize);
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
    /** 原子递增固定窗口计数，并在同一事务中建立窗口 TTL 后返回窗口剩余秒数。 */
    consumeFixedWindow: ({
      key,
      windowSeconds
    }: {
      key: RedisLogicalKey;
      windowSeconds: number;
    }) => {
      const operation = 'fixedWindow.consume' as const;
      const parsedWindowSeconds = parsePositiveInteger({
        value: windowSeconds,
        operation,
        field: 'windowSeconds'
      });

      return executeRedisOperation({
        operation,
        execute: async () => {
          const physicalKey = toPhysicalRedisKey(key);
          const result = await getCommandClient()
            .multi()
            .incr(physicalKey)
            .expire(physicalKey, parsedWindowSeconds, 'NX')
            .ttl(physicalKey)
            .exec();

          if (!Array.isArray(result) || result.length !== 3) {
            throw new RedisInvalidResponseError({
              operation,
              message: 'Redis fixed window transaction returned an unsupported response'
            });
          }

          const parseResult = (entry: unknown, field: string) => {
            if (!Array.isArray(entry) || entry.length !== 2 || entry[0] !== null) {
              throw new RedisInvalidResponseError({
                operation,
                message: `Redis fixed window ${field} result is invalid`
              });
            }
            return entry[1];
          };

          const currentCount = NonNegativeSafeIntegerSchema.safeParse(
            parseResult(result[0], 'INCR')
          );
          const expireResult = z
            .union([z.literal(0), z.literal(1)])
            .safeParse(parseResult(result[1], 'EXPIRE'));
          const ttlSeconds = NonNegativeSafeIntegerSchema.safeParse(parseResult(result[2], 'TTL'));

          if (!currentCount.success || !expireResult.success || !ttlSeconds.success) {
            throw new RedisInvalidResponseError({
              operation,
              message: 'Redis fixed window transaction returned invalid numeric values'
            });
          }

          return {
            currentCount: currentCount.data,
            ttlSeconds: ttlSeconds.data
          };
        }
      });
    },

    /** 在一个事务中读取两个字符串 key，避免双 key cache 读到交叉版本。 */
    getPair: ({ first, second }: { first: RedisLogicalKey; second: RedisLogicalKey }) =>
      executeRedisOperation({
        operation: 'string.getPair',
        execute: async () => {
          const result = await getCommandClient()
            .multi()
            .get(toPhysicalRedisKey(first))
            .get(toPhysicalRedisKey(second))
            .exec();

          if (
            !Array.isArray(result) ||
            result.length !== 2 ||
            result.some(
              (entry) =>
                !Array.isArray(entry) ||
                entry.length !== 2 ||
                entry[0] !== null ||
                (entry[1] !== null && typeof entry[1] !== 'string')
            )
          ) {
            throw new RedisInvalidResponseError({
              operation: 'string.getPair',
              message: 'Redis GET pair returned an unsupported response'
            });
          }

          return [result[0][1] as string | null, result[1][1] as string | null] as const;
        }
      }),
    /** 在一个事务中设置两个带相同 TTL 的字符串 key，保证成对刷新。 */
    setPair: ({
      first,
      second,
      ttlMs
    }: {
      first: { key: RedisLogicalKey; value: string };
      second: { key: RedisLogicalKey; value: string };
      ttlMs: number;
    }) => {
      const operation = 'string.setPair' as const;
      if (typeof first.value !== 'string' || typeof second.value !== 'string') {
        throw new RedisInvalidArgumentError({
          operation,
          message: 'pair values must be strings'
        });
      }
      const parsedTtlMs = parsePositiveInteger({ value: ttlMs, operation, field: 'ttlMs' });

      return executeRedisOperation({
        operation,
        execute: async () => {
          const result = await getCommandClient()
            .multi()
            .set(toPhysicalRedisKey(first.key), first.value, 'PX', parsedTtlMs)
            .set(toPhysicalRedisKey(second.key), second.value, 'PX', parsedTtlMs)
            .exec();

          if (
            !Array.isArray(result) ||
            result.length !== 2 ||
            result.some(
              (entry) =>
                !Array.isArray(entry) ||
                entry.length !== 2 ||
                entry[0] !== null ||
                entry[1] !== 'OK'
            )
          ) {
            throw new RedisInvalidResponseError({
              operation,
              message: 'Redis SET pair returned an unsupported response'
            });
          }
        }
      });
    },
    /** 原子递增浮点值，并只在 key 没有 TTL 时建立 TTL。 */
    incrementWithTtl: ({
      key,
      increment,
      ttlSeconds
    }: {
      key: RedisLogicalKey;
      increment: number;
      ttlSeconds: number;
    }) => {
      const operation = 'number.incrementWithTtl' as const;
      const parsedIncrement = FiniteNumberSchema.safeParse(increment);
      if (!parsedIncrement.success) {
        throw new RedisInvalidArgumentError({
          operation,
          message: 'increment must be a finite number'
        });
      }
      const parsedTtlSeconds = parsePositiveInteger({
        value: ttlSeconds,
        operation,
        field: 'ttlSeconds'
      });

      return executeRedisOperation({
        operation,
        execute: async () => {
          const physicalKey = toPhysicalRedisKey(key);
          const result = await getCommandClient()
            .multi()
            .incrbyfloat(physicalKey, parsedIncrement.data)
            .expire(physicalKey, parsedTtlSeconds, 'NX')
            .exec();

          if (
            !Array.isArray(result) ||
            result.length !== 2 ||
            result.some((entry) => !Array.isArray(entry) || entry.length !== 2 || entry[0] !== null)
          ) {
            throw new RedisInvalidResponseError({
              operation,
              message: 'Redis increment transaction returned an unsupported response'
            });
          }

          const rawValue = result[0][1];
          const parsedValue = (() => {
            if (typeof rawValue === 'number') return FiniteNumberSchema.safeParse(rawValue);
            if (typeof rawValue !== 'string' || rawValue.trim() === '') {
              return { success: false } as const;
            }
            return FiniteNumberSchema.safeParse(Number(rawValue));
          })();
          const expireResult = z.union([z.literal(0), z.literal(1)]).safeParse(result[1][1]);

          if (!parsedValue.success || !expireResult.success) {
            throw new RedisInvalidResponseError({
              operation,
              message: 'Redis increment transaction returned invalid numeric values'
            });
          }

          return parsedValue.data;
        }
      });
    },
    get: (key: RedisLogicalKey) =>
      executeRedisOperation({
        operation: 'string.get',
        execute: async () => {
          const value = await getCommandClient().get(toPhysicalRedisKey(key));
          if (value !== null && typeof value !== 'string') {
            throw new RedisInvalidResponseError({
              operation: 'string.get',
              message: 'Redis GET returned an unsupported response'
            });
          }
          return value;
        }
      }),

    /** 原子返回已有值；key 不存在时写入并返回候选值。 */
    getOrSet: ({ key, value }: { key: RedisLogicalKey; value: string }) => {
      const operation = 'string.getOrSet';
      if (typeof value !== 'string') {
        throw new RedisInvalidArgumentError({ operation, message: 'value must be a string' });
      }

      return executeRedisOperation({
        operation,
        execute: async () => {
          const previousValue = await getCommandClient().set(
            toPhysicalRedisKey(key),
            value,
            'NX',
            'GET'
          );
          if (previousValue !== null && typeof previousValue !== 'string') {
            throw new RedisInvalidResponseError({
              operation,
              message: 'Redis SET NX GET returned an unsupported response'
            });
          }
          return previousValue ?? value;
        }
      });
    },

    set: ({ key, value, ttlMs }: { key: RedisLogicalKey; value: string; ttlMs?: number }) => {
      const operation = 'string.set';
      if (typeof value !== 'string') {
        throw new RedisInvalidArgumentError({ operation, message: 'value must be a string' });
      }
      const parsedTtlMs = parseOptionalTtlMs({ ttlMs, operation });

      return executeRedisOperation({
        operation,
        execute: async () => {
          const physicalKey = toPhysicalRedisKey(key);
          const result = await (parsedTtlMs === undefined
            ? getCommandClient().set(physicalKey, value)
            : getCommandClient().set(physicalKey, value, 'PX', parsedTtlMs));
          if (result !== 'OK') {
            throw new RedisInvalidResponseError({
              operation,
              message: 'Redis SET returned an unsupported response'
            });
          }
        }
      });
    },

    /** 使用单条 SET NX EX 原子声明一个带秒级 TTL 的 key。 */
    setIfAbsent: ({
      key,
      value,
      ttlSeconds
    }: {
      key: RedisLogicalKey;
      value: string;
      ttlSeconds: number;
    }) => {
      const operation = 'string.setIfAbsent';
      if (typeof value !== 'string') {
        throw new RedisInvalidArgumentError({ operation, message: 'value must be a string' });
      }
      const parsedTtlSeconds = parsePositiveInteger({
        value: ttlSeconds,
        operation,
        field: 'ttlSeconds'
      });

      return executeRedisOperation({
        operation,
        execute: async () => {
          const result = await getCommandClient().set(
            toPhysicalRedisKey(key),
            value,
            'EX',
            parsedTtlSeconds,
            'NX'
          );
          if (result === 'OK') return true;
          if (result === null) return false;

          throw new RedisInvalidResponseError({
            operation,
            message: 'Redis SET NX returned an unsupported response'
          });
        }
      });
    },

    /** 原子获取一个带毫秒 TTL 的 token lease；已被其他持有者占用时返回 false。 */
    acquireLease: ({
      key,
      token,
      ttlMs
    }: {
      key: RedisLogicalKey;
      token: string;
      ttlMs: number;
    }) => {
      const operation = 'lease.acquire' as const;
      if (typeof token !== 'string' || token.length === 0) {
        throw new RedisInvalidArgumentError({
          operation,
          message: 'token must be a non-empty string'
        });
      }
      const parsedTtlMs = parsePositiveInteger({ value: ttlMs, operation, field: 'ttlMs' });

      return executeRedisOperation({
        operation,
        execute: async () => {
          const result = await getCommandClient().set(
            toPhysicalRedisKey(key),
            token,
            'PX',
            parsedTtlMs,
            'NX'
          );
          if (result === 'OK') return true;
          if (result === null) return false;

          throw new RedisInvalidResponseError({
            operation,
            message: 'Redis lease acquire returned an unsupported response'
          });
        }
      });
    },

    /** 只有 token 仍匹配时才续租，返回 Redis PEXPIRE 的 0/1 结果。 */
    renewLease: ({ key, token, ttlMs }: { key: RedisLogicalKey; token: string; ttlMs: number }) => {
      const operation = 'lease.renew' as const;
      if (typeof token !== 'string' || token.length === 0) {
        throw new RedisInvalidArgumentError({
          operation,
          message: 'token must be a non-empty string'
        });
      }
      const parsedTtlMs = parsePositiveInteger({ value: ttlMs, operation, field: 'ttlMs' });

      return executeRedisOperation({
        operation,
        execute: async () => {
          const result = await getCommandClient().eval(
            RENEW_LEASE_SCRIPT,
            1,
            toPhysicalRedisKey(key),
            token,
            String(parsedTtlMs)
          );
          if (result !== 0 && result !== 1) {
            throw new RedisInvalidResponseError({
              operation,
              message: 'Redis lease renew returned an unsupported response'
            });
          }
          return result === 1;
        }
      });
    },

    /** 只有 token 仍匹配时才释放 lease，避免误删后续持有者。 */
    releaseLease: ({ key, token }: { key: RedisLogicalKey; token: string }) => {
      const operation = 'lease.release' as const;
      if (typeof token !== 'string' || token.length === 0) {
        throw new RedisInvalidArgumentError({
          operation,
          message: 'token must be a non-empty string'
        });
      }

      return executeRedisOperation({
        operation,
        execute: async () => {
          const result = await getCommandClient().eval(
            RELEASE_LEASE_SCRIPT,
            1,
            toPhysicalRedisKey(key),
            token
          );
          if (result !== 0 && result !== 1) {
            throw new RedisInvalidResponseError({
              operation,
              message: 'Redis lease release returned an unsupported response'
            });
          }
          return result === 1;
        }
      });
    },

    /** 读取 hash 全部字段，并严格校验 ioredis 返回的字符串 map。 */
    getHashAll: (key: RedisLogicalKey) =>
      executeRedisOperation({
        operation: 'hash.getAll',
        execute: async () => {
          const value = await getCommandClient().hgetall(toPhysicalRedisKey(key));
          if (
            value === null ||
            typeof value !== 'object' ||
            Array.isArray(value) ||
            Object.entries(value).some(
              ([field, fieldValue]) => typeof field !== 'string' || typeof fieldValue !== 'string'
            )
          ) {
            throw new RedisInvalidResponseError({
              operation: 'hash.getAll',
              message: 'Redis HGETALL returned an unsupported response'
            });
          }
          return value as Record<string, string>;
        }
      }),

    /** 在一个事务中写入 hash 并设置 TTL，避免 hash 无过期时间。 */
    setHashWithTtl: ({
      key,
      fields,
      ttlSeconds
    }: {
      key: RedisLogicalKey;
      fields: Record<string, string>;
      ttlSeconds: number;
    }) => {
      const operation = 'hash.setWithTtl' as const;
      if (
        !fields ||
        Object.keys(fields).length === 0 ||
        Object.values(fields).some((value) => typeof value !== 'string')
      ) {
        throw new RedisInvalidArgumentError({
          operation,
          message: 'hash fields must contain at least one string value'
        });
      }
      const parsedTtlSeconds = parsePositiveInteger({
        value: ttlSeconds,
        operation,
        field: 'ttlSeconds'
      });

      return executeRedisOperation({
        operation,
        execute: async () => {
          const physicalKey = toPhysicalRedisKey(key);
          const result = await getCommandClient()
            .multi()
            .hmset(physicalKey, fields)
            .expire(physicalKey, parsedTtlSeconds)
            .exec();

          if (
            !Array.isArray(result) ||
            result.length !== 2 ||
            !Array.isArray(result[0]) ||
            result[0].length !== 2 ||
            result[0][0] !== null ||
            result[0][1] !== 'OK' ||
            !Array.isArray(result[1]) ||
            result[1].length !== 2 ||
            result[1][0] !== null ||
            result[1][1] !== 1
          ) {
            throw new RedisInvalidResponseError({
              operation,
              message: 'Redis hash set transaction returned an unsupported response'
            });
          }
        }
      });
    },

    /** 追加一个 Stream entry；写入超时不自动重放，因为 XADD 结果可能已经生效。 */
    appendStreamEntry: ({
      key,
      fields
    }: {
      key: RedisLogicalKey;
      fields: Record<string, string>;
    }) => {
      const operation = 'stream.append' as const;
      if (
        !fields ||
        Object.keys(fields).length === 0 ||
        Object.values(fields).some((value) => typeof value !== 'string')
      ) {
        throw new RedisInvalidArgumentError({
          operation,
          message: 'stream fields must contain at least one string value'
        });
      }

      const commandArguments = Object.entries(fields).flatMap(([field, value]) => [field, value]);
      return executeRedisOperation({
        operation,
        execute: async () => {
          const streamId = await getCommandClient().call(
            'XADD',
            toPhysicalRedisKey(key),
            '*',
            ...commandArguments
          );
          if (typeof streamId !== 'string' || streamId.length === 0) {
            throw new RedisInvalidResponseError({
              operation,
              message: 'Redis XADD returned an unsupported response'
            });
          }
          return streamId;
        }
      });
    },

    /** 刷新 Stream key 的秒级 TTL，0/1 以外的返回值视为协议错误。 */
    expireStream: ({ key, ttlSeconds }: { key: RedisLogicalKey; ttlSeconds: number }) => {
      const operation = 'stream.expire' as const;
      const parsedTtlSeconds = parsePositiveInteger({
        value: ttlSeconds,
        operation,
        field: 'ttlSeconds'
      });

      return executeRedisOperation({
        operation,
        execute: async () => {
          const result = await getCommandClient().expire(toPhysicalRedisKey(key), parsedTtlSeconds);
          if (result !== 0 && result !== 1) {
            throw new RedisInvalidResponseError({
              operation,
              message: 'Redis EXPIRE returned an unsupported response'
            });
          }
        }
      });
    },

    /** 分页读取 Stream history，并将 Redis 的交替 field 数组解析为 typed entry。 */
    rangeStream: ({
      key,
      start,
      end,
      count
    }: {
      key: RedisLogicalKey;
      start: string;
      end: string;
      count: number;
    }) => {
      const operation = 'stream.range' as const;
      if (typeof start !== 'string' || typeof end !== 'string') {
        throw new RedisInvalidArgumentError({
          operation,
          message: 'stream range bounds must be strings'
        });
      }
      const parsedCount = parsePositiveInteger({ value: count, operation, field: 'count' });

      return executeRedisOperation({
        operation,
        execute: async () => {
          const rawEntries = await getCommandClient().call(
            'XRANGE',
            toPhysicalRedisKey(key),
            start,
            end,
            'COUNT',
            parsedCount
          );
          return parseStreamEntries({ operation, rawEntries });
        }
      });
    },

    /**
     * 创建请求级 blocking reader。连接只在 reader 生命周期内存在，close 幂等且由调用方
     * 的 finally 触发；reader 不向上层暴露 raw ioredis client。
     */
    createBlockingStreamReader: ({
      key,
      blockMs,
      count = 1
    }: {
      key: RedisLogicalKey;
      blockMs: number;
      count?: number;
    }) => {
      const operation = 'stream.read' as const;
      const parsedBlockMs = parsePositiveInteger({ value: blockMs, operation, field: 'blockMs' });
      const parsedCount = parsePositiveInteger({ value: count, operation, field: 'count' });
      const createBlockingClient =
        createBlockingConnection ?? (() => getRedisRuntime().createBlockingConnection());
      const releaseBlockingClient =
        releaseConnection ??
        ((client: RedisStreamClient) => getRedisRuntime().releaseConnection(client as RedisClient));
      const client = createBlockingClient();
      const physicalKey = toPhysicalRedisKey(key);
      let closePromise: Promise<void> | undefined;

      return {
        read: (cursor: string) => {
          if (typeof cursor !== 'string' || cursor.length === 0) {
            throw new RedisInvalidArgumentError({
              operation,
              message: 'stream cursor must be a non-empty string'
            });
          }

          return executeRedisOperation({
            operation,
            timeoutMs: parsedBlockMs + 5_000,
            execute: async () => {
              const rawResult = await client.call(
                'XREAD',
                'BLOCK',
                parsedBlockMs,
                'COUNT',
                parsedCount,
                'STREAMS',
                physicalKey,
                cursor
              );

              if (rawResult === null) return [];
              if (!Array.isArray(rawResult) || rawResult.length !== 1) {
                throw new RedisInvalidResponseError({
                  operation,
                  message: 'Redis XREAD returned an unsupported response'
                });
              }

              const streamResult = rawResult[0];
              if (
                !Array.isArray(streamResult) ||
                streamResult.length !== 2 ||
                streamResult[0] !== physicalKey
              ) {
                throw new RedisInvalidResponseError({
                  operation,
                  message: 'Redis XREAD stream key returned an unsupported response'
                });
              }

              return parseStreamEntries({ operation, rawEntries: streamResult[1] });
            }
          });
        },
        close: () => {
          closePromise ??= Promise.resolve(releaseBlockingClient(client));
          return closePromise;
        }
      };
    },

    delete: (key: RedisLogicalKey) =>
      executeRedisOperation({
        operation: 'string.delete',
        execute: async () => {
          const deleted = await getCommandClient().del(toPhysicalRedisKey(key));
          if (deleted !== 0 && deleted !== 1) {
            throw new RedisInvalidResponseError({
              operation: 'string.delete',
              message: 'Redis DEL returned an unsupported response'
            });
          }
          return deleted === 1;
        }
      }),

    /** 用单条 DEL 删除一批 logical key；空批次不会获取 Redis connection。 */
    deleteMany: (keys: readonly RedisLogicalKey[]) => {
      if (keys.length === 0) return Promise.resolve();

      const operation = 'string.deleteMany';
      return executeRedisOperation({
        operation,
        execute: async () => {
          const deleted = await getCommandClient().del(...keys.map(toPhysicalRedisKey));
          if (!Number.isSafeInteger(deleted) || deleted < 0 || deleted > keys.length) {
            throw new RedisInvalidResponseError({
              operation,
              message: 'Redis DEL returned an unsupported response'
            });
          }
        }
      });
    },

    iterateByPrefix
  };
};

export type RedisStoreAdapter = ReturnType<typeof createRedisStoreAdapter>;

/** 默认 Repository adapter；仅在具体操作执行时获取已经由应用配置的 Runtime。 */
export const redisRepositoryAdapter = createRedisStoreAdapter({
  getCommandClient: () => getRedisRuntime().getCommandConnection(),
  createBlockingConnection: () => getRedisRuntime().createBlockingConnection(),
  releaseConnection: (client) => getRedisRuntime().releaseConnection(client as RedisClient)
});

export {
  RedisInvalidArgumentError,
  RedisInvalidResponseError,
  RedisOperationError
} from './runtime/errors';
export { asRedisLogicalKey, createRedisLogicalKey } from './runtime/keyspace';
export type { RedisLogicalKey } from './runtime/keyspace';

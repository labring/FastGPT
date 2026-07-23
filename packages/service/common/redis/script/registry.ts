import { createHash } from 'node:crypto';
import type { RedisClient } from '../runtime/connection';
import { RedisInvalidArgumentError, RedisInvalidResponseError } from '../runtime/errors';
import type { RedisLogicalKey, RedisPhysicalKey } from '../runtime/keyspace';
import { toPhysicalRedisKey } from '../runtime/keyspace';
import { executeRedisOperation, type RedisOperation } from '../runtime/operation';
import {
  assertNonEmptyString,
  assertOptionalTtlMs,
  assertPositiveInteger
} from '../runtime/validation';

type RedisScriptClient = Pick<RedisClient, 'eval' | 'evalsha'>;

type RedisScriptDefinition<TResult> = {
  name: string;
  operation: RedisOperation;
  source: string;
  sha: string;
  parseResult: (result: unknown) => TResult;
};

const createScriptDefinition = <TResult>({
  name,
  operation,
  source,
  parseResult
}: Omit<RedisScriptDefinition<TResult>, 'sha'>): RedisScriptDefinition<TResult> => ({
  name,
  operation,
  source,
  sha: createHash('sha1').update(source).digest('hex'),
  parseResult
});

const parseIntegerResult = ({
  result,
  operation
}: {
  result: unknown;
  operation: RedisOperation;
}) => {
  if (typeof result !== 'number' || !Number.isSafeInteger(result) || result < 0) {
    throw new RedisInvalidResponseError({
      operation,
      message: `Redis operation ${operation} returned a non-integer response`
    });
  }
  return result;
};

const parseBooleanIntegerResult = ({
  result,
  operation
}: {
  result: unknown;
  operation: RedisOperation;
}) => {
  const value = parseIntegerResult({ result, operation });
  if (value !== 0 && value !== 1) {
    throw new RedisInvalidResponseError({
      operation,
      message: `Redis operation ${operation} returned an unsupported boolean response`
    });
  }
  return value === 1;
};

const appendStringDefinition = createScriptDefinition({
  name: 'append-string-with-ttl',
  operation: 'string.append',
  source: `local length = redis.call('APPEND', KEYS[1], ARGV[1])
local ttl = tonumber(ARGV[2])
if ttl and ttl > 0 then
  redis.call('PEXPIRE', KEYS[1], ttl)
end
return length`,
  parseResult: (result) => parseIntegerResult({ result, operation: 'string.append' })
});

const setHashDefinition = createScriptDefinition({
  name: 'set-hash-fields-with-ttl',
  operation: 'hash.setFields',
  source: `local changed = redis.call('HSET', KEYS[1], unpack(ARGV, 2))
local ttl = tonumber(ARGV[1])
if ttl and ttl > 0 then
  redis.call('PEXPIRE', KEYS[1], ttl)
end
return changed`,
  parseResult: (result) => parseIntegerResult({ result, operation: 'hash.setFields' })
});

const initializeVersionDefinition = createScriptDefinition({
  name: 'initialize-version',
  operation: 'version.initialize',
  source: `local initialized = redis.call('SET', KEYS[1], ARGV[1], 'NX')
if initialized then
  return {1, ARGV[1]}
end
local current = redis.call('GET', KEYS[1])
if current then
  return {0, current}
end
return redis.error_reply('VERSION_INIT_RACE')`,
  parseResult: (result) => {
    if (
      !Array.isArray(result) ||
      result.length !== 2 ||
      (result[0] !== 0 && result[0] !== 1) ||
      typeof result[1] !== 'string'
    ) {
      throw new RedisInvalidResponseError({
        operation: 'version.initialize',
        message: 'Redis version initialization returned an unsupported response'
      });
    }
    return result[1];
  }
});

const renewLeaseDefinition = createScriptDefinition({
  name: 'renew-lease',
  operation: 'lease.renew',
  source: `if redis.call('GET', KEYS[1]) == ARGV[1] then
  return redis.call('PEXPIRE', KEYS[1], ARGV[2])
end
return 0`,
  parseResult: (result) => parseBooleanIntegerResult({ result, operation: 'lease.renew' })
});

const releaseLeaseDefinition = createScriptDefinition({
  name: 'release-lease',
  operation: 'lease.release',
  source: `if redis.call('GET', KEYS[1]) == ARGV[1] then
  return redis.call('DEL', KEYS[1])
end
return 0`,
  parseResult: (result) => parseBooleanIntegerResult({ result, operation: 'lease.release' })
});

const isNoScriptError = (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error ?? '');
  return /^NOSCRIPT(?:\s|$)/.test(message);
};

/**
 * 创建只包含内置脚本的封闭 registry。
 *
 * Registry 不暴露 register/eval 接口；每个方法固定 key 数量、参数编码、operation policy 和返回解析。
 */
export const createRedisScriptRegistry = ({
  getClient
}: {
  getClient: () => RedisScriptClient;
}) => {
  const executeScript = async <TResult>({
    definition,
    keys,
    args
  }: {
    definition: RedisScriptDefinition<TResult>;
    keys: readonly RedisPhysicalKey[];
    args: readonly string[];
  }) =>
    executeRedisOperation({
      operation: definition.operation,
      execute: async () => {
        const client = getClient();
        const redisArgs = [...keys, ...args];
        const result = await client
          .evalsha(definition.sha, keys.length, ...redisArgs)
          .catch((error) => {
            if (!isNoScriptError(error)) throw error;
            return client.eval(definition.source, keys.length, ...redisArgs);
          });
        return definition.parseResult(result);
      }
    });

  return {
    appendString: ({
      key,
      value,
      ttlMs
    }: {
      key: RedisLogicalKey;
      value: string;
      ttlMs?: number;
    }) => {
      const operation = appendStringDefinition.operation;
      if (typeof value !== 'string') {
        throw new RedisInvalidArgumentError({ operation, message: 'value must be a string' });
      }
      assertOptionalTtlMs({ ttlMs, operation });
      return executeScript({
        definition: appendStringDefinition,
        keys: [toPhysicalRedisKey(key)],
        args: [value, String(ttlMs ?? 0)]
      });
    },
    setHashFields: ({
      key,
      fields,
      ttlMs
    }: {
      key: RedisLogicalKey;
      fields: Readonly<Record<string, string>>;
      ttlMs?: number;
    }) => {
      const operation = setHashDefinition.operation;
      if (!fields || typeof fields !== 'object' || Array.isArray(fields)) {
        throw new RedisInvalidArgumentError({
          operation,
          message: 'fields must be a record'
        });
      }
      const entries = Object.entries(fields);
      if (entries.length === 0 || entries.length > 128) {
        throw new RedisInvalidArgumentError({
          operation,
          message: 'fields must contain between 1 and 128 entries'
        });
      }
      for (const [field, value] of entries) {
        assertNonEmptyString({ value: field, operation, field: 'hash field' });
        if (typeof value !== 'string') {
          throw new RedisInvalidArgumentError({
            operation,
            message: 'hash field values must be strings'
          });
        }
      }
      assertOptionalTtlMs({ ttlMs, operation });
      return executeScript({
        definition: setHashDefinition,
        keys: [toPhysicalRedisKey(key)],
        args: [String(ttlMs ?? 0), ...entries.flat()]
      }).then(() => undefined);
    },
    initializeVersion: ({ key, value }: { key: RedisLogicalKey; value: string }) => {
      const operation = initializeVersionDefinition.operation;
      assertNonEmptyString({ value, operation, field: 'value' });
      return executeScript({
        definition: initializeVersionDefinition,
        keys: [toPhysicalRedisKey(key)],
        args: [value]
      });
    },
    renewLease: ({ key, token, ttlMs }: { key: RedisLogicalKey; token: string; ttlMs: number }) => {
      const operation = renewLeaseDefinition.operation;
      assertNonEmptyString({ value: token, operation, field: 'token' });
      assertPositiveInteger({ value: ttlMs, operation, field: 'ttlMs' });
      return executeScript({
        definition: renewLeaseDefinition,
        keys: [toPhysicalRedisKey(key)],
        args: [token, String(ttlMs)]
      });
    },
    releaseLease: ({ key, token }: { key: RedisLogicalKey; token: string }) => {
      const operation = releaseLeaseDefinition.operation;
      assertNonEmptyString({ value: token, operation, field: 'token' });
      return executeScript({
        definition: releaseLeaseDefinition,
        keys: [toPhysicalRedisKey(key)],
        args: [token]
      });
    }
  };
};

export type RedisScriptRegistry = ReturnType<typeof createRedisScriptRegistry>;

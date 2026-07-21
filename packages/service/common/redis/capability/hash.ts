import type { RedisClient } from '../runtime/connection';
import { RedisInvalidResponseError } from '../runtime/errors';
import type { RedisLogicalKey } from '../runtime/keyspace';
import { toPhysicalRedisKey } from '../runtime/keyspace';
import { executeRedisOperation } from '../runtime/operation';
import type { RedisScriptRegistry } from '../script';

type RedisHashClient = Pick<RedisClient, 'del' | 'hgetall'>;

/** 创建 hash capability；字段序列化仍由后续业务 Store 负责。 */
export const createRedisHashCapability = ({
  getClient,
  scripts
}: {
  getClient: () => RedisHashClient;
  scripts: RedisScriptRegistry;
}) => ({
  getAll: (key: RedisLogicalKey) =>
    executeRedisOperation({
      operation: 'hash.getAll',
      execute: async () => {
        const fields = await getClient().hgetall(toPhysicalRedisKey(key));
        if (
          !fields ||
          Array.isArray(fields) ||
          Object.values(fields).some((value) => typeof value !== 'string')
        ) {
          throw new RedisInvalidResponseError({
            operation: 'hash.getAll',
            message: 'Redis HGETALL returned an unsupported response'
          });
        }
        return fields;
      }
    }),
  setFields: ({
    key,
    fields,
    ttlMs
  }: {
    key: RedisLogicalKey;
    fields: Readonly<Record<string, string>>;
    ttlMs?: number;
  }) => scripts.setHashFields({ key, fields, ttlMs }),
  delete: (key: RedisLogicalKey) =>
    executeRedisOperation({
      operation: 'hash.delete',
      execute: async () => {
        const deleted = await getClient().del(toPhysicalRedisKey(key));
        if (deleted !== 0 && deleted !== 1) {
          throw new RedisInvalidResponseError({
            operation: 'hash.delete',
            message: 'Redis hash delete returned an unsupported response'
          });
        }
        return deleted > 0;
      }
    })
});

export type RedisHashCapability = ReturnType<typeof createRedisHashCapability>;

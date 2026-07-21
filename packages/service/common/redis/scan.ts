import { getPhysicalRedisConnection } from './runtime/connection';
import { createChildRedisScanPattern, toLogicalRedisKey } from './runtime/keyspace';

const SCAN_BATCH_SIZE = 1000;

/** 扫描逻辑前缀下的所有子 key，返回不带 `fastgpt:` 的兼容逻辑 key。 */
export const getAllKeysByPrefix = async (key: string) => {
  if (!key) return [];

  const redis = getPhysicalRedisConnection();
  const pattern = createChildRedisScanPattern(key);
  const results: string[] = [];
  let cursor = '0';

  do {
    const [nextCursor, keys] = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', SCAN_BATCH_SIZE);
    cursor = nextCursor;
    results.push(...keys.map((item) => toLogicalRedisKey(item)));
  } while (cursor !== '0');

  return results;
};

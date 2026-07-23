import { redisCapabilities } from './capability';
import { asRedisLogicalKey } from './runtime/keyspace';

/** 扫描逻辑前缀下的所有子 key，返回不带 `fastgpt:` 的兼容逻辑 key。 */
export const getAllKeysByPrefix = async (key: string) => {
  if (!key) return [];

  const results: string[] = [];
  for await (const keys of redisCapabilities.scan.iterate({
    prefix: asRedisLogicalKey(key)
  })) {
    results.push(...keys);
  }

  return results;
};

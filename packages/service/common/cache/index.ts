import './init';
import { FASTGPT_REDIS_PREFIX, getGlobalRedisConnection } from '../../common/redis';
import type { SystemCacheKeyEnum } from './type';
import { randomUUID } from 'node:crypto';
import { initCache } from './init';

export const getCachedData = async (key: `${SystemCacheKeyEnum}`) => {
  const redis = getGlobalRedisConnection();

  const refreshVersionKey = async (key: `${SystemCacheKeyEnum}`) => {
    if (!global.systemCache) initCache();

    const val = randomUUID();
    await redis.set(`${FASTGPT_REDIS_PREFIX}:VERSION_KEY:${key}`, val);
  };

  const getVersionkey = async (key: `${SystemCacheKeyEnum}`) => {
    if (!global.systemCache) initCache();

    const versionKey = `${FASTGPT_REDIS_PREFIX}:VERSION_KEY:${key}`;
    const val = await redis.get(versionKey);
    if (val) return val;

    const newVal = randomUUID();
    await redis.set(versionKey, newVal);
    return newVal;
  };

  if (!global.systemCache) initCache();

  const versionKey = await getVersionkey(key);
  const isDisableCache = process.env.DISABLE_CACHE === 'true';

  // 命中缓存
  if (global.systemCache[key].versionKey === versionKey && !isDisableCache) {
    return global.systemCache[key].data;
  }

  const refreshedData = await global.systemCache[key].refreshFunc();
  await refreshVersionKey(key);
  global.systemCache[key].data = refreshedData;
  global.systemCache[key].versionKey = versionKey;
  return global.systemCache[key].data;
};

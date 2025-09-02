import './init';
import { FASTGPT_REDIS_PREFIX, getGlobalRedisConnection } from '../../common/redis';
import type { SystemCacheKeyEnum } from './type';
import { randomUUID } from 'node:crypto';
import { initCache } from './init';

export const flushSyncKey = async (key: `${SystemCacheKeyEnum}`) => {
  if (!global.systemCache) initCache();
  const val = randomUUID();
  const redis = getGlobalRedisConnection();
  await redis.set(`${FASTGPT_REDIS_PREFIX}:SYNC_KEY:${key}`, val);
};

const getSynckey = async (key: `${SystemCacheKeyEnum}`) => {
  if (!global.systemCache) initCache();
  const redis = getGlobalRedisConnection();
  const syncKey = `${FASTGPT_REDIS_PREFIX}:SYNC_KEY:${key}`;
  const val = await redis.get(syncKey);
  if (val) return val;
  const newVal = randomUUID();
  await redis.set(syncKey, newVal);
  return newVal;
};

export const getCachedData = async (key: `${SystemCacheKeyEnum}`) => {
  if (!global.systemCache) initCache();
  const syncKey = await getSynckey(key);
  const isDisableCache = process.env.DISABLE_CACHE === 'true';
  if (global.systemCache[key].syncKey === syncKey && !isDisableCache) {
    return global.systemCache[key].data;
  }
  const refreshedData = await global.systemCache[key].refreshFunc();
  await flushSyncKey(key);
  global.systemCache[key].data = refreshedData;
  return global.systemCache[key].data;
};

import './init';
import { FASTGPT_REDIS_PREFIX, getGlobalRedisConnection } from '../../common/redis';
import type { SystemCacheKeyEnum } from './type';
import { randomUUID } from 'node:crypto';

export const flushSyncKey = async (key: `${SystemCacheKeyEnum}`) => {
  const val = randomUUID();
  const redis = getGlobalRedisConnection();
  await redis.set(`${FASTGPT_REDIS_PREFIX}:SYNC_KEY:${key}`, val);
};

const getSynckey = async (key: `${SystemCacheKeyEnum}`) => {
  const redis = getGlobalRedisConnection();
  const syncKey = `${FASTGPT_REDIS_PREFIX}:SYNC_KEY:${key}`;
  const val = await redis.get(syncKey);
  if (val) return val;
  const newVal = randomUUID();
  await redis.set(syncKey, newVal);
  return newVal;
};

export const getCachedData = async (key: `${SystemCacheKeyEnum}`) => {
  const syncKey = await getSynckey(key);
  if (global.systemCache[key].syncKey === syncKey) {
    return global.systemCache[key].data;
  }
  const [_, refreshedData] = await Promise.all([
    flushSyncKey(key),
    global.systemCache[key].refreshFunc()
  ]);
  global.systemCache[key].data = refreshedData;
  return global.systemCache[key].data;
};

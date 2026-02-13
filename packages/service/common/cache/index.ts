import './init';
import { getAllKeysByPrefix, getGlobalRedisConnection } from '../../common/redis';
import type { SystemCacheKeyEnum } from './type';
import { randomUUID } from 'node:crypto';
import { initCache } from './init';
import { isProduction } from '@fastgpt/global/common/system/constants';

const cachePrefix = `VERSION_KEY:`;

/**
 *
 * @param key SystemCacheKeyEnum
 * @param id string (teamId, tmbId, etc), if '*' is used, all keys will be refreshed
 */
export const refreshVersionKey = async (key: `${SystemCacheKeyEnum}`, id?: string | '*') => {
  const redis = getGlobalRedisConnection();
  if (!global.systemCache) initCache();

  const val = randomUUID();
  const versionKey = id ? `${cachePrefix}${key}:${id}` : `${cachePrefix}${key}`;

  if (id === '*') {
    const pattern = `${cachePrefix}${key}`;
    const keys = await getAllKeysByPrefix(pattern);
    if (keys.length > 0) {
      const pipeline = redis.pipeline();
      pipeline.del(keys);
      await pipeline.exec();
    }
  } else {
    await redis.set(versionKey, val);
  }
};

export const getVersionKey = async (key: `${SystemCacheKeyEnum}`, id?: string) => {
  const redis = getGlobalRedisConnection();
  if (!global.systemCache) initCache();

  const versionKey = id ? `${cachePrefix}${key}:${id}` : `${cachePrefix}${key}`;
  const val = await redis.get(versionKey);
  if (val) return val;

  // if there is no val set to the key, init a new val.
  const initVal = randomUUID();
  await redis.set(versionKey, initVal);
  return initVal;
};

export const getCachedData = async <T extends SystemCacheKeyEnum>(key: T, id?: string) => {
  if (!global.systemCache) initCache();

  const versionKey = await getVersionKey(key, id);
  const isDisableCache = process.env.DISABLE_CACHE === 'true';

  const item = global.systemCache[key];

  // 命中缓存
  if ((isProduction || !item.devRefresh) && item.versionKey === versionKey && !isDisableCache) {
    return item.data;
  }

  const refreshedData = await item.refreshFunc();
  item.data = refreshedData;
  item.versionKey = versionKey;
  return item.data;
};

import './init';
import { systemVersionRepository } from '@fastgpt/dal/redis/repositories';
import type { SystemCacheKeyEnum } from './type';
import { initCache } from './init';
import { isProduction } from '@fastgpt/global/common/system/constants';
import { serviceEnv } from '../../env';

/**
 * 刷新系统缓存版本。id 为 '*' 时只失效该类型下的子版本，不修改 base version。
 */
export const refreshVersionKey = async (key: `${SystemCacheKeyEnum}`, id?: string | '*') => {
  if (!global.systemCache) initCache();
  await systemVersionRepository.refresh({ key, id });
};

/** 获取已有系统缓存版本；缺失时由 Repository 原子初始化。 */
export const getVersionKey = async (key: `${SystemCacheKeyEnum}`, id?: string) => {
  if (!global.systemCache) initCache();
  return systemVersionRepository.getOrInitialize({ key, id });
};

export const getCachedData = async <T extends SystemCacheKeyEnum>(key: T, id?: string) => {
  if (!global.systemCache) initCache();

  const versionKey = await getVersionKey(key, id);
  const isDisableCache = serviceEnv.DISABLE_CACHE;

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

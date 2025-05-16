import { getGlobalRedisConnection } from './index';
import { addLog } from '../system/log';
import { retryFn } from '@fastgpt/global/common/system/utils';

const redisPrefix = 'cache:';
const getCacheKey = (key: string) => `${redisPrefix}${key}`;

export enum CacheKeyEnum {
  team_vector_count = 'team_vector_count'
}

export const setRedisCache = async (
  key: string,
  data: string | Buffer | number,
  expireSeconds?: number
) => {
  return await retryFn(async () => {
    try {
      const redis = getGlobalRedisConnection();

      if (expireSeconds) {
        await redis.set(getCacheKey(key), data, 'EX', expireSeconds);
      } else {
        await redis.set(getCacheKey(key), data);
      }
    } catch (error) {
      addLog.error('Set cache error:', error);
      return Promise.reject(error);
    }
  });
};

export const getRedisCache = async (key: string) => {
  const redis = getGlobalRedisConnection();
  return await retryFn(() => redis.get(getCacheKey(key)));
};

export const delRedisCache = async (key: string) => {
  const redis = getGlobalRedisConnection();
  await retryFn(() => redis.del(getCacheKey(key)));
};

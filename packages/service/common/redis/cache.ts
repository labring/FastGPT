import { getGlobalRedisCacheConnection } from './index';
import { addLog } from '../system/log';
import { retryFn } from '@fastgpt/global/common/system/utils';

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
      const redis = getGlobalRedisCacheConnection();

      if (expireSeconds) {
        await redis.set(key, data, 'EX', expireSeconds);
      } else {
        await redis.set(key, data);
      }
    } catch (error) {
      addLog.error('Set cache error:', error);
      return Promise.reject(error);
    }
  });
};

export const getRedisCache = async (key: string) => {
  const redis = getGlobalRedisCacheConnection();
  return await retryFn(() => redis.get(key));
};

export const delRedisCache = async (key: string) => {
  const redis = getGlobalRedisCacheConnection();
  await retryFn(() => redis.del(key));
};

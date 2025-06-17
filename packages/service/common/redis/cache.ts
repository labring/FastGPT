import { getGlobalRedisConnection } from './index';
import { addLog } from '../system/log';
import { retryFn } from '@fastgpt/global/common/system/utils';

const redisPrefix = 'cache:';
const getCacheKey = (key: string) => `${redisPrefix}${key}`;

export enum CacheKeyEnum {
  team_vector_count = 'team_vector_count',
  team_point_surplus = 'team_point_surplus',
  team_point_total = 'team_point_total'
}

export enum CacheKeyEnumTime {
  team_vector_count = 30 * 60,
  team_point_surplus = 1 * 60,
  team_point_total = 1 * 60
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
  const value = await retryFn(() => redis.get(getCacheKey(key)));
  return value;
};

export const incrRedisCache = async (
  key: string,
  increment: number = 1,
  expireSeconds?: number
) => {
  const redis = getGlobalRedisConnection();
  await retryFn(() => redis.incrby(getCacheKey(key), increment));

  if (expireSeconds) {
    await retryFn(async () => {
      const ttl = await redis.ttl(getCacheKey(key));
      if (ttl === -1) {
        await redis.expire(getCacheKey(key), expireSeconds);
      }
    });
  }
};

export const delRedisCache = async (key: string) => {
  const redis = getGlobalRedisConnection();
  await retryFn(() => redis.del(getCacheKey(key)));
};

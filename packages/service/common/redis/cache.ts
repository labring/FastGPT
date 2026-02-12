import { getGlobalRedisConnection } from './index';
import { getLogger, LogCategories } from '../logger';
import { retryFn } from '@fastgpt/global/common/system/utils';

const logger = getLogger(LogCategories.INFRA.REDIS);

const redisPrefix = 'cache:';
const getCacheKey = (key: string) => `${redisPrefix}${key}`;

export enum CacheKeyEnum {
  team_vector_count = 'team_vector_count',
  team_point_surplus = 'team_point_surplus',
  team_point_total = 'team_point_total',
  team_qpm_limit = 'team_qpm_limit'
}

// Seconds
export enum CacheKeyEnumTime {
  team_vector_count = 30 * 60,
  team_point_surplus = 1 * 60,
  team_point_total = 1 * 60,
  team_qpm_limit = 60 * 60
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
      logger.error('Redis cache set failed', { key, expireSeconds, error });
      return Promise.reject(error);
    }
  });
};

export const getRedisCache = async (key: string) => {
  const redis = getGlobalRedisConnection();
  return retryFn(() => redis.get(getCacheKey(key)));
};

// Add value to cache
export const incrValueToCache = async (key: string, increment: number) => {
  if (typeof increment !== 'number' || increment === 0) return;
  const redis = getGlobalRedisConnection();
  try {
    await retryFn(() => redis.incrbyfloat(getCacheKey(key), increment));
  } catch (error) {
    logger.warn('Redis cache increment failed', { key, increment, error });
  }
};

export const delRedisCache = async (key: string) => {
  const redis = getGlobalRedisConnection();
  await retryFn(() => redis.del(getCacheKey(key)));
};

export const appendRedisCache = async (
  key: string,
  value: string | Buffer | number,
  expireSeconds?: number
) => {
  try {
    const redis = getGlobalRedisConnection();
    await retryFn(() => redis.append(getCacheKey(key), value));
    if (expireSeconds) {
      await redis.expire(getCacheKey(key), expireSeconds);
    }
  } catch (error) {
    logger.error('Redis cache append failed', { key, expireSeconds, error });
    return Promise.reject(error);
  }
};

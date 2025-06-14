import { getGlobalRedisConnection } from './index';
import { addLog } from '../system/log';
import { retryFn } from '@fastgpt/global/common/system/utils';

const redisPrefix = 'cache:';
const getCacheKey = (key: string) => `${redisPrefix}${key}`;

export enum CacheKeyEnum {
  team_vector_count = 'team_vector_count',
  team_dataset_count_max = 'team_dataset_count_max',
  team_app_count_max = 'team_app_count_max',
  team_member_count_max = 'team_member_count_max',
  team_current_sub_level = 'team_current_sub_level'
}

export enum CacheKeyEnumTime {
  team_vector_count = 30 * 60,
  team_dataset_count_max = 30 * 60,
  team_app_count_max = 30 * 60,
  team_member_count_max = 30 * 60,
  team_current_sub_level = 30 * 60
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

export const delRedisCache = async (key: string) => {
  const redis = getGlobalRedisConnection();
  await retryFn(() => redis.del(getCacheKey(key)));
};

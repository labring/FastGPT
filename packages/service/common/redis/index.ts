import { addLog } from '../system/log';
import Redis from 'ioredis';

const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';

export const newQueueRedisConnection = () => {
  const redis = new Redis(REDIS_URL);
  redis.on('connect', () => {
    console.log('Redis connected');
  });
  redis.on('error', (error) => {
    console.error('Redis connection error', error);
  });
  return redis;
};

export const newWorkerRedisConnection = () => {
  const redis = new Redis(REDIS_URL, {
    maxRetriesPerRequest: null
  });
  redis.on('connect', () => {
    console.log('Redis connected');
  });
  redis.on('error', (error) => {
    console.error('Redis connection error', error);
  });
  return redis;
};

export const getGlobalRedisCacheConnection = () => {
  if (global.redisCache) return global.redisCache;

  global.redisCache = new Redis(REDIS_URL, { keyPrefix: 'fastgpt:cache:' });

  global.redisCache.on('connect', () => {
    addLog.info('Redis connected');
  });
  global.redisCache.on('error', (error) => {
    addLog.error('Redis connection error', error);
  });

  return global.redisCache;
};

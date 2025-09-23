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

export const FASTGPT_REDIS_PREFIX = 'fastgpt:';
export const getGlobalRedisConnection = () => {
  if (global.redisClient) return global.redisClient;

  global.redisClient = new Redis(REDIS_URL, { keyPrefix: FASTGPT_REDIS_PREFIX });

  global.redisClient.on('connect', () => {
    addLog.info('Redis connected');
  });
  global.redisClient.on('error', (error) => {
    addLog.error('Redis connection error', error);
  });

  return global.redisClient;
};

export const getAllKeysByPrefix = async (key: string) => {
  const redis = getGlobalRedisConnection();
  const keys = (await redis.keys(`${FASTGPT_REDIS_PREFIX}${key}:*`)).map((key) =>
    key.replace(FASTGPT_REDIS_PREFIX, '')
  );
  return keys;
};

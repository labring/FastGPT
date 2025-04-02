import { addLog } from '../system/log';
import Redis from 'ioredis';

const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';

export function newQueueRedisConnection() {
  const redis = new Redis(REDIS_URL);
  redis.on('connect', () => {
    console.log('Redis connected');
  });
  redis.on('error', (error) => {
    console.error('Redis connection error', error);
  });
  return redis;
}

export function newWorkerRedisConnection() {
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
}

export function getGlobalRedisCacheConnection() {
  if (global.redisCache) return global.redisCache;
  const redis = new Redis(REDIS_URL, { keyPrefix: 'fastgpt:cache:' });
  redis.on('connect', () => {
    console.log('Redis connected');
  });
  redis.on('error', (error) => {
    console.error('Redis connection error', error);
  });
  global.redisCache = redis;
  return redis;
}

export async function checkAndIncr(redis: Redis, key: string, retry = 0) {
  // start a transaction
  await redis.watch(key);

  const exists = await redis.exists(key);
  if (exists) {
    const result = await redis.multi().incr(key).exec();
    const err = result?.[0][0];
    if (err) {
      addLog.error('redis opt checkAndIncr', err);
      // retry
      if (retry < 10) {
        await checkAndIncr(redis, key, retry + 1);
      } else {
        // try to delete the dirty cache
        await redis.del(key);
      }
    }
  }
}

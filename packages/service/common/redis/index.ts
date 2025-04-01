import Redis from 'ioredis';

const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';

export function newQueueRedisConnection() {
  return new Redis(REDIS_URL);
}

export function newWorkerRedisConnection() {
  return new Redis(REDIS_URL, {
    maxRetriesPerRequest: null
  });
}

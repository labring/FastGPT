import { addLog } from '../system/log';
import Redis from 'ioredis';

const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';

// Base Redis options for connection reliability
const REDIS_BASE_OPTION = {
  // Retry strategy: exponential backoff with unlimited retries for stability
  retryStrategy: (times: number) => {
    // Never give up retrying to ensure worker keeps running
    const delay = Math.min(times * 50, 2000); // Max 2s between retries
    if (times > 10) {
      addLog.error(`[Redis connection failed] attempt ${times}, will keep retrying...`);
    } else {
      addLog.warn(`Redis reconnecting... attempt ${times}, delay ${delay}ms`);
    }
    return delay; // Always return a delay to keep retrying
  },
  // Reconnect on specific errors (Redis master-slave switch, network issues)
  reconnectOnError: (err: any) => {
    const reconnectErrors = ['READONLY', 'ECONNREFUSED', 'ETIMEDOUT', 'ECONNRESET'];
    const message = typeof err?.message === 'string' ? err.message : String(err ?? '');

    const shouldReconnect = reconnectErrors.some((errType) => message.includes(errType));
    if (shouldReconnect) {
      addLog.warn(`Redis reconnecting due to error: ${message}`);
    }
    return shouldReconnect;
  },
  // Connection timeout
  connectTimeout: 10000, // 10 seconds
  // Enable offline queue to buffer commands when disconnected
  enableOfflineQueue: true
};

export const newQueueRedisConnection = () => {
  const redis = new Redis(REDIS_URL, {
    ...REDIS_BASE_OPTION,
    // Limit retries for queue operations
    maxRetriesPerRequest: 3
  });
  return redis;
};

export const newWorkerRedisConnection = () => {
  const redis = new Redis(REDIS_URL, {
    ...REDIS_BASE_OPTION,
    // BullMQ requires maxRetriesPerRequest: null for blocking operations
    maxRetriesPerRequest: null
  });
  return redis;
};

export const FASTGPT_REDIS_PREFIX = 'fastgpt:';
export const getGlobalRedisConnection = () => {
  if (global.redisClient) return global.redisClient;

  global.redisClient = new Redis(REDIS_URL, {
    ...REDIS_BASE_OPTION,
    keyPrefix: FASTGPT_REDIS_PREFIX,
    maxRetriesPerRequest: 3
  });

  global.redisClient.on('connect', () => {
    addLog.info('[Global Redis] connected');
  });
  global.redisClient.on('error', (error) => {
    addLog.error('[Global Redis] connection error', error);
  });
  global.redisClient.on('close', () => {
    addLog.warn('[Global Redis] connection closed');
  });

  return global.redisClient;
};

export const getAllKeysByPrefix = async (key: string) => {
  if (!key) return [];

  const redis = getGlobalRedisConnection();
  const prefix = FASTGPT_REDIS_PREFIX;
  const pattern = `${prefix}${key}:*`;

  let cursor = '0';
  const batchSize = 1000; // SCAN 每次取多少
  const results: string[] = [];

  do {
    const [nextCursor, keys] = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', batchSize);
    cursor = nextCursor;

    for (const k of keys) {
      results.push(k.replace(FASTGPT_REDIS_PREFIX, ''));
    }
  } while (cursor !== '0');

  return results;
};

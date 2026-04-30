import { getLogger, LogCategories } from '../logger';
import Redis from 'ioredis';
import type { RedisOptions } from 'ioredis';

const logger = getLogger(LogCategories.INFRA.REDIS);

const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';

// Base Redis options for connection reliability
const REDIS_BASE_OPTION = {
  // Retry strategy: exponential backoff with unlimited retries for stability
  retryStrategy: (times: number) => {
    // Never give up retrying to ensure worker keeps running
    const delay = Math.min(times * 50, 2000); // Max 2s between retries
    if (times > 10) {
      logger.error('Redis reconnect failed, continuing to retry', {
        attempt: times,
        delayMs: delay
      });
    } else {
      logger.warn('Redis reconnecting', {
        attempt: times,
        delayMs: delay
      });
    }
    return delay; // Always return a delay to keep retrying
  },
  // Reconnect on specific errors (Redis master-slave switch, network issues)
  reconnectOnError: (err: any) => {
    const reconnectErrors = ['READONLY', 'ECONNREFUSED', 'ETIMEDOUT', 'ECONNRESET'];
    const message = typeof err?.message === 'string' ? err.message : String(err ?? '');

    const shouldReconnect = reconnectErrors.some((errType) => message.includes(errType));
    if (shouldReconnect) {
      logger.warn('Redis reconnecting due to error', { message });
    }
    return shouldReconnect;
  },
  // Connection timeout
  connectTimeout: 10000, // 10 seconds
  // Enable offline queue to buffer commands when disconnected
  enableOfflineQueue: true
};

const getRedisConnectionOptions = (): RedisOptions => {
  if (REDIS_URL.startsWith('/')) {
    return {
      ...REDIS_BASE_OPTION,
      path: REDIS_URL
    };
  }

  const normalizedRedisUrl = REDIS_URL.includes('://') ? REDIS_URL : `redis://${REDIS_URL}`;

  try {
    const redisUrl = new URL(normalizedRedisUrl);
    const protocol = redisUrl.protocol.toLowerCase();

    if (protocol !== 'redis:' && protocol !== 'rediss:') {
      logger.warn('Unsupported Redis URL protocol, fallback to defaults', {
        protocol,
        redisUrl: REDIS_URL
      });
      return {
        ...REDIS_BASE_OPTION
      };
    }

    const dbFromPath = redisUrl.pathname.replace(/^\//, '');
    const parsedDb = dbFromPath ? Number(dbFromPath) : undefined;
    const db = Number.isFinite(parsedDb) ? parsedDb : undefined;

    const options: RedisOptions = {
      ...REDIS_BASE_OPTION,
      host: redisUrl.hostname || 'localhost',
      port: redisUrl.port ? Number(redisUrl.port) : 6379
    };

    if (redisUrl.username) options.username = decodeURIComponent(redisUrl.username);
    if (redisUrl.password) options.password = decodeURIComponent(redisUrl.password);
    if (db !== undefined) options.db = db;
    if (protocol === 'rediss:') options.tls = {};

    return options;
  } catch (error) {
    logger.warn('Failed to parse REDIS_URL with WHATWG URL API, fallback to defaults', {
      redisUrl: REDIS_URL,
      error: String(error)
    });
    return {
      ...REDIS_BASE_OPTION
    };
  }
};

export const newQueueRedisConnection = () => {
  const redis = new Redis({
    ...getRedisConnectionOptions(),
    // Limit retries for queue operations
    maxRetriesPerRequest: 3
  });
  return redis;
};

export const newWorkerRedisConnection = () => {
  const redis = new Redis({
    ...getRedisConnectionOptions(),
    // BullMQ requires maxRetriesPerRequest: null for blocking operations
    maxRetriesPerRequest: null
  });
  return redis;
};

export const FASTGPT_REDIS_PREFIX = 'fastgpt:';
export const getGlobalRedisConnection = () => {
  if (global.redisClient) return global.redisClient;

  global.redisClient = new Redis({
    ...getRedisConnectionOptions(),
    keyPrefix: FASTGPT_REDIS_PREFIX,
    maxRetriesPerRequest: 3
  });

  global.redisClient.on('connect', () => {
    logger.info('Global Redis connected');
  });
  global.redisClient.on('error', (error) => {
    logger.error('Global Redis connection error', { error });
  });
  global.redisClient.on('close', () => {
    logger.warn('Global Redis connection closed');
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

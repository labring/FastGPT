import type { RedisOptions } from 'ioredis';
import Redis, { Cluster } from 'ioredis';
import { parseRedisConfig } from './config';
import { addLog } from '../system/log';

// Use hash tag {fastgpt} to ensure all keys go to the same slot in cluster mode
// In standalone mode, the braces are just regular characters with no special meaning
export const FASTGPT_REDIS_PREFIX = '{fastgpt}:';

export type RedisConnection = Redis | Cluster;

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
  reconnectOnError: (err: Error) => {
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

/**
 * Create a new Redis connection based on configuration
 * This replaces the direct `new Redis()` calls
 */
function createRedisConnection(additionalOptions?: Partial<RedisOptions>): RedisConnection {
  const config = parseRedisConfig();

  if (config.mode === 'cluster') {
    const clusterOptions = config.cluster!.options || {};
    const options = {
      ...clusterOptions,
      redisOptions: {
        ...REDIS_BASE_OPTION,
        ...(clusterOptions.redisOptions || {}),
        ...additionalOptions
      }
    };

    return new Cluster(config.cluster!.nodes, options);
  } else {
    // Standalone mode
    return new Redis(config.standalone!.url, {
      ...REDIS_BASE_OPTION,
      ...additionalOptions
    });
  }
}

/**
 * Global Redis connection with automatic prefixing
 * Maintains singleton pattern for standalone mode
 */
export const getGlobalRedisConnection = (): RedisConnection => {
  if (global.redisClient) return global.redisClient;

  const config = parseRedisConfig();

  try {
    // Create connection with keyPrefix for both standalone and cluster modes
    const options = { keyPrefix: FASTGPT_REDIS_PREFIX, maxRetriesPerRequest: 3 };
    global.redisClient = createRedisConnection(options);

    global.redisClient.on('connect', () => {
      addLog.info('[Global Redis] connected');
    });
    global.redisClient.on('error', (error) => {
      addLog.error('[Global Redis] connection error', error);
      if (config.mode === 'cluster') {
        console.error(
          '\n⚠️  Redis Cluster connection failed. Please check:\n' +
            '  1. REDIS_CLUSTER_NODES is set correctly\n' +
            '  2. Redis cluster is running and accessible\n' +
            '  3. Or unset REDIS_CLUSTER_NODES to use standalone mode\n'
        );
      }
    });
    global.redisClient.on('close', () => {
      addLog.warn('[Global Redis] connection closed');
    });

    return global.redisClient;
  } catch (error) {
    if (config.mode === 'cluster') {
      console.error(
        '\n❌ Failed to create Redis cluster connection.\n' +
          'Current REDIS_CLUSTER_NODES: ' +
          process.env.REDIS_CLUSTER_NODES +
          '\n\nTo fix this:\n' +
          '  1. Ensure Redis cluster is running\n' +
          '  2. Or unset REDIS_CLUSTER_NODES to use standalone mode with REDIS_URL\n'
      );
    }
    throw error;
  }
};

/**
 * Queue connection for BullMQ
 */
export const newQueueRedisConnection = (): RedisConnection => {
  const redis = createRedisConnection({
    maxRetriesPerRequest: 3
  });

  redis.on('error', (error) => {
    console.error('Redis Queue connection error', error);
  });

  return redis;
};

/**
 * Worker connection for BullMQ
 * Critical: maxRetriesPerRequest must be null
 */
export const newWorkerRedisConnection = (): RedisConnection => {
  const redis = createRedisConnection({
    maxRetriesPerRequest: null
  });

  redis.on('error', (error) => {
    console.error('Redis Worker connection error', error);
  });

  return redis;
};

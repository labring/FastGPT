import {
  getGlobalRedisConnection,
  newQueueRedisConnection,
  newWorkerRedisConnection,
  FASTGPT_REDIS_PREFIX
} from './connection';
import { getAllKeysByPrefix as getAllKeysImpl } from './cluster';

// Re-export for backward compatibility
export {
  getGlobalRedisConnection,
  newQueueRedisConnection,
  newWorkerRedisConnection,
  FASTGPT_REDIS_PREFIX
};

// Update getAllKeysByPrefix to use cluster-aware implementation
export const getAllKeysByPrefix = async (key: string) => {
  if (!key) return [];

  const redis = getGlobalRedisConnection();
  return await getAllKeysImpl(redis, key);
};

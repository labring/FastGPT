import crypto from 'crypto';
import { delay } from '@fastgpt/global/common/system/utils';
import { getGlobalRedisConnection } from './index';
import { getLogger, LogCategories } from '../logger';

const logger = getLogger(LogCategories.INFRA.REDIS);
const LOCK_KEY_PREFIX = 'lock:';

const RELEASE_LOCK_SCRIPT = `
if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("del", KEYS[1])
end
return 0
`;

const getLeaseKey = (key: string) => `${LOCK_KEY_PREFIX}${key}`;

/**
 * 基于 Redis SET NX PX 的轻量租约。
 *
 * 该 helper 用于保护低频、可降级的服务端临界区。获取失败或 Redis 异常时默认继续执行，
 * 保持调用方主流程不被锁服务阻断；如果需要强一致锁，不应复用这个 helper。
 */
export async function withRedisLease<T>({
  key,
  label,
  ttlMs,
  waitMs = 0,
  retryIntervalMs = 500,
  fn
}: {
  key: string;
  label: string;
  ttlMs: number;
  waitMs?: number;
  retryIntervalMs?: number;
  fn: () => Promise<T>;
}): Promise<T> {
  const redis = getGlobalRedisConnection();
  const leaseKey = getLeaseKey(key);
  const token = crypto.randomUUID();
  const deadline = Date.now() + waitMs;

  const acquire = async () => redis.set(leaseKey, token, 'PX', ttlMs, 'NX');

  let acquired = false;
  try {
    do {
      acquired = (await acquire()) === 'OK';
      if (acquired) break;
      if (waitMs <= 0 || Date.now() >= deadline) break;
      await delay(Math.min(retryIntervalMs, Math.max(deadline - Date.now(), 0)));
    } while (Date.now() < deadline);
  } catch (error) {
    logger.warn('Redis lease acquire failed, run without lease', { key: leaseKey, label, error });
    return fn();
  }

  if (!acquired) {
    logger.warn('Redis lease unavailable after waiting, run without lease', {
      key: leaseKey,
      label
    });
    return fn();
  }

  try {
    return await fn();
  } finally {
    await redis.eval(RELEASE_LOCK_SCRIPT, 1, leaseKey, token).catch((error: unknown) => {
      logger.warn('Redis lease release failed', { key: leaseKey, label, error });
    });
  }
}

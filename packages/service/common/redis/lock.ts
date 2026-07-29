import crypto from 'crypto';
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

const RENEW_LOCK_SCRIPT = `
if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("pexpire", KEYS[1], ARGV[2])
end
return 0
`;

const getLeaseKey = (key: string) => `${LOCK_KEY_PREFIX}${key}`;

export class RedisLeaseUnavailableError extends Error {
  constructor({ key, label }: { key: string; label: string }) {
    super(`Redis lease is already held for ${label}: ${key}`);
    this.name = 'RedisLeaseUnavailableError';
  }
}

export class RedisLeaseLostError extends Error {
  constructor({ key, label }: { key: string; label: string }) {
    super(`Redis lease was lost while running ${label}: ${key}`);
    this.name = 'RedisLeaseLostError';
  }
}

export class RedisLeaseAcquireError extends Error {
  constructor({ key, label, cause }: { key: string; label: string; cause: unknown }) {
    super(`Failed to acquire Redis lease for ${label}: ${key}`);
    this.name = 'RedisLeaseAcquireError';
    this.cause = cause;
  }
}

export const isRedisLeaseError = (error: unknown) =>
  error instanceof RedisLeaseUnavailableError ||
  error instanceof RedisLeaseLostError ||
  error instanceof RedisLeaseAcquireError;

export type RedisLeaseContext = {
  /** lease 丢失后触发，支持传递给可取消的 provider 请求。 */
  signal: AbortSignal;
  /** 在进入下一步不可逆副作用前同步确认当前执行者仍持有 lease。 */
  assertValid: () => void;
};

/**
 * 基于 Redis SET NX PX 的服务端租约。
 *
 * 获取失败或 Redis 异常会向上抛错，不会无锁执行临界区。执行期间通过 token 校验续期，
 * 释放时同样只删除当前 token 持有的 lease，避免误删后续请求重新获得的 lease。
 * fn 必须在每个不可逆步骤前调用 assertValid；支持 AbortSignal 的底层请求应直接消费 signal。
 */
export async function withRedisLease<T>({
  key,
  label,
  ttlMs,
  renewIntervalMs = Math.floor(ttlMs / 6),
  fn
}: {
  key: string;
  label: string;
  ttlMs: number;
  renewIntervalMs?: number;
  fn: (context: RedisLeaseContext) => Promise<T>;
}): Promise<T> {
  if (!Number.isFinite(ttlMs) || ttlMs <= 0) {
    throw new Error('ttlMs must be a positive number');
  }
  if (!Number.isFinite(renewIntervalMs) || renewIntervalMs <= 0 || renewIntervalMs >= ttlMs) {
    throw new Error('renewIntervalMs must be a positive number smaller than ttlMs');
  }

  const redis = getGlobalRedisConnection();
  const leaseKey = getLeaseKey(key);
  const token = crypto.randomUUID();
  let leaseLostError: RedisLeaseLostError | undefined;
  let leaseExpiresAt = Date.now() + ttlMs;
  let active = true;
  const abortController = new AbortController();

  const markLeaseLost = () => {
    leaseLostError ??= new RedisLeaseLostError({ key: leaseKey, label });
    if (!abortController.signal.aborted) {
      abortController.abort(leaseLostError);
    }
    return leaseLostError;
  };

  const assertValid = () => {
    if (!leaseLostError && Date.now() >= leaseExpiresAt) {
      markLeaseLost();
    }
    if (leaseLostError) throw leaseLostError;
  };

  const acquire = async () => redis.set(leaseKey, token, 'PX', ttlMs, 'NX');
  const renew = async () => {
    if (!active || leaseLostError) return;

    try {
      const renewed = await redis.eval(RENEW_LOCK_SCRIPT, 1, leaseKey, token, ttlMs);
      if (!active) return;

      if (renewed === 1) {
        leaseExpiresAt = Date.now() + ttlMs;
        return;
      }

      markLeaseLost();
      logger.warn('Redis lease renew failed because token no longer matches', {
        key: leaseKey,
        label
      });
    } catch (error) {
      logger.warn('Redis lease renew failed', { key: leaseKey, label, error });
      if (Date.now() >= leaseExpiresAt) {
        markLeaseLost();
      }
    }
  };

  const acquired = await acquire().catch((error) => {
    logger.warn('Redis lease acquire failed', { key: leaseKey, label, error });
    throw new RedisLeaseAcquireError({ key: leaseKey, label, cause: error });
  });

  if (acquired !== 'OK') {
    throw new RedisLeaseUnavailableError({ key: leaseKey, label });
  }

  const renewTimer = setInterval(() => {
    void renew();
  }, renewIntervalMs);
  renewTimer.unref?.();

  try {
    const result = await fn({ signal: abortController.signal, assertValid });
    assertValid();
    return result;
  } catch (error) {
    if (leaseLostError) throw leaseLostError;
    throw error;
  } finally {
    active = false;
    clearInterval(renewTimer);
    await redis.eval(RELEASE_LOCK_SCRIPT, 1, leaseKey, token).catch((error: unknown) => {
      logger.warn('Redis lease release failed', { key: leaseKey, label, error });
    });
  }
}

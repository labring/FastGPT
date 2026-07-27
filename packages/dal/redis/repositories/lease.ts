import { randomUUID } from 'node:crypto';
import { asRedisLogicalKey, redisRepositoryAdapter, type RedisStoreAdapter } from '../adapter';
import { RedisInvalidArgumentError } from '../runtime/errors';
import { parsePositiveInteger } from '../runtime/validation';

const LEASE_KEY_PREFIX = 'lock:';

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
  cause: unknown;

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

export type LeaseRepositoryLogger = {
  warn: (message: string, metadata: Record<string, unknown>) => void;
};

export type LeaseRepositoryDependencies = {
  redis?: Pick<RedisStoreAdapter, 'acquireLease' | 'releaseLease' | 'renewLease'>;
  logger: LeaseRepositoryLogger;
};

export type WithLeaseOptions<T> = {
  key: string;
  label: string;
  ttlMs: number;
  renewIntervalMs?: number;
  fn: () => Promise<T>;
};

/**
 * 创建 Redis Lease Repository。
 *
 * Lease 只负责 token 生命周期和续租/释放竞态；key 的物理前缀与 Lua 原子操作由 adapter
 * 负责。获取异常和租约丢失会阻断临界区，释放失败只记录 warning，避免误报业务结果。
 */
export const createLeaseRepository = ({
  redis = redisRepositoryAdapter,
  logger
}: LeaseRepositoryDependencies) => {
  const getLeaseKey = (key: string) => {
    if (typeof key !== 'string' || key.length === 0) {
      throw new RedisInvalidArgumentError({
        operation: 'lease.with',
        message: 'key must be a non-empty string'
      });
    }
    return asRedisLogicalKey(`${LEASE_KEY_PREFIX}${key}`);
  };

  const parseLeaseOptions = ({
    ttlMs,
    renewIntervalMs
  }: Pick<WithLeaseOptions<unknown>, 'ttlMs' | 'renewIntervalMs'>) => {
    const parsedTtlMs = parsePositiveInteger({
      value: ttlMs,
      operation: 'lease.with',
      field: 'ttlMs'
    });
    const parsedRenewIntervalMs = parsePositiveInteger({
      value: renewIntervalMs ?? Math.floor(parsedTtlMs / 6),
      operation: 'lease.with',
      field: 'renewIntervalMs'
    });
    if (parsedRenewIntervalMs >= parsedTtlMs) {
      throw new RedisInvalidArgumentError({
        operation: 'lease.with',
        message: 'renewIntervalMs must be smaller than ttlMs'
      });
    }
    return { parsedTtlMs, parsedRenewIntervalMs };
  };

  return {
    /** 在临界区执行带自动续租的 Redis Lease。 */
    withLease: async <T>({
      key,
      label,
      ttlMs,
      renewIntervalMs,
      fn
    }: WithLeaseOptions<T>): Promise<T> => {
      const leaseKey = getLeaseKey(key);
      const { parsedTtlMs, parsedRenewIntervalMs } = parseLeaseOptions({
        ttlMs,
        renewIntervalMs
      });
      const token = randomUUID();
      let leaseLostError: RedisLeaseLostError | undefined;
      let leaseExpiresAt = Date.now() + parsedTtlMs;
      let active = true;

      const renew = async () => {
        if (!active || leaseLostError) return;

        try {
          const renewed = await redis.renewLease({
            key: leaseKey,
            token,
            ttlMs: parsedTtlMs
          });
          if (!active) return;

          if (renewed) {
            leaseExpiresAt = Date.now() + parsedTtlMs;
            return;
          }

          leaseLostError = new RedisLeaseLostError({ key: leaseKey, label });
          logger.warn('Redis lease renew failed because token no longer matches', {
            key: leaseKey,
            label
          });
        } catch (error) {
          logger.warn('Redis lease renew failed', { key: leaseKey, label, error });
          if (Date.now() >= leaseExpiresAt) {
            leaseLostError = new RedisLeaseLostError({ key: leaseKey, label });
          }
        }
      };

      let acquired: boolean;
      try {
        acquired = await redis.acquireLease({
          key: leaseKey,
          token,
          ttlMs: parsedTtlMs
        });
      } catch (error) {
        logger.warn('Redis lease acquire failed', { key: leaseKey, label, error });
        throw new RedisLeaseAcquireError({ key: leaseKey, label, cause: error });
      }

      if (!acquired) {
        throw new RedisLeaseUnavailableError({ key: leaseKey, label });
      }

      const renewTimer = setInterval(() => {
        void renew();
      }, parsedRenewIntervalMs);
      renewTimer.unref?.();

      try {
        const result = await fn();
        if (leaseLostError) throw leaseLostError;
        return result;
      } finally {
        active = false;
        clearInterval(renewTimer);
        try {
          await redis.releaseLease({ key: leaseKey, token });
        } catch (error) {
          logger.warn('Redis lease release failed', { key: leaseKey, label, error });
        }
      }
    }
  };
};

export type LeaseRepository = ReturnType<typeof createLeaseRepository>;

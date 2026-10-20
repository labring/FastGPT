import { randomUUID } from 'node:crypto';
import { asRedisLogicalKey, redisCacheAdapter, type RedisCacheAdapter } from '../adapter';
import { RedisInvalidArgumentError } from '../runtime/errors';
import { parsePositiveInteger } from '../runtime/validation';
import type { RedisCacheLogger } from '../types';

const LEASE_KEY_PREFIX = 'lock:';
const MAX_TIMER_DELAY_MS = 2_147_483_647;

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

export class RedisLeaseWaitTimeoutError extends Error {
  constructor({ key, label }: { key: string; label: string }) {
    super(`Timed out waiting for Redis concurrency lease for ${label}: ${key}`);
    this.name = 'RedisLeaseWaitTimeoutError';
  }
}

export const isRedisLeaseError = (error: unknown) =>
  error instanceof RedisLeaseUnavailableError ||
  error instanceof RedisLeaseLostError ||
  error instanceof RedisLeaseAcquireError ||
  error instanceof RedisLeaseWaitTimeoutError;

export type LeaseCacheOptions = {
  redis?: RedisCacheAdapter;
  logger: RedisCacheLogger<'warn'>;
};

export type RedisLeaseContext = {
  /** lease 丢失后触发，支持传递给可取消的 provider 请求。 */
  signal: AbortSignal;
  /** 在进入下一步不可逆副作用前确认当前执行者仍持有 lease。 */
  assertValid: () => void;
};

export type WithLeaseOptions<T> = {
  key: string;
  label: string;
  ttlMs: number;
  renewIntervalMs?: number;
  fn: (context: RedisLeaseContext) => Promise<T>;
};

export type WithConcurrencyOptions<T> = WithLeaseOptions<T> & {
  /** 同一 key 的所有调用方必须使用相同上限；修改上限时应让已有任务先排空。 */
  concurrency: number;
  /** 只限制等待槽位的时长，不限制取得槽位后的业务执行时间。 */
  waitTimeoutMs?: number;
  retryIntervalMs?: number;
  /** 取消等待，并向业务回调传递与租约丢失合并后的取消信号。 */
  signal?: AbortSignal;
};

/**
 * Redis Lease Cache。
 *
 * Lease 只负责 token 生命周期和续租/释放竞态；key 的物理前缀与 Lua 原子操作由 adapter
 * 负责。获取异常和租约丢失会阻断临界区，释放失败只记录 warning，避免误报业务结果。
 */
export class LeaseCache {
  private readonly redis: RedisCacheAdapter;
  private readonly logger: RedisCacheLogger<'warn'>;

  constructor({ redis = redisCacheAdapter, logger }: LeaseCacheOptions) {
    this.redis = redis;
    this.logger = logger;
  }

  private getLeaseKey = (key: string) => {
    if (typeof key !== 'string' || key.length === 0) {
      throw new RedisInvalidArgumentError({
        operation: 'lease.with',
        message: 'key must be a non-empty string'
      });
    }
    return asRedisLogicalKey(`${LEASE_KEY_PREFIX}${key}`);
  };

  private parseLeaseOptions = ({
    ttlMs,
    renewIntervalMs
  }: Pick<WithLeaseOptions<unknown>, 'ttlMs' | 'renewIntervalMs'>) => {
    const parsedTtlMs = parsePositiveInteger({
      value: ttlMs,
      operation: 'lease.with',
      field: 'ttlMs'
    });
    const parsedRenewIntervalMs = parsePositiveInteger({
      value: renewIntervalMs ?? Math.max(1, Math.floor(parsedTtlMs / 6)),
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

  /**
   * 在共享的 N 个 lease 槽位中执行任务；不同实例使用同一 key 即共享并发额度。
   *
   * 只重试槽位占用，不重试 Redis 故障、租约丢失或业务异常，也不保证 FIFO。
   * 回调必须响应 signal / assertValid，或自行设置覆盖执行时长的超时；lease 不能强制
   * 停止外部操作。续租、token 校验和释放均复用 withLease。
   */
  async withConcurrency<T>({
    key,
    label,
    concurrency,
    ttlMs,
    renewIntervalMs,
    waitTimeoutMs = 30_000,
    retryIntervalMs = 50,
    signal,
    fn
  }: WithConcurrencyOptions<T>): Promise<T> {
    this.getLeaseKey(key);
    this.parseLeaseOptions({ ttlMs, renewIntervalMs });
    const operation = 'lease.concurrency';
    const limit = parsePositiveInteger({ value: concurrency, operation, field: 'concurrency' });
    const waitMs = parsePositiveInteger({
      value: waitTimeoutMs,
      operation,
      field: 'waitTimeoutMs'
    });
    const retryMs = parsePositiveInteger({
      value: retryIntervalMs,
      operation,
      field: 'retryIntervalMs'
    });
    const deadline = Date.now() + waitMs;

    const assertWaiting = () => {
      signal?.throwIfAborted();
      if (Date.now() >= deadline) throw new RedisLeaseWaitTimeoutError({ key, label });
    };

    // 在等待阶段响应取消，并在成功、失败两条路径清理 timer 和 listener。
    const waitForRetry = (delayMs: number) =>
      new Promise<void>((resolve, reject) => {
        const onAbort = () => {
          clearTimeout(timer);
          reject(signal?.reason);
        };
        const timer = setTimeout(() => {
          signal?.removeEventListener('abort', onAbort);
          resolve();
        }, delayMs);
        signal?.addEventListener('abort', onAbort, { once: true });
      });

    while (true) {
      assertWaiting();
      // 随机起点和轮询抖动，避免多个进程总是争抢第一个槽位。
      const firstSlot = Math.floor(Math.random() * limit);
      for (let offset = 0; offset < limit; offset++) {
        assertWaiting();
        let entered = false;
        try {
          return await this.withLease({
            key: `${key}:slot:${(firstSlot + offset) % limit}`,
            label,
            ttlMs,
            renewIntervalMs,
            fn: async (context) => {
              // Redis 获取成功也可能已超过等待期限，此时释放槽位但不启动业务。
              assertWaiting();
              entered = true;
              const result = await fn({
                signal: signal ? AbortSignal.any([signal, context.signal]) : context.signal,
                assertValid: () => {
                  context.assertValid();
                  signal?.throwIfAborted();
                }
              });
              signal?.throwIfAborted();
              return result;
            }
          });
        } catch (error) {
          // 业务本身也可能抛出同名错误，进入回调后绝不能因此重复执行任务。
          if (entered || !(error instanceof RedisLeaseUnavailableError)) throw error;
        }
      }

      assertWaiting();
      await waitForRetry(
        Math.min(
          retryMs + Math.floor(Math.random() * retryMs),
          deadline - Date.now(),
          MAX_TIMER_DELAY_MS
        )
      );
    }
  }

  /** 在临界区执行带自动续租的 Redis Lease。 */
  async withLease<T>({ key, label, ttlMs, renewIntervalMs, fn }: WithLeaseOptions<T>): Promise<T> {
    const leaseKey = this.getLeaseKey(key);
    const { parsedTtlMs, parsedRenewIntervalMs } = this.parseLeaseOptions({
      ttlMs,
      renewIntervalMs
    });
    const token = randomUUID();
    let leaseLostError: RedisLeaseLostError | undefined;
    let leaseExpiresAt = Date.now() + parsedTtlMs;
    let active = true;
    let renewalInFlight = false;
    let expiryTimer: ReturnType<typeof setTimeout> | undefined;
    let renewTimer: ReturnType<typeof setTimeout> | undefined;
    const abortController = new AbortController();

    const clearExpiryTimer = () => {
      if (expiryTimer !== undefined) {
        clearTimeout(expiryTimer);
        expiryTimer = undefined;
      }
    };

    const clearRenewTimer = () => {
      if (renewTimer !== undefined) {
        clearTimeout(renewTimer);
        renewTimer = undefined;
      }
    };

    const markLeaseLost = () => {
      leaseLostError ??= new RedisLeaseLostError({ key: leaseKey, label });
      clearExpiryTimer();
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

    const scheduleExpiryCheck = () => {
      clearExpiryTimer();
      if (!active || leaseLostError) return;

      const remainingMs = leaseExpiresAt - Date.now();
      if (remainingMs <= 0) {
        markLeaseLost();
        return;
      }

      expiryTimer = setTimeout(
        () => {
          expiryTimer = undefined;
          if (!active || leaseLostError) return;
          if (Date.now() >= leaseExpiresAt) {
            markLeaseLost();
          } else {
            scheduleExpiryCheck();
          }
        },
        Math.max(0, Math.min(remainingMs, MAX_TIMER_DELAY_MS))
      );
      expiryTimer.unref?.();
    };

    const renew = async () => {
      if (!active || leaseLostError || renewalInFlight) return;

      renewalInFlight = true;
      const renewStartedAt = Date.now();

      try {
        const renewed = await this.redis.renewLease({
          key: leaseKey,
          token,
          ttlMs: parsedTtlMs
        });
        if (!active || leaseLostError) return;

        if (renewed) {
          leaseExpiresAt = renewStartedAt + parsedTtlMs;
          scheduleExpiryCheck();
          return;
        }

        markLeaseLost();
        this.logger.warn('Redis lease renew failed because token no longer matches', {
          key: leaseKey,
          label
        });
      } catch (error) {
        this.logger.warn('Redis lease renew failed', { key: leaseKey, label, error });
        if (Date.now() >= leaseExpiresAt) {
          markLeaseLost();
        }
      } finally {
        renewalInFlight = false;
      }
    };

    const scheduleRenewal = (remainingMs = parsedRenewIntervalMs) => {
      clearRenewTimer();
      if (!active || leaseLostError) return;

      // Node 会截断超长 timer；分段等待避免大 TTL 被误调度成高频续租。
      const delayMs = Math.min(remainingMs, MAX_TIMER_DELAY_MS);
      renewTimer = setTimeout(() => {
        renewTimer = undefined;
        if (!active || leaseLostError) return;
        if (remainingMs > MAX_TIMER_DELAY_MS) {
          scheduleRenewal(remainingMs - MAX_TIMER_DELAY_MS);
          return;
        }

        void renew()
          .finally(() => scheduleRenewal())
          .catch((error) => {
            this.logger.warn('Redis lease renewal scheduler failed', {
              key: leaseKey,
              label,
              error
            });
          });
      }, delayMs);
      renewTimer.unref?.();
    };

    let acquired: boolean;
    const acquireStartedAt = Date.now();
    try {
      acquired = await this.redis.acquireLease({
        key: leaseKey,
        token,
        ttlMs: parsedTtlMs
      });
    } catch (error) {
      this.logger.warn('Redis lease acquire failed', { key: leaseKey, label, error });
      throw new RedisLeaseAcquireError({ key: leaseKey, label, cause: error });
    }

    if (!acquired) {
      throw new RedisLeaseUnavailableError({ key: leaseKey, label });
    }

    leaseExpiresAt = acquireStartedAt + parsedTtlMs;
    scheduleExpiryCheck();

    scheduleRenewal();

    try {
      assertValid();
      const result = await fn({ signal: abortController.signal, assertValid });
      assertValid();
      return result;
    } catch (error) {
      assertValid();
      throw error;
    } finally {
      active = false;
      clearRenewTimer();
      clearExpiryTimer();
      try {
        await this.redis.releaseLease({ key: leaseKey, token });
      } catch (error) {
        this.logger.warn('Redis lease release failed', { key: leaseKey, label, error });
      }
    }
  }
}

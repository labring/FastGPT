import { randomUUID } from 'node:crypto';
import { asRedisLogicalKey, redisCacheAdapter, type RedisCacheAdapter } from '../adapter';
import { RedisInvalidArgumentError, RedisInvalidResponseError } from '../runtime/errors';
import { parsePositiveInteger } from '../runtime/validation';
import type { RedisCacheLogger } from '../types';

const LEASE_KEY_PREFIX = 'lock:';
const MAX_TIMER_DELAY_MS = 2_147_483_647;

// 每个 token 独立过期；Redis 时间避免不同实例的时钟偏差改变占用计数。
const ACQUIRE_CONCURRENCY_LEASE_SCRIPT = `
local clock = redis.call("TIME")
local now = clock[1] * 1000 + math.floor(clock[2] / 1000)
redis.call("ZREMRANGEBYSCORE", KEYS[1], "-inf", now)
if redis.call("ZCARD", KEYS[1]) >= tonumber(ARGV[3]) then return 0 end
redis.call("ZADD", KEYS[1], now + tonumber(ARGV[2]), ARGV[1])
local last = redis.call("ZREVRANGE", KEYS[1], 0, 0, "WITHSCORES")
redis.call("PEXPIREAT", KEYS[1], last[2])
return 1
`;

const RENEW_CONCURRENCY_LEASE_SCRIPT = `
local clock = redis.call("TIME")
local now = clock[1] * 1000 + math.floor(clock[2] / 1000)
local expires = redis.call("ZSCORE", KEYS[1], ARGV[1])
if not expires then return 0 end
if tonumber(expires) <= now then
  redis.call("ZREM", KEYS[1], ARGV[1])
  return 0
end
redis.call("ZADD", KEYS[1], now + tonumber(ARGV[2]), ARGV[1])
local last = redis.call("ZREVRANGE", KEYS[1], 0, 0, "WITHSCORES")
redis.call("PEXPIREAT", KEYS[1], last[2])
return 1
`;

const RELEASE_CONCURRENCY_LEASE_SCRIPT = `
return redis.call("ZREM", KEYS[1], ARGV[1])
`;

type LeaseOperations = Pick<RedisCacheAdapter, 'acquireLease' | 'renewLease' | 'releaseLease'>;

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
  /** 0 表示不限制；热更新配置使用 getter，等待者在每次重试前读取最新上限。 */
  concurrency: number | (() => number);
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
   * 按同一 key 的全部在途 token 限制并发；下调上限时等待旧任务退出，不中断旧任务。
   *
   * 所有调用方须使用同一配置源；getter 让已排队任务也能读取热更新后的上限。
   * 0 直接执行，不访问 Redis；只重试额度占满，不重试 Redis 故障或业务异常，不保证 FIFO。
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
    const getLimit = () => {
      const value = typeof concurrency === 'function' ? concurrency() : concurrency;
      if (value === 0) return 0;
      return parsePositiveInteger({ value, operation, field: 'concurrency' });
    };
    getLimit();
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

    const evalLeaseScript = async (input: Parameters<RedisCacheAdapter['evalScript']>[0]) => {
      const result = await this.redis.evalScript(input);
      if (result !== 0 && result !== 1) {
        throw new RedisInvalidResponseError({
          operation,
          message: 'Redis concurrency lease returned an unsupported response'
        });
      }
      return result === 1;
    };

    while (true) {
      assertWaiting();
      const limit = getLimit();
      if (limit === 0) {
        const result = await fn({
          signal: signal ?? new AbortController().signal,
          assertValid: () => signal?.throwIfAborted()
        });
        signal?.throwIfAborted();
        return result;
      }

      // 检查总占用与新增 token 在同一脚本内完成，降额后不能从其他编号槽位旁路进入。
      const operations: LeaseOperations = {
        acquireLease: ({ key, token, ttlMs }) =>
          evalLeaseScript({
            script: ACQUIRE_CONCURRENCY_LEASE_SCRIPT,
            keys: [key],
            args: [token, ttlMs, limit]
          }),
        renewLease: ({ key, token, ttlMs }) =>
          evalLeaseScript({
            script: RENEW_CONCURRENCY_LEASE_SCRIPT,
            keys: [key],
            args: [token, ttlMs]
          }),
        releaseLease: ({ key, token }) =>
          evalLeaseScript({
            script: RELEASE_CONCURRENCY_LEASE_SCRIPT,
            keys: [key],
            args: [token]
          })
      };
      let entered = false;
      try {
        return await this.runWithLease(
          {
            key: `concurrency:${key}`,
            label,
            ttlMs,
            renewIntervalMs,
            fn: async (context) => {
              // Redis 获取成功也可能已超过等待期限，此时释放额度但不启动业务。
              assertWaiting();
              // 配置可能在 Redis 往返期间变化，释放旧额度后按最新上限重新竞争。
              if (getLimit() !== limit) throw new RedisLeaseUnavailableError({ key, label });
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
          },
          operations
        );
      } catch (error) {
        // 业务本身也可能抛出同名错误，进入回调后绝不能因此重复执行任务。
        if (entered || !(error instanceof RedisLeaseUnavailableError)) throw error;
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
  async withLease<T>(options: WithLeaseOptions<T>): Promise<T> {
    return this.runWithLease(options, this.redis);
  }

  /** 独占锁与并发额度共用同一套续租、失效检测及 token 释放流程。 */
  private async runWithLease<T>(
    { key, label, ttlMs, renewIntervalMs, fn }: WithLeaseOptions<T>,
    operations: LeaseOperations
  ): Promise<T> {
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
        const renewed = await operations.renewLease({
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
      acquired = await operations.acquireLease({
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
        await operations.releaseLease({ key: leaseKey, token });
      } catch (error) {
        this.logger.warn('Redis lease release failed', { key: leaseKey, label, error });
      }
    }
  }
}

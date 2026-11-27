/**
 * Sandbox 统一可重入分布式租约协调器。
 *
 * - 单一物理锁键：`agent-sandbox:lease:${sandboxId}`，统一串行化同一沙盒的远端生命周期操作
 *   （创建、唤醒、换镜像、停止、归档、恢复、删除、孤儿对账、迁移）与工作区初始化/重置/打包。
 * - 稳态运行快路径与工具调用、`keepalive` 保活保持无锁快路径。
 * - 同一异步调用链内基于 `AsyncLocalStorage` 按 `sandboxId` 自动重入复用当前有效租约，消除双锁嵌套与保护断层。
 * - 同进程非重入并发请求优先感知本进程持有者释放事件即时唤醒，跨进程竞争采用带随机抖动的指数退避并响应 `AbortSignal`。
 */
import { AsyncLocalStorage } from 'node:async_hooks';
import {
  SANDBOX_LEASE_TTL_MS,
  SANDBOX_LEASE_RENEW_INTERVAL_MS,
  SANDBOX_LEASE_WAIT_TIMEOUT_MS,
  SANDBOX_LEASE_RETRY_INITIAL_MS,
  SANDBOX_LEASE_RETRY_MAX_MS
} from '../constants';
import {
  LeaseCache,
  RedisLeaseUnavailableError,
  type RedisLeaseContext
} from '@fastgpt/dal/redis/caches';
import { RedisLeaseWaitTimeoutError } from '@fastgpt/dal/redis/caches/lease';

const leaseCache = new LeaseCache();

type ActiveSandboxLeaseMap = ReadonlyMap<string, RedisLeaseContext>;
const activeSandboxLeases = new AsyncLocalStorage<ActiveSandboxLeaseMap>();

// 记录本进程当前正在持有的物理锁释放 Promise，使同副本并发排队请求在锁释放后零轮询即时唤醒。
const localLeaseHolders = new Map<string, Promise<void>>();

export type SandboxLeaseTask<T> = (context: RedisLeaseContext) => Promise<T>;

/**
 * 获取指定稳定 `sandboxId` 的统一可重入分布式租约。
 *
 * - 若当前异步调用链已持有同一 `sandboxId` 的有效租约，校验有效性后直接重入复用，不重复请求 Redis；
 * - `waitTimeoutMs === 0`（后台 cron / GC 非阻塞模式）：单次尝试获取锁，已被占用时立即抛出 `RedisLeaseUnavailableError`；
 * - `waitTimeoutMs > 0`（前台请求排队模式，默认 180s）：同进程等待本地释放通知，跨进程按带抖动指数退避有界等待，
 *   超时抛出 `RedisLeaseWaitTimeoutError`，取消信号触发时立即中断等待；
 * - `context.signal` 与 `context.assertValid()` 严格表达物理 Redis 租约归属，不被调用方请求取消信号污染。
 */
export const withSandboxLease = async <T>(params: {
  sandboxId: string;
  label: string;
  waitTimeoutMs?: number;
  retryInitialMs?: number;
  retryMaxMs?: number;
  signal?: AbortSignal;
  fn: SandboxLeaseTask<T>;
}): Promise<T> => {
  const inheritedMap = activeSandboxLeases.getStore();
  const existingLease = inheritedMap?.get(params.sandboxId);

  if (existingLease) {
    existingLease.assertValid();
    params.signal?.throwIfAborted();
    return await params.fn(existingLease);
  }

  const key = `agent-sandbox:lease:${params.sandboxId}`;
  const {
    label,
    waitTimeoutMs = SANDBOX_LEASE_WAIT_TIMEOUT_MS,
    retryInitialMs = SANDBOX_LEASE_RETRY_INITIAL_MS,
    retryMaxMs = SANDBOX_LEASE_RETRY_MAX_MS,
    signal,
    fn
  } = params;

  const waitWithDeadlineAndSignal = ({
    delayMs,
    wakePromise
  }: {
    delayMs: number;
    wakePromise?: Promise<void>;
  }): Promise<void> => {
    signal?.throwIfAborted();

    return new Promise<void>((resolve, reject) => {
      let settled = false;
      const cleanup = () => {
        clearTimeout(timer);
        signal?.removeEventListener('abort', onAbort);
      };
      const finish = () => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve();
      };
      const onAbort = () => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(signal?.reason);
      };

      const timer = setTimeout(finish, delayMs);
      signal?.addEventListener('abort', onAbort, { once: true });
      void wakePromise?.then(finish, finish);
    });
  };

  const deadline = Date.now() + Math.max(0, waitTimeoutMs);
  let retryAttempt = 0;

  while (true) {
    signal?.throwIfAborted();

    let entered = false;
    let releaseEntry: Promise<void> | undefined;
    let notifyLocalRelease: (() => void) | undefined;

    try {
      return await leaseCache.withLease({
        key,
        label,
        ttlMs: SANDBOX_LEASE_TTL_MS,
        renewIntervalMs: SANDBOX_LEASE_RENEW_INTERVAL_MS,
        fn: async (rawContext) => {
          entered = true;
          const releasePromise = new Promise<void>((resolve) => {
            notifyLocalRelease = resolve;
          });
          releaseEntry = releasePromise;
          localLeaseHolders.set(key, releasePromise);

          const releaseLocalEntry = () => {
            if (localLeaseHolders.get(key) === releaseEntry) {
              localLeaseHolders.delete(key);
            }
            notifyLocalRelease?.();
          };
          rawContext.signal.addEventListener('abort', releaseLocalEntry, { once: true });

          try {
            rawContext.assertValid();
            signal?.throwIfAborted();
            const nextMap = new Map(inheritedMap);
            nextMap.set(params.sandboxId, rawContext);
            return await activeSandboxLeases.run(nextMap, () => fn(rawContext));
          } finally {
            rawContext.signal.removeEventListener('abort', releaseLocalEntry);
          }
        }
      });
    } catch (error) {
      // 进入临界区后业务内部抛出的同名异常不能当作抢锁失败重放。
      if (entered || !(error instanceof RedisLeaseUnavailableError)) {
        throw error;
      }
      if (waitTimeoutMs <= 0) {
        throw error;
      }

      const remainingMs = deadline - Date.now();
      if (remainingMs <= 0) {
        throw new RedisLeaseWaitTimeoutError({ key, label });
      }

      const localHolder = localLeaseHolders.get(key);
      if (localHolder) {
        await waitWithDeadlineAndSignal({
          delayMs: Math.min(remainingMs, SANDBOX_LEASE_RENEW_INTERVAL_MS),
          wakePromise: localHolder
        });
        continue;
      }

      const baseDelayMs = Math.min(
        Math.max(1, retryMaxMs),
        Math.max(1, retryInitialMs) * 2 ** Math.min(retryAttempt, 10)
      );
      retryAttempt += 1;
      const jitterMs = Math.floor(Math.random() * Math.max(1, Math.floor(baseDelayMs / 2)));
      const delayMs = Math.min(baseDelayMs + jitterMs, remainingMs);

      await waitWithDeadlineAndSignal({ delayMs });
    } finally {
      // 必须在 withLease 完成 Redis releaseLease 之后再唤醒同进程等待者；仅当条目仍指向自身时删除，避免过期持有者误删新持有者句柄。
      if (notifyLocalRelease) {
        if (localLeaseHolders.get(key) === releaseEntry) {
          localLeaseHolders.delete(key);
        }
        notifyLocalRelease();
      }
    }
  }
};

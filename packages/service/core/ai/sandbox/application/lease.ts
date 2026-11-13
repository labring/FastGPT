/**
 * Sandbox 分布式租约分层。
 *
 * 所有租约均收敛到单个逻辑 `sandboxId` 粒度，采用「短 TTL（30s）+ 自动续租（5s）」策略：
 * 活跃任务执行期间自动续期，Pod 崩溃后最多 30s 释放锁。
 * 统一锁顺序为 `Agent Sandbox Init Lease -> Sandbox Lifecycle Lease`；生命周期操作严禁反向等待 `Init Lease`。
 */
import {
  SANDBOX_LIFECYCLE_LEASE_TTL_MS,
  SANDBOX_LIFECYCLE_LEASE_RENEW_INTERVAL_MS,
  SANDBOX_LIFECYCLE_LEASE_WAIT_TIMEOUT_MS,
  SANDBOX_LIFECYCLE_LEASE_RETRY_INTERVAL_MS
} from '../constants';
import {
  LeaseCache,
  RedisLeaseUnavailableError,
  type RedisLeaseContext
} from '@fastgpt/dal/redis/caches';
import { RedisLeaseWaitTimeoutError } from '@fastgpt/dal/redis/caches/lease';

const leaseCache = new LeaseCache();

export type SandboxLeaseTask<T> = (context: RedisLeaseContext) => Promise<T>;

/**
 * 基于统一 Redis 互斥锁执行带可选有界等待的租约任务。
 *
 * - `waitTimeoutMs === 0`（后台 cron / GC 非阻塞模式）：单次尝试获取锁，已被占用时立即抛出 `RedisLeaseUnavailableError`。
 * - `waitTimeoutMs > 0`（前台请求排队模式）：锁被占用时按带随机抖动的重试间隔有界等待，超时抛出 `RedisLeaseWaitTimeoutError`。
 * - 无论阻塞与否均共享同一把物理 Redis key，确保前台请求与后台 cron 严格互斥。
 */
export const acquireSandboxRedisLease = async <T>(params: {
  key: string;
  label: string;
  ttlMs: number;
  renewIntervalMs: number;
  waitTimeoutMs: number;
  retryIntervalMs: number;
  fn: SandboxLeaseTask<T>;
}): Promise<T> => {
  const { key, label, ttlMs, renewIntervalMs, waitTimeoutMs, retryIntervalMs, fn } = params;
  const deadline = Date.now() + Math.max(0, waitTimeoutMs);

  while (true) {
    let entered = false;
    try {
      return await leaseCache.withLease({
        key,
        label,
        ttlMs,
        renewIntervalMs,
        fn: async (context) => {
          entered = true;
          return await fn(context);
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

      const jitterMs = Math.floor(Math.random() * Math.max(1, Math.floor(retryIntervalMs / 2)));
      const delayMs = Math.min(retryIntervalMs + jitterMs, remainingMs);
      await new Promise<void>((resolve) => setTimeout(resolve, delayMs));
    }
  }
};

/**
 * 串行化同一稳定 `sandboxId` 的远端生命周期操作（创建、唤醒、镜像升级、停止、删除与孤儿容器对账）。
 *
 * 前台路径默认有界等待（60s），使并发唤醒或停止过渡窗口的请求平滑排队并复用最新状态；
 * 后台 cron 与反向 GC 显式传入 `waitTimeoutMs: 0`，遇到在途活跃请求时立即跳过。
 */
export const withSandboxLifecycleLease = <T>(params: {
  sandboxId: string;
  label: string;
  waitTimeoutMs?: number;
  retryIntervalMs?: number;
  fn: SandboxLeaseTask<T>;
}) =>
  acquireSandboxRedisLease({
    key: `agent-sandbox:lifecycle:${params.sandboxId}`,
    label: params.label,
    ttlMs: SANDBOX_LIFECYCLE_LEASE_TTL_MS,
    renewIntervalMs: SANDBOX_LIFECYCLE_LEASE_RENEW_INTERVAL_MS,
    waitTimeoutMs: params.waitTimeoutMs ?? SANDBOX_LIFECYCLE_LEASE_WAIT_TIMEOUT_MS,
    retryIntervalMs: params.retryIntervalMs ?? SANDBOX_LIFECYCLE_LEASE_RETRY_INTERVAL_MS,
    fn: params.fn
  });

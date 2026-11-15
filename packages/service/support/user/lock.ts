import { LeaseCache } from '@fastgpt/dal/redis/caches';
import {
  RedisLeaseUnavailableError,
  type RedisLeaseContext
} from '@fastgpt/dal/redis/caches/lease';

const lockTtlMs = 10 * 60 * 1000;
const leaseCache = new LeaseCache();

/**
 * 用户变更共用独占锁；刷新可指定有界等待，避免正常并发被当作服务故障。
 * 只重试进入临界区前的锁占用，业务回调和 Redis 故障均不重试。
 */
export const withUserLock = async <T>(
  target: string | { userId: string; waitTimeoutMs: number },
  fn: (context: RedisLeaseContext) => Promise<T>
) => {
  const userId = typeof target === 'string' ? target : target.userId;
  const deadline = Date.now() + (typeof target === 'string' ? 0 : target.waitTimeoutMs);
  while (true) {
    let entered = false;
    try {
      return await leaseCache.withLease({
        key: `user:${String(userId)}`,
        label: 'user-operation',
        ttlMs: lockTtlMs,
        fn: (context) => {
          entered = true;
          return fn(context);
        }
      });
    } catch (error) {
      if (entered || !(error instanceof RedisLeaseUnavailableError) || Date.now() >= deadline)
        throw error;
      await new Promise((resolve) => setTimeout(resolve, Math.min(50, deadline - Date.now())));
    }
  }
};

/** 在团队维度串行化会同时修改团队归属、成员关系或团队资源的操作。 */
export const withTeamLock = async <T>(teamId: string, fn: () => Promise<T>) =>
  leaseCache.withLease({
    key: `team:${String(teamId)}`,
    label: 'team-operation',
    ttlMs: lockTtlMs,
    fn: () => fn()
  });

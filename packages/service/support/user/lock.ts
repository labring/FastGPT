import { LeaseCache } from '@fastgpt/dal/redis/caches';
import { getLogger, LogCategories } from '../../common/logger';

const userLockTtlMs = 10 * 60 * 1000;
const leaseCache = new LeaseCache({ logger: getLogger(LogCategories.INFRA.REDIS) });

/** 在用户维度串行化会修改用户、团队归属或账号状态的操作。 */
export const withUserLock = async <T>(userId: string, fn: () => Promise<T>) =>
  leaseCache.withLease({
    key: `user:${String(userId)}`,
    label: 'user-operation',
    ttlMs: userLockTtlMs,
    fn: () => fn()
  });

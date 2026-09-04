import { LeaseCache } from '@fastgpt/dal/redis/caches';
import { getLogger, LogCategories } from '../../common/logger';

const lockTtlMs = 10 * 60 * 1000;
const leaseCache = new LeaseCache({ logger: getLogger(LogCategories.INFRA.REDIS) });

/** 在团队维度串行化会同时修改团队成员关系或团队资源的操作。 */
export const withTeamLock = async <T>(teamId: string, fn: () => Promise<T>) =>
  leaseCache.withLease({
    key: `team:${String(teamId)}`,
    label: 'team-operation',
    ttlMs: lockTtlMs,
    fn: () => fn()
  });

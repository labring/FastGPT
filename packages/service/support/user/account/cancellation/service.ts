import { AccountCancellationStatus } from '@fastgpt/global/support/user/account/cancellation/constants';
import { isAccountCancellationMethod } from '@fastgpt/global/support/user/account/cancellation/utils';
import { deriveAccountCancellationSchedule } from '@fastgpt/global/support/user/account/cancellation/utils';
import {
  AccountCancellationCache,
  LeaseCache,
  RedisLeaseUnavailableError
} from '@fastgpt/dal/redis/caches';
import { getLogger, LogCategories } from '../../../../common/logger';
import { getActiveAccountCancellationByUserId } from './read';
import { withUserLock } from '../../lock';
import { MongoAccountCancellation } from './schema';
import { MongoTeam } from '../../team/teamSchema';

const accountCancellationTeamLockTtlMs = 10 * 60 * 1000;
const leaseCache = new LeaseCache({ logger: getLogger(LogCategories.INFRA.REDIS) });
const accountCancellationCache = new AccountCancellationCache({
  logger: getLogger(LogCategories.INFRA.REDIS)
});

export type AccountCancellationCacheTargets = {
  teamIds: string[];
  userIds: string[];
};

/** 读取用户当前拥有的团队和用户身份，供注销状态 Cache 做生命周期刷新。 */
export const getAccountCancellationCacheTargets = async (
  userId: string
): Promise<AccountCancellationCacheTargets> => {
  const teams = await MongoTeam.find({ ownerId: userId }, { _id: 1 }).lean();

  return {
    teamIds: teams.map((team) => String(team._id)),
    userIds: [String(userId)]
  };
};

/**
 * 刷新鉴权注销状态 Cache。
 *
 * active 时写入 1，取消注销或最终清理时写入 0。Redis 只是加速层，刷新失败时鉴权仍会
 * 在 Cache miss 时回源 Mongo，因此不能因为缓存故障放行注销中的账号。写入失败时清理
 * 相关 marker，避免旧的 inactive marker 继续短路 Mongo。
 */
export const syncAccountCancellationCache = async ({
  userId,
  active,
  targets
}: {
  userId: string;
  active: boolean;
  targets?: AccountCancellationCacheTargets;
}) => {
  const resolvedTargets = targets ?? (await getAccountCancellationCacheTargets(userId));

  try {
    await Promise.all([
      accountCancellationCache.setMany({
        scope: 'team',
        ids: resolvedTargets.teamIds,
        active
      }),
      accountCancellationCache.setMany({
        scope: 'user',
        ids: resolvedTargets.userIds,
        active
      })
    ]);
  } catch (error) {
    await Promise.allSettled([
      accountCancellationCache.clearMany({
        scope: 'team',
        ids: resolvedTargets.teamIds
      }),
      accountCancellationCache.clearMany({
        scope: 'user',
        ids: resolvedTargets.userIds
      })
    ]);
    throw error;
  }

  return resolvedTargets;
};

/**
 * 删除注销状态 Cache marker。
 *
 * Mongo 写入失败后只能删除 marker，不能写入 inactive 状态；这样下一次读取会以 Mongo
 * 为准，即使本次 Mongo 写入的结果存在不确定性，也不会被错误的 false marker 放行。
 */
export const clearAccountCancellationCache = async ({
  userId,
  targets
}: {
  userId: string;
  targets?: AccountCancellationCacheTargets;
}) => {
  const resolvedTargets = targets ?? (await getAccountCancellationCacheTargets(userId));

  await Promise.all([
    accountCancellationCache.clearMany({
      scope: 'team',
      ids: resolvedTargets.teamIds
    }),
    accountCancellationCache.clearMany({
      scope: 'user',
      ids: resolvedTargets.userIds
    })
  ]);

  return resolvedTargets;
};

/**
 * 在注销用户维度串行化 submit、cancel、cron 和管理员删除，释放锁由 finally 保证。
 */
export const withAccountCancellationUserLock = async <T>(userId: string, fn: () => Promise<T>) => {
  try {
    return await withUserLock(userId, fn);
  } catch (error) {
    if (error instanceof RedisLeaseUnavailableError) {
      throw new Error('Account cancellation operation is busy');
    }
    throw error;
  }
};

/**
 * 串行化团队删除、owner 转让和注销 finalizer 的团队部分。
 * 团队锁独立于用户锁，调用方需遵循“用户锁后团队锁”的顺序避免交叉等待。
 */
export const withAccountCancellationTeamLock = async <T>(teamId: string, fn: () => Promise<T>) => {
  try {
    return await leaseCache.withLease({
      key: `accountCancellation:team:${String(teamId)}`,
      label: 'account-cancellation-team',
      ttlMs: accountCancellationTeamLockTtlMs,
      fn: () => fn()
    });
  } catch (error) {
    if (error instanceof RedisLeaseUnavailableError) {
      throw new Error('Account cancellation team operation is busy');
    }
    throw error;
  }
};

export const assertAccountCancellationMethod = (method: string) => {
  if (!isAccountCancellationMethod(method)) {
    throw new Error('Password verification is not allowed for account cancellation');
  }
};

/** 条件删除 pending；finalizing/completed 永远不会被取消。 */
export const cancelPendingAccountCancellation = async ({
  userId,
  now = new Date()
}: {
  userId: string;
  now?: Date;
}) =>
  withAccountCancellationUserLock(userId, async () => {
    const record = await getActiveAccountCancellationByUserId(userId);
    if (!record) return { cancelled: false as const, record: null };
    if (record.status !== AccountCancellationStatus.pending) {
      throw new Error('Account cancellation is already finalizing');
    }

    const scheduledCancelAt = deriveAccountCancellationSchedule(
      record.requestedAt
    ).scheduledCancelAt;
    if (now >= scheduledCancelAt)
      throw new Error('Account cancellation can no longer be cancelled');

    const result = await MongoAccountCancellation.deleteOne({
      _id: record._id,
      userId,
      status: AccountCancellationStatus.pending
    });
    return {
      cancelled: result.deletedCount === 1,
      record
    } as const;
  });

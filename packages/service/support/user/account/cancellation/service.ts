import { AccountCancellationStatus } from '@fastgpt/global/support/user/account/cancellation/constants';
import { isAccountCancellationMethod } from '@fastgpt/global/support/user/account/cancellation/utils';
import { deriveAccountCancellationSchedule } from '@fastgpt/global/support/user/account/cancellation/utils';
import {
  AccountCancellationCache,
  LeaseCache,
  RedisLeaseUnavailableError
} from '@fastgpt/dal/redis/caches';
import { getLogger, LogCategories } from '../../../../common/logger';
import { getAccountCancellationAuthKey } from './formatter';
import { getActiveAccountCancellationByUserId } from './read';
import { MongoAccountCancellation } from './schema';
import { MongoTeam } from '../../team/teamSchema';
import { MongoTeamMember } from '../../team/teamMemberSchema';

const accountCancellationLockTtlMs = 10 * 60 * 1000;
const accountCancellationTeamLockTtlMs = 10 * 60 * 1000;
const leaseCache = new LeaseCache({ logger: getLogger(LogCategories.INFRA.REDIS) });
const accountCancellationCache = new AccountCancellationCache({
  logger: getLogger(LogCategories.INFRA.REDIS)
});

export type AccountCancellationCacheTargets = {
  teamIds: string[];
  tmbIds: string[];
};

/** 读取用户当前拥有的团队和成员关系，供注销状态 Cache 做生命周期刷新。 */
export const getAccountCancellationCacheTargets = async (
  userId: string
): Promise<AccountCancellationCacheTargets> => {
  const [teams, members] = await Promise.all([
    MongoTeam.find({ ownerId: userId }, { _id: 1 }).lean(),
    MongoTeamMember.find({ userId }, { _id: 1 }).lean()
  ]);

  return {
    teamIds: teams.map((team) => String(team._id)),
    tmbIds: members.map((member) => String(member._id))
  };
};

/**
 * 刷新 API Key 注销状态 Cache。
 *
 * active 时写入正向 marker；注销取消或完成后删除 marker。Redis 只是加速层，刷新失败时
 * API Key 鉴权仍会在 Cache miss 时回源 Mongo，因此不能因为缓存故障放行注销中的账号。
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

  await Promise.all([
    active
      ? accountCancellationCache.setMany({
          scope: 'team',
          ids: resolvedTargets.teamIds,
          active: true
        })
      : accountCancellationCache.clearMany({ scope: 'team', ids: resolvedTargets.teamIds }),
    active
      ? accountCancellationCache.setMany({
          scope: 'member',
          ids: resolvedTargets.tmbIds,
          active: true
        })
      : accountCancellationCache.clearMany({ scope: 'member', ids: resolvedTargets.tmbIds })
  ]);

  return resolvedTargets;
};

/**
 * 在注销用户维度串行化 submit、cancel、cron 和管理员删除，释放锁由 finally 保证。
 */
export const withAccountCancellationUserLock = async <T>(userId: string, fn: () => Promise<T>) => {
  try {
    return await leaseCache.withLease({
      key: getAccountCancellationAuthKey(userId),
      label: 'account-cancellation-user',
      ttlMs: accountCancellationLockTtlMs,
      fn: () => fn()
    });
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

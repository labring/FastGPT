import { AccountCancellationStatus } from '@fastgpt/global/support/user/account/cancellation/constants';
import { isAccountCancellationMethod } from '@fastgpt/global/support/user/account/cancellation/utils';
import { deriveAccountCancellationSchedule } from '@fastgpt/global/support/user/account/cancellation/utils';
import { LeaseCache, RedisLeaseUnavailableError } from '@fastgpt/dal/redis/caches';
import { getLogger, LogCategories } from '../../../../common/logger';
import { getAccountCancellationAuthKey } from './formatter';
import { getActiveAccountCancellationByUserId } from './read';
import { MongoAccountCancellation } from './schema';

const accountCancellationLockTtlMs = 10 * 60 * 1000;
const accountCancellationTeamLockTtlMs = 10 * 60 * 1000;
const leaseCache = new LeaseCache({ logger: getLogger(LogCategories.INFRA.REDIS) });

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

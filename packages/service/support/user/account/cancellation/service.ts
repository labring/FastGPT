import { AccountCancellationStatusEnum } from '@fastgpt/global/support/user/account/cancellation/constants';
import { isAccountCancellationMethod } from '@fastgpt/global/support/user/account/cancellation/utils';
import { deriveAccountCancellationSchedule } from '@fastgpt/global/support/user/account/cancellation/utils';
import { checkTimerLock, deleteTimerLock } from '../../../../common/system/timerLock/utils';
import { getAccountCancellationAuthKey } from './formatter';
import { getActiveAccountCancellationByUserId } from './read';
import { MongoAccountCancellation } from './schema';

const accountCancellationLockMinutes = 10;
const accountCancellationTeamLockMinutes = 10;

/**
 * 在注销用户维度串行化 submit、cancel、cron 和管理员删除，释放锁由 finally 保证。
 */
export const withAccountCancellationUserLock = async <T>(userId: string, fn: () => Promise<T>) => {
  const timerId = getAccountCancellationAuthKey(userId);
  const locked = await checkTimerLock({
    timerId,
    lockMinuted: accountCancellationLockMinutes
  });
  if (!locked) throw new Error('Account cancellation operation is busy');

  try {
    return await fn();
  } finally {
    await deleteTimerLock({ timerId }).catch(() => undefined);
  }
};

/**
 * 串行化团队删除、owner 转让和注销 finalizer 的团队部分。
 * 团队锁独立于用户锁，调用方需遵循“用户锁后团队锁”的顺序避免交叉等待。
 */
export const withAccountCancellationTeamLock = async <T>(teamId: string, fn: () => Promise<T>) => {
  const timerId = `accountCancellation:team:${String(teamId)}`;
  const locked = await checkTimerLock({
    timerId,
    lockMinuted: accountCancellationTeamLockMinutes
  });
  if (!locked) throw new Error('Account cancellation team operation is busy');

  try {
    return await fn();
  } finally {
    await deleteTimerLock({ timerId }).catch(() => undefined);
  }
};

export const assertAccountCancellationMethod = (method: string) => {
  if (!isAccountCancellationMethod(method) || method === 'oldPassword') {
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
    if (record.status !== AccountCancellationStatusEnum.pending) {
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
      status: AccountCancellationStatusEnum.pending
    });
    return {
      cancelled: result.deletedCount === 1,
      record
    } as const;
  });

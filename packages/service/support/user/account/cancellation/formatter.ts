import { AccountCancellationStatusEnum } from '@fastgpt/global/support/user/account/cancellation/constants';
import { deriveAccountCancellationSchedule } from '@fastgpt/global/support/user/account/cancellation/utils';
import type { TeamAccountCancellationSummary } from '@fastgpt/global/support/user/account/cancellation/type';
import type { AccountCancellationSchemaType } from './schema';

export const getAccountCancellationAuthKey = (userId: string) =>
  `accountCancellation:${String(userId)}`;

export const maskAccount = (account?: string) => {
  if (!account) return '';
  const at = account.indexOf('@');
  if (at > 1) return `${account.slice(0, 2)}***${account.slice(at)}`;
  if (/^1\d{10}$/.test(account)) return `${account.slice(0, 3)}****${account.slice(-4)}`;
  if (account.length <= 4) return `${account.slice(0, 1)}***`;
  return `${account.slice(0, 2)}***${account.slice(-2)}`;
};

/** 将内部 pending/finalizing 记录转换为公开注销状态。 */
export const formatAccountCancellationPendingResponse = (
  record: Pick<AccountCancellationSchemaType, 'status' | 'requestedAt'>,
  now = new Date()
) => {
  if (
    !record.requestedAt ||
    ![AccountCancellationStatusEnum.pending, AccountCancellationStatusEnum.finalizing].includes(
      record.status
    )
  ) {
    throw new Error('Invalid account cancellation active record');
  }

  const schedule = deriveAccountCancellationSchedule(record.requestedAt);
  const isPending = record.status === AccountCancellationStatusEnum.pending;
  return {
    status: 'pending' as const,
    requestedAt: record.requestedAt,
    ...(isPending && now < schedule.scheduledCancelAt
      ? { scheduledCancelAt: schedule.scheduledCancelAt }
      : {}),
    canCancelCancellation: isPending && now < schedule.scheduledCancelAt
  };
};

export const formatTeamAccountCancellationSummary = (
  record: Pick<AccountCancellationSchemaType, 'status' | 'requestedAt'>
): TeamAccountCancellationSummary => {
  formatAccountCancellationPendingResponse(record);

  if (record.status === AccountCancellationStatusEnum.pending) {
    return {
      status: AccountCancellationStatusEnum.pending,
      scheduledCancelAt: deriveAccountCancellationSchedule(record.requestedAt).scheduledCancelAt
    };
  }

  if (record.status === AccountCancellationStatusEnum.finalizing) {
    return {
      status: AccountCancellationStatusEnum.finalizing
    };
  }

  throw new Error('Invalid team account cancellation active record');
};

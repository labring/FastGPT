import { TeamErrEnum } from '@fastgpt/global/common/error/code/team';
import { UserErrEnum } from '@fastgpt/global/common/error/code/user';
import { ERROR_ENUM } from '@fastgpt/global/common/error/errorCode';
import { AccountCancellationStatusEnum } from '@fastgpt/global/support/user/account/cancellation/constants';
import type { AuthContext } from '../../../permission/auth/context';
import { resolveAuthContext } from '../../../permission/auth/context';
import type { AccountCancellationSchemaType } from './schema';
import {
  getActiveAccountCancellationByTeamId,
  getActiveAccountCancellationByUserId,
  getActiveAccountCancellationsByUserIds
} from './read';

export type AssertAccountUsableProps = {
  userId?: string;
  teamId?: string;
  tmbId?: string;
  authContext?: AuthContext;
  cancellations?: Pick<AccountCancellationSchemaType, 'userId' | 'status'>[];
  allowUserAccountCancellationPending?: boolean;
  allowUserAccountCancellationFinalizing?: boolean;
  allowCurrentUserOwnedTeamAccountCancellationPending?: boolean;
  allowCurrentUserOwnedTeamAccountCancellationFinalizing?: boolean;
  allowCurrentSessionTeamAccountCancellationPending?: boolean;
  allowCurrentSessionTeamAccountCancellationFinalizing?: boolean;
};

/**
 * 按用户和团队注销生命周期阻断业务访问。中心鉴权传入已验证的 auth-context 和注销记录时，
 * 本函数不再查询 member/team；保留无上下文调用给邀请链接等只知道目标 team 的业务。
 */
export const assertAccountUsable = async ({
  userId,
  teamId,
  tmbId,
  authContext,
  cancellations,
  allowUserAccountCancellationPending = false,
  allowUserAccountCancellationFinalizing = false,
  allowCurrentUserOwnedTeamAccountCancellationPending = false,
  allowCurrentUserOwnedTeamAccountCancellationFinalizing = false,
  allowCurrentSessionTeamAccountCancellationPending = false,
  allowCurrentSessionTeamAccountCancellationFinalizing = false
}: AssertAccountUsableProps) => {
  const context =
    authContext ??
    (tmbId && teamId
      ? await resolveAuthContext({
          userId,
          teamId,
          tmbId
        })
      : undefined);

  if (tmbId && teamId && !context) {
    throw new Error(ERROR_ENUM.unAuthorization);
  }

  const currentUserId = context?.userId ?? userId;
  const records = context
    ? (cancellations ??
      (await getActiveAccountCancellationsByUserIds({
        userId: context.userId,
        ownerId: context.ownerId
      })))
    : [];
  const userCancellation = context
    ? records.find((record) => String(record.userId) === String(context.userId))
    : userId
      ? await getActiveAccountCancellationByUserId(userId)
      : undefined;
  const teamCancellation = context
    ? context.ownerId
      ? records.find((record) => String(record.userId) === String(context.ownerId))
      : undefined
    : teamId
      ? await getActiveAccountCancellationByTeamId(teamId)
      : undefined;

  const isAllowedStatus = ({
    status,
    allowPending,
    allowFinalizing
  }: {
    status: AccountCancellationStatusEnum;
    allowPending: boolean;
    allowFinalizing: boolean;
  }) =>
    (status === AccountCancellationStatusEnum.pending && allowPending) ||
    (status === AccountCancellationStatusEnum.finalizing && allowFinalizing);

  if (
    userCancellation &&
    !isAllowedStatus({
      status: userCancellation.status,
      allowPending: allowUserAccountCancellationPending,
      allowFinalizing: allowUserAccountCancellationFinalizing
    })
  ) {
    throw new Error(UserErrEnum.accountCancellationPending);
  }

  if (!teamCancellation) return;

  const isOwnTeam =
    !!currentUserId &&
    String(teamCancellation.userId) === String(currentUserId) &&
    isAllowedStatus({
      status: teamCancellation.status,
      allowPending: allowCurrentUserOwnedTeamAccountCancellationPending,
      allowFinalizing: allowCurrentUserOwnedTeamAccountCancellationFinalizing
    });
  const isCurrentSessionTeam = isAllowedStatus({
    status: teamCancellation.status,
    allowPending: allowCurrentSessionTeamAccountCancellationPending,
    allowFinalizing: allowCurrentSessionTeamAccountCancellationFinalizing
  });
  if (!isOwnTeam && !isCurrentSessionTeam) {
    throw new Error(TeamErrEnum.accountCancellationPending);
  }
};

/** 登录前只允许本人处于 pending；finalizing 用户不能更新偏好或创建新的 Session。 */
export const assertUserCanLogin = async (userId: string) => {
  const cancellation = await getActiveAccountCancellationByUserId(userId);
  if (cancellation?.status === AccountCancellationStatusEnum.finalizing) {
    throw new Error(UserErrEnum.accountCancellationPending);
  }
};

/** 创建团队或转让 owner 前调用，避免注销中的用户重新获得 owner 资源。 */
export const assertAccountCancellationUserCanOwnTeam = async (userId?: string) => {
  const cancellation = await getActiveAccountCancellationByUserId(userId);
  if (cancellation) throw new Error(UserErrEnum.accountCancellationPending);
};

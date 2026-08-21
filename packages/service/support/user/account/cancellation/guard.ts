import { TeamErrEnum } from '@fastgpt/global/common/error/code/team';
import { UserErrEnum } from '@fastgpt/global/common/error/code/user';
import { AccountCancellationStatus } from '@fastgpt/global/support/user/account/cancellation/constants';
import { getActiveAccountCancellationByTeamId, getActiveAccountCancellationByUserId } from './read';

/** 校验用户或团队是否处于注销流程；用户状态按 userId 读取并复用用户级缓存。 */
export const assertCancellation = async ({
  teamId,
  userId
}: {
  teamId: string;
  userId?: string;
}) => {
  const teamCancellation = await getActiveAccountCancellationByTeamId(teamId);
  if (teamCancellation) {
    throw new Error(TeamErrEnum.accountCancellationPending);
  }

  if (!userId) return;

  const userCancellation = await getActiveAccountCancellationByUserId(userId);
  if (userCancellation) {
    throw new Error(UserErrEnum.accountCancellationPending);
  }
};

/** 登录前只允许本人处于 pending；finalizing 用户不能更新偏好或创建新的 Session。 */
export const assertUserCanLogin = async (userId: string) => {
  const cancellation = await getActiveAccountCancellationByUserId(userId);
  if (cancellation?.status === AccountCancellationStatus.finalizing) {
    throw new Error(UserErrEnum.accountCancellationPending);
  }
};

/** 创建团队或转让 owner 前调用，避免注销中的用户重新获得 owner 资源。 */
export const assertAccountCancellationUserCanOwnTeam = async (userId?: string) => {
  const cancellation = await getActiveAccountCancellationByUserId(userId);
  if (cancellation) throw new Error(UserErrEnum.accountCancellationPending);
};

import { TeamErrEnum } from '@fastgpt/global/common/error/code/team';
import { UserErrEnum } from '@fastgpt/global/common/error/code/user';
import { ERROR_ENUM } from '@fastgpt/global/common/error/errorCode';
import { AccountCancellationStatus } from '@fastgpt/global/support/user/account/cancellation/constants';
import { MongoTeamMember } from '../../team/teamMemberSchema';
import { getActiveAccountCancellationByTeamId, getActiveAccountCancellationByUserId } from './read';

/** 校验用户或团队是否处于注销流程；任一存在 active 注销记录即拒绝访问。 */
export const assertCancellation = async ({ teamId, tmbId }: { teamId: string; tmbId?: string }) => {
  const teamCancellation = await getActiveAccountCancellationByTeamId(teamId);
  if (teamCancellation) throw new Error(TeamErrEnum.accountCancellationPending);

  if (!tmbId) return;
  const member = await MongoTeamMember.findById(tmbId, { userId: 1, teamId: 1 }).lean();
  if (!member) throw new Error(ERROR_ENUM.unAuthorization);
  const userCancellation = await getActiveAccountCancellationByUserId(String(member.userId));
  if (userCancellation) throw new Error(UserErrEnum.accountCancellationPending);
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

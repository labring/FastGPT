import { TeamErrEnum } from '@fastgpt/global/common/error/code/team';
import { UserErrEnum } from '@fastgpt/global/common/error/code/user';
import { ERROR_ENUM } from '@fastgpt/global/common/error/errorCode';
import { MongoTeamMember } from '../../team/teamMemberSchema';
import { MongoTeam } from '../../team/teamSchema';
import { getActiveAccountCancellationByTeamId, getActiveAccountCancellationByUserId } from './read';

export type AssertAccountUsableProps = {
  userId?: string;
  teamId?: string;
  tmbId?: string;
  allowUserAccountCancellationPending?: boolean;
  allowCurrentUserOwnedTeamAccountCancellationPending?: boolean;
  allowCurrentSessionTeamAccountCancellationPending?: boolean;
};

/**
 * 统一阻断用户本人和当前团队 owner 的 pending/finalizing 业务访问。
 * owner 关联始终实时读取团队 ownerId，不依赖注销记录中的团队快照。
 */
export const assertAccountUsable = async ({
  userId,
  teamId,
  tmbId,
  allowUserAccountCancellationPending = false,
  allowCurrentUserOwnedTeamAccountCancellationPending = false,
  allowCurrentSessionTeamAccountCancellationPending = false
}: AssertAccountUsableProps) => {
  const tmb = tmbId && !teamId ? await MongoTeamMember.findById(tmbId).lean() : null;
  const currentUserId = userId || (tmb?.userId ? String(tmb.userId) : undefined);
  const currentTeamId = teamId || (tmb?.teamId ? String(tmb.teamId) : undefined);
  const [userCancellation, teamCancellation] = await Promise.all([
    allowUserAccountCancellationPending
      ? null
      : getActiveAccountCancellationByUserId(currentUserId),
    getActiveAccountCancellationByTeamId(currentTeamId)
  ]);

  if (!userCancellation && !teamCancellation) return;

  if (tmbId && currentTeamId) {
    const [activeMember, activeTeam] = await Promise.all([
      MongoTeamMember.findOne(
        {
          _id: tmbId,
          teamId: currentTeamId,
          ...(currentUserId ? { userId: currentUserId } : {}),
          status: 'active'
        },
        { _id: 1 }
      ).lean(),
      MongoTeam.findOne(
        {
          _id: currentTeamId,
          $or: [{ deleteTime: { $exists: false } }, { deleteTime: null }]
        },
        { _id: 1 }
      ).lean()
    ]);
    if (!activeMember || !activeTeam) throw new Error(ERROR_ENUM.unAuthorization);
  }

  if (userCancellation) throw new Error(UserErrEnum.accountCancellationPending);

  if (teamCancellation) {
    const isOwnTeam =
      allowCurrentUserOwnedTeamAccountCancellationPending &&
      !!currentUserId &&
      String(teamCancellation.userId) === String(currentUserId);
    const isCurrentSessionTeam = allowCurrentSessionTeamAccountCancellationPending;
    if (!isOwnTeam && !isCurrentSessionTeam) {
      throw new Error(TeamErrEnum.accountCancellationPending);
    }
  }
};

/** 创建团队或转让 owner 前调用，避免注销中的用户重新获得 owner 资源。 */
export const assertAccountCancellationUserCanOwnTeam = async (userId?: string) => {
  const cancellation = await getActiveAccountCancellationByUserId(userId);
  if (cancellation) throw new Error(UserErrEnum.accountCancellationPending);
};

import { TeamMemberStatusEnum } from '@fastgpt/global/support/user/team/constant';
import { getActiveAccountCancellationsByTeamIds } from '../account/cancellation/read';
import { MongoTeamMember } from './teamMemberSchema';
import { MongoTeam } from './teamSchema';
import type { ClientSession } from '../../../common/mongo';

/**
 * 找到用户可继续使用的团队。默认排除已删除团队、无效成员关系和注销中的 owner 团队；
 * 登录恢复场景可显式允许注销中的团队作为受限 Session 上下文，后续访问仍由注销 guard 控制。
 */
export const getUserFallbackTeam = async ({
  userId,
  excludedTeamId,
  session,
  allowAccountCancellationTeam = false
}: {
  userId: string;
  excludedTeamId?: string;
  session?: ClientSession;
  allowAccountCancellationTeam?: boolean;
}) => {
  const memberQuery = MongoTeamMember.find(
    {
      userId,
      status: TeamMemberStatusEnum.active,
      ...(excludedTeamId ? { teamId: { $ne: excludedTeamId } } : {})
    },
    { _id: 1, teamId: 1 }
  ).sort({ createTime: 1 });
  if (session) memberQuery.session(session);
  const members = await memberQuery.lean();

  if (members.length === 0) return null;

  const teamQuery = MongoTeam.find(
    {
      _id: { $in: members.map((member) => member.teamId) },
      $or: [{ deleteTime: { $exists: false } }, { deleteTime: null }]
    },
    { _id: 1, ownerId: 1 }
  );
  if (session) teamQuery.session(session);
  const teams = await teamQuery.lean();
  if (teams.length === 0) return null;

  const cancellationTeams = await getActiveAccountCancellationsByTeamIds(
    teams.map((team) => String(team._id))
  );
  const blockedTeamIds = new Set(cancellationTeams.map(({ teamId }) => teamId));
  const validTeams = new Map(teams.map((team) => [String(team._id), team]));
  const candidates = members.flatMap((member) => {
    const teamId = String(member.teamId);
    return validTeams.has(teamId) ? [{ teamId, tmbId: String(member._id) }] : [];
  });

  return (
    candidates.find(({ teamId }) => !blockedTeamIds.has(teamId)) ??
    (allowAccountCancellationTeam ? candidates[0] : undefined) ??
    null
  );
};

import { TeamMemberStatusEnum } from '@fastgpt/global/support/user/team/constant';
import { getActiveAccountCancellationsByTeamIds } from '../account/cancellation/read';
import { MongoTeamMember } from './teamMemberSchema';
import { MongoTeam } from './teamSchema';

/**
 * 找到用户可继续使用的团队。已删除团队、无效成员关系和注销中的 owner 团队都不能作为 fallback。
 */
export const getUserFallbackTeam = async ({
  userId,
  excludedTeamId
}: {
  userId: string;
  excludedTeamId?: string;
}) => {
  const members = await MongoTeamMember.find(
    {
      userId,
      status: TeamMemberStatusEnum.active,
      ...(excludedTeamId ? { teamId: { $ne: excludedTeamId } } : {})
    },
    { _id: 1, teamId: 1 }
  )
    .sort({ createTime: 1 })
    .lean();

  if (members.length === 0) return null;

  const teams = await MongoTeam.find(
    {
      _id: { $in: members.map((member) => member.teamId) },
      $or: [{ deleteTime: { $exists: false } }, { deleteTime: null }]
    },
    { _id: 1, ownerId: 1 }
  ).lean();
  if (teams.length === 0) return null;

  const cancellationTeams = await getActiveAccountCancellationsByTeamIds(
    teams.map((team) => String(team._id))
  );
  const blockedTeamIds = new Set(cancellationTeams.map(({ teamId }) => teamId));
  const validTeams = new Map(teams.map((team) => [String(team._id), team]));

  return (
    members
      .map((member) => {
        const teamId = String(member.teamId);
        return blockedTeamIds.has(teamId) || !validTeams.has(teamId)
          ? null
          : { teamId, tmbId: String(member._id) };
      })
      .find(Boolean) ?? null
  );
};

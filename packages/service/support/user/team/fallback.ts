import { TeamMemberStatusEnum } from '@fastgpt/global/support/user/team/constant';
import { MongoTeamMember } from './teamMemberSchema';
import { MongoTeam } from './teamSchema';
import type { ClientSession } from '../../../common/mongo';

/**
 * 找到用户可继续使用的团队，排除已删除团队和无效成员关系。
 */
export const getUserFallbackTeam = async ({
  userId,
  excludedTeamId,
  session
}: {
  userId: string;
  excludedTeamId?: string;
  session?: ClientSession;
}) => {
  const ownerTeamQuery = MongoTeam.findOne(
    {
      ownerId: userId,
      ...(excludedTeamId ? { _id: { $ne: excludedTeamId } } : {}),
      $or: [{ deleteTime: { $exists: false } }, { deleteTime: null }]
    },
    { _id: 1 }
  ).sort({ createTime: 1 });
  if (session) ownerTeamQuery.session(session);
  const ownerTeam = await ownerTeamQuery.lean();

  if (ownerTeam) {
    const ownerMemberQuery = MongoTeamMember.findOne(
      {
        teamId: ownerTeam._id,
        userId,
        status: TeamMemberStatusEnum.active
      },
      { _id: 1 }
    );
    if (session) ownerMemberQuery.session(session);

    const ownerMember = await ownerMemberQuery.lean();
    if (ownerMember) {
      return { teamId: String(ownerTeam._id), tmbId: String(ownerMember._id) };
    }
  }

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

  const validTeams = new Map(teams.map((team) => [String(team._id), team]));
  const candidates = members.flatMap((member) => {
    const teamId = String(member.teamId);
    return validTeams.has(teamId) ? [{ teamId, tmbId: String(member._id) }] : [];
  });

  return candidates[0] ?? null;
};

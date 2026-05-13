import { MongoTeamMember } from '../../user/team/teamMemberSchema';
import { type UserModelSchema } from '@fastgpt/global/support/user/type';
import { type TeamSchema } from '@fastgpt/global/support/user/team/type';
import { TeamErrEnum } from '@fastgpt/global/common/error/code/team';
import { MongoUser } from '../schema';

export async function getTmbIdByUsername(username: string, teamId: string) {
  const user = await MongoUser.findOne({ username }, '_id');
  if (!user) return null;
  const tmb = await MongoTeamMember.findOne({ userId: user._id, teamId }, '_id');
  return tmb?._id?.toString() || null;
}

/** Batch resolve usernames to tmbIds within a team. Returns username → tmbId map. */
export async function getTmbIdsByUsernames(
  usernames: string[],
  teamId: string
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (usernames.length === 0) return map;

  const users = await MongoUser.find({ username: { $in: usernames } }, '_id username').lean();
  if (users.length === 0) return map;

  const usernameToUserId = new Map(users.map((u) => [u.username, u._id]));
  const userIds = users.map((u) => u._id);

  const tmbs = await MongoTeamMember.find(
    { userId: { $in: userIds }, teamId },
    '_id userId'
  ).lean();

  const userIdToTmbId = new Map(tmbs.map((t) => [t.userId.toString(), t._id.toString()]));

  for (const username of usernames) {
    const userId = usernameToUserId.get(username);
    if (!userId) continue;
    const tmbId = userIdToTmbId.get(userId.toString());
    if (tmbId) map.set(username, tmbId);
  }

  return map;
}

// TODO: 数据库优化
export async function getRunningUserInfoByTmbId(tmbId: string) {
  if (tmbId) {
    const tmb = await MongoTeamMember.findById(tmbId, 'teamId name userId') // team_members name is the user's name
      .populate<{ team: TeamSchema; user: UserModelSchema }>([
        {
          path: 'team',
          select: 'name'
        },
        {
          path: 'user',
          select: 'username contact'
        }
      ])
      .lean();

    if (!tmb) return Promise.reject(TeamErrEnum.notUser);

    return {
      username: tmb.user.username,
      teamName: tmb.team.name,
      memberName: tmb.name,
      contact: tmb.user.contact || '',
      teamId: tmb.teamId,
      tmbId: tmb._id
    };
  }

  return Promise.reject(TeamErrEnum.notUser);
}

export async function getUserChatInfo(tmbId: string) {
  const tmb = await MongoTeamMember.findById(tmbId, 'userId teamId')
    .populate<{ user: UserModelSchema; team: TeamSchema }>([
      {
        path: 'user',
        select: 'timezone'
      },
      {
        path: 'team',
        select: 'openaiAccount externalWorkflowVariables'
      }
    ])
    .lean();

  if (!tmb) return Promise.reject(TeamErrEnum.notUser);

  return {
    timezone: tmb.user.timezone,
    externalProvider: {
      openaiAccount: tmb.team.openaiAccount,
      externalWorkflowVariables: tmb.team.externalWorkflowVariables
    }
  };
}

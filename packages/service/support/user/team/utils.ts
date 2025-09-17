import { MongoTeamMember } from '../../user/team/teamMemberSchema';
import { type UserModelSchema } from '@fastgpt/global/support/user/type';
import { type TeamSchema } from '@fastgpt/global/support/user/team/type';
import { TeamErrEnum } from '@fastgpt/global/common/error/code/team';

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

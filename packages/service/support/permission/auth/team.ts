import { MongoTeamMember } from '../../user/team/teamMemberSchema';
import { checkTeamAIPoints } from '../teamLimit';
import { UserErrEnum } from '@fastgpt/global/common/error/code/user';
import { UserModelSchema } from '@fastgpt/global/support/user/type';
import { TeamSchema } from '@fastgpt/global/support/user/team/type';

export async function getUserChatInfoAndAuthTeamPoints(tmbId: string) {
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

  if (!tmb) return Promise.reject(UserErrEnum.unAuthUser);

  await checkTeamAIPoints(tmb.team._id);

  return {
    timezone: tmb.user.timezone,
    externalProvider: {
      openaiAccount: tmb.team.openaiAccount,
      externalWorkflowVariables: tmb.team.externalWorkflowVariables
    }
  };
}

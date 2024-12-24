import { ExternalProviderType } from '@fastgpt/global/core/workflow/runtime/type';
import { MongoTeamMember } from '../../user/team/teamMemberSchema';
import { checkTeamAIPoints } from '../teamLimit';
import { UserErrEnum } from '@fastgpt/global/common/error/code/user';

type tmbType = {
  teamId: ExternalProviderType & { _id: string };
  userId: {
    timezone: string;
  };
};

export async function getUserChatInfoAndAuthTeamPoints(tmbId: string) {
  const tmb = (await MongoTeamMember.findById(tmbId, 'teamId userId')
    .populate('userId', 'timezone')
    .populate('teamId', 'openaiAccount externalWorkflowVariables')) as tmbType;

  if (!tmb) return Promise.reject(UserErrEnum.unAuthUser);

  await checkTeamAIPoints(tmb.teamId._id);

  return {
    timezone: tmb.userId.timezone,
    externalProvider: tmb.teamId
  };
}

import {
  TeamExternalProviderConfigType,
  UserExternalProviderConfigType
} from '@fastgpt/global/core/workflow/runtime/type';
import { MongoTeamMember } from '../../user/team/teamMemberSchema';
import { checkTeamAIPoints } from '../teamLimit';
import { UserErrEnum } from '@fastgpt/global/common/error/code/user';

type tmbType = {
  teamId: TeamExternalProviderConfigType & { _id: string };
  userId: UserExternalProviderConfigType;
};

export async function getUserChatInfoAndAuthTeamPoints(tmbId: string) {
  const tmb = (await MongoTeamMember.findById(tmbId, 'teamId userId')
    .populate('userId', 'timezone')
    .populate('teamId', 'openaiAccount externalWorkflowVariables')) as tmbType;

  if (!tmb) return Promise.reject(UserErrEnum.unAuthUser);

  await checkTeamAIPoints(tmb.teamId._id);

  return {
    user: tmb.userId,
    team: tmb.teamId
  };
}

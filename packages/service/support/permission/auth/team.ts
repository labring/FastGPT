import { TeamMemberWithUserSchema, TeamSchema } from '@fastgpt/global/support/user/team/type';
import { MongoTeamMember } from '../../user/team/teamMemberSchema';
import { checkTeamAIPoints } from '../teamLimit';
import { UserErrEnum } from '@fastgpt/global/common/error/code/user';
import { MongoTeam } from '../../../support/user/team/teamSchema';

export async function getUserChatInfoAndAuthTeamPoints(tmbId: string) {
  const tmb = (await MongoTeamMember.findById(tmbId, 'teamId userId').populate(
    'userId',
    'timezone'
  )) as TeamMemberWithUserSchema;
  if (!tmb) return Promise.reject(UserErrEnum.unAuthUser);

  const team = (await MongoTeam.findById(
    tmb.teamId,
    'openaiAccount workflowVariables'
  ).lean()) as TeamSchema;
  if (!team) return Promise.reject('team is empty');

  await checkTeamAIPoints(tmb.teamId);

  return {
    user: tmb.userId,
    team
  };
}

import { AuthResponseType } from '@fastgpt/global/support/permission/type';
import { parseHeaderAuth } from '@fastgpt/service/support/permission/controller';
import { AuthModeType } from '@fastgpt/service/support/permission/type';
import { getTeamInfoByUIdAndTmbId } from '../../user/team/controller';
import { TeamMemberRoleEnum } from '@fastgpt/global/support/user/team/constant';
import { UserErrEnum } from '@fastgpt/global/common/error/code/user';
import { TeamItemType } from '@fastgpt/global/support/user/team/type';

export async function authUserNotVisitor(props: AuthModeType): Promise<
  AuthResponseType & {
    team: TeamItemType;
  }
> {
  const { userId, teamId, tmbId } = await parseHeaderAuth(props);
  const team = await getTeamInfoByUIdAndTmbId(userId, tmbId);

  if (team.role === TeamMemberRoleEnum.visitor) {
    return Promise.reject(UserErrEnum.binVisitor);
  }

  return {
    userId,
    teamId,
    tmbId,
    team,
    isOwner: String(team.tmbId) === tmbId,
    canWrite: true
  };
}

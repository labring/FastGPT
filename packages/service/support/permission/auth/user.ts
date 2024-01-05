import { AuthResponseType } from '@fastgpt/global/support/permission/type';
import { AuthModeType } from '../type';
import { TeamItemType } from '@fastgpt/global/support/user/team/type';
import { TeamMemberRoleEnum } from '@fastgpt/global/support/user/team/constant';
import { parseHeaderCert } from '../controller';
import { getTeamInfoByTmbId } from '../../user/team/controller';
import { UserErrEnum } from '../../../../global/common/error/code/user';

export async function authUserNotVisitor(props: AuthModeType): Promise<
  AuthResponseType & {
    team: TeamItemType;
    role: `${TeamMemberRoleEnum}`;
  }
> {
  const { userId, teamId, tmbId } = await parseHeaderCert(props);
  const team = await getTeamInfoByTmbId({ tmbId });

  if (team.role === TeamMemberRoleEnum.visitor) {
    return Promise.reject(UserErrEnum.binVisitor);
  }

  return {
    userId,
    teamId,
    tmbId,
    team,
    role: team.role,
    isOwner: team.role === TeamMemberRoleEnum.owner, // teamOwner
    canWrite: true
  };
}

/* auth user role  */
export async function authUserRole(props: AuthModeType): Promise<
  AuthResponseType & {
    role: `${TeamMemberRoleEnum}`;
    teamOwner: boolean;
  }
> {
  const result = await parseHeaderCert(props);
  const { role: userRole, canWrite } = await getTeamInfoByTmbId({ tmbId: result.tmbId });

  return {
    ...result,
    isOwner: true,
    role: userRole,
    teamOwner: userRole === TeamMemberRoleEnum.owner,
    canWrite
  };
}

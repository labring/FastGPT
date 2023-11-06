import { AuthResponseType } from '@fastgpt/global/support/permission/type';
import { parseHeaderAuth } from '@fastgpt/service/support/permission/controller';
import { AuthModeType } from '@fastgpt/service/support/permission/type';
import { getTeamInfoByUIdAndTmbId, getTeamRole } from '../../user/team/controller';
import { TeamMemberRoleEnum } from '@fastgpt/global/support/user/team/constant';
import { UserErrEnum } from '@fastgpt/global/common/error/code/user';
import { TeamItemType } from '@fastgpt/global/support/user/team/type';

export async function authUserNotVisitor(props: AuthModeType): Promise<
  AuthResponseType & {
    team: TeamItemType;
    role: `${TeamMemberRoleEnum}`;
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
    role: team.role,
    isOwner: String(team.tmbId) === tmbId,
    canWrite: true
  };
}
/* uniform auth user */
export const authUserRole = async ({
  authBalance = false,
  role,
  ...props
}: AuthModeType & {
  role?: `${TeamMemberRoleEnum}`;
  authBalance?: boolean;
}): Promise<
  AuthResponseType & {
    role: `${TeamMemberRoleEnum}`;
  }
> => {
  const { userId, teamId, tmbId } = await parseHeaderAuth(props);
  const { role: userRole, canWrite } = await getTeamRole(userId, tmbId);

  if (role === 'admin' && !canWrite) {
    return Promise.reject(UserErrEnum.unAuthRole);
  }
  if (role === 'owner' && !canWrite) {
    return Promise.reject(UserErrEnum.unAuthRole);
  }

  return {
    userId,
    teamId,
    tmbId,
    isOwner: true,
    role: userRole,
    canWrite
  };
};

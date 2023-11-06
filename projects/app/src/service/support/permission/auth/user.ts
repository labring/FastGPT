import { AuthResponseType } from '@fastgpt/global/support/permission/type';
import { parseHeaderAuth } from '@fastgpt/service/support/permission/controller';
import { AuthModeType } from '@fastgpt/service/support/permission/type';
import { getTeamInfoByUIdAndTmbId, getTeamRole } from '../../user/team/controller';
import { TeamMemberRoleEnum } from '@fastgpt/global/support/user/team/constant';
import { UserErrEnum } from '@fastgpt/global/common/error/code/user';
import { TeamItemType } from '@fastgpt/global/support/user/team/type';
import { UserModelSchema, UserType } from '@fastgpt/global/support/user/type';
import { getUserDetail } from '../../user/controller';

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
export async function authUserRole({
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
> {
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
}

export async function authUser({
  minBalance,
  ...props
}: AuthModeType & {
  minBalance?: number;
}): Promise<
  AuthResponseType & {
    user: UserType;
  }
> {
  const { userId, teamId, tmbId } = await parseHeaderAuth(props);

  return {
    userId,
    teamId,
    tmbId,
    user: await authBalance({ userId, tmbId, minBalance }),
    isOwner: true
  };
}

export async function authBalance({
  userId,
  tmbId,
  minBalance
}: {
  userId: string;
  tmbId: string;
  minBalance?: number;
}) {
  const user = await getUserDetail(userId, tmbId);

  if (!user) {
    return Promise.reject(UserErrEnum.unAuthUser);
  }
  if (minBalance !== undefined && user.team.balance < minBalance) {
    return Promise.reject(UserErrEnum.balanceNotEnough);
  }

  return user;
}

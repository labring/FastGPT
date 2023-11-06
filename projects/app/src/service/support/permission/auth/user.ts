import { AuthResponseType } from '@fastgpt/global/support/permission/type';
import { parseHeaderCert } from '@fastgpt/service/support/permission/controller';
import { AuthModeType } from '@fastgpt/service/support/permission/type';
import { getTeamInfoByTmbId } from '../../user/team/controller';
import { TeamMemberRoleEnum } from '@fastgpt/global/support/user/team/constant';
import { UserErrEnum } from '@fastgpt/global/common/error/code/user';
import { TeamItemType } from '@fastgpt/global/support/user/team/type';
import { UserType } from '@fastgpt/global/support/user/type';
import { getUserDetail } from '@/service/support/user/controller';

export async function authUserNotVisitor(props: AuthModeType): Promise<
  AuthResponseType & {
    team: TeamItemType;
    role: `${TeamMemberRoleEnum}`;
  }
> {
  const { userId, teamId, tmbId } = await parseHeaderCert(props);
  const team = await getTeamInfoByTmbId(tmbId);

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
/* auth user role  */
export async function authUserRole(props: AuthModeType): Promise<
  AuthResponseType & {
    role: `${TeamMemberRoleEnum}`;
  }
> {
  const { userId, teamId, tmbId } = await parseHeaderCert(props);
  const { role: userRole, canWrite } = await getTeamInfoByTmbId(tmbId);

  return {
    userId,
    teamId,
    tmbId,
    isOwner: true,
    role: userRole,
    canWrite
  };
}

export async function getUserAndAuthBalance({
  tmbId,
  minBalance
}: {
  tmbId: string;
  minBalance?: number;
}) {
  const user = await getUserDetail(tmbId);

  if (!user) {
    return Promise.reject(UserErrEnum.unAuthUser);
  }
  if (minBalance !== undefined && user.team.balance < minBalance) {
    return Promise.reject(UserErrEnum.balanceNotEnough);
  }

  return user;
}

/* get user */
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
  const { userId, teamId, tmbId } = await parseHeaderCert(props);

  return {
    userId,
    teamId,
    tmbId,
    user: await getUserAndAuthBalance({ tmbId, minBalance }),
    isOwner: true,
    canWrite: true
  };
}

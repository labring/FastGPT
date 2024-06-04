import { AuthResponseType } from '@fastgpt/global/support/permission/type/auth.d';
import { AuthPropsType } from '../type';
import { TeamTmbItemType } from '@fastgpt/global/support/user/team/type';
import { TeamMemberRoleEnum } from '@fastgpt/global/support/user/team/constant';
import { parseHeaderCert } from '../controller';
import { getTmbInfoByTmbId } from '../../user/team/controller';
import { UserErrEnum } from '../../../../global/common/error/code/user';
import { TeamErrEnum } from '@fastgpt/global/common/error/code/team';

export async function authUserNotVisitor(props: Omit<AuthPropsType, 'per'>): Promise<
  AuthResponseType & {
    tmb: TeamTmbItemType;
    role: `${TeamMemberRoleEnum}`;
  }
> {
  const { teamId, tmbId } = await parseHeaderCert(props);
  const tmb = await getTmbInfoByTmbId({ tmbId });

  if (tmb.role === TeamMemberRoleEnum.visitor) {
    return Promise.reject(UserErrEnum.binVisitor);
  }

  return {
    teamId,
    tmbId,
    tmb,
    role: tmb.role,
    permission: tmb.permission
  };
}

/* auth user role  */
export async function authUserPer(props: AuthPropsType): Promise<
  AuthResponseType & {
    role: `${TeamMemberRoleEnum}`;
  }
> {
  const result = await parseHeaderCert(props);
  const { role: userRole, permission } = await getTmbInfoByTmbId({ tmbId: result.tmbId });

  if (!permission.checkPer(props.per)) {
    return Promise.reject(TeamErrEnum.unAuthTeam);
  }

  return {
    ...result,
    role: userRole,
    permission
  };
}

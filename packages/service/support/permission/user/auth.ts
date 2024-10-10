import { TeamTmbItemType } from '@fastgpt/global/support/user/team/type';
import { parseHeaderCert } from '../controller';
import { getTmbInfoByTmbId } from '../../user/team/controller';
import { TeamErrEnum } from '@fastgpt/global/common/error/code/team';
import { AuthModeType, AuthResponseType } from '../type';
import { NullPermission } from '@fastgpt/global/support/permission/constant';
import { TeamPermission } from '@fastgpt/global/support/permission/user/controller';

/* auth user role  */
export async function authUserPer(props: AuthModeType): Promise<
  AuthResponseType<TeamPermission> & {
    tmb: TeamTmbItemType;
  }
> {
  const result = await parseHeaderCert(props);
  const tmb = await getTmbInfoByTmbId({ tmbId: result.tmbId });

  if (result.isRoot) {
    return {
      ...result,
      permission: new TeamPermission({
        isOwner: true
      }),
      tmb
    };
  }
  if (!tmb.permission.checkPer(props.per ?? NullPermission)) {
    return Promise.reject(TeamErrEnum.unAuthTeam);
  }

  return {
    ...result,
    permission: tmb.permission,
    tmb
  };
}

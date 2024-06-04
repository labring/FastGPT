import { AuthResponseType } from '../type/auth.d';
import { AuthPropsType } from '../type/auth.d';
import { TeamTmbItemType } from '@fastgpt/global/support/user/team/type';
import { parseHeaderCert } from '../controller';
import { getTmbInfoByTmbId } from '../../user/team/controller';
import { TeamErrEnum } from '@fastgpt/global/common/error/code/team';

/* auth user role  */
export async function authUserPer(props: AuthPropsType): Promise<
  AuthResponseType & {
    tmb: TeamTmbItemType;
  }
> {
  const result = await parseHeaderCert(props);
  const tmb = await getTmbInfoByTmbId({ tmbId: result.tmbId });

  if (!tmb.permission.checkPer(props.per)) {
    return Promise.reject(TeamErrEnum.unAuthTeam);
  }

  return {
    ...result,
    permission: tmb.permission,
    tmb
  };
}

import { parseHeaderCert } from '@fastgpt/service/support/permission/controller';
import { AuthModeType } from '@fastgpt/service/support/permission/type';
import { getTeamInfoByTmbId } from '@/service/support/user/team/controller';
import { authApp as packageAuthApp } from '@fastgpt/service/support/permission/auth/app';

export async function authApp(
  props: AuthModeType & {
    appId: string;
  }
) {
  const { tmbId, appId: authAppId } = await parseHeaderCert(props);
  const team = await getTeamInfoByTmbId(tmbId);

  return packageAuthApp({
    ...props,
    appId: props.appId || authAppId,
    role: team.role
  });
}

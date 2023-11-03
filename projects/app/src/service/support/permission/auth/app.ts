import { parseHeaderAuth } from '@fastgpt/service/support/permission/controller';
import { AuthModeType } from '@fastgpt/service/support/permission/type';
import { getTeamInfoByUIdAndTmbId } from '@/service/support/user/team/controller';
import { authApp as packageAuthApp } from '@fastgpt/service/support/permission/auth/app';

export async function authApp(
  props: AuthModeType & {
    appId: string;
  }
) {
  const { userId, tmbId } = await parseHeaderAuth(props);
  const team = await getTeamInfoByUIdAndTmbId(userId, tmbId);

  return packageAuthApp({
    ...props,
    role: team.role
  });
}

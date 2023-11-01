import { GET } from '@fastgpt/service/common/api/plusRequest';
import { TeamItemType } from '@fastgpt/global/support/user/team/type';
import { createJWT } from '@fastgpt/service/support/permission/controller';

export async function getTeamInfoByUIdAndTmbId(userId: string, tmbId?: string) {
  return tmbId
    ? GET<TeamItemType>(
        '/support/user/team/getTokenTeam',
        {},
        {
          headers: {
            token: createJWT(userId, tmbId)
          }
        }
      )
    : undefined;
}

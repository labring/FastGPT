import { TeamItemType } from '@fastgpt/global/support/user/team/type';
import { GET } from '../../../common/api/plusRequest';
import { createJWT } from '../../permission/controller';

export async function getTeamInfoByUIdAndTmbId(userId: string, tmbId = '') {
  let team: TeamItemType | undefined = undefined;
  try {
    team = await GET<TeamItemType>(
      '/support/user/team/getTokenTeam',
      {},
      {
        headers: {
          token: createJWT({ _id: userId, team: { tmbId } })
        }
      }
    );
  } catch (error) {}
  return team;
}

import { POST } from '@fastgpt/service/common/api/plusRequest';
import type { AuthOutLinkChatProps } from '@fastgpt/global/support/outLink/api.d';
import type { chatAppListSchema } from '@fastgpt/global/core/chat/type.d';
import { getUserChatInfoAndAuthTeamPoints } from './team';
import { MongoTeam } from '@fastgpt/service/support/user/team/teamSchema';
import { MongoTeamMember } from '@fastgpt/service/support/user/team/teamMemberSchema';

export function authChatTeamInfo(data: { shareTeamId: string; authToken: string }) {
  return POST<chatAppListSchema>('/core/chat/init', data);
}

export async function authTeamShareChatStart({
  teamId,
  ip,
  outLinkUid,
  question
}: AuthOutLinkChatProps & {
  teamId: string;
}) {
  // get outLink and app
  const { teamInfo, uid } = await authChatTeamInfo({ shareTeamId: teamId, authToken: outLinkUid });
  // check balance and chat limit
  const tmb = await MongoTeamMember.findOne({ teamId, userId: String(teamInfo.ownerId) });

  if (!tmb) {
    throw new Error('can not find it');
  }

  const { user } = await getUserChatInfoAndAuthTeamPoints(String(tmb._id));

  return {
    user,
    tmbId: String(tmb._id),
    uid: uid
  };
}

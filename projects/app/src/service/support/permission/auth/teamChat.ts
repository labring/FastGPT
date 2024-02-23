import { POST } from '@fastgpt/service/common/api/plusRequest';
import type {
  AuthOutLinkChatProps,
  AuthOutLinkLimitProps,
  AuthOutLinkInitProps,
  AuthOutLinkResponse
} from '@fastgpt/global/support/outLink/api.d';
import { getUserChatInfoAndAuthTeamPoints } from './team';
import { MongoTeam } from '@fastgpt/service/support/user/team/teamSchema';
import { MongoTeamMember } from '@fastgpt/service/support/user/team/teamMemberSchema';
export function authOutLinkInit(data: AuthOutLinkInitProps): Promise<AuthOutLinkResponse> {
  if (!global.feConfigs?.isPlus) return Promise.resolve({ uid: data.outLinkUid });
  return POST<AuthOutLinkResponse>('/support/outLink/authInit', data);
}
export function authOutLinkChatLimit(data: AuthOutLinkLimitProps): Promise<AuthOutLinkResponse> {
  if (!global.feConfigs?.isPlus) return Promise.resolve({ uid: data.outLinkUid });
  return POST<AuthOutLinkResponse>('/support/outLink/authChatStart', data);
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
  const res: any = await MongoTeam.findById(teamId);

  // check balance and chat limit
  const tmb = await MongoTeamMember.findOne({ teamId, userId: String(res.ownerId) });

  if (!tmb) {
    throw new Error('can not find it');
  }

  const { user } = await getUserChatInfoAndAuthTeamPoints(String(tmb._id));

  return {
    user,
    uid: outLinkUid
  };
}

import { POST } from '@fastgpt/service/common/api/plusRequest';
import type {
  AuthOutLinkChatProps,
  AuthOutLinkLimitProps,
  AuthOutLinkInitProps,
  AuthOutLinkResponse,
  AuthOutLinkProps
} from '@fastgpt/global/support/outLink/api.d';
import { authOutLinkValid } from '@fastgpt/service/support/permission/publish/authLink';
import { getUserChatInfoAndAuthTeamPoints } from '@/service/support/permission/auth/team';
import { AuthUserTypeEnum } from '@fastgpt/global/support/permission/constant';
import { OutLinkErrEnum } from '@fastgpt/global/common/error/code/outLink';
import { OutLinkSchema } from '@fastgpt/global/support/outLink/type';

export function authOutLinkInit(data: AuthOutLinkInitProps): Promise<AuthOutLinkResponse> {
  if (!global.feConfigs?.isPlus) return Promise.resolve({ uid: data.outLinkUid });
  return POST<AuthOutLinkResponse>('/support/outLink/authInit', data);
}
export function authOutLinkChatLimit(data: AuthOutLinkLimitProps): Promise<AuthOutLinkResponse> {
  if (!global.feConfigs?.isPlus) return Promise.resolve({ uid: data.outLinkUid });
  return POST<AuthOutLinkResponse>('/support/outLink/authChatStart', data);
}

export const authOutLink = async ({
  shareId,
  outLinkUid
}: AuthOutLinkProps): Promise<{
  uid: string;
  appId: string;
  shareChat: OutLinkSchema;
}> => {
  if (!outLinkUid) {
    return Promise.reject(OutLinkErrEnum.linkUnInvalid);
  }
  const result = await authOutLinkValid({ shareId });

  const { uid } = await authOutLinkInit({
    outLinkUid,
    tokenUrl: result.shareChat.limit?.hookUrl
  });

  return {
    ...result,
    uid
  };
};

export async function authOutLinkChatStart({
  shareId,
  ip,
  outLinkUid,
  question
}: AuthOutLinkChatProps & {
  shareId: string;
}) {
  // get outLink and app
  const { shareChat, appId } = await authOutLinkValid({ shareId });

  // check ai points and chat limit
  const [{ user }, { uid }] = await Promise.all([
    getUserChatInfoAndAuthTeamPoints(shareChat.tmbId),
    authOutLinkChatLimit({ outLink: shareChat, ip, outLinkUid, question })
  ]);

  return {
    sourceName: shareChat.name,
    teamId: shareChat.teamId,
    tmbId: shareChat.tmbId,
    authType: AuthUserTypeEnum.token,
    responseDetail: shareChat.responseDetail,
    showNodeStatus: shareChat.showNodeStatus,
    user,
    appId,
    uid
  };
}

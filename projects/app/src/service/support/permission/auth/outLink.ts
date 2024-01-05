import { POST } from '@fastgpt/service/common/api/plusRequest';
import type {
  AuthOutLinkChatProps,
  AuthOutLinkLimitProps,
  AuthOutLinkInitProps,
  AuthOutLinkResponse
} from '@fastgpt/global/support/outLink/api.d';
import { authOutLinkValid } from '@fastgpt/service/support/permission/auth/outLink';
import { getUserAndAuthBalance } from '@fastgpt/service/support/user/controller';
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
}: {
  shareId?: string;
  outLinkUid?: string;
}): Promise<{
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

  // check balance and chat limit
  const [user, { uid }] = await Promise.all([
    getUserAndAuthBalance({ tmbId: shareChat.tmbId, minBalance: 0 }),
    authOutLinkChatLimit({ outLink: shareChat, ip, outLinkUid, question })
  ]);

  return {
    authType: AuthUserTypeEnum.token,
    responseDetail: shareChat.responseDetail,
    user,
    appId,
    uid
  };
}

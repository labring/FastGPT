import { authOutLinkLimit } from '@/service/support/outLink/auth';
import { AuthLinkChatProps } from '@fastgpt/global/support/outLink/api.d';
import { AuthUserTypeEnum } from '@fastgpt/global/support/permission/constant';
import { getUserAndAuthBalance } from './user';
import { authOutLinkValid } from '@fastgpt/service/support/permission/auth/outLink';

export async function authOutLinkChat({
  shareId,
  ip,
  authToken,
  question
}: AuthLinkChatProps & {
  shareId: string;
}) {
  // get outLink
  const { shareChat, app } = await authOutLinkValid({ shareId });

  const [user] = await Promise.all([
    getUserAndAuthBalance({ tmbId: shareChat.tmbId, minBalance: 0 }),
    global.feConfigs?.isPlus
      ? authOutLinkLimit({ outLink: shareChat, ip, authToken, question })
      : undefined
  ]);

  return {
    authType: AuthUserTypeEnum.token,
    responseDetail: shareChat.responseDetail,
    user,
    app
  };
}

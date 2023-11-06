import { parseHeaderCert } from '@fastgpt/service/support/permission/controller';
import { AuthModeType } from '@fastgpt/service/support/permission/type';
import { getTeamInfoByTmbId } from '@/service/support/user/team/controller';
import { authOutLinkCrud as packageAuthOutLinkCrud } from '@fastgpt/service/support/permission/auth/outLink';
import { MongoOutLink } from '@fastgpt/service/support/outLink/schema';
import { OutLinkErrEnum } from '@fastgpt/global/common/error/code/outLink';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { AppErrEnum } from '@fastgpt/global/common/error/code/app';
import { AuthLinkChatProps, authOutLinkLimit } from '@/service/support/outLink/auth';
import { AuthUserTypeEnum } from '@fastgpt/global/support/permission/constant';
import { getUserAndAuthBalance } from './user';

export async function authOutLinkCrud(
  props: AuthModeType & {
    outLinkId: string;
  }
) {
  const { tmbId } = await parseHeaderCert(props);
  const team = await getTeamInfoByTmbId(tmbId);

  return packageAuthOutLinkCrud({
    ...props,
    role: team.role
  });
}

export async function authOutLinkValid({ shareId }: { shareId?: string }) {
  const shareChat = await MongoOutLink.findOne({ shareId });

  if (!shareChat) {
    return Promise.reject(OutLinkErrEnum.linkUnInvalid);
  }

  const app = await MongoApp.findById(shareChat.appId);

  if (!app) {
    return Promise.reject(AppErrEnum.unExist);
  }

  return {
    app,
    shareChat
  };
}

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

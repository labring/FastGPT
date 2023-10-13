import { AuthUserTypeEnum, authBalanceByUid } from '../user/auth';
import { MongoOutLink } from './schema';
import { POST } from '@fastgpt/common/plusApi/request';
import { OutLinkSchema } from './type.d';

export type AuthLinkProps = { ip?: string | null; authToken?: string; question: string };
export type AuthLinkLimitProps = AuthLinkProps & { outLink: OutLinkSchema };

export async function authOutLinkChat({
  shareId,
  ip,
  authToken,
  question
}: AuthLinkProps & {
  shareId: string;
}) {
  // get outLink
  const outLink = await MongoOutLink.findOne({
    shareId
  });

  if (!outLink) {
    return Promise.reject('分享链接无效');
  }

  const uid = String(outLink.userId);

  const [user] = await Promise.all([
    authBalanceByUid(uid), // authBalance
    ...(global.feConfigs?.isPlus ? [authOutLinkLimit({ outLink, ip, authToken, question })] : []) // limit auth
  ]);

  return {
    user,
    userId: String(outLink.userId),
    appId: String(outLink.appId),
    authType: AuthUserTypeEnum.token,
    responseDetail: outLink.responseDetail
  };
}

export function authOutLinkLimit(data: AuthLinkLimitProps) {
  return POST('/support/outLink/authLimit', data);
}

export async function authOutLinkId({ id }: { id: string }) {
  const outLink = await MongoOutLink.findOne({
    shareId: id
  });

  if (!outLink) {
    return Promise.reject('分享链接无效');
  }

  return {
    userId: String(outLink.userId)
  };
}

export type AuthShareChatInitProps = {
  authToken?: string;
  tokenUrl?: string;
};

export function authShareChatInit(data: AuthShareChatInitProps) {
  return POST('/support/outLink/authShareChatInit', data);
}

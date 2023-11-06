import { MongoOutLink } from './schema';
import { POST } from '../../common/api/plusRequest';
import { OutLinkSchema } from '@fastgpt/global/support/outLink/type';
import { AuthUserTypeEnum } from '@fastgpt/global/support/permission/constant';
import { OutLinkErrEnum } from '../../../global/common/error/code/outLink';

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
    return Promise.reject(OutLinkErrEnum.unAuthLink);
  }

  if (global.feConfigs?.isPlus) {
    await authOutLinkLimit({ outLink, ip, authToken, question });
  }

  return {
    userId: String(outLink.userId),
    teamId: String(outLink.teamId),
    tmbId: String(outLink.tmbId),
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
  if (!global.feConfigs?.isPlus) return;
  return POST('/support/outLink/authShareChatInit', data);
}

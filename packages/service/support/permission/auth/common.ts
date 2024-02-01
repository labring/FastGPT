import { AuthUserTypeEnum } from '@fastgpt/global/support/permission/constant';
import { parseHeaderCert } from '../controller';
import { AuthModeType } from '../type';
import { authOutLinkValid } from './outLink';
import { isIPv6 } from 'net';

export const authCert = async (props: AuthModeType) => {
  const result = await parseHeaderCert(props);

  return {
    ...result,
    isOwner: true,
    canWrite: true
  };
};
export async function authCertOrShareId({
  shareId,
  ...props
}: AuthModeType & { shareId?: string }) {
  if (!shareId) {
    return authCert(props);
  }

  const { shareChat } = await authOutLinkValid({ shareId });

  return {
    teamId: String(shareChat.teamId),
    tmbId: String(shareChat.tmbId),
    authType: AuthUserTypeEnum.outLink,
    apikey: '',
    isOwner: false,
    canWrite: false
  };
}

/* auth the request from local service */
export const authRequestFromLocal = ({ req }: AuthModeType) => {
  const host =
    process.env.HOSTNAME && isIPv6(process.env.HOSTNAME)
      ? `[${process.env.HOSTNAME}]:${process.env.PORT || 3000}`
      : `${process.env.HOSTNAME || 'localhost'}:${process.env.PORT || 3000}`;

  if (host !== req.headers.host) {
    return Promise.reject('Invalid request');
  }
};

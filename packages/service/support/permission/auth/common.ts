import { AuthUserTypeEnum } from '@fastgpt/global/support/permission/constant';
import { parseHeaderCert } from '../controller';
import { AuthModeType } from '../type';
import { authOutLinkValid } from './outLink';
import { SERVICE_LOCAL_HOST } from '../../../common/system/tools';

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
  if (req.headers.host !== SERVICE_LOCAL_HOST) {
    return Promise.reject('Invalid request');
  }
};

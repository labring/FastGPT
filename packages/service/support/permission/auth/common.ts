import { AuthUserTypeEnum } from '@fastgpt/global/support/permission/constant';
import { parseHeaderCert } from '../controller';
import { AuthModeType } from '../type';
import { authOutLinkValid } from './outLink';

export const authCert = async (props: AuthModeType) => {
  const result = await parseHeaderCert(props);

  return {
    ...result,
    isOwner: true,
    canWrite: true
  };
};
export async function authCertAndShareId({
  shareId,
  ...props
}: AuthModeType & { shareId?: string }) {
  if (!shareId) {
    return authCert(props);
  }

  const { app } = await authOutLinkValid({ shareId });

  return {
    teamId: String(app.teamId),
    tmbId: String(app.tmbId),
    authType: AuthUserTypeEnum.outLink,
    apikey: '',
    isOwner: false,
    canWrite: false
  };
}

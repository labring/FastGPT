import { AppDetailType } from '@fastgpt/global/core/app/type';
import { OutlinkAppType, OutLinkSchema } from '@fastgpt/global/support/outLink/type';
import { parseHeaderCert } from '../controller';
import { MongoOutLink } from '../../outLink/schema';
import { OutLinkErrEnum } from '@fastgpt/global/common/error/code/outLink';
import { OwnerPermissionVal } from '@fastgpt/global/support/permission/constant';
import { authAppByTmbId } from '../app/auth';
import { AuthModeType, AuthResponseType } from '../type';

/* crud outlink permission */
export async function authOutLinkCrud({
  outLinkId,
  per = OwnerPermissionVal,
  ...props
}: AuthModeType & {
  outLinkId: string;
}): Promise<
  AuthResponseType & {
    app: AppDetailType;
    outLink: OutLinkSchema;
  }
> {
  const result = await parseHeaderCert(props);
  const { tmbId, teamId } = result;

  const { app, outLink } = await (async () => {
    const outLink = await MongoOutLink.findOne({ _id: outLinkId, teamId });
    if (!outLink) {
      return Promise.reject(OutLinkErrEnum.unExist);
    }

    if (String(outLink.teamId) !== teamId) {
      return Promise.reject(OutLinkErrEnum.unAuthLink);
    }

    const { app } = await authAppByTmbId({
      tmbId,
      appId: outLink.appId,
      per
    });

    return {
      outLink,
      app
    };
  })();

  return {
    ...result,
    permission: app.permission,
    app,
    outLink
  };
}

/* outLink exist and it app exist */
export async function authOutLinkValid<T extends OutlinkAppType = undefined>({
  shareId
}: {
  shareId?: string;
}) {
  if (!shareId) {
    return Promise.reject(OutLinkErrEnum.linkUnInvalid);
  }
  const shareChat = (await MongoOutLink.findOne({ shareId }).lean()) as OutLinkSchema<T>;

  if (!shareChat) {
    return Promise.reject(OutLinkErrEnum.linkUnInvalid);
  }

  return {
    appId: shareChat.appId,
    shareChat
  };
}

import { AppDetailType } from '@fastgpt/global/core/app/type';
import { OutLinkSchema } from '@fastgpt/global/support/outLink/type';
import { parseHeaderCert } from '../controller';
import { MongoOutLink } from '../../outLink/schema';
import { OutLinkErrEnum } from '@fastgpt/global/common/error/code/outLink';
import { ManagePermissionVal } from '@fastgpt/global/support/permission/constant';
import { AuthPropsType } from '../type/auth';
import { AuthResponseType } from '../type/auth';
import { authAppByTmbId } from '../app/auth';

/* crud outlink permission */
export async function authOutLinkCrud({
  outLinkId,
  per,
  ...props
}: AuthPropsType & {
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
      throw new Error(OutLinkErrEnum.unExist);
    }

    const { app } = await authAppByTmbId({
      tmbId,
      appId: outLink.appId,
      per: ManagePermissionVal
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
export async function authOutLinkValid({ shareId }: { shareId?: string }) {
  if (!shareId) {
    return Promise.reject(OutLinkErrEnum.linkUnInvalid);
  }
  const shareChat = await MongoOutLink.findOne({ shareId });

  if (!shareChat) {
    return Promise.reject(OutLinkErrEnum.linkUnInvalid);
  }

  return {
    appId: shareChat.appId,
    shareChat
  };
}

import { MockParseHeaderCert, TestRequest } from '@/test/utils';
import { OutLinkErrEnum } from '@fastgpt/global/common/error/code/outLink';
import { AppDetailType } from '@fastgpt/global/core/app/type';
import { OutLinkSchema } from '@fastgpt/global/support/outLink/type';
import { OwnerPermissionVal } from '@fastgpt/global/support/permission/constant';
import { PermissionValueType } from '@fastgpt/global/support/permission/type';
import { MongoOutLink } from '@fastgpt/service/support/outLink/schema';
import { authAppByTmbId } from '@fastgpt/service/support/permission/app/auth';
import { AuthResponseType } from '@fastgpt/service/support/permission/type';

export async function authOutLinkCrud({
  outLinkId,
  per = OwnerPermissionVal,
  req,
  authToken = true,
  authRoot = false,
  authApiKey = false
}: {
  outLinkId: string;
  req: TestRequest;
  authToken?: boolean;
  authRoot?: boolean;
  authApiKey?: boolean;
  per?: PermissionValueType;
}): Promise<
  AuthResponseType & {
    app: AppDetailType;
    outLink: OutLinkSchema;
  }
> {
  const result = await MockParseHeaderCert({
    req,
    authToken,
    authRoot,
    authApiKey
  });
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

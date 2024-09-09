import { AuthModeType, AuthResponseType } from '../type';
import { OpenApiSchema } from '@fastgpt/global/support/openapi/type';
import { parseHeaderCert } from '../controller';
import { getTmbInfoByTmbId } from '../../user/team/controller';
import { MongoOpenApi } from '../../openapi/schema';
import { OpenApiErrEnum } from '@fastgpt/global/common/error/code/openapi';
import { OwnerPermissionVal } from '@fastgpt/global/support/permission/constant';
import { authAppByTmbId } from '../app/auth';
import { Permission } from '@fastgpt/global/support/permission/controller';

export async function authOpenApiKeyCrud({
  id,
  per = OwnerPermissionVal,
  ...props
}: AuthModeType & {
  id: string;
}): Promise<
  AuthResponseType & {
    openapi: OpenApiSchema;
  }
> {
  const result = await parseHeaderCert(props);
  const { tmbId, teamId } = result;

  const { openapi, permission } = await (async () => {
    const openapi = await MongoOpenApi.findOne({ _id: id, teamId });
    if (!openapi) {
      return Promise.reject(OpenApiErrEnum.unExist);
    }

    if (String(openapi.teamId) !== teamId) {
      return Promise.reject(OpenApiErrEnum.unAuth);
    }

    if (!!openapi.appId) {
      // if is not global openapi, then auth app
      const { app } = await authAppByTmbId({ appId: openapi.appId!, tmbId, per });
      return {
        permission: app.permission,
        openapi
      };
    }
    // if is global openapi, then auth openapi
    const { permission: tmbPer } = await getTmbInfoByTmbId({ tmbId });

    if (!tmbPer.checkPer(per) && tmbId !== String(openapi.tmbId)) {
      return Promise.reject(OpenApiErrEnum.unAuth);
    }

    return {
      openapi,
      permission: new Permission({
        per
      })
    };
  })();

  return {
    ...result,
    openapi,
    permission
  };
}

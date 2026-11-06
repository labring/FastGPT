import { type AuthModeType, type AuthResponseType } from '../type';
import { type OpenApiSchema } from '@fastgpt/global/support/openapi/type';
import { getTmbInfoByTmbId } from '../../user/team/controller';
import { MongoOpenApi } from '../../openapi/schema';
import { OpenApiErrEnum } from '@fastgpt/global/common/error/code/openapi';
import { parseHeaderCert } from './common';
import { ApiKeyTypeEnum } from '@fastgpt/global/support/openapi/constants';
import { resolveApiKeyScope } from '../../openapi/utils';
import { authAppByTmbId } from '../app/auth';
import { ManagePermissionVal } from '@fastgpt/global/support/permission/constant';

/**
 * 校验当前登录成员是否可以管理指定 APIKey。
 *
 * 个人密钥仅本人；应用 Key 要求绑定应用的管理权限，可跨归属成员管理。
 * 此入口仅接受登录态，Key 自身不能管理其他密钥。团队权限仅用于个人 authProxy 开关。
 */
export async function authOpenApiKeyCrud({
  id,
  ...props
}: AuthModeType & {
  id: string;
}): Promise<
  AuthResponseType & {
    openapi: OpenApiSchema;
  }
> {
  const result = await parseHeaderCert({ req: props.req, authToken: true });
  const { tmbId, teamId } = result;
  const { permission: tmbPer } = await getTmbInfoByTmbId({ tmbId });

  const { openapi, permission } = await (async () => {
    const openapi = await MongoOpenApi.findOne({ _id: id, teamId });
    if (!openapi) {
      return Promise.reject(OpenApiErrEnum.unExist);
    }

    if (String(openapi.teamId) !== teamId) {
      return Promise.reject(OpenApiErrEnum.unAuth);
    }

    const scope = resolveApiKeyScope(openapi);
    if (scope.type === ApiKeyTypeEnum.app) {
      await authAppByTmbId({ tmbId, appId: scope.appId, per: ManagePermissionVal });
    } else if (String(openapi.tmbId) !== tmbId) {
      return Promise.reject(OpenApiErrEnum.unAuth);
    }

    return {
      openapi,
      permission: tmbPer
    };
  })();

  return {
    ...result,
    openapi,
    permission
  };
}

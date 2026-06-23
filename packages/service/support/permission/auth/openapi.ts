import { type AuthModeType, type AuthResponseType } from '../type';
import { type OpenApiSchema } from '@fastgpt/global/support/openapi/type';
import { getTmbInfoByTmbId } from '../../user/team/controller';
import { MongoOpenApi } from '../../openapi/schema';
import { OpenApiErrEnum } from '@fastgpt/global/common/error/code/openapi';
import { parseHeaderCert } from './common';

/**
 * 校验当前登录成员是否可以管理指定 APIKey。
 *
 * 新版 APIKey 只属于创建它的团队成员，team owner 或 app owner 不再拥有跨成员
 * 查看、复制、更新、删除的特权。返回的团队权限仅用于调用点判断 authProxy 开关。
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
  const result = await parseHeaderCert(props);
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

    if (String(openapi.tmbId) !== tmbId) {
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

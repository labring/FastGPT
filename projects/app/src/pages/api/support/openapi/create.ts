import { withTeamLock } from '@fastgpt/service/support/user/lock';
import { parseHeaderCert } from '@fastgpt/service/support/permission/auth/common';
import { MongoOpenApi } from '@fastgpt/service/support/openapi/schema';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import type { ApiRequestProps } from '@fastgpt/next/type';
import { NextAPI } from '@/service/middleware/entry';
import { OpenApiErrEnum } from '@fastgpt/global/common/error/code/openapi';
import { TeamErrEnum } from '@fastgpt/global/common/error/code/team';
import { TeamApikeyCreatePermissionVal } from '@fastgpt/global/support/permission/user/constant';
import { addAuditLog } from '@fastgpt/service/support/user/audit/util';
import { AuditEventEnum } from '@fastgpt/global/support/user/audit/constants';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { appEnv } from '@/env';
import { validateOpenApiTags } from '@fastgpt/service/support/openapi/tag/service';
import {
  CreateApiKeyBodySchema,
  CreateApiKeyResponseSchema,
  type CreateApiKeyBodyType,
  type CreateApiKeyResponseType
} from '@fastgpt/global/openapi/support/openapi/api';
import { ApiKeyTypeEnum } from '@fastgpt/global/support/openapi/constants';
import {
  getOpenApiTypeFilter,
  getOpenApiAppIdFilter
} from '@fastgpt/service/support/openapi/utils';
import { authAppByTmbId } from '@fastgpt/service/support/permission/app/auth';
import { ManagePermissionVal } from '@fastgpt/global/support/permission/constant';
import { AppTypeList } from '@fastgpt/global/core/app/constants';

export async function handler(
  req: ApiRequestProps<CreateApiKeyBodyType>
): Promise<CreateApiKeyResponseType> {
  const {
    name,
    type = ApiKeyTypeEnum.personal,
    appId,
    limit,
    authProxy = false,
    tags
  } = parseApiInput({
    req,
    bodySchema: CreateApiKeyBodySchema
  }).body;
  /** 权限复查、额度统计和写入同处团队锁内，不能在交接完成后再创建归属离职者的 Key。 */
  const createKey = async () => {
    const { teamId, tmbId, permission } = await authUserPer({
      req,
      authToken: true,
      // 应用 Key 由应用管理员授权创建；团队创建权限只限制个人密钥。
      per: type === ApiKeyTypeEnum.personal ? TeamApikeyCreatePermissionVal : undefined
    });

    if (authProxy && !permission.isOwner) {
      return Promise.reject(TeamErrEnum.unPermission);
    }

    let boundAppId: string | undefined;
    if (type === ApiKeyTypeEnum.app) {
      const { app } = await authAppByTmbId({ appId: appId!, tmbId, per: ManagePermissionVal });
      if (!AppTypeList.includes(app.type)) throw OpenApiErrEnum.unAuth;
      boundAppId = String(app._id);
    }

    const count = await MongoOpenApi.countDocuments({
      teamId,
      ...getOpenApiTypeFilter(type),
      ...(type === ApiKeyTypeEnum.app ? getOpenApiAppIdFilter([boundAppId!]) : { tmbId })
    });

    // 应用固定按每个应用 100 个计数，与成员个人密钥的配置额度互不占用。
    const maxCount = type === ApiKeyTypeEnum.app ? 100 : appEnv.OPENAPI_KEY_MAX_COUNT;
    if (count >= maxCount) {
      return Promise.reject(OpenApiErrEnum.exceedLimit);
    }

    const nanoid = getNanoid(Math.floor(Math.random() * 14) + 52);
    const apiKey = `${global.systemEnv?.openapiPrefix || 'fastgpt'}-${nanoid}`;
    const tagIds = tags
      ? await validateOpenApiTags({
          teamId,
          tmbId,
          tags
        })
      : [];

    const key = await MongoOpenApi.create({
      teamId,
      tmbId,
      type,
      ...(boundAppId ? { appId: boundAppId } : {}),
      apiKey,
      authProxy,
      name,
      tagIds,
      limit
    });

    (async () => {
      addAuditLog({
        tmbId,
        teamId,
        event: AuditEventEnum.CREATE_API_KEY,
        params: {
          keyName: name,
          keyId: String(key._id),
          keyType: type,
          ...(boundAppId ? { appId: boundAppId } : {})
        }
      });
    })();

    return CreateApiKeyResponseSchema.parse(apiKey);
  };
  if (type === ApiKeyTypeEnum.app) {
    const { teamId } = await parseHeaderCert({ req, authToken: true });
    return withTeamLock(teamId, createKey);
  }
  return createKey();
}

export default NextAPI(handler);

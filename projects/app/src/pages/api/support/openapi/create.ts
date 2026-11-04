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
import { getOpenApiTypeFilter } from '@fastgpt/service/support/openapi/utils';
import { authAppByTmbId } from '@fastgpt/service/support/permission/app/auth';
import { ManagePermissionVal } from '@fastgpt/global/support/permission/constant';
import { AppTypeList } from '@fastgpt/global/core/app/constants';

async function handler(
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
  const { teamId, tmbId, permission } = await authUserPer({
    req,
    authToken: true,
    per: TeamApikeyCreatePermissionVal
  });

  if (authProxy && !permission.isOwner) {
    return Promise.reject(TeamErrEnum.unPermission);
  }

  if (type === ApiKeyTypeEnum.app) {
    const { app } = await authAppByTmbId({ appId: appId!, tmbId, per: ManagePermissionVal });
    if (!AppTypeList.includes(app.type)) throw OpenApiErrEnum.unAuth;
  }

  const count = await MongoOpenApi.countDocuments({
    teamId,
    ...getOpenApiTypeFilter(type),
    ...(type === ApiKeyTypeEnum.app ? { appId } : { tmbId })
  });

  if (count >= appEnv.OPENAPI_KEY_MAX_COUNT) {
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
    ...(type === ApiKeyTypeEnum.app ? { appId } : {}),
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
        ...(appId ? { appId } : {})
      }
    });
  })();

  return CreateApiKeyResponseSchema.parse(apiKey);
}

export default NextAPI(handler);

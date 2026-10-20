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
import { getSystemInstanceConfig } from '@fastgpt/service/common/system/systemInstanceConfig/controller';
import { logInstanceConfigRead } from '@fastgpt/service/common/system/migrationCoverageLog';
import { appEnv } from '@/env';
import { validateOpenApiTags } from '@fastgpt/service/support/openapi/tag/service';
import {
  CreateApiKeyBodySchema,
  CreateApiKeyResponseSchema,
  type CreateApiKeyBodyType,
  type CreateApiKeyResponseType
} from '@fastgpt/global/openapi/support/openapi/api';

async function handler(
  req: ApiRequestProps<CreateApiKeyBodyType>
): Promise<CreateApiKeyResponseType> {
  const {
    name,
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

  const count = await MongoOpenApi.find({ tmbId }).countDocuments();
  const configuredMaxCount = getSystemInstanceConfig().auth.openApiKeyMaxCount;
  const maxCount = configuredMaxCount ?? appEnv.OPENAPI_KEY_MAX_COUNT;
  logInstanceConfigRead({
    callsite: 'runtime.app.openapi.create',
    source: configuredMaxCount === undefined ? 'env-fallback' : 'instance-config',
    fields: [{ path: 'auth.openApiKeyMaxCount', value: configuredMaxCount ?? maxCount }]
  });

  if (count >= maxCount) {
    return Promise.reject(OpenApiErrEnum.exceedLimit);
  }

  const nanoid = getNanoid(Math.floor(Math.random() * 14) + 52);
  logInstanceConfigRead({
    callsite: 'runtime.app.openapi.create.apiKeyPrefix',
    source: 'bridged-system-env',
    fields: [{ path: 'site.openApiPrefix', value: global.systemEnv?.openapiPrefix || 'fastgpt' }]
  });
  const apiKey = `${global.systemEnv?.openapiPrefix || 'fastgpt'}-${nanoid}`;
  const tagIds = tags
    ? await validateOpenApiTags({
        teamId,
        tmbId,
        tags
      })
    : [];

  await MongoOpenApi.create({
    teamId,
    tmbId,
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
        keyName: name
      }
    });
  })();

  return CreateApiKeyResponseSchema.parse(apiKey);
}

export default NextAPI(handler);

import { MongoOpenApi } from '@fastgpt/service/support/openapi/schema';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { OpenApiErrEnum } from '@fastgpt/global/common/error/code/openapi';
import { TeamErrEnum } from '@fastgpt/global/common/error/code/team';
import { TeamApikeyCreatePermissionVal } from '@fastgpt/global/support/permission/user/constant';
import { addAuditLog } from '@fastgpt/service/support/user/audit/util';
import { AuditEventEnum } from '@fastgpt/global/support/user/audit/constants';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
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
    authProxy = false
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

  if (count >= 10) {
    return Promise.reject(OpenApiErrEnum.exceedLimit);
  }

  const nanoid = getNanoid(Math.floor(Math.random() * 14) + 52);
  const apiKey = `${global.systemEnv?.openapiPrefix || 'fastgpt'}-${nanoid}`;

  await MongoOpenApi.create({
    teamId,
    tmbId,
    apiKey,
    authProxy,
    name,
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

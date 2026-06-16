import { MongoOpenApi } from '@fastgpt/service/support/openapi/schema';
import { authOpenApiKeyCrud } from '@fastgpt/service/support/permission/auth/openapi';
import { OwnerPermissionVal } from '@fastgpt/global/support/permission/constant';
import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { addAuditLog } from '@fastgpt/service/support/user/audit/util';
import { AuditEventEnum } from '@fastgpt/global/support/user/audit/constants';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { OpenApiErrEnum } from '@fastgpt/global/common/error/code/openapi';
import { TeamErrEnum } from '@fastgpt/global/common/error/code/team';
import {
  UpdateApiKeyBodySchema,
  UpdateApiKeyResponseSchema,
  type UpdateApiKeyBodyType,
  type UpdateApiKeyResponseType
} from '@fastgpt/global/openapi/support/openapi/api';

async function handler(
  req: ApiRequestProps<UpdateApiKeyBodyType>
): Promise<UpdateApiKeyResponseType> {
  const { _id, name, limit, authProxy } = parseApiInput({
    req,
    bodySchema: UpdateApiKeyBodySchema
  }).body;

  const { tmbId, teamId, openapi, permission } = await authOpenApiKeyCrud({
    req,
    authToken: true,
    id: _id,
    per: OwnerPermissionVal
  });

  if (authProxy !== undefined) {
    if (openapi.appId && authProxy) {
      return Promise.reject(OpenApiErrEnum.unAuth);
    }

    if (authProxy && !permission.isOwner) {
      return Promise.reject(TeamErrEnum.unPermission);
    }
  }

  (async () => {
    addAuditLog({
      tmbId,
      teamId,
      event: AuditEventEnum.UPDATE_API_KEY,
      params: {
        keyName: name || openapi.name
      }
    });
  })();

  await MongoOpenApi.findByIdAndUpdate(_id, {
    ...(name && { name }),
    ...(limit && { limit }),
    ...(authProxy !== undefined && { authProxy })
  });

  return UpdateApiKeyResponseSchema.parse(undefined);
}

export default NextAPI(handler);

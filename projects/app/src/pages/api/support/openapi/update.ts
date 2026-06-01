import { MongoOpenApi } from '@fastgpt/service/support/openapi/schema';
import { authOpenApiKeyCrud } from '@fastgpt/service/support/permission/auth/openapi';
import { OwnerPermissionVal } from '@fastgpt/global/support/permission/constant';
import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { addAuditLog } from '@fastgpt/service/support/user/audit/util';
import { AuditEventEnum } from '@fastgpt/global/support/user/audit/constants';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import {
  UpdateApiKeyBodySchema,
  UpdateApiKeyResponseSchema,
  type UpdateApiKeyBodyType,
  type UpdateApiKeyResponseType
} from '@fastgpt/global/openapi/support/openapi/api';

async function handler(
  req: ApiRequestProps<UpdateApiKeyBodyType>
): Promise<UpdateApiKeyResponseType> {
  const { _id, name, limit } = parseApiInput({
    req,
    bodySchema: UpdateApiKeyBodySchema
  }).body;

  const { tmbId, teamId, openapi } = await authOpenApiKeyCrud({
    req,
    authToken: true,
    id: _id,
    per: OwnerPermissionVal
  });

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
    ...(limit && { limit })
  });

  return UpdateApiKeyResponseSchema.parse(undefined);
}

export default NextAPI(handler);

import { MongoOpenApi } from '@fastgpt/service/support/openapi/schema';
import { authOpenApiKeyCrud } from '@fastgpt/service/support/permission/auth/openapi';
import { OwnerPermissionVal } from '@fastgpt/global/support/permission/constant';
import { CommonErrEnum } from '@fastgpt/global/common/error/code/common';
import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { addAuditLog } from '@fastgpt/service/support/user/audit/util';
import { AuditEventEnum } from '@fastgpt/global/support/user/audit/constants';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import {
  DeleteApiKeyQuerySchema,
  DeleteApiKeyResponseSchema,
  type DeleteApiKeyBodyType,
  type DeleteApiKeyQueryType,
  type DeleteApiKeyResponseType
} from '@fastgpt/global/openapi/support/openapi/api';

export type OpenAPIDeleteQuery = DeleteApiKeyQueryType;
export type OpenAPIDeleteBody = DeleteApiKeyBodyType;
export type OpenAPIDeleteResponse = DeleteApiKeyResponseType;

async function handler(
  req: ApiRequestProps<OpenAPIDeleteBody, OpenAPIDeleteQuery>
): Promise<OpenAPIDeleteResponse> {
  const { id } = parseApiInput({
    req,
    querySchema: DeleteApiKeyQuerySchema
  }).query;

  if (!id) {
    return Promise.reject(CommonErrEnum.missingParams);
  }

  const { tmbId, teamId, openapi } = await authOpenApiKeyCrud({
    req,
    authToken: true,
    id,
    per: OwnerPermissionVal
  });

  (async () => {
    addAuditLog({
      tmbId,
      teamId,
      event: AuditEventEnum.DELETE_API_KEY,
      params: {
        keyName: openapi.name
      }
    });
  })();

  await MongoOpenApi.deleteOne({ _id: id });

  return DeleteApiKeyResponseSchema.parse({});
}

export default NextAPI(handler);

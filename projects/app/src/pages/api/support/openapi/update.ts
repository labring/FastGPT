import { MongoOpenApi } from '@fastgpt/service/support/openapi/schema';
import { authOpenApiKeyCrud } from '@fastgpt/service/support/permission/auth/openapi';
import type { ApiRequestProps } from '@fastgpt/next/type';
import { NextAPI } from '@/service/middleware/entry';
import { addAuditLog } from '@fastgpt/service/support/user/audit/util';
import { AuditEventEnum } from '@fastgpt/global/support/user/audit/constants';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { OpenApiErrEnum } from '@fastgpt/global/common/error/code/openapi';
import { TeamErrEnum } from '@fastgpt/global/common/error/code/team';
import { validateOpenApiTags } from '@fastgpt/service/support/openapi/tag/service';
import {
  UpdateApiKeyBodySchema,
  UpdateApiKeyResponseSchema,
  type UpdateApiKeyBodyType,
  type UpdateApiKeyResponseType
} from '@fastgpt/global/openapi/support/openapi/api';
import { resolveApiKeyScope } from '@fastgpt/service/support/openapi/utils';
import { ApiKeyTypeEnum } from '@fastgpt/global/support/openapi/constants';

async function handler(
  req: ApiRequestProps<UpdateApiKeyBodyType>
): Promise<UpdateApiKeyResponseType> {
  const { _id, name, limit, authProxy, tags } = parseApiInput({
    req,
    bodySchema: UpdateApiKeyBodySchema
  }).body;

  const { tmbId, teamId, openapi, permission } = await authOpenApiKeyCrud({
    req,
    authToken: true,
    id: _id
  });

  const scope = resolveApiKeyScope(openapi);
  if (scope.type === ApiKeyTypeEnum.app && (authProxy !== undefined || tags !== undefined)) {
    throw OpenApiErrEnum.unAuth;
  }
  if (authProxy !== undefined) {
    if (authProxy && !permission.isOwner) {
      return Promise.reject(TeamErrEnum.unPermission);
    }
  }

  const tagIds =
    tags !== undefined
      ? await validateOpenApiTags({
          teamId,
          tmbId,
          tags
        })
      : undefined;

  (async () => {
    addAuditLog({
      tmbId,
      teamId,
      event: AuditEventEnum.UPDATE_API_KEY,
      params: {
        keyName: name || openapi.name,
        keyId: String(openapi._id),
        keyType: scope.type,
        ...(scope.type === ApiKeyTypeEnum.app ? { appId: scope.appId } : {})
      }
    });
  })();

  await MongoOpenApi.findByIdAndUpdate(_id, {
    ...(name && { name }),
    ...(limit && { limit }),
    ...(authProxy !== undefined && { authProxy }),
    ...(tagIds !== undefined && { tagIds })
  });

  return UpdateApiKeyResponseSchema.parse(undefined);
}

export default NextAPI(handler);

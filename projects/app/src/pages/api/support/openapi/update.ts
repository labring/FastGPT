import { MongoOpenApi } from '@fastgpt/service/support/openapi/schema';
import { authOpenApiKeyCrud } from '@fastgpt/service/support/permission/auth/openapi';
import type { ApiRequestProps } from '@fastgpt/next/type';
import { NextAPI } from '@/service/middleware/entry';
import { addAuditLog } from '@fastgpt/service/support/user/audit/util';
import { AuditEventEnum } from '@fastgpt/global/support/user/audit/constants';
import { AuditResourceTypeEnum, type AuditResourceType, buildAppAuditResource, buildEntityAuditResource } from '@fastgpt/global/support/user/audit/type';
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

  const { tmbId, teamId, openapi, permission, app } = await authOpenApiKeyCrud({
    req,
    authToken: true,
    id: _id
  });

  const scope = resolveApiKeyScope(openapi);
  if (scope.type === ApiKeyTypeEnum.app && (authProxy !== undefined || tags !== undefined)) {
    throw OpenApiErrEnum.unAuth;
  }
  if (authProxy !== undefined) {
    // 历史默认应用不是强绑定，但仍保留旧协议禁止成员代理的限制。
    if (authProxy && scope.type === ApiKeyTypeEnum.personal && scope.defaultAppId) {
      throw OpenApiErrEnum.unAuth;
    }
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
    const resources = [
      buildEntityAuditResource({
        type: AuditResourceTypeEnum.apiKey,
        id: openapi._id,
        name: name || openapi.name
      }),
      ...(scope.type === ApiKeyTypeEnum.app
        ? [
            app
              ? buildAppAuditResource(app)
              : buildEntityAuditResource({ type: AuditResourceTypeEnum.app, id: scope.appId })
          ]
        : [])
    ].filter((item): item is AuditResourceType => Boolean(item));
    addAuditLog({
      tmbId,
      teamId,
      event: AuditEventEnum.UPDATE_API_KEY,
      resources,
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

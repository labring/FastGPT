import { authOpenApiKeyCrud } from '@fastgpt/service/support/permission/auth/openapi';
import type { ApiRequestProps } from '@fastgpt/next/type';
import { NextAPI } from '@/service/middleware/entry';
import { addAuditLog } from '@fastgpt/service/support/user/audit/util';
import { AuditEventEnum } from '@fastgpt/global/support/user/audit/constants';
import { AuditResourceTypeEnum, type AuditResourceType, buildAppAuditResource, buildEntityAuditResource } from '@fastgpt/global/support/user/audit/type';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import {
  CopyApiKeyBodySchema,
  CopyApiKeyResponseSchema,
  type CopyApiKeyBodyType,
  type CopyApiKeyResponseType
} from '@fastgpt/global/openapi/support/openapi/api';
import { resolveApiKeyScope } from '@fastgpt/service/support/openapi/utils';

async function handler(req: ApiRequestProps<CopyApiKeyBodyType>): Promise<CopyApiKeyResponseType> {
  const { id } = parseApiInput({
    req,
    bodySchema: CopyApiKeyBodySchema
  }).body;

  const { tmbId, teamId, openapi, app } = await authOpenApiKeyCrud({
    req,
    authToken: true,
    id
  });

  const scope = resolveApiKeyScope(openapi);
  const resources = [
    buildEntityAuditResource({
      type: AuditResourceTypeEnum.apiKey,
      id: openapi._id,
      name: openapi.name
    }),
    ...('appId' in scope && scope.appId
      ? [
          app
            ? buildAppAuditResource(app)
            : buildEntityAuditResource({ type: AuditResourceTypeEnum.app, id: scope.appId })
        ]
      : [])
  ].filter((item): item is AuditResourceType => Boolean(item));
  await addAuditLog({
    tmbId,
    teamId,
    event: AuditEventEnum.COPY_API_KEY,
    resources,
    params: {
      keyName: openapi.name,
      keyId: String(openapi._id),
      keyType: scope.type,
      ...('appId' in scope ? { appId: scope.appId } : {})
    }
  });

  const apiKey = (
    openapi as unknown as {
      get: (path: 'apiKey', type?: unknown, options?: { getters?: boolean }) => unknown;
    }
  ).get('apiKey', null, { getters: false });

  return CopyApiKeyResponseSchema.parse(apiKey);
}

export default NextAPI(handler);

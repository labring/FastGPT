import { authOpenApiKeyCrud } from '@fastgpt/service/support/permission/auth/openapi';
import type { ApiRequestProps } from '@fastgpt/next/type';
import { NextAPI } from '@/service/middleware/entry';
import { addAuditLog } from '@fastgpt/service/support/user/audit/util';
import { AuditEventEnum } from '@fastgpt/global/support/user/audit/constants';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import {
  CopyApiKeyBodySchema,
  CopyApiKeyResponseSchema,
  type CopyApiKeyBodyType,
  type CopyApiKeyResponseType
} from '@fastgpt/global/openapi/support/openapi/api';

async function handler(req: ApiRequestProps<CopyApiKeyBodyType>): Promise<CopyApiKeyResponseType> {
  const { id } = parseApiInput({
    req,
    bodySchema: CopyApiKeyBodySchema
  }).body;

  const { tmbId, teamId, openapi } = await authOpenApiKeyCrud({
    req,
    authToken: true,
    id
  });

  await addAuditLog({
    tmbId,
    teamId,
    event: AuditEventEnum.COPY_API_KEY,
    params: {
      keyName: openapi.name
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

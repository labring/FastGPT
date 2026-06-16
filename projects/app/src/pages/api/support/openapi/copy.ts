import { authOpenApiKeyCrud } from '@fastgpt/service/support/permission/auth/openapi';
import { OwnerPermissionVal } from '@fastgpt/global/support/permission/constant';
import type { ApiRequestProps } from '@fastgpt/service/type/next';
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
    id,
    per: OwnerPermissionVal
  });

  addAuditLog({
    tmbId,
    teamId,
    event: AuditEventEnum.COPY_API_KEY,
    params: {
      keyName: openapi.name
    }
  });

  return CopyApiKeyResponseSchema.parse(undefined);
}

export default NextAPI(handler);

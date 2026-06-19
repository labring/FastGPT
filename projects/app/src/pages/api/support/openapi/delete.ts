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
  createUserAuditActor,
  writeEnterpriseAuditEvent
} from '@fastgpt/service/support/enterprise/audit/util';
import {
  EnterpriseAuditActionEnum,
  EnterpriseAuditResourceTypeEnum,
  EnterpriseAuditResultEnum
} from '@fastgpt/global/support/enterprise/audit/constants';
import { getClientIpFromRequest } from '@fastgpt/service/common/security/clientIp';
import {
  DeleteApiKeyQuerySchema,
  DeleteApiKeyResponseSchema,
  type DeleteApiKeyQueryType,
  type DeleteApiKeyResponseType
} from '@fastgpt/global/openapi/support/openapi/api';

async function handler(
  req: ApiRequestProps<Record<string, never>, DeleteApiKeyQueryType>
): Promise<DeleteApiKeyResponseType> {
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
    writeEnterpriseAuditEvent({
      action: EnterpriseAuditActionEnum.ApiKeyDelete,
      result: EnterpriseAuditResultEnum.Success,
      actor: createUserAuditActor({
        teamId,
        tmbId
      }),
      resource: {
        type: EnterpriseAuditResourceTypeEnum.ApiKey,
        id,
        name: openapi.name
      },
      clientIp: getClientIpFromRequest(req),
      userAgent: Array.isArray(req.headers['user-agent'])
        ? req.headers['user-agent'].join(',')
        : req.headers['user-agent'],
      metadata: {
        appId: openapi.appId
      }
    });
  })();

  await MongoOpenApi.deleteOne({ _id: id });

  return DeleteApiKeyResponseSchema.parse(undefined);
}

export default NextAPI(handler);

import { MongoOpenApi } from '@fastgpt/service/support/openapi/schema';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { ManagePermissionVal } from '@fastgpt/global/support/permission/constant';
import { authApp } from '@fastgpt/service/support/permission/app/auth';
import { OpenApiErrEnum } from '@fastgpt/global/common/error/code/openapi';
import { TeamErrEnum } from '@fastgpt/global/common/error/code/team';
import { TeamApikeyCreatePermissionVal } from '@fastgpt/global/support/permission/user/constant';
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
  CreateApiKeyBodySchema,
  CreateApiKeyResponseSchema,
  type CreateApiKeyBodyType,
  type CreateApiKeyResponseType
} from '@fastgpt/global/openapi/support/openapi/api';

async function handler(
  req: ApiRequestProps<CreateApiKeyBodyType>
): Promise<CreateApiKeyResponseType> {
  const {
    appId,
    name,
    limit,
    authProxy = false
  } = parseApiInput({
    req,
    bodySchema: CreateApiKeyBodySchema
  }).body;
  const { tmbId, teamId, allowAuthProxy } = await (async () => {
    if (!appId) {
      // global apikey is being created, auth the tmb
      const { teamId, tmbId, permission } = await authUserPer({
        req,
        authToken: true,
        per: TeamApikeyCreatePermissionVal
      });
      return { teamId, tmbId, allowAuthProxy: permission.isOwner };
    } else {
      if (authProxy) {
        return Promise.reject(OpenApiErrEnum.unAuth);
      }

      const { teamId, tmbId } = await authApp({
        req,
        per: ManagePermissionVal,
        appId,
        authToken: true
      });
      return { teamId, tmbId, allowAuthProxy: false };
    }
  })();

  if (authProxy && !allowAuthProxy) {
    return Promise.reject(TeamErrEnum.unPermission);
  }

  const count = await MongoOpenApi.find({ tmbId, appId }).countDocuments();

  if (count >= 10) {
    return Promise.reject(OpenApiErrEnum.exceedLimit);
  }

  const nanoid = getNanoid(Math.floor(Math.random() * 14) + 52);
  const apiKey = `${global.systemEnv?.openapiPrefix || 'fastgpt'}-${nanoid}`;

  const openapi = await MongoOpenApi.create({
    teamId,
    tmbId,
    apiKey,
    appId,
    authProxy: !appId && authProxy,
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
    writeEnterpriseAuditEvent({
      action: EnterpriseAuditActionEnum.ApiKeyCreate,
      result: EnterpriseAuditResultEnum.Success,
      actor: createUserAuditActor({
        teamId,
        tmbId
      }),
      resource: {
        type: EnterpriseAuditResourceTypeEnum.ApiKey,
        id: String(openapi._id),
        name
      },
      clientIp: getClientIpFromRequest(req),
      userAgent: Array.isArray(req.headers['user-agent'])
        ? req.headers['user-agent'].join(',')
        : req.headers['user-agent'],
      metadata: {
        appId,
        authProxy: !appId && authProxy,
        keySuffix: apiKey.slice(-4)
      }
    });
  })();

  return CreateApiKeyResponseSchema.parse(apiKey);
}

export default NextAPI(handler);

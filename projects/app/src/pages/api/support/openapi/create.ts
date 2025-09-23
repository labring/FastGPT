import { MongoOpenApi } from '@fastgpt/service/support/openapi/schema';
import type { EditApiKeyProps } from '@/global/support/openapi/api';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { ManagePermissionVal } from '@fastgpt/global/support/permission/constant';
import { authApp } from '@fastgpt/service/support/permission/app/auth';
import { OpenApiErrEnum } from '@fastgpt/global/common/error/code/openapi';
import { TeamApikeyCreatePermissionVal } from '@fastgpt/global/support/permission/user/constant';
import { addAuditLog } from '@fastgpt/service/support/user/audit/util';
import { AuditEventEnum } from '@fastgpt/global/support/user/audit/constants';
async function handler(req: ApiRequestProps<EditApiKeyProps>): Promise<string> {
  const { appId, name, limit } = req.body;
  const { tmbId, teamId } = await (async () => {
    if (!appId) {
      // global apikey is being created, auth the tmb
      const { teamId, tmbId } = await authUserPer({
        req,
        authToken: true,
        per: TeamApikeyCreatePermissionVal
      });
      return { teamId, tmbId };
    } else {
      const { teamId, tmbId } = await authApp({
        req,
        per: ManagePermissionVal,
        appId,
        authToken: true
      });
      return { teamId, tmbId };
    }
  })();

  const count = await MongoOpenApi.find({ tmbId, appId }).countDocuments();

  if (count >= 10) {
    return Promise.reject(OpenApiErrEnum.exceedLimit);
  }

  const nanoid = getNanoid(Math.floor(Math.random() * 14) + 52);
  const apiKey = `${global.systemEnv?.openapiPrefix || 'fastgpt'}-${nanoid}`;

  await MongoOpenApi.create({
    teamId,
    tmbId,
    apiKey,
    appId,
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
  })();

  return apiKey;
}

export default NextAPI(handler);

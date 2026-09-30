import { NextAPI } from '@/service/middleware/entry';
import type { ApiRequestProps } from '@fastgpt/next/type';
import {
  GetAppsByToolIdQuerySchema,
  type GetAppsByToolIdQuery
} from '@fastgpt/global/openapi/core/app/common/api';
import { AppErrEnum } from '@fastgpt/global/common/error/code/app';
import { getAppPublishedResourceType } from '@fastgpt/service/core/app/resourceLookup';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { authApp } from '@fastgpt/service/support/permission/app/auth';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { findAppAndAllChildren } from '@fastgpt/service/core/app/controller';
import { listReadableReferencedApps } from '@/service/core/app/referencedApps';

/**
 * List readable published apps referencing the specified tool or tools within the folder.
 * Enforces owner-only access on the target tool resource.
 */
async function handler(req: ApiRequestProps<unknown, GetAppsByToolIdQuery>) {
  const { toolId } = parseApiInput({ req, querySchema: GetAppsByToolIdQuerySchema }).query;
  const [{ teamId, tmbId, permission: teamPer }, { permission: appPer }] = await Promise.all([
    authUserPer({ req, authToken: true, authApiKey: true, per: ReadPermissionVal }),
    authApp({
      req,
      authToken: true,
      authApiKey: true,
      appId: toolId,
      per: ReadPermissionVal
    })
  ]);
  if (!appPer.isOwner) {
    return Promise.reject(AppErrEnum.unAuthApp);
  }
  const appsInToolTree = await findAppAndAllChildren({
    teamId,
    appId: toolId,
    fields: '_id type deleteTime'
  });
  const toolIds = appsInToolTree
    .filter((app) => !app.deleteTime && getAppPublishedResourceType(app.type) === 'tool')
    .map((app) => String(app._id));
  return listReadableReferencedApps({
    teamId,
    tmbId,
    isTeamOwner: teamPer.isOwner,
    resourceType: 'tool',
    resourceIds: toolIds
  });
}

export default NextAPI(handler);

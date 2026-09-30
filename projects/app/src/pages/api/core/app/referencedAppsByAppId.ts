import { NextAPI } from '@/service/middleware/entry';
import type { ApiRequestProps } from '@fastgpt/next/type';
import {
  GetReferencedAppsByAppIdQuerySchema,
  type GetReferencedAppsByAppIdQuery
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
 * List readable published apps referencing the specified app or apps within the folder.
 * Enforces owner-only access on the target app resource.
 */
async function handler(req: ApiRequestProps<unknown, GetReferencedAppsByAppIdQuery>) {
  const { appId } = parseApiInput({ req, querySchema: GetReferencedAppsByAppIdQuerySchema }).query;
  const [{ teamId, tmbId, permission: teamPer }, { permission: appPer }] = await Promise.all([
    authUserPer({ req, authToken: true, authApiKey: true, per: ReadPermissionVal }),
    authApp({
      req,
      authToken: true,
      authApiKey: true,
      appId,
      per: ReadPermissionVal
    })
  ]);
  if (!appPer.isOwner) {
    return Promise.reject(AppErrEnum.unAuthApp);
  }
  const appsInTree = await findAppAndAllChildren({
    teamId,
    appId,
    fields: '_id type deleteTime'
  });
  const appIds = appsInTree
    .filter((app) => !app.deleteTime && getAppPublishedResourceType(app.type) === 'agent')
    .map((app) => String(app._id));
  return listReadableReferencedApps({
    teamId,
    tmbId,
    isTeamOwner: teamPer.isOwner,
    resourceType: 'agent',
    resourceIds: appIds
  });
}

export default NextAPI(handler);

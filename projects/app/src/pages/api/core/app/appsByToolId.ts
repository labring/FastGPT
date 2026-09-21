import { NextAPI } from '@/service/middleware/entry';
import type { ApiRequestProps } from '@fastgpt/next/type';
import {
  GetAppsByToolIdQuerySchema,
  ReferencedAppsResponseSchema,
  type GetAppsByToolIdQuery
} from '@fastgpt/global/openapi/core/app/common/api';
import { AppTypeEnum, ToolTypeList } from '@fastgpt/global/core/app/constants';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { authApp } from '@fastgpt/service/support/permission/app/auth';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { findAppAndAllChildren } from '@fastgpt/service/core/app/controller';
import { findTeamAppsByPublishedResource } from '@fastgpt/service/core/app/resourceLookup';
import { formatReadableReferencedApps } from '@/service/core/app/referencedApps';

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
    return ReferencedAppsResponseSchema.parse({ list: [], hiddenCount: 0 });
  }
  const appsInToolTree = await findAppAndAllChildren({
    teamId,
    appId: toolId,
    fields: '_id type deleteTime'
  });
  const toolIds = appsInToolTree
    .filter(
      (app) => !app.deleteTime && (ToolTypeList.includes(app.type) || app.type === AppTypeEnum.tool)
    )
    .map((app) => String(app._id));
  const { apps } = await findTeamAppsByPublishedResource({
    teamId,
    type: 'tool',
    ids: toolIds
  });
  apps.sort((a, b) => +new Date(b.updateTime) - +new Date(a.updateTime));

  return ReferencedAppsResponseSchema.parse(
    await formatReadableReferencedApps({
      apps,
      teamId,
      tmbId,
      isTeamOwner: teamPer.isOwner
    })
  );
}

export default NextAPI(handler);

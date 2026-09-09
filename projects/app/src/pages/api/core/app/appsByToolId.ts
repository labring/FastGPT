import { NextAPI } from '@/service/middleware/entry';
import { formatReadableReferencedApps } from '@/service/core/app/reference';
import type { ApiRequestProps } from '@fastgpt/next/type';
import {
  GetToolReferencedAppsQuerySchema,
  type GetToolReferencedAppsQuery,
  type GetToolReferencedAppsResponse
} from '@fastgpt/global/openapi/core/app/common/api';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { authApp } from '@fastgpt/service/support/permission/app/auth';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { findAppsByCurrentResourceRefs } from '@fastgpt/service/core/app/currentResourceRefs';

async function handler(
  req: ApiRequestProps<unknown, GetToolReferencedAppsQuery>
): Promise<GetToolReferencedAppsResponse> {
  const { toolId } = parseApiInput({
    req,
    querySchema: GetToolReferencedAppsQuerySchema
  }).query;
  const { teamId } = await authApp({
    req,
    authToken: true,
    appId: toolId,
    per: ReadPermissionVal
  });
  const apps = await findAppsByCurrentResourceRefs({
    teamId,
    resourceType: 'tool',
    resourceIds: [toolId]
  });

  return formatReadableReferencedApps({ req, apps });
}

export default NextAPI(handler);

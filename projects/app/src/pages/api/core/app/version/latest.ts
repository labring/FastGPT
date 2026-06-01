import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { authApp } from '@fastgpt/service/support/permission/app/auth';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { getAppLatestVersion } from '@fastgpt/service/core/app/version/controller';
import { rewriteAppWorkflowToDetail } from '@fastgpt/service/core/app/utils';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import {
  GetLatestAppVersionQuerySchema,
  GetLatestAppVersionResponseSchema,
  type GetLatestAppVersionBodyType,
  type GetLatestAppVersionQueryType,
  type GetLatestAppVersionResponseType
} from '@fastgpt/global/openapi/core/app/version/api';

async function handler(
  req: ApiRequestProps<GetLatestAppVersionBodyType, GetLatestAppVersionQueryType>
): Promise<GetLatestAppVersionResponseType> {
  const { appId } = parseApiInput({
    req,
    querySchema: GetLatestAppVersionQuerySchema
  }).query;

  const { app, isRoot, teamId } = await authApp({
    req,
    authToken: true,
    appId,
    per: WritePermissionVal
  });

  const version = await getAppLatestVersion(appId, app);

  await rewriteAppWorkflowToDetail({
    nodes: version.nodes,
    teamId,
    isRoot,
    ownerTmbId: app.tmbId
  });

  return GetLatestAppVersionResponseSchema.parse(version);
}

export default NextAPI(handler);

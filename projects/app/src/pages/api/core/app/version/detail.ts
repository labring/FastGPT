import type { NextApiRequest } from 'next';
import { NextAPI } from '@/service/middleware/entry';
import { MongoAppVersion } from '@fastgpt/service/core/app/version/schema';
import { authApp } from '@fastgpt/service/support/permission/app/auth';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { formatTime2YMDHM } from '@fastgpt/global/common/string/time';
import { rewriteAppWorkflowToDetail } from '@fastgpt/service/core/app/utils';
import { migrateWorkflowToCurrent } from '@fastgpt/global/core/workflow/migration';
import { getWorkflowMigrationOptions } from '@fastgpt/service/core/app/tool/utils/client';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { getLocale } from '@fastgpt/service/common/middle/i18n';
import {
  GetAppVersionDetailQuerySchema,
  GetAppVersionDetailResponseSchema,
  type GetAppVersionDetailResponseType
} from '@fastgpt/global/openapi/core/app/version/api';

async function handler(req: NextApiRequest): Promise<GetAppVersionDetailResponseType> {
  const { versionId, appId } = parseApiInput({
    req,
    querySchema: GetAppVersionDetailQuerySchema
  }).query;

  const { app, teamId, isRoot } = await authApp({
    req,
    authToken: true,
    appId,
    per: WritePermissionVal
  });
  const result = await MongoAppVersion.findOne({ _id: versionId, appId }).lean();

  if (!result) {
    return Promise.reject('version not found');
  }

  const normalizedWorkflow = await migrateWorkflowToCurrent(
    {
      nodes: result.nodes,
      edges: result.edges,
      chatConfig: result.chatConfig
    },
    getWorkflowMigrationOptions({ teamId })
  );
  await rewriteAppWorkflowToDetail({
    nodes: normalizedWorkflow.nodes,
    teamId,
    ownerTmbId: app.tmbId,
    isRoot,
    lang: getLocale(req)
  });
  return GetAppVersionDetailResponseSchema.parse({
    ...result,
    ...normalizedWorkflow,
    versionName: result?.versionName ?? formatTime2YMDHM(result?.time)
  });
}

export default NextAPI(handler);

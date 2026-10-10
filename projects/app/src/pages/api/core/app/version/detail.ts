import { NextAPI } from '@/service/middleware/entry';
import { formatTime2YMDHM } from '@fastgpt/global/common/string/time';
import { AppResourcesSchema } from '@fastgpt/global/core/app/type';
import {
  GetAppVersionDetailQuerySchema,
  GetAppVersionDetailResponseSchema,
  type GetAppVersionDetailResponseType
} from '@fastgpt/global/openapi/core/app/version/api';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { getLocale } from '@fastgpt/service/common/middle/i18n';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { getTeamModelHandle } from '@fastgpt/service/core/ai/model/catalog/service';
import { rewriteAppWorkflowToDetail } from '@fastgpt/service/core/app/utils';
import { normalizeAppVersionWorkflow } from '@fastgpt/service/core/app/version/controller';
import { MongoAppVersion } from '@fastgpt/service/core/app/version/schema';
import { authApp } from '@fastgpt/service/support/permission/app/auth';
import type { NextApiRequest } from 'next';

async function handler(req: NextApiRequest): Promise<GetAppVersionDetailResponseType> {
  const { versionId, appId } = parseApiInput({
    req,
    querySchema: GetAppVersionDetailQuerySchema
  }).query;

  const { app, teamId, tmbId, isRoot } = await authApp({
    req,
    authToken: true,
    appId,
    per: WritePermissionVal
  });
  const result = await MongoAppVersion.findOne({ _id: versionId, appId }).lean();

  if (!result) {
    return Promise.reject('version not found');
  }

  const normalizedWorkflow = normalizeAppVersionWorkflow(
    result,
    AppResourcesSchema.safeParse(result.resources).success
      ? []
      : (await getTeamModelHandle({ teamId: String(app.teamId) })).getAllModels()
  );
  await rewriteAppWorkflowToDetail({
    nodes: normalizedWorkflow.nodes,
    teamId,
    viewerTmbId: tmbId,
    ownerTmbId: app.tmbId,
    isRoot,
    lang: getLocale(req),
    resources: normalizedWorkflow.resources
  });
  return GetAppVersionDetailResponseSchema.parse({
    ...result,
    ...normalizedWorkflow,
    versionName: result?.versionName ?? formatTime2YMDHM(result?.time)
  });
}

export default NextAPI(handler);

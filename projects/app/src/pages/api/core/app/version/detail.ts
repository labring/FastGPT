import type { NextApiRequest } from 'next';
import { NextAPI } from '@/service/middleware/entry';
import { MongoAppVersion } from '@fastgpt/service/core/app/version/schema';
import { authApp } from '@fastgpt/service/support/permission/app/auth';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { formatTime2YMDHM } from '@fastgpt/global/common/string/time';
import { rewriteAppWorkflowToDetail } from '@fastgpt/service/core/app/utils';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
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

  await rewriteAppWorkflowToDetail({
    nodes: result.nodes,
    teamId,
    ownerTmbId: app.tmbId,
    isRoot
  });

  return GetAppVersionDetailResponseSchema.parse({
    ...result,
    versionName: result?.versionName || formatTime2YMDHM(result?.time)
  });
}

export default NextAPI(handler);

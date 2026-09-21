import { NextAPI } from '@/service/middleware/entry';
import type { ApiRequestProps } from '@fastgpt/next/type';
import {
  GetAppsByDatasetIdQuerySchema,
  type GetAppsByDatasetIdQuery
} from '@fastgpt/global/openapi/core/dataset/api';
import { ReferencedAppsResponseSchema } from '@fastgpt/global/openapi/core/app/common/api';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { authDataset } from '@fastgpt/service/support/permission/dataset/auth';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { findDatasetAndAllChildren } from '@fastgpt/service/core/dataset/controller';
import { findTeamAppsByPublishedResource } from '@fastgpt/service/core/app/resourceLookup';
import { formatReadableReferencedApps } from '@/service/core/app/referencedApps';

async function handler(req: ApiRequestProps<unknown, GetAppsByDatasetIdQuery>) {
  const { datasetId } = parseApiInput({ req, querySchema: GetAppsByDatasetIdQuerySchema }).query;
  const [{ teamId, tmbId, permission: teamPer }, { permission: datasetPer }] = await Promise.all([
    authUserPer({ req, authToken: true, authApiKey: true, per: ReadPermissionVal }),
    authDataset({
      req,
      authToken: true,
      authApiKey: true,
      datasetId,
      per: ReadPermissionVal
    })
  ]);
  if (!datasetPer.isOwner) {
    return ReferencedAppsResponseSchema.parse({ list: [], hiddenCount: 0 });
  }
  const datasets = await findDatasetAndAllChildren({ teamId, datasetId, fields: '_id deleteTime' });
  const { apps } = await findTeamAppsByPublishedResource({
    teamId,
    type: 'dataset',
    ids: datasets.filter((dataset) => !dataset.deleteTime).map((dataset) => String(dataset._id))
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

import { NextAPI } from '@/service/middleware/entry';
import type { ApiRequestProps } from '@fastgpt/next/type';
import {
  GetAppsByDatasetIdQuerySchema,
  type GetAppsByDatasetIdQuery
} from '@fastgpt/global/openapi/core/dataset/api';
import { DatasetErrEnum } from '@fastgpt/global/common/error/code/dataset';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { authDataset } from '@fastgpt/service/support/permission/dataset/auth';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { findDatasetAndAllChildren } from '@fastgpt/service/core/dataset/controller';
import { listReadableReferencedApps } from '@/service/core/app/referencedApps';

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
    return Promise.reject(DatasetErrEnum.unAuthDataset);
  }
  const datasets = await findDatasetAndAllChildren({ teamId, datasetId, fields: '_id deleteTime' });
  return listReadableReferencedApps({
    teamId,
    tmbId,
    isTeamOwner: teamPer.isOwner,
    resourceType: 'dataset',
    resourceIds: datasets
      .filter((dataset) => !dataset.deleteTime)
      .map((dataset) => String(dataset._id))
  });
}

export default NextAPI(handler);

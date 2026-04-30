import { authDataset } from '@fastgpt/service/support/permission/dataset/auth';
import { NextAPI } from '@/service/middleware/entry';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { type ApiRequestProps } from '@fastgpt/service/type/next';
import { getApiDatasetRequest } from '@fastgpt/service/core/dataset/apiDataset';
import { createApiDatasetCollection } from './apiCollectionV2';
import { CreateApiCollectionBodySchema } from '@fastgpt/global/openapi/core/dataset/collection/createApi';

async function handler(req: ApiRequestProps) {
  const { apiFileId, ...body } = CreateApiCollectionBodySchema.parse(req.body);

  const { teamId, tmbId, dataset } = await authDataset({
    req,
    authToken: true,
    authApiKey: true,
    datasetId: body.datasetId,
    per: WritePermissionVal
  });

  const fileDetail = await (
    await getApiDatasetRequest(dataset.apiDatasetServer)
  ).getFileDetail({
    apiFileId
  });

  return createApiDatasetCollection({
    apiFiles: [fileDetail],
    teamId,
    tmbId,
    dataset,
    ...body
  });
}

export default NextAPI(handler);

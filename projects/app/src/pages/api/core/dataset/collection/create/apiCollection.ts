import { authDatasetCollectionCreate } from '@fastgpt/service/support/permission/dataset/auth';
import { NextAPI } from '@/service/middleware/entry';
import { type ApiRequestProps } from '@fastgpt/next/type';
import { getApiDatasetRequest } from '@fastgpt/service/core/dataset/apiDataset';
import { createApiDatasetCollection } from './apiCollectionV2';
import { CreateApiCollectionBodySchema } from '@fastgpt/global/openapi/core/dataset/collection/createApi';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';

async function handler(req: ApiRequestProps) {
  const { apiFileId, ...body } = parseApiInput({
    req,
    bodySchema: CreateApiCollectionBodySchema
  }).body;

  const { teamId, tmbId, dataset } = await authDatasetCollectionCreate({
    req,
    authToken: true,
    authApiKey: true,
    datasetId: body.datasetId,
    parentId: body.parentId
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

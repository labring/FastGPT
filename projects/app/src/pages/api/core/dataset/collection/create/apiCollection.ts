import {
  authDataset,
  authDatasetCollection
} from '@fastgpt/service/support/permission/dataset/auth';
import { NextAPI } from '@/service/middleware/entry';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { type ApiRequestProps } from '@fastgpt/service/type/next';
import { getApiDatasetRequest } from '@fastgpt/service/core/dataset/apiDataset';
import { createApiDatasetCollection } from './apiCollectionV2';
import { CreateApiCollectionBodySchema } from '@fastgpt/global/openapi/core/dataset/collection/createApi';
import { DatasetErrEnum } from '@fastgpt/global/common/error/code/dataset';

async function handler(req: ApiRequestProps) {
  const { apiFileId, ...body } = CreateApiCollectionBodySchema.parse(req.body);

  const { teamId, tmbId, dataset } = body.parentId
    ? await authDatasetCollection({
        req,
        authToken: true,
        authApiKey: true,
        collectionId: body.parentId,
        per: WritePermissionVal
      }).then((res) => {
        if (body.datasetId && String(res.collection.datasetId) !== String(body.datasetId)) {
          return Promise.reject(DatasetErrEnum.unAuthDataset);
        }
        return {
          teamId: res.teamId,
          tmbId: res.tmbId,
          dataset: res.collection.dataset
        };
      })
    : await authDataset({
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

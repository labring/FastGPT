import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { authDataset } from '@fastgpt/service/support/permission/dataset/auth';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { MongoDatasetCollection } from '@fastgpt/service/core/dataset/collection/schema';
import {
  GetApiDatasetFileListExistIdQuerySchema,
  GetApiDatasetFileListExistIdResponseSchema,
  type GetApiDatasetFileListExistIdQuery,
  type GetApiDatasetFileListExistIdResponse
} from '@fastgpt/global/openapi/core/dataset/apiDataset/api';

async function handler(
  req: ApiRequestProps<unknown, GetApiDatasetFileListExistIdQuery>
): Promise<GetApiDatasetFileListExistIdResponse> {
  const { datasetId } = GetApiDatasetFileListExistIdQuerySchema.parse(req.query);

  const { dataset } = await authDataset({
    req,
    datasetId,
    per: ReadPermissionVal,
    authToken: true,
    authApiKey: true
  });

  const collections = await MongoDatasetCollection.find(
    {
      teamId: dataset.teamId,
      datasetId: dataset._id
    },
    '_id apiFileId'
  ).lean();

  const existIds = collections.map((col) => col.apiFileId).filter(Boolean) as string[];

  return GetApiDatasetFileListExistIdResponseSchema.parse(existIds);
}

export default NextAPI(handler);

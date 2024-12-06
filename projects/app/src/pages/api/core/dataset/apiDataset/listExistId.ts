import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { authDataset } from '@fastgpt/service/support/permission/dataset/auth';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { MongoDatasetCollection } from '@fastgpt/service/core/dataset/collection/schema';

export type listExistIdQuery = {
  datasetId: string;
};

export type listExistIdBody = {};

export type listExistIdResponse = string[];

async function handler(
  req: ApiRequestProps<listExistIdBody, listExistIdQuery>,
  res: ApiResponseType<any>
): Promise<listExistIdResponse> {
  const { datasetId } = req.query;

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

  return collections.map((col) => col.apiFileId).filter(Boolean) as string[];
}

export default NextAPI(handler);

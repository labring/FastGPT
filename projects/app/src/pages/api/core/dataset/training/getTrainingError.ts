import { NextAPI } from '@/service/middleware/entry';
import { type DatasetTrainingSchemaType } from '@fastgpt/global/core/dataset/type';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { parsePaginationRequest } from '@fastgpt/service/common/api/pagination';
import { readFromSecondary } from '@fastgpt/service/common/mongo/utils';
import { MongoDatasetTraining } from '@fastgpt/service/core/dataset/training/schema';
import { authDatasetCollection } from '@fastgpt/service/support/permission/dataset/auth';
import { type ApiRequestProps } from '@fastgpt/service/type/next';
import { type PaginationProps, type PaginationResponse } from '@fastgpt/web/common/fetch/type';

export type getTrainingErrorBody = PaginationProps<{
  collectionId: string;
}>;

export type getTrainingErrorResponse = PaginationResponse<DatasetTrainingSchemaType>;

async function handler(req: ApiRequestProps<getTrainingErrorBody, {}>) {
  const { collectionId } = req.body;
  const { offset, pageSize } = parsePaginationRequest(req);

  const { collection } = await authDatasetCollection({
    req,
    authToken: true,
    authApiKey: true,
    collectionId,
    per: ReadPermissionVal
  });

  const match = {
    teamId: collection.teamId,
    datasetId: collection.datasetId,
    collectionId: collection._id,
    errorMsg: { $exists: true }
  };

  const [errorList, total] = await Promise.all([
    MongoDatasetTraining.find(match, undefined, {
      ...readFromSecondary
    })
      .skip(offset)
      .limit(pageSize)
      .lean(),
    MongoDatasetTraining.countDocuments(match, { ...readFromSecondary })
  ]);

  return {
    list: errorList,
    total
  };
}

export default NextAPI(handler);

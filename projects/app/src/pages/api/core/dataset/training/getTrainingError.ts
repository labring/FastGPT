import { NextAPI } from '@/service/middleware/entry';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { parsePaginationRequest } from '@fastgpt/service/common/api/pagination';
import { readFromSecondary } from '@fastgpt/service/common/mongo/utils';
import { MongoDatasetTraining } from '@fastgpt/service/core/dataset/training/schema';
import { authDatasetCollection } from '@fastgpt/service/support/permission/dataset/auth';
import { type ApiRequestProps } from '@fastgpt/service/type/next';
import {
  GetTrainingErrorBodySchema,
  GetTrainingErrorResponseSchema,
  type GetTrainingErrorResponse
} from '@fastgpt/global/openapi/core/dataset/training/api';

async function handler(req: ApiRequestProps): Promise<GetTrainingErrorResponse> {
  const { collectionId } = GetTrainingErrorBodySchema.parse(req.body);
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

  return GetTrainingErrorResponseSchema.parse({
    list: errorList,
    total
  });
}

export default NextAPI(handler);

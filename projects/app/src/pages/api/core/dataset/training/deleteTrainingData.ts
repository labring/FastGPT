import { ManagePermissionVal } from '@fastgpt/global/support/permission/constant';
import { MongoDatasetTraining } from '@fastgpt/service/core/dataset/training/schema';
import { authDatasetCollection } from '@fastgpt/service/support/permission/dataset/auth';
import { NextAPI } from '@/service/middleware/entry';
import { type ApiRequestProps } from '@fastgpt/service/type/next';
import {
  DeleteTrainingDataBodySchema,
  DeleteTrainingDataResponseSchema,
  type DeleteTrainingDataResponse
} from '@fastgpt/global/openapi/core/dataset/training/api';

async function handler(req: ApiRequestProps): Promise<DeleteTrainingDataResponse> {
  const { datasetId, collectionId, dataId } = DeleteTrainingDataBodySchema.parse(req.body);

  const { teamId } = await authDatasetCollection({
    req,
    authToken: true,
    authApiKey: true,
    collectionId,
    per: ManagePermissionVal
  });

  await MongoDatasetTraining.deleteOne({
    teamId,
    datasetId,
    _id: dataId
  });

  return DeleteTrainingDataResponseSchema.parse({});
}

export default NextAPI(handler);

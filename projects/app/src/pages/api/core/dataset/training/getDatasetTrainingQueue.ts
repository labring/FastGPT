import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { authDataset } from '@fastgpt/service/support/permission/dataset/auth';
import { MongoDatasetData } from '@fastgpt/service/core/dataset/data/schema';
import { MongoDatasetTraining } from '@fastgpt/service/core/dataset/training/schema';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { readFromSecondary } from '@fastgpt/service/common/mongo/utils';
import {
  GetDatasetTrainingQueueQuerySchema,
  GetDatasetTrainingQueueResponseSchema,
  type GetDatasetTrainingQueueResponse
} from '@fastgpt/global/openapi/core/dataset/training/api';

async function handler(req: ApiRequestProps): Promise<GetDatasetTrainingQueueResponse> {
  const { datasetId } = GetDatasetTrainingQueueQuerySchema.parse(req.query);

  const { teamId } = await authDataset({
    req,
    authToken: true,
    authApiKey: true,
    datasetId,
    per: ReadPermissionVal
  });

  const [rebuildingCount, trainingCount] = await Promise.all([
    MongoDatasetData.countDocuments(
      { rebuilding: true, teamId, datasetId },
      {
        ...readFromSecondary
      }
    ),
    MongoDatasetTraining.countDocuments(
      { teamId, datasetId },
      {
        ...readFromSecondary
      }
    )
  ]);

  return GetDatasetTrainingQueueResponseSchema.parse({
    rebuildingCount,
    trainingCount
  });
}

export default NextAPI(handler);

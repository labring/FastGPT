import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { authDataset } from '@fastgpt/service/support/permission/dataset/auth';
import { MongoDatasetData } from '@fastgpt/service/core/dataset/data/schema';
import { MongoDatasetTraining } from '@fastgpt/service/core/dataset/training/schema';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { readFromSecondary } from '@fastgpt/service/common/mongo/utils';

export type getDatasetTrainingQueueResponse = {
  rebuildingCount: number;
  trainingCount: number;
};

async function handler(
  req: ApiRequestProps<any, { datasetId: string }>
): Promise<getDatasetTrainingQueueResponse> {
  const { datasetId } = req.query;

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

  return {
    rebuildingCount,
    trainingCount
  };
}

export default NextAPI(handler);

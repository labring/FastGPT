import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { authDataset } from '@fastgpt/service/support/permission/auth/dataset';
import { MongoDatasetData } from '@fastgpt/service/core/dataset/data/schema';
import { MongoDatasetTraining } from '@fastgpt/service/core/dataset/training/schema';

type Props = {};

export type getDatasetTrainingQueueResponse = {
  rebuildingCount: number;
  trainingCount: number;
};

async function handler(
  req: ApiRequestProps<any, { datasetId: string }>,
  res: ApiResponseType<any>
): Promise<getDatasetTrainingQueueResponse> {
  const { datasetId } = req.query;

  const { teamId } = await authDataset({
    req,
    authToken: true,
    authApiKey: true,
    datasetId,
    per: 'r'
  });

  const [rebuildingCount, trainingCount] = await Promise.all([
    MongoDatasetData.countDocuments({ teamId, datasetId, rebuilding: true }),
    MongoDatasetTraining.countDocuments({ teamId, datasetId })
  ]);

  return {
    rebuildingCount,
    trainingCount
  };
}

export default NextAPI(handler);

import type { NextApiRequest, NextApiResponse } from 'next';
import { NextAPI } from '@/service/middleware/entry';
import { authEmbeddingTrainTask } from '@fastgpt/service/support/permission/train/embedding/auth';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { EmbeddingTrainErrEnum } from '@fastgpt/global/common/error/code/train';
import { CommonErrEnum } from '@fastgpt/global/common/error/code/common';
import { MongoEmbeddingTrainTask } from '@fastgpt/service/core/train/embedding/task/schema';
import { Types } from '@fastgpt/service/common/mongo';
import type {
  EmbeddingTrainTaskDetailRequest,
  EmbeddingTrainTaskDetailResponse
} from '@fastgpt/global/core/train/embedding/api';
import { buildEmbeddingTrainTaskAggregationPipeline } from '@fastgpt/service/core/train/embedding/task/utils';

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<EmbeddingTrainTaskDetailResponse>
): Promise<EmbeddingTrainTaskDetailResponse> {
  const { taskId } = req.query as EmbeddingTrainTaskDetailRequest;

  if (!taskId) {
    return Promise.reject(CommonErrEnum.missingParams);
  }

  // Verify permission (includes teamId ownership check)
  await authEmbeddingTrainTask({
    req,
    authToken: true,
    authApiKey: true,
    taskId,
    per: ReadPermissionVal
  });

  // Query task detail via aggregation pipeline (includes creator info)
  const tasks = await MongoEmbeddingTrainTask.aggregate([
    { $match: { _id: new Types.ObjectId(taskId) } },
    ...buildEmbeddingTrainTaskAggregationPipeline()
  ]);

  const task = tasks[0];

  if (!task) {
    return Promise.reject(EmbeddingTrainErrEnum.embeddingTaskNotExist);
  }

  return task;
}

export default NextAPI(handler);

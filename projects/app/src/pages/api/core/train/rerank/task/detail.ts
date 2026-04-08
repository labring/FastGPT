import type { NextApiRequest, NextApiResponse } from 'next';
import { NextAPI } from '@/service/middleware/entry';
import { authRerankTrainTask } from '@fastgpt/service/support/permission/train/rerank/auth';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { RerankTrainErrEnum } from '@fastgpt/global/common/error/code/train';
import { CommonErrEnum } from '@fastgpt/global/common/error/code/common';
import { MongoRerankTrainTask } from '@fastgpt/service/core/train/rerank/task/schema';
import { Types } from '@fastgpt/service/common/mongo';
import type {
  RerankTrainTaskDetailRequest,
  RerankTrainTaskDetailResponse
} from '@fastgpt/global/core/train/rerank/api';
import { buildRerankTrainTaskAggregationPipeline } from '@fastgpt/service/core/train/rerank/task/utils';

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<RerankTrainTaskDetailResponse>
): Promise<RerankTrainTaskDetailResponse> {
  const { taskId } = req.query as RerankTrainTaskDetailRequest;

  if (!taskId) {
    return Promise.reject(CommonErrEnum.missingParams);
  }

  // Verify permission (includes teamId ownership check)
  await authRerankTrainTask({
    req,
    authToken: true,
    authApiKey: true,
    taskId,
    per: ReadPermissionVal
  });

  // Query task detail via aggregation pipeline (includes creator info)
  const tasks = await MongoRerankTrainTask.aggregate([
    { $match: { _id: new Types.ObjectId(taskId) } },
    ...buildRerankTrainTaskAggregationPipeline()
  ]);

  const task = tasks[0];

  if (!task) {
    return Promise.reject(RerankTrainErrEnum.rerankTaskNotExist);
  }

  return task;
}

export default NextAPI(handler);

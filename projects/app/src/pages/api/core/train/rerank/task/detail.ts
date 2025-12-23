import type { NextApiRequest, NextApiResponse } from 'next';
import { NextAPI } from '@/service/middleware/entry';
import { MongoRerankTrainTask } from '@fastgpt/service/core/train/rerank/task/schema';
import { authApp } from '@fastgpt/service/support/permission/app/auth';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { RerankTrainErrEnum } from '@fastgpt/global/common/error/code/train';
import { CommonErrEnum } from '@fastgpt/global/common/error/code/common';
import { Types } from '@fastgpt/service/common/mongo';
import type {
  RerankTrainTaskDetailRequest,
  RerankTrainTaskDetailResponse
} from '@fastgpt/global/core/train/rerank/api';
import { buildTrainTaskAggregationPipeline } from '@fastgpt/service/core/train/rerank/task/utils';

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<RerankTrainTaskDetailResponse>
): Promise<RerankTrainTaskDetailResponse> {
  const { taskId } = req.query as RerankTrainTaskDetailRequest;

  if (!taskId) {
    return Promise.reject(CommonErrEnum.missingParams);
  }

  // Get task using aggregation to include creator and app info
  const tasks = await MongoRerankTrainTask.aggregate([
    { $match: { _id: new Types.ObjectId(taskId) } },
    ...buildTrainTaskAggregationPipeline()
  ]);

  const task = tasks[0];

  if (!task) {
    return Promise.reject(RerankTrainErrEnum.taskNotExist);
  }

  // Verify user permission for the task's app
  await authApp({
    req,
    authToken: true,
    appId: String(task.appId),
    per: ReadPermissionVal
  });

  return task;
}

export default NextAPI(handler);

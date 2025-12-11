import type { NextApiRequest, NextApiResponse } from 'next';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { NextAPI } from '@/service/middleware/entry';
import { MongoRerankTrainTask } from '@fastgpt/service/core/train/rerank/task/schema';
import { cancelRerankTrainTask } from '@fastgpt/service/core/train/rerank/task/controller';
import { authApp } from '@fastgpt/service/support/permission/app/auth';
import { RerankTrainErrEnum } from '@fastgpt/global/common/error/code/train';
import { CommonErrEnum } from '@fastgpt/global/common/error/code/common';
import type { CancelRerankTrainTaskRequest } from '@fastgpt/global/core/train/rerank/api';

async function handler(req: NextApiRequest, res: NextApiResponse): Promise<any> {
  const { taskId } = req.body as CancelRerankTrainTaskRequest;

  if (!taskId) {
    return Promise.reject(CommonErrEnum.missingParams);
  }

  // Get task
  const task = await MongoRerankTrainTask.findById(taskId).lean();
  if (!task) {
    return Promise.reject(RerankTrainErrEnum.taskNotExist);
  }

  // Verify user permission for the task's app
  await authApp({
    req,
    authToken: true,
    appId: String(task.appId),
    per: WritePermissionVal
  });

  // Cancel task
  await cancelRerankTrainTask(taskId);

  return { success: true };
}

export default NextAPI(handler);

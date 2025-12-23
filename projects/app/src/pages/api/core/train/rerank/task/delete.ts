import type { NextApiRequest, NextApiResponse } from 'next';
import { NextAPI } from '@/service/middleware/entry';
import { MongoRerankTrainTask } from '@fastgpt/service/core/train/rerank/task/schema';
import { deleteRerankTrainTask } from '@fastgpt/service/core/train/rerank/task/controller';
import { authApp } from '@fastgpt/service/support/permission/app/auth';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { RerankTrainTaskStatusEnum } from '@fastgpt/global/core/train/rerank/constants';
import { RerankTrainErrEnum } from '@fastgpt/global/common/error/code/train';
import { CommonErrEnum } from '@fastgpt/global/common/error/code/common';
import type { DeleteRerankTrainTaskRequest } from '@fastgpt/global/core/train/rerank/api';

async function handler(req: NextApiRequest, res: NextApiResponse): Promise<any> {
  const { taskId } = req.query as DeleteRerankTrainTaskRequest;

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

  // Check task status - cannot delete running tasks
  if (
    task.status === RerankTrainTaskStatusEnum.pending ||
    task.status === RerankTrainTaskStatusEnum.running
  ) {
    return Promise.reject(RerankTrainErrEnum.taskCannotDelete);
  }

  // Delete task
  await deleteRerankTrainTask(taskId);

  return { success: true };
}

export default NextAPI(handler);

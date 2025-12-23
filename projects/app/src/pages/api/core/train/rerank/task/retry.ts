import type { NextApiRequest, NextApiResponse } from 'next';
import { NextAPI } from '@/service/middleware/entry';
import { MongoRerankTrainTask } from '@fastgpt/service/core/train/rerank/task/schema';
import { rerankTrainTaskQueue } from '@fastgpt/service/core/train/rerank/task/mq';
import { updateTaskStatus } from '@fastgpt/service/core/train/rerank/task/controller';
import { authApp } from '@fastgpt/service/support/permission/app/auth';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { RerankTrainTaskStatusEnum } from '@fastgpt/global/core/train/rerank/constants';
import { RerankTrainErrEnum } from '@fastgpt/global/common/error/code/train';
import { CommonErrEnum } from '@fastgpt/global/common/error/code/common';
import type { RetryRerankTrainTaskRequest } from '@fastgpt/global/core/train/rerank/api';

async function handler(req: NextApiRequest, res: NextApiResponse): Promise<any> {
  const { taskId } = req.body as RetryRerankTrainTaskRequest;

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

  // Check task status
  if (task.status !== RerankTrainTaskStatusEnum.failed) {
    return Promise.reject(RerankTrainErrEnum.taskCannotRetry);
  }

  // Get failed job directly using jobId
  if (!task.jobId) {
    return Promise.reject(RerankTrainErrEnum.taskCannotRetry);
  }

  const job = await rerankTrainTaskQueue.getJob(task.jobId);
  if (!job || (await job.getState()) !== 'failed') {
    return Promise.reject(RerankTrainErrEnum.taskCannotRetry);
  }

  // Retry failed job using BullMQ's retry method
  await job.retry();

  // Update task status to pending and clear error message
  await Promise.all([
    updateTaskStatus(taskId, RerankTrainTaskStatusEnum.pending),
    MongoRerankTrainTask.updateOne({ _id: taskId }, { $unset: { errorMsg: '' } })
  ]);

  return { success: true, jobId: job.id as string };
}

export default NextAPI(handler);

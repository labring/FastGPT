import type { NextApiRequest, NextApiResponse } from 'next';
import { NextAPI } from '@/service/middleware/entry';
import { MongoRerankTrainTask } from '@fastgpt/service/core/train/rerank/task/schema';
import { MongoRerankTrainset } from '@fastgpt/service/core/train/rerank/trainset/schema';
import { rerankTrainTaskQueue } from '@fastgpt/service/core/train/rerank/task/mq';
import { rerankTrainDataGenerateQueue } from '@fastgpt/service/core/train/rerank/data/mq';
import { updateTaskStatus } from '@fastgpt/service/core/train/rerank/task/controller';
import { authApp } from '@fastgpt/service/support/permission/app/auth';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import {
  RerankTrainTaskStatusEnum,
  RerankTrainsetStatusEnum
} from '@fastgpt/global/core/train/rerank/constants';
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

  // Check trainset status - if trainset generation failed, retry trainset generation first
  const trainset = await MongoRerankTrainset.findById(task.trainsetId).lean();
  if (!trainset) {
    return Promise.reject(RerankTrainErrEnum.trainsetNotExist);
  }

  // If trainset generation failed, retry the trainset generation job first
  // The training task will wait for trainset to be ready using waitForTrainsetReady()
  if (trainset.status === RerankTrainsetStatusEnum.error && trainset.jobId) {
    const trainsetJob = await rerankTrainDataGenerateQueue.getJob(trainset.jobId);
    if (trainsetJob && (await trainsetJob.getState()) === 'failed') {
      // Retry trainset generation job
      await trainsetJob.retry();

      // Update trainset status to pending and clear error
      await MongoRerankTrainset.updateOne(
        { _id: trainset._id },
        {
          status: RerankTrainsetStatusEnum.pending,
          $unset: { errorMsg: '' }
        }
      );

      // Continue to retry the training task job below
      // The training task will automatically wait for trainset generation to complete
    }
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

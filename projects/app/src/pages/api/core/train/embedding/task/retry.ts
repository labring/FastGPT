import type { NextApiRequest, NextApiResponse } from 'next';
import { NextAPI } from '@/service/middleware/entry';
import { MongoEmbeddingTrainTask } from '@fastgpt/service/core/train/embedding/task/schema';
import { MongoEmbeddingTrainset } from '@fastgpt/service/core/train/embedding/trainset/schema';
import { embeddingTrainTaskQueue } from '@fastgpt/service/core/train/embedding/task/mq';
import { embeddingTrainDataGenerateQueue } from '@fastgpt/service/core/train/embedding/data/mq';
import { updateEmbeddingTaskStatus } from '@fastgpt/service/core/train/embedding/task/controller';
import { authEmbeddingTrainTask } from '@fastgpt/service/support/permission/train/embedding/auth';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import {
  EmbeddingTrainTaskStatusEnum,
  EmbeddingTrainsetStatusEnum
} from '@fastgpt/global/core/train/embedding/constants';
import { EmbeddingTrainErrEnum } from '@fastgpt/global/common/error/code/train';
import { CommonErrEnum } from '@fastgpt/global/common/error/code/common';
import type { RetryEmbeddingTrainTaskRequest } from '@fastgpt/global/core/train/embedding/api';
import { addAuditLog } from '@fastgpt/service/support/user/audit/util';
import { AuditEventEnum } from '@fastgpt/global/support/user/audit/constants';

async function handler(req: NextApiRequest, res: NextApiResponse): Promise<any> {
  const { taskId } = req.body as RetryEmbeddingTrainTaskRequest;

  if (!taskId) {
    return Promise.reject(CommonErrEnum.missingParams);
  }

  const { task } = await authEmbeddingTrainTask({
    req,
    authToken: true,
    authApiKey: true,
    taskId,
    per: WritePermissionVal
  });

  // Only failed tasks can be retried
  if (task.status !== EmbeddingTrainTaskStatusEnum.failed) {
    return Promise.reject(EmbeddingTrainErrEnum.embeddingTaskCannotRetry);
  }

  // Retrieve the failed BullMQ job by its persisted jobId
  if (!task.jobId) {
    return Promise.reject(EmbeddingTrainErrEnum.embeddingTaskCannotRetry);
  }

  const job = await embeddingTrainTaskQueue.getJob(task.jobId);
  if (!job || (await job.getState()) !== 'failed') {
    return Promise.reject(EmbeddingTrainErrEnum.embeddingTaskCannotRetry);
  }

  // If the trainset generation also failed, retry it first so the training task
  // can resume waiting for a ready trainset on its next attempt
  if (task.trainsetId) {
    const trainset = await MongoEmbeddingTrainset.findById(task.trainsetId).lean();
    if (!trainset) {
      return Promise.reject(EmbeddingTrainErrEnum.embeddingTrainsetNotExist);
    }

    // Retry the data generation job and reset trainset status to pending
    if (trainset.status === EmbeddingTrainsetStatusEnum.error && trainset.jobId) {
      const trainsetJob = await embeddingTrainDataGenerateQueue.getJob(trainset.jobId);
      if (trainsetJob && (await trainsetJob.getState()) === 'failed') {
        // Retry trainset data generation job
        await trainsetJob.retry();

        // Reset trainset status and clear error
        await MongoEmbeddingTrainset.updateOne(
          { _id: trainset._id },
          {
            status: EmbeddingTrainsetStatusEnum.pending,
            $unset: { errorMsg: '' }
          }
        );
      }
    }
  }

  // Retry the main training task job via BullMQ
  await job.retry();

  // Reset task status to pending and clear error message
  await Promise.all([
    updateEmbeddingTaskStatus(taskId, EmbeddingTrainTaskStatusEnum.pending),
    MongoEmbeddingTrainTask.updateOne({ _id: taskId }, { $unset: { errorMsg: '' } })
  ]);

  // Audit log
  (async () => {
    addAuditLog({
      tmbId: task.tmbId,
      teamId: task.teamId,
      event: AuditEventEnum.RETRY_EMBEDDING_TRAIN_TASK,
      params: { taskName: task.name || taskId }
    });
  })();

  return { success: true, jobId: job.id as string };
}

export default NextAPI(handler);

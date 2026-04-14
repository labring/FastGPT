import type { NextApiRequest, NextApiResponse } from 'next';
import { NextAPI } from '@/service/middleware/entry';
import { MongoRerankTrainTask } from '@fastgpt/service/core/train/rerank/task/schema';
import { MongoRerankTrainset } from '@fastgpt/service/core/train/rerank/trainset/schema';
import { rerankTrainTaskQueue } from '@fastgpt/service/core/train/rerank/task/mq';
import { rerankTrainDataGenerateQueue } from '@fastgpt/service/core/train/rerank/data/mq';
import { updateRerankTaskStatus } from '@fastgpt/service/core/train/rerank/task/controller';
import { authRerankTrainTask } from '@fastgpt/service/support/permission/train/rerank/auth';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import {
  RerankTrainTaskStatusEnum,
  RerankTrainsetStatusEnum
} from '@fastgpt/global/core/train/rerank/constants';
import { RerankTrainErrEnum } from '@fastgpt/global/common/error/code/train';
import { CommonErrEnum } from '@fastgpt/global/common/error/code/common';
import type { RetryRerankTrainTaskRequest } from '@fastgpt/global/core/train/rerank/api';
import { addAuditLog } from '@fastgpt/service/support/user/audit/util';
import { AuditEventEnum } from '@fastgpt/global/support/user/audit/constants';

async function handler(req: NextApiRequest, res: NextApiResponse): Promise<any> {
  const { taskId } = req.body as RetryRerankTrainTaskRequest;

  if (!taskId) {
    return Promise.reject(CommonErrEnum.missingParams);
  }

  const { task } = await authRerankTrainTask({
    req,
    authToken: true,
    authApiKey: true,
    taskId,
    per: WritePermissionVal
  });

  // Only failed tasks can be retried
  if (task.status !== RerankTrainTaskStatusEnum.failed) {
    return Promise.reject(RerankTrainErrEnum.rerankTaskCannotRetry);
  }

  // Retrieve the failed BullMQ job by its persisted jobId
  if (!task.jobId) {
    return Promise.reject(RerankTrainErrEnum.rerankTaskCannotRetry);
  }

  const job = await rerankTrainTaskQueue.getJob(task.jobId);
  if (!job || (await job.getState()) !== 'failed') {
    return Promise.reject(RerankTrainErrEnum.rerankTaskCannotRetry);
  }

  // If the trainset generation also failed, retry it first so the training task
  // can resume waiting for a ready trainset on its next attempt
  if (task.trainsetId) {
    const trainset = await MongoRerankTrainset.findById(task.trainsetId).lean();
    if (!trainset) {
      return Promise.reject(RerankTrainErrEnum.rerankTrainsetNotExist);
    }

    // Retry the data generation job and reset trainset status to pending
    if (trainset.status === RerankTrainsetStatusEnum.error && trainset.jobId) {
      const trainsetJob = await rerankTrainDataGenerateQueue.getJob(trainset.jobId);
      if (trainsetJob && (await trainsetJob.getState()) === 'failed') {
        // Retry trainset data generation job
        await trainsetJob.retry();

        // Reset trainset status and clear error
        await MongoRerankTrainset.updateOne(
          { _id: trainset._id },
          {
            status: RerankTrainsetStatusEnum.pending,
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
    updateRerankTaskStatus(taskId, RerankTrainTaskStatusEnum.pending),
    MongoRerankTrainTask.updateOne({ _id: taskId }, { $unset: { errorMsg: '' } })
  ]);

  // Audit log
  (async () => {
    addAuditLog({
      tmbId: task.tmbId,
      teamId: task.teamId,
      event: AuditEventEnum.RETRY_RERANK_TRAIN_TASK,
      params: { taskName: task.name || taskId }
    });
  })();

  return { success: true, jobId: job.id as string };
}

export default NextAPI(handler);

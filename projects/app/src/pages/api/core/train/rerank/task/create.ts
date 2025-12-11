import type { NextApiRequest, NextApiResponse } from 'next';
import { NextAPI } from '@/service/middleware/entry';
import { authApp } from '@fastgpt/service/support/permission/app/auth';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { createRerankTrainTask } from '@fastgpt/service/core/train/rerank/task/controller';
import { MongoRerankTrainset } from '@fastgpt/service/core/train/rerank/trainset/schema';
import { MongoRerankTrainTask } from '@fastgpt/service/core/train/rerank/task/schema';
import { rerankTrainTaskQueue } from '@fastgpt/service/core/train/rerank/task/mq';
import {
  RerankTrainsetStatusEnum,
  RerankTrainTaskStatusEnum
} from '@fastgpt/global/core/train/rerank/constants';
import { RerankTrainErrEnum } from '@fastgpt/global/common/error/code/train';
import { CommonErrEnum } from '@fastgpt/global/common/error/code/common';
import type {
  CreateRerankTrainTaskRequest,
  CreateRerankTrainTaskResponse
} from '@fastgpt/global/core/train/rerank/api';
import { calculateTrainsetStats } from '@fastgpt/service/core/train/rerank/data/controller';

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<CreateRerankTrainTaskResponse>
): Promise<CreateRerankTrainTaskResponse> {
  const { appId, trainsetId, name } = req.body as CreateRerankTrainTaskRequest;

  if (!appId) {
    return Promise.reject(CommonErrEnum.missingParams);
  }

  if (!trainsetId) {
    return Promise.reject(CommonErrEnum.missingParams);
  }

  // 1. Authenticate app write permission
  const { app, teamId, tmbId } = await authApp({
    req,
    authToken: true,
    appId,
    per: WritePermissionVal
  });

  // 2. Validate trainset exists, is ready, and belongs to the app
  const trainset = await MongoRerankTrainset.findOne({
    _id: trainsetId,
    appId: appId
  }).lean();
  if (!trainset) {
    return Promise.reject(RerankTrainErrEnum.trainsetNotExist);
  }
  if (trainset.status !== RerankTrainsetStatusEnum.ready) {
    return Promise.reject(RerankTrainErrEnum.trainsetNotReady);
  }

  // Calculate statistics dynamically
  const stats = await calculateTrainsetStats(String(trainset._id));
  if (stats.dataCount === 0) {
    return Promise.reject(RerankTrainErrEnum.noTrainDataAvailable);
  }

  // 3. Check if there's a running task
  const runningTask = await MongoRerankTrainTask.findOne({
    appId,
    status: {
      $in: [RerankTrainTaskStatusEnum.pending, RerankTrainTaskStatusEnum.running]
    }
  }).lean();

  if (runningTask) {
    return Promise.reject(RerankTrainErrEnum.taskAlreadyRunning);
  }

  // 4. Create task
  const taskId = await createRerankTrainTask({
    appId,
    trainsetId,
    teamId,
    tmbId,
    name
  });

  // 5. Add to task queue
  const job = await rerankTrainTaskQueue.add(
    `train-${taskId}`,
    { taskId },
    {
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 }
    }
  );

  // 6. Update jobId
  await MongoRerankTrainTask.updateOne({ _id: taskId }, { jobId: job.id as string });

  return {
    taskId,
    status: RerankTrainTaskStatusEnum.pending
  };
}

export default NextAPI(handler);

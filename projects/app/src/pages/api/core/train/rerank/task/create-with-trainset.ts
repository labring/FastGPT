import type { NextApiRequest, NextApiResponse } from 'next';
import { NextAPI } from '@/service/middleware/entry';
import { authApp } from '@fastgpt/service/support/permission/app/auth';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { createRerankTrainTask } from '@fastgpt/service/core/train/rerank/task/controller';
import { cleanupTrainModuleOnAppDelete } from '@fastgpt/service/core/app/controller';
import { MongoRerankTrainset } from '@fastgpt/service/core/train/rerank/trainset/schema';
import { MongoRerankTrainTask } from '@fastgpt/service/core/train/rerank/task/schema';
import { rerankTrainTaskQueue } from '@fastgpt/service/core/train/rerank/task/mq';
import { rerankTrainDataGenerateQueue } from '@fastgpt/service/core/train/rerank/data/mq';
import {
  RerankTrainsetStatusEnum,
  RerankTrainTaskStatusEnum
} from '@fastgpt/global/core/train/rerank/constants';
import { RerankTrainErrEnum } from '@fastgpt/global/common/error/code/train';
import { CommonErrEnum } from '@fastgpt/global/common/error/code/common';
import type {
  CreateRerankTrainTaskWithTrainsetRequest,
  CreateRerankTrainTaskResponse
} from '@fastgpt/global/core/train/rerank/api';
import { addLog } from '@fastgpt/service/common/system/log';

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<CreateRerankTrainTaskResponse>
): Promise<CreateRerankTrainTaskResponse> {
  const { appId, name } = req.body as CreateRerankTrainTaskWithTrainsetRequest;

  if (!appId) {
    return Promise.reject(CommonErrEnum.missingParams);
  }

  // 1. Authenticate app write permission
  const { app, teamId, tmbId } = await authApp({
    req,
    authToken: true,
    appId,
    per: WritePermissionVal
  });

  // 2. Check if there's a running task
  const runningTask = await MongoRerankTrainTask.findOne({
    appId,
    status: {
      $in: [RerankTrainTaskStatusEnum.pending, RerankTrainTaskStatusEnum.running]
    }
  }).lean();

  if (runningTask) {
    return Promise.reject(RerankTrainErrEnum.taskAlreadyRunning);
  }

  // 3. Create new trainset (old ones are automatically preserved)
  addLog.info('Creating new trainset for app', { appId });

  const [{ _id: trainsetId }] = await MongoRerankTrainset.create([
    {
      appId,
      teamId,
      tmbId,
      name: `${app.name} - Training Set`,
      status: RerankTrainsetStatusEnum.pending
    }
  ]);

  addLog.info('Created new trainset', {
    appId,
    trainsetId: String(trainsetId)
  });

  // 4. Trigger train data generation
  addLog.info('Triggering train data generation', {
    appId,
    trainsetId: String(trainsetId)
  });

  const dataGenJob = await rerankTrainDataGenerateQueue.add(
    `auto-generate-${trainsetId}-${Date.now()}`,
    {
      appId,
      trainsetId: String(trainsetId),
      datasetIds: undefined, // Use all datasets associated with the app
      generateConfig: {
        forceRegenerate: false,
        minNegativeSamples: 1,
        maxNegativeSamples: 7,
        includeOriginalQ: true
      }
    }
  );

  // Save jobId to trainset for retry functionality
  await MongoRerankTrainset.updateOne({ _id: trainsetId }, { jobId: dataGenJob.id as string });

  // 5. Create train task with trainsetId
  // Note: Trainset may still be generating. The task processor will wait for it to be ready.
  const taskId = await createRerankTrainTask({
    appId,
    trainsetId: String(trainsetId),
    teamId,
    tmbId,
    name
  });

  // 6. Add to task queue
  const job = await rerankTrainTaskQueue.add(
    `train-${taskId}`,
    { taskId },
    {
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 }
    }
  );

  // 7. Update jobId
  await MongoRerankTrainTask.updateOne({ _id: taskId }, { jobId: job.id as string });

  addLog.info('Created train task with trainset', {
    appId,
    taskId,
    trainsetId: String(trainsetId)
  });

  return {
    taskId,
    status: RerankTrainTaskStatusEnum.pending
  };
}

export default NextAPI(handler);

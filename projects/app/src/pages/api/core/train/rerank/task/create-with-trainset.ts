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
  CreateRerankTrainTaskRequest,
  CreateRerankTrainTaskResponse
} from '@fastgpt/global/core/train/rerank/api';
import { addLog } from '@fastgpt/service/common/system/log';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { calculateTrainsetStats } from '@fastgpt/service/core/train/rerank/data/controller';

// Extended request body type with polling configuration
export type CreateRerankTrainTaskWithTrainsetBody = CreateRerankTrainTaskRequest & {
  pollingConfig?: {
    maxAttempts?: number; // Max polling attempts, default 60
    interval?: number; // Polling interval (ms), default 5000
  };
};

/**
 * Poll and wait for trainset to be ready
 * @param trainsetId Trainset ID
 * @param maxAttempts Max polling attempts
 * @param interval Polling interval (ms)
 * @returns Ready trainset
 */
async function waitForTrainsetReady(
  trainsetId: string,
  maxAttempts: number = 60,
  interval: number = 5000
) {
  let attempts = 0;

  while (attempts < maxAttempts) {
    const trainset = await MongoRerankTrainset.findById(trainsetId).lean();

    if (!trainset) {
      throw RerankTrainErrEnum.trainsetNotExist;
    }

    // If ready, return trainset with calculated statistics
    if (trainset.status === RerankTrainsetStatusEnum.ready) {
      const stats = await calculateTrainsetStats(String(trainset._id));
      if (stats.dataCount === 0) {
        throw RerankTrainErrEnum.noTrainDataAvailable;
      }
      return { trainset, stats };
    }

    // If error, throw exception
    if (trainset.status === RerankTrainsetStatusEnum.error) {
      throw RerankTrainErrEnum.trainsetGenerationFailed;
    }

    // If still generating, continue waiting
    if (trainset.status === RerankTrainsetStatusEnum.generating) {
      addLog.info('Waiting for trainset generation', {
        trainsetId,
        attempt: attempts + 1,
        maxAttempts
      });
      await new Promise((resolve) => setTimeout(resolve, interval));
      attempts++;
      continue;
    }

    // Idle status shouldn't appear here (generation should have been triggered)
    // Continue waiting for safety
    await new Promise((resolve) => setTimeout(resolve, interval));
    attempts++;
  }

  // Timeout
  addLog.error('Trainset generation timeout', { trainsetId, maxAttempts });
  throw RerankTrainErrEnum.trainsetGenerationFailed;
}

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<CreateRerankTrainTaskResponse>
): Promise<CreateRerankTrainTaskResponse> {
  const { appId, name, pollingConfig } = req.body as CreateRerankTrainTaskWithTrainsetBody;

  if (!appId) {
    return Promise.reject(CommonErrEnum.missingParams);
  }

  // Destructure polling config with defaults
  const { maxAttempts = 60, interval = 5000 } = pollingConfig || {};

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

  await rerankTrainDataGenerateQueue.add(`auto-generate-${trainsetId}-${Date.now()}`, {
    appId,
    trainsetId: String(trainsetId),
    datasetIds: undefined, // Use all datasets associated with the app
    generateConfig: {
      forceRegenerate: false,
      minNegativeSamples: 1,
      maxNegativeSamples: 7,
      includeOriginalQ: true
    }
  });

  // 5. Wait for trainset generation to complete
  addLog.info('Waiting for trainset to be ready', {
    trainsetId: String(trainsetId),
    maxAttempts,
    interval
  });

  const { trainset, stats } = await waitForTrainsetReady(String(trainsetId), maxAttempts, interval);

  addLog.info('Trainset is ready', {
    appId,
    dataCount: stats.dataCount
  });

  // 6. Create train task with trainsetId
  const taskId = await createRerankTrainTask({
    appId,
    trainsetId: String(trainsetId),
    teamId,
    tmbId,
    name
  });

  // 7. Add to task queue
  const job = await rerankTrainTaskQueue.add(
    `train-${taskId}`,
    { taskId },
    {
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 }
    }
  );

  // 8. Update jobId
  await MongoRerankTrainTask.updateOne({ _id: taskId }, { jobId: job.id as string });

  addLog.info('Created train task with trainset', {
    appId,
    taskId,
    trainsetId: String(trainset._id)
  });

  return {
    taskId,
    status: RerankTrainTaskStatusEnum.pending
  };
}

export default NextAPI(handler);

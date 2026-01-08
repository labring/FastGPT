import type { NextApiRequest, NextApiResponse } from 'next';
import { NextAPI } from '@/service/middleware/entry';
import {
  authRerankTrainset,
  authGenerateFromDatasets
} from '@fastgpt/service/support/permission/train/rerank/auth';
import { authApp } from '@fastgpt/service/support/permission/app/auth';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { rerankTrainDataGenerateQueue } from '@fastgpt/service/core/train/rerank/data/mq';
import { MongoRerankTrainset } from '@fastgpt/service/core/train/rerank/trainset/schema';
import { RerankTrainsetStatusEnum } from '@fastgpt/global/core/train/rerank/constants';
import { RerankTrainErrEnum } from '@fastgpt/global/common/error/code/train';
import { CommonErrEnum } from '@fastgpt/global/common/error/code/common';
import type {
  GenerateRerankTrainDataRequest,
  GenerateRerankTrainDataResponse
} from '@fastgpt/global/core/train/rerank/api';

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<GenerateRerankTrainDataResponse>
): Promise<GenerateRerankTrainDataResponse> {
  const { trainsetId, datasetIds, generateConfig } = req.body as GenerateRerankTrainDataRequest;

  if (!trainsetId) {
    return Promise.reject(CommonErrEnum.missingParams);
  }

  // 1. Authenticate trainset write permission
  const { trainset, teamId, tmbId } = await authRerankTrainset({
    req,
    authToken: true,
    trainsetId,
    per: WritePermissionVal
  });

  // Get app information for dataset extraction
  const { app } = await authApp({
    req,
    authToken: true,
    appId: String(trainset.appId),
    per: WritePermissionVal
  });

  // 2. Process dataset IDs
  let targetDatasetIds: string[];

  if (datasetIds?.length) {
    // User specified datasets, use them directly
    targetDatasetIds = datasetIds;
  } else {
    // User didn't specify, parse dataset IDs from app config using utility function
    const { extractDatasetIdsFromApp } = require('@fastgpt/service/core/train/rerank/utils');
    targetDatasetIds = extractDatasetIdsFromApp(app);
  }

  if (!targetDatasetIds.length) {
    return Promise.reject(RerankTrainErrEnum.noDatasetAvailable);
  }

  // 3. Authenticate dataset read permission
  await authGenerateFromDatasets({
    req,
    authToken: true,
    datasetIds: targetDatasetIds
  });

  // 4. Check status
  if (trainset.status === RerankTrainsetStatusEnum.generating) {
    return Promise.reject(RerankTrainErrEnum.trainsetGenerating);
  }

  // 5. Create async task
  const job = await rerankTrainDataGenerateQueue.add(`generate-${trainset._id}-${Date.now()}`, {
    appId: String(trainset.appId),
    trainsetId: String(trainset._id),
    datasetIds: targetDatasetIds,
    generateConfig // Pass config directly, defaults handled by controller and DiTing service
  });

  // 6. Save jobId to trainset for retry functionality
  await MongoRerankTrainset.updateOne({ _id: trainset._id }, { jobId: job.id as string });

  return {
    jobId: job.id as string,
    status: 'pending'
  };
}

export default NextAPI(handler);

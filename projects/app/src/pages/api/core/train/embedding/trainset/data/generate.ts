import type { NextApiRequest, NextApiResponse } from 'next';
import { NextAPI } from '@/service/middleware/entry';
import {
  authEmbeddingTrainset,
  authGenerateFromDatasets
} from '@fastgpt/service/support/permission/train/embedding/auth';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { embeddingTrainDataGenerateQueue } from '@fastgpt/service/core/train/embedding/data/mq';
import { MongoEmbeddingTrainset } from '@fastgpt/service/core/train/embedding/trainset/schema';
import { EmbeddingTrainsetStatusEnum } from '@fastgpt/global/core/train/embedding/constants';
import { EmbeddingTrainErrEnum } from '@fastgpt/global/common/error/code/train';
import { CommonErrEnum } from '@fastgpt/global/common/error/code/common';
import type {
  GenerateEmbeddingTrainDataRequest,
  GenerateEmbeddingTrainDataResponse
} from '@fastgpt/global/core/train/embedding/api';
import { addAuditLog } from '@fastgpt/service/support/user/audit/util';
import { AuditEventEnum } from '@fastgpt/global/support/user/audit/constants';

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<GenerateEmbeddingTrainDataResponse>
): Promise<GenerateEmbeddingTrainDataResponse> {
  const { trainsetId, datasetIds, generateConfig } = req.body as GenerateEmbeddingTrainDataRequest;

  if (!trainsetId) {
    return Promise.reject(CommonErrEnum.missingParams);
  }

  // datasetIds is required
  if (!datasetIds?.length) {
    return Promise.reject(CommonErrEnum.missingParams);
  }

  // 1. Verify write permission for the trainset
  const { trainset } = await authEmbeddingTrainset({
    req,
    authToken: true,
    authApiKey: true,
    trainsetId,
    per: WritePermissionVal
  });

  // 2. Verify read permission for each dataset
  await authGenerateFromDatasets({
    req,
    authToken: true,
    authApiKey: true,
    datasetIds
  });

  // 3. Reject if generation is already in progress
  if (trainset.status === EmbeddingTrainsetStatusEnum.generating) {
    return Promise.reject(EmbeddingTrainErrEnum.embeddingTrainsetGenerating);
  }

  // 4. Enqueue async generation job
  const job = await embeddingTrainDataGenerateQueue.add(`generate-${trainset._id}-${Date.now()}`, {
    trainsetId: String(trainset._id),
    datasetIds,
    generateConfig
  });

  // 5. Persist jobId on the trainset for retry support
  await MongoEmbeddingTrainset.updateOne({ _id: trainset._id }, { jobId: job.id as string });

  // 6. Audit log
  (async () => {
    addAuditLog({
      tmbId: trainset.tmbId,
      teamId: trainset.teamId,
      event: AuditEventEnum.GENERATE_EMBEDDING_TRAINSET_DATA,
      params: {
        trainsetName: trainset.name || String(trainset._id),
        datasetCount: datasetIds.length
      }
    });
  })();

  return {
    jobId: job.id as string,
    status: 'pending'
  };
}

export default NextAPI(handler);

import type { NextApiRequest, NextApiResponse } from 'next';
import { NextAPI } from '@/service/middleware/entry';
import {
  authEmbeddingTrainset,
  authGenerateFromDatasets
} from '@fastgpt/service/support/permission/train/embedding/auth';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { embeddingTrainDataGenerateQueue } from '@fastgpt/service/core/train/embedding/data/mq';
import { trainEnv } from '@fastgpt/service/core/train/common/env';
import { MongoEmbeddingTrainset } from '@fastgpt/service/core/train/embedding/trainset/schema';
import { EmbeddingTrainsetStatusEnum } from '@fastgpt/global/core/train/embedding/constants';
import { EmbeddingTrainErrEnum } from '@fastgpt/global/common/error/code/train';
import type {
  GenerateEmbeddingTrainDataRequest,
  GenerateEmbeddingTrainDataResponse
} from '@fastgpt/global/core/train/embedding/api';
import { addAuditLog } from '@fastgpt/service/support/user/audit/util';
import { AuditEventEnum } from '@fastgpt/global/support/user/audit/constants';
import { expandFolderDatasetIds } from '@fastgpt/service/core/dataset/controller';
import { validateDatasetTargetIndexes } from '@fastgpt/service/core/train/embedding/validation';

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<GenerateEmbeddingTrainDataResponse>
): Promise<GenerateEmbeddingTrainDataResponse> {
  const { trainsetId, datasetIds, generateConfig } = req.body as GenerateEmbeddingTrainDataRequest;

  if (!trainsetId) {
    return Promise.reject(EmbeddingTrainErrEnum.embeddingTrainsetNotExist);
  }

  // datasetIds is required
  if (!datasetIds?.length) {
    return Promise.reject(EmbeddingTrainErrEnum.embeddingValidationNoDatasetConfigured);
  }

  // 1. Verify write permission for the trainset
  const { trainset } = await authEmbeddingTrainset({
    req,
    authToken: true,
    authApiKey: true,
    trainsetId,
    per: WritePermissionVal
  });

  // 2. Expand folder-type datasets to their non-folder children
  const expandedDatasetIds = await expandFolderDatasetIds(trainset.teamId, datasetIds);
  if (!expandedDatasetIds.length) {
    return Promise.reject(EmbeddingTrainErrEnum.embeddingValidationNoDatasetConfigured);
  }

  // 3. Verify read permission for each dataset
  await authGenerateFromDatasets({
    req,
    authToken: true,
    authApiKey: true,
    datasetIds: expandedDatasetIds
  });

  // 4. Validate dataset indexes
  const normalizedGenerateConfig = {
    ...generateConfig,
    indexType: generateConfig?.indexType ?? trainEnv.TRAIN_INDEX_TYPE
  };
  await validateDatasetTargetIndexes(expandedDatasetIds, normalizedGenerateConfig.indexType);

  // 5. Reject if generation is already in progress
  if (trainset.status === EmbeddingTrainsetStatusEnum.generating) {
    return Promise.reject(EmbeddingTrainErrEnum.embeddingTrainsetGenerating);
  }

  // 5. Enqueue async generation job
  const job = await embeddingTrainDataGenerateQueue.add(`generate-${trainset._id}-${Date.now()}`, {
    trainsetId: String(trainset._id),
    datasetIds: expandedDatasetIds,
    generateConfig: normalizedGenerateConfig
  });

  // 6. Persist jobId on the trainset for retry support
  await MongoEmbeddingTrainset.updateOne({ _id: trainset._id }, { jobId: job.id as string });

  // 7. Audit log
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

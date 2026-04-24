import type { NextApiRequest, NextApiResponse } from 'next';
import { NextAPI } from '@/service/middleware/entry';
import {
  authRerankTrainset,
  authGenerateFromDatasets
} from '@fastgpt/service/support/permission/train/rerank/auth';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { rerankTrainDataGenerateQueue } from '@fastgpt/service/core/train/rerank/data/mq';
import { trainEnv } from '@fastgpt/service/core/train/common/env';
import { MongoRerankTrainset } from '@fastgpt/service/core/train/rerank/trainset/schema';
import { RerankTrainsetStatusEnum } from '@fastgpt/global/core/train/rerank/constants';
import { RerankTrainErrEnum } from '@fastgpt/global/common/error/code/train';
import type {
  GenerateRerankTrainDataRequest,
  GenerateRerankTrainDataResponse
} from '@fastgpt/global/core/train/rerank/api';
import { addAuditLog } from '@fastgpt/service/support/user/audit/util';
import { AuditEventEnum } from '@fastgpt/global/support/user/audit/constants';
import { expandFolderDatasetIds } from '@fastgpt/service/core/dataset/controller';
import { validateDatasetTargetIndexes } from '@fastgpt/service/core/train/rerank/validation';

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<GenerateRerankTrainDataResponse>
): Promise<GenerateRerankTrainDataResponse> {
  const { trainsetId, datasetIds, generateConfig } = req.body as GenerateRerankTrainDataRequest;

  if (!trainsetId) {
    return Promise.reject(RerankTrainErrEnum.rerankTrainsetNotExist);
  }

  if (!datasetIds?.length) {
    return Promise.reject(RerankTrainErrEnum.rerankValidationNoDatasetConfigured);
  }

  // 1. Verify write permission for the trainset
  const { trainset } = await authRerankTrainset({
    req,
    authToken: true,
    authApiKey: true,
    trainsetId,
    per: WritePermissionVal
  });

  // 2. Expand folder-type datasets to their non-folder children
  const expandedDatasetIds = await expandFolderDatasetIds(trainset.teamId, datasetIds);
  if (!expandedDatasetIds.length) {
    return Promise.reject(RerankTrainErrEnum.rerankValidationNoDatasetConfigured);
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
  if (trainset.status === RerankTrainsetStatusEnum.generating) {
    return Promise.reject(RerankTrainErrEnum.rerankTrainsetGenerating);
  }

  // 6. Enqueue async generation job
  const job = await rerankTrainDataGenerateQueue.add(`generate-${trainset._id}-${Date.now()}`, {
    trainsetId: String(trainset._id),
    datasetIds: expandedDatasetIds,
    generateConfig: normalizedGenerateConfig
  });

  // 7. Persist jobId on the trainset for retry support
  await MongoRerankTrainset.updateOne({ _id: trainset._id }, { jobId: job.id as string });

  // 8. Audit log
  (async () => {
    addAuditLog({
      tmbId: trainset.tmbId,
      teamId: trainset.teamId,
      event: AuditEventEnum.GENERATE_RERANK_TRAINSET_DATA,
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

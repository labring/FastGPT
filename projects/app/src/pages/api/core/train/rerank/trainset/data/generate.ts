import type { NextApiRequest, NextApiResponse } from 'next';
import { NextAPI } from '@/service/middleware/entry';
import {
  authRerankTrainset,
  authGenerateFromDatasets
} from '@fastgpt/service/support/permission/train/rerank/auth';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { rerankTrainDataGenerateQueue } from '@fastgpt/service/core/train/rerank/data/mq';
import { DEFAULT_TRAIN_INDEX_TYPE } from '@fastgpt/service/core/train/common/constants';
import { MongoRerankTrainset } from '@fastgpt/service/core/train/rerank/trainset/schema';
import { RerankTrainsetStatusEnum } from '@fastgpt/global/core/train/rerank/constants';
import { RerankTrainErrEnum } from '@fastgpt/global/common/error/code/train';
import { CommonErrEnum } from '@fastgpt/global/common/error/code/common';
import type {
  GenerateRerankTrainDataRequest,
  GenerateRerankTrainDataResponse
} from '@fastgpt/global/core/train/rerank/api';
import { addAuditLog } from '@fastgpt/service/support/user/audit/util';
import { AuditEventEnum } from '@fastgpt/global/support/user/audit/constants';

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<GenerateRerankTrainDataResponse>
): Promise<GenerateRerankTrainDataResponse> {
  const { trainsetId, datasetIds, generateConfig } = req.body as GenerateRerankTrainDataRequest;

  if (!trainsetId) {
    return Promise.reject(CommonErrEnum.missingParams);
  }

  if (!datasetIds?.length) {
    return Promise.reject(CommonErrEnum.missingParams);
  }

  // 1. Verify write permission for the trainset
  const { trainset } = await authRerankTrainset({
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
  if (trainset.status === RerankTrainsetStatusEnum.generating) {
    return Promise.reject(RerankTrainErrEnum.rerankTrainsetGenerating);
  }

  // 4. Enqueue async generation job
  const job = await rerankTrainDataGenerateQueue.add(`generate-${trainset._id}-${Date.now()}`, {
    trainsetId: String(trainset._id),
    datasetIds,
    generateConfig: {
      ...generateConfig,
      indexType: generateConfig?.indexType ?? DEFAULT_TRAIN_INDEX_TYPE
    }
  });

  // 5. Persist jobId on the trainset for retry support
  await MongoRerankTrainset.updateOne({ _id: trainset._id }, { jobId: job.id as string });

  // 6. Audit log
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

import type { NextApiRequest, NextApiResponse } from 'next';
import { NextAPI } from '@/service/middleware/entry';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { WritePermissionVal, ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { createRerankTrainTask } from '@fastgpt/service/core/train/rerank/task/controller';
import {
  validateTrainingEnvironment,
  validateDatasetTargetIndexes
} from '@fastgpt/service/core/train/rerank/validation';
import { DEFAULT_TRAIN_INDEX_TYPE } from '@fastgpt/service/core/train/common/constants';
import { MongoRerankTrainTask } from '@fastgpt/service/core/train/rerank/task/schema';
import { authRerankTrainset } from '@fastgpt/service/support/permission/train/rerank/auth';
import { authEvalDataset } from '@fastgpt/service/support/permission/evaluation/auth';
import { rerankTrainTaskQueue } from '@fastgpt/service/core/train/rerank/task/mq';
import { RerankTrainErrEnum } from '@fastgpt/global/common/error/code/train';
import type {
  CreateRerankTrainTaskRequest,
  CreateRerankTrainTaskResponse
} from '@fastgpt/global/core/train/rerank/api';
import { addAuditLog } from '@fastgpt/service/support/user/audit/util';
import { AuditEventEnum } from '@fastgpt/global/support/user/audit/constants';
import { expandFolderDatasetIds } from '@fastgpt/service/core/dataset/controller';

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<CreateRerankTrainTaskResponse>
): Promise<CreateRerankTrainTaskResponse> {
  const {
    baseModelId,
    trainsetId,
    evalDatasetId,
    datasetIds,
    newModelName,
    name,
    trainMethod,
    generateConfig
  } = req.body as CreateRerankTrainTaskRequest;

  if (!baseModelId) {
    return Promise.reject(RerankTrainErrEnum.rerankValidationBaseModelNotConfigured);
  }
  if (!datasetIds?.length) {
    return Promise.reject(RerankTrainErrEnum.rerankValidationNoDatasetConfigured);
  }

  // 1. Authenticate user permission (team-level)
  const { teamId, tmbId } = await authUserPer({
    req,
    authToken: true,
    authApiKey: true,
    per: WritePermissionVal
  });

  // 2. Validate training environment (SFT Bridge and DiTing availability)
  await validateTrainingEnvironment();

  // 3. Expand folder-type datasets to their non-folder children
  const expandedDatasetIds = await expandFolderDatasetIds(teamId, datasetIds);
  if (!expandedDatasetIds.length) {
    return Promise.reject(RerankTrainErrEnum.rerankValidationNoDatasetConfigured);
  }

  // 4. Validate existence and team ownership of referenced resources
  if (trainsetId) {
    // Exact mode: verify trainset exists and belongs to the current team
    await authRerankTrainset({
      req,
      authToken: true,
      authApiKey: true,
      trainsetId,
      per: ReadPermissionVal
    });
  }

  if (evalDatasetId) {
    // Exact mode: verify eval dataset exists and belongs to the current team
    await authEvalDataset({
      req,
      authToken: true,
      datasetId: evalDatasetId,
      per: ReadPermissionVal
    });
  }

  // Step 1: Auto mode without generateConfig → build default
  let normalizedGenerateConfig = generateConfig;
  if (!normalizedGenerateConfig && !trainsetId) {
    normalizedGenerateConfig = { indexType: DEFAULT_TRAIN_INDEX_TYPE };
  }
  // Step 2: Validate dataset indexes whenever generateConfig is present
  if (normalizedGenerateConfig) {
    await validateDatasetTargetIndexes(expandedDatasetIds, normalizedGenerateConfig.indexType);
  }

  // 5. Create task (controller checks for existing running tasks internally)
  const task = await createRerankTrainTask({
    baseModelId,
    trainsetId,
    evalDatasetId,
    datasetIds: expandedDatasetIds,
    newModelName,
    teamId,
    tmbId,
    name,
    trainMethod,
    generateConfig: normalizedGenerateConfig
  });
  const taskId = String(task._id);

  // 6. Enqueue the task
  const job = await rerankTrainTaskQueue.add(
    `train-${taskId}`,
    { taskId },
    {
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 }
    }
  );

  // 7. Persist jobId for later retry/status tracking
  await MongoRerankTrainTask.updateOne({ _id: taskId }, { jobId: job.id as string });

  // 8. Audit log
  (async () => {
    addAuditLog({
      tmbId,
      teamId,
      event: AuditEventEnum.CREATE_RERANK_TRAIN_TASK,
      params: { taskName: name || taskId, baseModelId }
    });
  })();

  return task;
}

export default NextAPI(handler);

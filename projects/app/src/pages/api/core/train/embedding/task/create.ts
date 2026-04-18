import type { NextApiRequest, NextApiResponse } from 'next';
import { NextAPI } from '@/service/middleware/entry';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { WritePermissionVal, ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { createEmbeddingTrainTask } from '@fastgpt/service/core/train/embedding/task/controller';
import {
  validateTrainingEnvironment,
  validateDatasetSynthesisIndexes
} from '@fastgpt/service/core/train/embedding/validation';
import { MongoEmbeddingTrainTask } from '@fastgpt/service/core/train/embedding/task/schema';
import { authEmbeddingTrainset } from '@fastgpt/service/support/permission/train/embedding/auth';
import { authEvalDataset } from '@fastgpt/service/support/permission/evaluation/auth';
import { embeddingTrainTaskQueue } from '@fastgpt/service/core/train/embedding/task/mq';
import { EmbeddingTrainErrEnum } from '@fastgpt/global/common/error/code/train';
import type {
  CreateEmbeddingTrainTaskRequest,
  CreateEmbeddingTrainTaskResponse
} from '@fastgpt/global/core/train/embedding/api';
import { addAuditLog } from '@fastgpt/service/support/user/audit/util';
import { AuditEventEnum } from '@fastgpt/global/support/user/audit/constants';
import { expandFolderDatasetIds } from '@fastgpt/service/core/dataset/controller';

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<CreateEmbeddingTrainTaskResponse>
): Promise<CreateEmbeddingTrainTaskResponse> {
  const { baseModelId, trainsetId, evalDatasetId, datasetIds, newModelName, name, trainType } =
    req.body as CreateEmbeddingTrainTaskRequest;

  if (!baseModelId) {
    return Promise.reject(EmbeddingTrainErrEnum.embeddingValidationBaseModelNotConfigured);
  }
  if (!datasetIds?.length) {
    return Promise.reject(EmbeddingTrainErrEnum.embeddingValidationNoDatasetConfigured);
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
    return Promise.reject(EmbeddingTrainErrEnum.embeddingValidationNoDatasetConfigured);
  }

  // 4. Validate existence and team ownership of referenced resources
  if (trainsetId) {
    // Exact mode: verify trainset exists and belongs to the current team
    await authEmbeddingTrainset({
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

  // Verify dataset synthesis indexes are ready
  await validateDatasetSynthesisIndexes(expandedDatasetIds);

  // 5. Create task (controller checks for existing running tasks internally)
  const task = await createEmbeddingTrainTask({
    baseModelId,
    trainsetId,
    evalDatasetId,
    datasetIds: expandedDatasetIds,
    newModelName,
    teamId,
    tmbId,
    name,
    trainType
  });
  const taskId = String(task._id);

  // 6. Enqueue the task
  const job = await embeddingTrainTaskQueue.add(
    `train-${taskId}`,
    { taskId },
    {
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 }
    }
  );

  // 7. Persist jobId for later retry/status tracking
  await MongoEmbeddingTrainTask.updateOne({ _id: taskId }, { jobId: job.id as string });

  // 8. Audit log
  (async () => {
    addAuditLog({
      tmbId,
      teamId,
      event: AuditEventEnum.CREATE_EMBEDDING_TRAIN_TASK,
      params: { taskName: name || taskId, baseModelId }
    });
  })();

  return task;
}

export default NextAPI(handler);

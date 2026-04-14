import type { NextApiRequest, NextApiResponse } from 'next';
import { NextAPI } from '@/service/middleware/entry';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { WritePermissionVal, ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { createRerankTrainTask } from '@fastgpt/service/core/train/rerank/task/controller';
import {
  validateTrainingEnvironment,
  validateDatasetSynthesisIndexes
} from '@fastgpt/service/core/train/rerank/validation';
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

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<CreateRerankTrainTaskResponse>
): Promise<CreateRerankTrainTaskResponse> {
  const { baseModelId, trainsetId, evalDatasetId, datasetIds, newModelName, name, trainType } =
    req.body as CreateRerankTrainTaskRequest;

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

  // 3. Validate existence and team ownership of referenced resources
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

  // Verify dataset synthesis indexes are ready
  await validateDatasetSynthesisIndexes(datasetIds);

  // 4. Create task (controller checks for existing running tasks internally)
  const task = await createRerankTrainTask({
    baseModelId,
    trainsetId,
    evalDatasetId,
    datasetIds,
    newModelName,
    teamId,
    tmbId,
    name,
    trainType
  });
  const taskId = String(task._id);

  // 5. Enqueue the task
  const job = await rerankTrainTaskQueue.add(
    `train-${taskId}`,
    { taskId },
    {
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 }
    }
  );

  // 6. Persist jobId for later retry/status tracking
  await MongoRerankTrainTask.updateOne({ _id: taskId }, { jobId: job.id as string });

  // 7. Audit log
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

import type { NextApiRequest, NextApiResponse } from 'next';
import { NextAPI } from '@/service/middleware/entry';
import { authRerankTrainTask } from '@fastgpt/service/support/permission/train/rerank/auth';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { addLog } from '@fastgpt/service/common/system/log';
import { RerankTrainTaskStatusEnum } from '@fastgpt/global/core/train/rerank/constants';
import { RerankTrainErrEnum } from '@fastgpt/global/common/error/code/train';
import { CommonErrEnum } from '@fastgpt/global/common/error/code/common';
import type {
  ApplyRerankTrainTaskRequest,
  ApplyRerankTrainTaskResponse
} from '@fastgpt/global/core/train/rerank/api';
import {
  enableRerankModel,
  disableRerankModel,
  replaceRerankModelInApps
} from '@fastgpt/service/core/train/rerank/model/controller';
import { isTunedModel } from '@fastgpt/service/core/train/rerank/task/helpers/model';
import { MongoSystemModel } from '@fastgpt/service/core/ai/config/schema';
import { MongoRerankTrainTask } from '@fastgpt/service/core/train/rerank/task/schema';
import { addAuditLog } from '@fastgpt/service/support/user/audit/util';
import { AuditEventEnum } from '@fastgpt/global/support/user/audit/constants';

/**
 * @deprecated This API endpoint has been deprecated.
 * Trained models are now applied to apps via separate manual workflows.
 * This handler is kept for reference only.
 *
 * Find the currently active model in the training chain, starting from tunedModelId
 * and walking up through baseModelId links.
 *
 * Returns the first model in the chain (excluding tunedModelId itself) whose
 * isActive is not explicitly false — i.e. the model currently serving traffic.
 */
async function findBestModelInChain(
  tunedModelId: string,
  teamId: string
): Promise<string | undefined> {
  const visited = new Set<string>();
  let currentModelId = tunedModelId;
  const MAX_DEPTH = 100;
  let depth = 0;

  while (depth < MAX_DEPTH) {
    if (visited.has(currentModelId)) break;
    visited.add(currentModelId);

    const task = await MongoRerankTrainTask.findOne(
      {
        teamId,
        'checkpoint.data.registering.tunedModelId': currentModelId
      },
      'baseModelId'
    ).lean();

    if (!task) break;

    const baseModelId = task.baseModelId;

    const dbModel = await MongoSystemModel.findOne({ model: baseModelId }, 'metadata').lean();
    if (dbModel?.metadata?.isActive !== false) {
      return baseModelId;
    }

    currentModelId = baseModelId;
    depth++;
  }

  return undefined;
}

/** @deprecated This API endpoint has been deprecated. See apply-task.ts file header. */
async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ApplyRerankTrainTaskResponse>
): Promise<ApplyRerankTrainTaskResponse> {
  const { taskId } = req.body as ApplyRerankTrainTaskRequest;

  if (!taskId) {
    return Promise.reject(CommonErrEnum.missingParams);
  }

  const { task, teamId, tmbId } = await authRerankTrainTask({
    req,
    authToken: true,
    authApiKey: true,
    taskId,
    per: WritePermissionVal
  });

  if (task.status !== RerankTrainTaskStatusEnum.completed) {
    return Promise.reject(RerankTrainErrEnum.taskNotCompleted);
  }

  const tunedModelId =
    task.result?.tunedModelId ?? task.checkpoint?.data?.registering?.tunedModelId;
  if (!tunedModelId) {
    return Promise.reject(RerankTrainErrEnum.tunedModelNotFound);
  }

  // 1. Enable tunedModel if currently disabled
  const tunedDbModel = await MongoSystemModel.findOne({ model: tunedModelId }, 'metadata').lean();
  if (tunedDbModel?.metadata?.isActive === false) {
    addLog.info('apply-task: enabling disabled tuned model', { tunedModelId });
    await enableRerankModel(tunedModelId);
  }

  // 2. Find the currently active best model in the training chain
  const bestModelId = await findBestModelInChain(tunedModelId, teamId);

  addLog.info('apply-task: resolved best model in chain', { tunedModelId, bestModelId });

  let updatedAppsCount = 0;

  if (bestModelId && bestModelId !== tunedModelId) {
    // 3. Replace bestModel references in all team Apps with tunedModel
    updatedAppsCount = await replaceRerankModelInApps(
      bestModelId,
      tunedModelId,
      teamId,
      tmbId,
      'Apply rerank model'
    );

    // 4. Disable bestModel only if it's a tuned model (never disable original base models)
    if (isTunedModel(bestModelId)) {
      addLog.info('apply-task: disabling superseded best model', { bestModelId });
      await disableRerankModel(bestModelId);
    }
  }

  (async () => {
    addAuditLog({
      tmbId,
      teamId,
      event: AuditEventEnum.APPLY_RERANK_TRAIN_TASK_TO_APPS,
      params: { taskName: task.name || taskId, appCount: updatedAppsCount, tunedModelId }
    });
  })();

  return { tunedModelId, bestModelId, updatedAppsCount };
}

export default NextAPI(handler);

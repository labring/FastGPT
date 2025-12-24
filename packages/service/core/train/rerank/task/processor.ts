import type { Processor } from 'bullmq';
import { UnrecoverableError } from 'bullmq';
import type { RerankTrainTaskJobData } from './mq';
import { MongoRerankTrainTask } from './schema';
import {
  getRerankTrainTask,
  updateTaskStatus,
  updateCheckpointStage,
  updateCheckpointData
} from './controller';
import {
  RerankTrainTaskStatusEnum,
  RerankTaskCheckpointStageEnum
} from '@fastgpt/global/core/train/rerank/constants';
import { addLog } from '../../../../common/system/log';

import { runPrepareStage } from './stages/prepare';
import { runFinetuneStage } from './stages/finetune';
import { runRegisterStage } from './stages/register';
import { runApplyingStage } from './stages/apply';
import {
  runGenerateEvalDataset,
  runEvaluateBaseModel,
  runEvaluateTunedModel
} from './stages/evaluate';
import { MongoRerankTrainset } from '../trainset/schema';
import { RerankTrainsetStatusEnum } from '@fastgpt/global/core/train/rerank/constants';
import { RerankTrainErrEnum } from '@fastgpt/global/common/error/code/train';
import { calculateTrainsetStats } from '../data/controller';

/**
 * Poll and wait for trainset to be ready
 * Moved from API handler to avoid blocking the main thread
 * @param trainsetId Trainset ID
 * @param maxAttempts Max polling attempts (default: 120 for 10 minutes)
 * @param interval Polling interval in ms (default: 5000ms = 5s)
 */
async function waitForTrainsetReady(
  trainsetId: string,
  maxAttempts: number = 120,
  interval: number = 5000
): Promise<void> {
  let attempts = 0;

  addLog.info('Waiting for trainset to be ready', {
    trainsetId,
    maxAttempts,
    interval
  });

  while (attempts < maxAttempts) {
    const trainset = await MongoRerankTrainset.findById(trainsetId).lean();

    if (!trainset) {
      throw new UnrecoverableError(RerankTrainErrEnum.trainsetNotExist);
    }

    // If ready, validate data count and return successfully
    if (trainset.status === RerankTrainsetStatusEnum.ready) {
      const stats = await calculateTrainsetStats(String(trainset._id));
      if (stats.dataCount === 0) {
        addLog.error('No train data available in trainset', { trainsetId });
        throw new UnrecoverableError(RerankTrainErrEnum.noTrainDataAvailable);
      }
      addLog.info('Trainset is ready', { trainsetId, dataCount: stats.dataCount });
      return;
    }

    // If error, throw unrecoverable error
    if (trainset.status === RerankTrainsetStatusEnum.error) {
      const errorMsg = trainset.errorMsg || 'Trainset generation failed';
      addLog.error('Trainset generation failed', { trainsetId, errorMsg });
      throw new UnrecoverableError(RerankTrainErrEnum.trainsetGenerationFailed);
    }

    // If still generating or pending, continue waiting
    if (
      trainset.status === RerankTrainsetStatusEnum.generating ||
      trainset.status === RerankTrainsetStatusEnum.pending
    ) {
      addLog.info('Trainset still generating', {
        trainsetId,
        status: trainset.status,
        attempt: attempts + 1,
        maxAttempts
      });
      await new Promise((resolve) => setTimeout(resolve, interval));
      attempts++;
      continue;
    }

    // Unknown status, continue waiting
    await new Promise((resolve) => setTimeout(resolve, interval));
    attempts++;
  }

  // Timeout
  addLog.error('Trainset generation timeout', { trainsetId, maxAttempts });
  throw new UnrecoverableError(RerankTrainErrEnum.trainsetGenerationFailed);
}

/**
 * Rerank training task processor
 *
 * Executes complete rerank model training pipeline:
 * 0. Waiting - Wait for trainset generation to complete
 * 1. Preparing - Data preparation
 * 2. Finetuning - Model finetuning (AICP)
 * 3. Registering - Model registration
 * 4. Evaluating - Performance evaluation
 * 5. Applying - Apply trained model to app workflow
 */
export const rerankTrainTaskProcessor: Processor<RerankTrainTaskJobData> = async (job) => {
  const { taskId } = job.data;

  const task = await getRerankTrainTask(taskId);
  if (!task) {
    throw new UnrecoverableError('Task not found');
  }

  const currentStage = task.checkpoint.stage;

  addLog.info('Task execution started', {
    taskId,
    attemptsMade: job.attemptsMade,
    checkpointStage: task.checkpoint.stage,
    currentStage,
    totalAttempts: job.opts.attempts
  });

  try {
    if (task.status === RerankTrainTaskStatusEnum.pending) {
      await updateTaskStatus(taskId, RerankTrainTaskStatusEnum.running);
    }

    // Wait for trainset to be ready before starting prepare stage
    // This was moved from the API handler to avoid blocking the main thread
    if (!currentStage || currentStage === null) {
      await waitForTrainsetReady(task.trainsetId);
    }

    if (shouldRunStage(currentStage, RerankTaskCheckpointStageEnum.preparing)) {
      const prepareResult = await runPrepareStage(task);
      await updateCheckpointData(taskId, 'preparing', {
        trainDatasetId: prepareResult.trainDatasetId,
        trainDatasetFilePath: prepareResult.trainDatasetFilePath
      });
      await updateCheckpointStage(taskId, RerankTaskCheckpointStageEnum.preparing);
    }

    if (shouldRunStage(currentStage, RerankTaskCheckpointStageEnum.finetuning)) {
      const taskAfterPrepare = await getRerankTrainTask(taskId);
      if (!taskAfterPrepare) {
        throw new UnrecoverableError('Task not found after preparing stage');
      }

      const finetuneResult = await runFinetuneStage(taskAfterPrepare);
      await updateCheckpointData(taskId, 'finetuning', {
        aicpTaskId: finetuneResult.aicpTaskId,
        tunedModelEndpoint: finetuneResult.tunedModelEndpoint
      });
      await updateCheckpointStage(taskId, RerankTaskCheckpointStageEnum.finetuning);
    }

    if (shouldRunStage(currentStage, RerankTaskCheckpointStageEnum.registering)) {
      const taskAfterFinetune = await getRerankTrainTask(taskId);
      if (!taskAfterFinetune) {
        throw new UnrecoverableError('Task not found after finetuning stage');
      }

      const registerResult = await runRegisterStage(taskAfterFinetune);
      await updateCheckpointData(taskId, 'registering', {
        tunedModelConfigId: registerResult.tunedModelConfigId
      });
      await updateCheckpointStage(taskId, RerankTaskCheckpointStageEnum.registering);
    }

    if (shouldRunStage(currentStage, RerankTaskCheckpointStageEnum.evaluating)) {
      const updatedTask = await getRerankTrainTask(taskId);
      if (!updatedTask) {
        throw new UnrecoverableError('Task not found after checkpoint update');
      }

      const checkpointData = updatedTask.checkpoint.data || {};
      const evaluatingData = checkpointData.evaluating || {};

      if (!checkpointData.registering?.tunedModelConfigId) {
        throw new UnrecoverableError('Tuned model config ID not found in checkpoint');
      }

      if (!evaluatingData.evalDatasetId) {
        const evalDatasetId = await runGenerateEvalDataset(updatedTask);
        await updateCheckpointData(taskId, 'evaluating', { evalDatasetId: evalDatasetId }, true);
      }

      const taskAfterEvalDataset = await getRerankTrainTask(taskId);
      if (!taskAfterEvalDataset) {
        throw new UnrecoverableError('Task not found');
      }
      const evalData = taskAfterEvalDataset.checkpoint.data?.evaluating || {};

      if (!evalData.baseModelEvalResult) {
        const baseModelEvalResult = await runEvaluateBaseModel(
          taskId,
          evalData.evalDatasetId!,
          taskAfterEvalDataset.baseModelConfigId
        );
        await updateCheckpointData(taskId, 'evaluating', { baseModelEvalResult }, true);
      }

      if (!evalData.tunedModelEvalResult) {
        const taskCheckpointData = taskAfterEvalDataset.checkpoint.data || {};
        const tunedModelEvalResult = await runEvaluateTunedModel(
          taskId,
          evalData.evalDatasetId!,
          taskCheckpointData.registering?.tunedModelConfigId!
        );
        await updateCheckpointData(taskId, 'evaluating', { tunedModelEvalResult }, true);
      }

      await updateCheckpointStage(taskId, RerankTaskCheckpointStageEnum.evaluating);
    }

    if (shouldRunStage(currentStage, RerankTaskCheckpointStageEnum.applying)) {
      const updatedTask = await getRerankTrainTask(taskId);
      if (!updatedTask) {
        throw new UnrecoverableError('Task not found after evaluating stage');
      }

      const applyResult = await runApplyingStage(updatedTask);
      await updateCheckpointData(taskId, 'applying', {
        versionId: applyResult.versionId,
        versionName: applyResult.versionName,
        previousModelConfigId: applyResult.previousModelConfigId,
        updatedNodesCount: applyResult.updatedNodesCount
      });
      await updateCheckpointStage(taskId, RerankTaskCheckpointStageEnum.applying);
    }

    const finalTask = await getRerankTrainTask(taskId);
    if (!finalTask) {
      throw new UnrecoverableError('Task not found');
    }
    const finalCheckpoint = finalTask.checkpoint.data || {};
    await MongoRerankTrainTask.updateOne(
      { _id: taskId },
      {
        result: {
          trainDatasetId: finalCheckpoint.preparing?.trainDatasetId || '',
          trainDatasetFilePath: finalCheckpoint.preparing?.trainDatasetFilePath || '',
          tunedModelConfigId: finalCheckpoint.registering?.tunedModelConfigId || '',
          evalDatasetId: finalCheckpoint.evaluating?.evalDatasetId!,
          baseModelEvalResult: finalCheckpoint.evaluating?.baseModelEvalResult!,
          tunedModelEvalResult: finalCheckpoint.evaluating?.tunedModelEvalResult!,
          versionId: finalCheckpoint.applying?.versionId || '',
          versionName: finalCheckpoint.applying?.versionName || '',
          previousModelConfigId: finalCheckpoint.applying?.previousModelConfigId || '',
          updatedNodesCount: finalCheckpoint.applying?.updatedNodesCount || 0
        }
      }
    );

    await updateTaskStatus(taskId, RerankTrainTaskStatusEnum.completed);

    addLog.info('Rerank train task completed', { taskId });
  } catch (error) {
    addLog.error('Rerank train task failed', error);
    throw error;
  }
};

/**
 * Determine whether to run a stage (skip completed stages, run remaining stages)
 */
function shouldRunStage(
  currentStage: `${RerankTaskCheckpointStageEnum}` | null,
  targetStage: `${RerankTaskCheckpointStageEnum}`
): boolean {
  if (currentStage === null) return true;

  const stageOrder: RerankTaskCheckpointStageEnum[] = [
    RerankTaskCheckpointStageEnum.preparing,
    RerankTaskCheckpointStageEnum.finetuning,
    RerankTaskCheckpointStageEnum.registering,
    RerankTaskCheckpointStageEnum.evaluating,
    RerankTaskCheckpointStageEnum.applying
  ];

  const currentStageEnum = currentStage as RerankTaskCheckpointStageEnum;
  const targetStageEnum = targetStage as RerankTaskCheckpointStageEnum;

  return stageOrder.indexOf(targetStageEnum) > stageOrder.indexOf(currentStageEnum);
}

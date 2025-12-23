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

/**
 * Rerank training task processor
 *
 * Executes complete rerank model training pipeline:
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

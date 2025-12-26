import type { Processor } from 'bullmq';
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
import type { RerankEvalResult } from '@fastgpt/global/core/train/rerank/type';

import { runPrepareStage } from './stages/prepare';
import { runFinetuneStage } from './stages/finetune';
import { runRegisterStage } from './stages/register';
import { runApplyingStage } from './stages/apply';
import {
  runGenerateEvalDataset,
  runEvaluateBaseModel,
  runEvaluateTunedModel
} from './stages/evaluate';
import { TrainTaskErrorType } from '@fastgpt/global/core/train/rerank/error';
import { createEnhancedError } from '../utils';
import { deleteRerankModelConfig } from '../model/controller';
import { isTunedModel } from './helpers/model';
import { TrainTaskUnrecoverableError } from './errors';

/**
 * Compare evaluation performance between base model and tuned model
 * Both overall_mrr and overall_precision must be better for the tuned model
 * @param baseModelResult Base model (previous tuned model) evaluation result
 * @param tunedModelResult New tuned model evaluation result
 * @returns true if tuned model performs better than base model in BOTH overall_mrr and overall_precision
 */
function compareEvalPerformance(
  baseModelResult: RerankEvalResult | null | undefined,
  tunedModelResult: RerankEvalResult | null | undefined
): boolean {
  if (!baseModelResult || !tunedModelResult) {
    addLog.warn('Cannot compare evaluation performance: missing evaluation results', {
      hasBaseResult: !!baseModelResult,
      hasTunedResult: !!tunedModelResult
    });
    return false;
  }

  const baseDetails = baseModelResult.detailed_results;
  const tunedDetails = tunedModelResult.detailed_results;

  if (!baseDetails || !tunedDetails) {
    addLog.warn('Cannot compare evaluation performance: missing detailed results', {
      hasBaseDetails: !!baseDetails,
      hasTunedDetails: !!tunedDetails
    });
    return false;
  }

  const baseMRR = baseDetails.overall_mrr;
  const tunedMRR = tunedDetails.overall_mrr;
  const basePrecision = baseDetails.overall_precision;
  const tunedPrecision = tunedDetails.overall_precision;

  // If any required metric is missing, conservatively keep the previous model
  if (
    baseMRR === undefined ||
    tunedMRR === undefined ||
    basePrecision === undefined ||
    tunedPrecision === undefined
  ) {
    addLog.warn('Cannot compare evaluation performance: missing required metrics', {
      hasBaseMRR: baseMRR !== undefined,
      hasTunedMRR: tunedMRR !== undefined,
      hasBasePrecision: basePrecision !== undefined,
      hasTunedPrecision: tunedPrecision !== undefined
    });
    return false;
  }

  // Both overall_mrr and overall_precision must be better (higher is better for both metrics)
  const mrrImproved = tunedMRR > baseMRR;
  const precisionImproved = tunedPrecision > basePrecision;

  addLog.info('Evaluation performance comparison', {
    baseMRR,
    tunedMRR,
    mrrImproved,
    basePrecision,
    tunedPrecision,
    precisionImproved,
    bothImproved: mrrImproved && precisionImproved
  });

  return mrrImproved && precisionImproved;
}

/**
 * Rerank training task processor
 *
 * Executes complete rerank model training pipeline:
 * 1. Preparing - Data preparation (includes waiting for trainset to be ready)
 * 2. Finetuning - Model finetuning
 * 3. Registering - Model registration
 * 4. Evaluating - Performance evaluation
 * 5. Applying - Apply trained model to app workflow
 */
export const rerankTrainTaskProcessor: Processor<RerankTrainTaskJobData> = async (job) => {
  const { taskId } = job.data;

  const task = await getRerankTrainTask(taskId);
  if (!task) {
    const enhancedError = createEnhancedError(
      null,
      TrainTaskErrorType.INTERNAL_ERROR,
      'Training task not found or has been deleted',
      'Please check if the task ID is correct'
    );
    throw new TrainTaskUnrecoverableError(enhancedError);
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
        const enhancedError = createEnhancedError(
          RerankTaskCheckpointStageEnum.finetuning,
          TrainTaskErrorType.INTERNAL_ERROR,
          'Task not found after data preparation completed',
          'This may be a system error, please contact administrator'
        );
        throw new TrainTaskUnrecoverableError(enhancedError);
      }

      const finetuneResult = await runFinetuneStage(taskAfterPrepare);
      await updateCheckpointData(taskId, 'finetuning', {
        sftTaskId: finetuneResult.sftTaskId,
        tunedModelEndpoint: finetuneResult.tunedModelEndpoint
      });
      await updateCheckpointStage(taskId, RerankTaskCheckpointStageEnum.finetuning);
    }

    if (shouldRunStage(currentStage, RerankTaskCheckpointStageEnum.registering)) {
      const taskAfterFinetune = await getRerankTrainTask(taskId);
      if (!taskAfterFinetune) {
        const enhancedError = createEnhancedError(
          RerankTaskCheckpointStageEnum.registering,
          TrainTaskErrorType.INTERNAL_ERROR,
          'Task not found after model finetuning completed',
          'This may be a system error, please contact administrator'
        );
        throw new TrainTaskUnrecoverableError(enhancedError);
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
        const enhancedError = createEnhancedError(
          RerankTaskCheckpointStageEnum.evaluating,
          TrainTaskErrorType.INTERNAL_ERROR,
          'Task not found after checkpoint update',
          'This may be a system error, please contact administrator'
        );
        throw new TrainTaskUnrecoverableError(enhancedError);
      }

      const checkpointData = updatedTask.checkpoint.data || {};
      const evaluatingData = checkpointData.evaluating || {};

      if (!checkpointData.registering?.tunedModelConfigId) {
        const enhancedError = createEnhancedError(
          RerankTaskCheckpointStageEnum.evaluating,
          TrainTaskErrorType.MODEL_CONFIG_INVALID,
          'Tuned model config ID not found in checkpoint',
          'Please check if model registration stage completed correctly'
        );
        throw new TrainTaskUnrecoverableError(enhancedError);
      }

      if (!evaluatingData.evalDatasetId) {
        const evalDatasetId = await runGenerateEvalDataset(updatedTask);
        await updateCheckpointData(taskId, 'evaluating', { evalDatasetId: evalDatasetId }, true);
      }

      const taskAfterEvalDataset = await getRerankTrainTask(taskId);
      if (!taskAfterEvalDataset) {
        const enhancedError = createEnhancedError(
          RerankTaskCheckpointStageEnum.evaluating,
          TrainTaskErrorType.INTERNAL_ERROR,
          'Task not found after evaluation dataset generation',
          'This may be a system error, please contact administrator'
        );
        throw new TrainTaskUnrecoverableError(enhancedError);
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
        const enhancedError = createEnhancedError(
          RerankTaskCheckpointStageEnum.applying,
          TrainTaskErrorType.INTERNAL_ERROR,
          'Task not found after evaluation completed',
          'This may be a system error, please contact administrator'
        );
        throw new TrainTaskUnrecoverableError(enhancedError);
      }

      const applyResult = await runApplyingStage(updatedTask);
      await updateCheckpointData(taskId, 'applying', {
        versionId: applyResult.versionId,
        versionName: applyResult.versionName,
        previousModelConfigId: applyResult.previousModelConfigId,
        previousTaskId: applyResult.previousTaskId,
        updatedNodesCount: applyResult.updatedNodesCount
      });
      await updateCheckpointStage(taskId, RerankTaskCheckpointStageEnum.applying);
    }

    const finalTask = await getRerankTrainTask(taskId);
    if (!finalTask) {
      const enhancedError = createEnhancedError(
        null,
        TrainTaskErrorType.INTERNAL_ERROR,
        'Task not found after all stages completed',
        'This may be a system error, please contact administrator'
      );
      throw new TrainTaskUnrecoverableError(enhancedError);
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
          previousTaskId: finalCheckpoint.applying?.previousTaskId || '',
          updatedNodesCount: finalCheckpoint.applying?.updatedNodesCount || 0
        }
      }
    );

    await updateTaskStatus(taskId, RerankTrainTaskStatusEnum.completed);

    // Optimization 2: Auto-delete previous tuned model that is no longer in use
    // This runs after the new tuned model has been successfully deployed to the app
    const previousModelConfigId = finalCheckpoint.applying?.previousModelConfigId;
    const previousTaskId = finalCheckpoint.applying?.previousTaskId;
    const tunedModelConfigId = finalCheckpoint.registering?.tunedModelConfigId;
    const baseModelEvalResult = finalCheckpoint.evaluating?.baseModelEvalResult;
    const tunedModelEvalResult = finalCheckpoint.evaluating?.tunedModelEvalResult;

    // Delete the previous model if all conditions are met:
    // 1. It exists (app was using a model before)
    // 2. It's a fine-tuned model created by training module (not a base model or manually created custom model)
    // 3. Previous model is different from new tuned model (avoid self-deletion in in-place replacement scenarios)
    // 4. New model performs better than previous model (based on evaluation metrics)
    if (
      previousModelConfigId &&
      isTunedModel(previousModelConfigId) &&
      previousModelConfigId !== tunedModelConfigId
    ) {
      // Compare evaluation performance (baseModelEvalResult is the previous tuned model's result)
      const shouldDelete = compareEvalPerformance(baseModelEvalResult, tunedModelEvalResult);

      if (shouldDelete) {
        addLog.info('Deleting previous tuned model (new model performs better)', {
          taskId,
          previousModelConfigId,
          previousTaskId,
          baseModelMRR: baseModelEvalResult?.detailed_results?.overall_mrr,
          baseModelPrecision: baseModelEvalResult?.detailed_results?.overall_precision,
          tunedModelMRR: tunedModelEvalResult?.detailed_results?.overall_mrr,
          tunedModelPrecision: tunedModelEvalResult?.detailed_results?.overall_precision
        });

        try {
          // Query previous task to get sftTaskId if previousTaskId is available
          let previousSftTaskId: string | undefined;
          if (previousTaskId) {
            const previousTask = await MongoRerankTrainTask.findById(
              previousTaskId,
              'checkpoint'
            ).lean();
            previousSftTaskId = previousTask?.checkpoint?.data?.finetuning?.sftTaskId;
            addLog.info('Found previous task sftTaskId', {
              taskId,
              previousTaskId,
              previousSftTaskId
            });
          }

          await deleteRerankModelConfig(previousModelConfigId, previousSftTaskId);
          addLog.info('Successfully deleted previous tuned model', {
            taskId,
            previousModelConfigId,
            previousTaskId,
            previousSftTaskId
          });
        } catch (deleteError) {
          addLog.warn('Failed to delete previous tuned model', {
            taskId,
            previousModelConfigId,
            previousTaskId,
            error: deleteError instanceof Error ? deleteError.message : String(deleteError)
          });
        }
      } else {
        addLog.info('Keeping previous tuned model (new model does not perform better)', {
          taskId,
          previousModelConfigId,
          previousTaskId,
          baseModelMRR: baseModelEvalResult?.detailed_results?.overall_mrr,
          baseModelPrecision: baseModelEvalResult?.detailed_results?.overall_precision,
          tunedModelMRR: tunedModelEvalResult?.detailed_results?.overall_mrr,
          tunedModelPrecision: tunedModelEvalResult?.detailed_results?.overall_precision
        });
      }
    } else {
      addLog.info('No previous fine-tuned model to delete', {
        taskId,
        previousModelConfigId,
        previousTaskId,
        tunedModelConfigId,
        isTunedModel: previousModelConfigId ? isTunedModel(previousModelConfigId) : false,
        reason: !previousModelConfigId
          ? 'No previous model recorded'
          : !isTunedModel(previousModelConfigId)
            ? 'Previous model is not a fine-tuned model created by training module'
            : 'Previous model is the same as new tuned model (in-place replacement)'
      });
    }

    addLog.info('Rerank train task completed', { taskId });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const isUnrecoverable = error instanceof TrainTaskUnrecoverableError;

    addLog.error('Rerank train task failed', {
      taskId,
      error: errorMessage,
      isUnrecoverable,
      errorType: error instanceof Error ? error.constructor.name : 'Unknown'
    });

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

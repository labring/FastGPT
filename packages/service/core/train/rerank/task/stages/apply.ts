import type {
  RerankTrainTaskSchemaType,
  RerankEvalResult
} from '@fastgpt/global/core/train/rerank/type';
import { RerankTaskCheckpointStageEnum } from '@fastgpt/global/core/train/rerank/constants';
import { addLog } from '../../../../../common/system/log';
import {
  RerankTrainErrEnum,
  RerankTrainSuggestionEnum
} from '@fastgpt/global/common/error/code/train';
import { createEnhancedError } from '../../utils';
import { MongoRerankTrainTask } from '../schema';
import { isTunedModel } from '../helpers/model';
import { deleteRerankModelConfig } from '../../model/controller';
import { TrainTaskUnrecoverableError } from '../errors';

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
 * Stage 7: Apply - Decision and Cleanup
 *
 * Compares base model and tuned model evaluation results to decide
 * whether to keep the new tuned model or roll back.
 *
 * - New model better: Keep it. If baseModelId is itself a tuned model (continuous training),
 *   find the previous task and delete the old model.
 * - New model worse: Delete the newly trained model and its SFT task.
 *
 * @param task - Rerank training task instance
 * @returns Object containing newModelKept flag
 */
export async function runApplyingStage(task: RerankTrainTaskSchemaType): Promise<{
  newModelKept: boolean;
}> {
  addLog.info('Run applying stage', { taskId: String(task._id) });

  const checkpointData = task.checkpoint.data || {};

  const tunedModelId = checkpointData.registering?.tunedModelId;
  if (!tunedModelId) {
    const enhancedError = createEnhancedError(
      RerankTaskCheckpointStageEnum.applying,
      RerankTrainErrEnum.applyModelConfigNotFound,
      RerankTrainSuggestionEnum.applyModelConfigNotFound
    );
    throw new TrainTaskUnrecoverableError(enhancedError);
  }

  const tunedModelEvalResult = checkpointData.eval_tunedmodel?.tunedModelEvalResult;
  const baseModelEvalResult = checkpointData.eval_basemodel?.baseModelEvalResult;

  const newModelIsBetter = compareEvalPerformance(baseModelEvalResult, tunedModelEvalResult);

  if (newModelIsBetter) {
    addLog.info('New tuned model performs better, keeping it', {
      taskId: String(task._id),
      tunedModelId,
      baseModelMRR: baseModelEvalResult?.detailed_results?.overall_mrr,
      tunedModelMRR: tunedModelEvalResult?.detailed_results?.overall_mrr,
      baseModelPrecision: baseModelEvalResult?.detailed_results?.overall_precision,
      tunedModelPrecision: tunedModelEvalResult?.detailed_results?.overall_precision
    });

    // Continuous training scenario: if the base model is itself a tuned model, delete it
    if (isTunedModel(task.baseModelId)) {
      addLog.info('Continuous training: base model is a tuned model, will delete it', {
        taskId: String(task._id),
        baseModelId: task.baseModelId
      });

      try {
        // Find the previous task that created this base model to get its sftTaskId
        const prevTask = await MongoRerankTrainTask.findOne(
          { 'checkpoint.data.registering.tunedModelId': task.baseModelId },
          'checkpoint.data.finetuning.sftTaskId'
        ).lean();

        const prevSftTaskId = prevTask?.checkpoint?.data?.finetuning?.sftTaskId;

        addLog.info('Deleting previous tuned model', {
          taskId: String(task._id),
          baseModelId: task.baseModelId,
          prevSftTaskId
        });

        await deleteRerankModelConfig(task.baseModelId, prevSftTaskId);

        addLog.info('Successfully deleted previous tuned model', {
          taskId: String(task._id),
          baseModelId: task.baseModelId
        });
      } catch (deleteError) {
        addLog.error('Failed to delete previous tuned model, continuing', {
          taskId: String(task._id),
          baseModelId: task.baseModelId,
          error: deleteError instanceof Error ? deleteError.message : String(deleteError)
        });
      }
    }

    return { newModelKept: true };
  } else {
    // New model is not better: delete the newly trained model
    addLog.info('New tuned model does not perform better, rolling back', {
      taskId: String(task._id),
      tunedModelId,
      baseModelMRR: baseModelEvalResult?.detailed_results?.overall_mrr,
      tunedModelMRR: tunedModelEvalResult?.detailed_results?.overall_mrr,
      baseModelPrecision: baseModelEvalResult?.detailed_results?.overall_precision,
      tunedModelPrecision: tunedModelEvalResult?.detailed_results?.overall_precision
    });

    try {
      const sftTaskId = checkpointData.finetuning?.sftTaskId;

      await deleteRerankModelConfig(tunedModelId, sftTaskId);

      addLog.info('Successfully deleted underperforming tuned model', {
        taskId: String(task._id),
        tunedModelId,
        sftTaskId
      });
    } catch (deleteError) {
      addLog.error('Failed to delete underperforming tuned model', {
        taskId: String(task._id),
        tunedModelId,
        error: deleteError instanceof Error ? deleteError.message : String(deleteError)
      });
    }

    return { newModelKept: false };
  }
}

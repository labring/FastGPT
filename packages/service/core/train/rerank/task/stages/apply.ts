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
import { isTunedModel } from '../helpers/model';
import { TrainTaskUnrecoverableError } from '../errors';
import { disableRerankModel, replaceRerankModelInApps } from '../../model/controller';

/**
 * Compare evaluation performance between base model and tuned model
 * Both overall_mrr and overall_precision must be better for the tuned model
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
 * - New model better: Replace App references (old → new). If baseModelId is a tuned model, disable it.
 * - New model worse: Disable the newly trained model (artifacts cleaned up by task deletion).
 *
 * @param task - Rerank training task instance
 * @returns Object containing newModelIsBetter flag and updatedAppCount
 */
export async function runApplyingStage(task: RerankTrainTaskSchemaType): Promise<{
  newModelIsBetter: boolean;
  updatedAppCount?: number;
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
    addLog.info('New tuned model performs better, replacing App references', {
      taskId: String(task._id),
      tunedModelId,
      baseModelId: task.baseModelId
    });

    const updatedAppCount = await replaceRerankModelInApps(
      task.baseModelId,
      tunedModelId,
      task.teamId,
      task.tmbId,
      'Auto-apply rerank model'
    );

    // If base model is itself a tuned model, disable it (artifacts cleaned up by task deletion)
    if (isTunedModel(task.baseModelId)) {
      addLog.info('Continuous training: base model is a tuned model, disabling it', {
        taskId: String(task._id),
        baseModelId: task.baseModelId
      });

      try {
        await disableRerankModel(task.baseModelId);
      } catch (err) {
        addLog.error('Failed to disable previous tuned model, continuing', {
          taskId: String(task._id),
          baseModelId: task.baseModelId,
          error: err instanceof Error ? err.message : String(err)
        });
      }
    }

    return { newModelIsBetter: true, updatedAppCount };
  } else {
    // New model is not better: disable the newly trained model
    addLog.info('New tuned model does not perform better, disabling it', {
      taskId: String(task._id),
      tunedModelId
    });

    try {
      await disableRerankModel(tunedModelId);
    } catch (err) {
      addLog.error('Failed to disable underperforming tuned model', {
        taskId: String(task._id),
        tunedModelId,
        error: err instanceof Error ? err.message : String(err)
      });
    }

    return { newModelIsBetter: false };
  }
}

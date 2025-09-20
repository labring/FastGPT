import { addLog } from '../../../../common/system/log';
import { MongoEvalItem, MongoEvaluation } from '../../task/schema';
import { Types } from 'mongoose';
import { EvaluationStatusEnum } from '@fastgpt/global/core/evaluation/constants';

// Calculate aggregateScore for a single evaluation item
export const calculateEvaluationItemAggregateScore = async (
  evalItemId: string
): Promise<number> => {
  try {
    const evalItem = await MongoEvalItem.findById(evalItemId).lean();
    if (!evalItem || !evalItem.evaluatorOutputs || evalItem.evaluatorOutputs.length === 0) {
      return 0;
    }

    // Get evaluation task to access summaryConfigs for weights
    const evaluation = await MongoEvaluation.findById(evalItem.evalId).lean();
    if (!evaluation || !evaluation.summaryConfigs || evaluation.summaryConfigs.length === 0) {
      return 0;
    }

    let totalWeightedScore = 0;
    let totalWeight = 0;

    // Calculate weighted score for each evaluator
    evalItem.evaluatorOutputs.forEach((evaluatorOutput, index) => {
      const score = evaluatorOutput?.data?.score;
      if (score !== undefined && score !== null && evaluation.summaryConfigs[index]) {
        const weight = evaluation.summaryConfigs[index].weight || 0;
        const scoreScaling = evaluation.evaluators[index]?.scoreScaling || 1;

        // Apply score scaling and calculate weighted score
        const scaledScore = score * scoreScaling;
        totalWeightedScore += scaledScore * weight;
        totalWeight += weight;
      }
    });

    // Calculate aggregate score
    const aggregateScore =
      totalWeight > 0 ? Math.round((totalWeightedScore / totalWeight) * 100) / 100 : 0;

    addLog.debug(
      `[Evaluation] Calculated aggregateScore for item: ${evalItemId}, score: ${aggregateScore}`,
      {
        evalItemId,
        totalWeightedScore,
        totalWeight,
        aggregateScore
      }
    );

    return aggregateScore;
  } catch (error) {
    addLog.error(`[Evaluation] Error calculating aggregateScore for item: ${evalItemId}`, error);
    return 0;
  }
};

// Recalculate aggregate scores for all evaluation items in a given evaluation task
export const recalculateAllEvaluationItemAggregateScores = async (
  evalId: string,
  session?: any
): Promise<void> => {
  try {
    addLog.info('[Evaluation] Starting recalculation of all evaluation item aggregate scores', {
      evalId
    });

    // Get all completed evaluation items for this evaluation
    const query = MongoEvalItem.find({
      evalId: new Types.ObjectId(evalId),
      status: EvaluationStatusEnum.completed,
      evaluatorOutputs: { $exists: true, $nin: [null, []] }
    });

    if (session) {
      query.session(session);
    }

    const evalItems = await query.lean();

    if (evalItems.length === 0) {
      addLog.info('[Evaluation] No completed evaluation items found for recalculation', {
        evalId
      });
      return;
    }

    // Recalculate aggregate score for each item
    const updatePromises = evalItems.map(async (item) => {
      const aggregateScore = await calculateEvaluationItemAggregateScore(item._id.toString());

      return MongoEvalItem.updateOne({ _id: item._id }, { $set: { aggregateScore } }, { session });
    });

    await Promise.all(updatePromises);

    addLog.info('[Evaluation] Successfully recalculated all evaluation item aggregate scores', {
      evalId,
      updatedItemsCount: evalItems.length
    });
  } catch (error) {
    addLog.error('[Evaluation] Failed to recalculate evaluation item aggregate scores', {
      evalId,
      error
    });
    throw error;
  }
};

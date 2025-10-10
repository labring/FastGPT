import { addLog } from '../../../common/system/log';
import type { Job } from '../../../common/bullmq';
import type {
  EvaluationTaskJobData,
  EvaluationItemJobData,
  TargetOutput
} from '@fastgpt/global/core/evaluation/type';
import { getEvaluationItemWorker, getEvaluationTaskWorker, addEvaluationItemJobs } from './mq';
import { MongoEvaluation, MongoEvalItem } from './schema';
import { createTargetInstance } from '../target';
import { createEvaluatorInstance } from '../evaluator';
import { Types } from 'mongoose';
import { EvaluationStatusEnum } from '@fastgpt/global/core/evaluation/constants';
import { checkTeamAIPoints } from '../../../support/permission/teamLimit';
import { EvaluationErrEnum } from '@fastgpt/global/common/error/code/evaluation';
import { getErrText } from '@fastgpt/global/common/error/utils';
import { createMergedEvaluationUsage } from '../utils/usage';
import { EvaluationSummaryService } from '../summary';
import { createEvaluationError } from './errors';
import { getEvaluationTaskStats } from './statusCalculator';

import type { MetricResult } from '@fastgpt/global/core/evaluation/metric/type';
import { MetricResultStatusEnum } from '@fastgpt/global/core/evaluation/metric/constants';

/**
 * Complete evaluation task and trigger summary generation
 */
export const finishEvaluationTask = async (evalId: string) => {
  try {
    // Get task statistics using the reusable function
    const stats = await getEvaluationTaskStats(evalId);

    if (stats.total === 0) {
      addLog.warn(`[Evaluation] Evaluation task has no evaluation item data: ${evalId}`);
      return;
    }

    // Check if all items are truly completed
    const pendingCount = stats.evaluating + stats.queuing;

    if (pendingCount > 0) {
      addLog.debug(
        `[Evaluation] Task still has pending items, skipping completion: ${evalId}, total: ${stats.total}, ` +
          `success: ${stats.completed}, failed: ${stats.error}, pending: ${pendingCount}`
      );
      return;
    }

    // Set finishTime if all items are finished (either completed or error, no pending)
    // Use conditional update to prevent duplicate writes
    const updateResult = await MongoEvaluation.updateOne(
      {
        _id: new Types.ObjectId(evalId),
        finishTime: { $exists: false } // Only update if finishTime is not already set
      },
      { $set: { finishTime: new Date() } }
    );

    // If no document was modified, it means another process already finished the task
    if (updateResult.modifiedCount === 0) {
      addLog.debug(
        `[Evaluation] Task already finished by another process: ${evalId}, skipping completion`
      );
      return;
    }

    // Trigger summary generation for completed task
    await EvaluationSummaryService.triggerSummaryGeneration(evalId, stats.completed);
  } catch (error) {
    addLog.error(`[Evaluation] Error occurred while completing task: ${evalId}`, {
      error: getErrText(error)
    });

    // Save error info to database
    try {
      await MongoEvaluation.updateOne(
        { _id: new Types.ObjectId(evalId) },
        {
          $set: {
            finishTime: new Date(),
            errorMessage: EvaluationErrEnum.evalTaskSystemError
          }
        }
      );
    } catch (updateError) {
      addLog.warn(`[Evaluation] Failed to update task error info: ${evalId}`, {
        updateError: getErrText(updateError)
      });
    }
  }
};

/**
 * Process evaluation task: validate config and submit items to queue
 */
const evaluationTaskProcessor = async (job: Job<EvaluationTaskJobData>) => {
  const { evalId } = job.data;

  // Get evaluation data
  const evaluation = await MongoEvaluation.findById(evalId).lean();

  // Skip if task doesn't exist
  if (!evaluation) {
    addLog.warn(`[Evaluation] Task ${evalId} no longer exists, skipping`);
    return;
  }

  addLog.debug(`[Evaluation] Task ${evalId} now evaluating`);

  // Validate target and evaluators configuration
  if (!evaluation.target || !evaluation.target.type || !evaluation.target.config) {
    throw createEvaluationError(EvaluationErrEnum.evalTargetConfigInvalid, 'ResourceCheck');
  }

  if (!evaluation.evaluators || evaluation.evaluators.length === 0) {
    throw createEvaluationError(EvaluationErrEnum.evalEvaluatorsConfigInvalid, 'ResourceCheck');
  }

  // Check if evaluation items exist
  const existingItems = await MongoEvalItem.find({ evalId }).lean();
  if (existingItems.length === 0) {
    throw createEvaluationError(EvaluationErrEnum.evalItemNotFound, 'ResourceCheck');
  }

  const itemsToProcess = existingItems.filter((item) => {
    return item.status === EvaluationStatusEnum.queuing;
  });

  if (itemsToProcess.length > 0) {
    const jobs = itemsToProcess.map((item, index) => ({
      data: {
        evalId,
        evalItemId: item._id.toString()
      },
      delay: index * 100 // Small delay to avoid overwhelming system
    }));

    await addEvaluationItemJobs(jobs);
    addLog.debug(`[Evaluation] Submitted ${jobs.length} items to queue`);
  }

  addLog.debug(
    `[Evaluation] Task processing completed: ${evalId}, submitted ${itemsToProcess.length} evaluation items to queue`
  );
};

/**
 * Process evaluation item: execute target and evaluators
 */
const evaluationItemProcessor = async (job: Job<EvaluationItemJobData>) => {
  const { evalId, evalItemId } = job.data;

  addLog.debug(`[Evaluation] Start processing evaluation item: ${evalItemId}`);

  // Get evaluation item
  const evalItem = await MongoEvalItem.findById(evalItemId);
  if (!evalItem) {
    throw createEvaluationError(EvaluationErrEnum.evalItemNotFound, 'ResourceCheck');
  }

  // Get evaluation for AI points check and configuration
  const evaluation = await MongoEvaluation.findById(
    evalId,
    'teamId tmbId usageId target evaluators'
  );
  if (!evaluation) {
    throw createEvaluationError(EvaluationErrEnum.evalTaskNotFound, 'ResourceCheck');
  }

  // Check AI points availability
  try {
    await checkTeamAIPoints(evaluation.teamId);
  } catch (error) {
    throw createEvaluationError(error, 'ResourceCheck');
  }

  // Initialize outputs and check for existing results
  let targetOutput: TargetOutput | undefined = undefined;
  let evaluatorOutputs: MetricResult[] = [];

  // Resume from checkpoint if results exist
  if (evalItem.targetOutput?.actualOutput) {
    addLog.debug(`[Evaluation] Resuming targetOutput from evalItem: ${evalItemId}`);
    targetOutput = evalItem.targetOutput;
  }
  if (evalItem.evaluatorOutputs && evalItem.evaluatorOutputs.length > 0) {
    addLog.debug(`[Evaluation] Resuming evaluatorOutputs from evalItem: ${evalItemId}`);
    evaluatorOutputs = evalItem.evaluatorOutputs;
  }

  if (!targetOutput && !evaluatorOutputs.length) {
    addLog.debug(`[Evaluation] Starting evaluation item from scratch: ${evalItemId}`);
  }

  // Execute evaluation target if needed
  if (!targetOutput || !targetOutput.actualOutput) {
    try {
      const targetInstance = await createTargetInstance(evaluation.target, { validate: false });
      targetOutput = await targetInstance.execute({
        userInput: evalItem.dataItem.userInput,
        context: evalItem.dataItem.context,
        targetCallParams: evalItem.dataItem.targetCallParams
      });

      // Save target output as checkpoint
      await MongoEvalItem.updateOne(
        { _id: new Types.ObjectId(evalItemId) },
        {
          $set: {
            targetOutput: targetOutput
          }
        }
      );

      // Record target usage
      if (targetOutput.usage) {
        const totalPoints = targetOutput.usage.reduce(
          (sum: number, item: any) => sum + (item.totalPoints || 0),
          0
        );
        const inputTokens = targetOutput.usage.reduce(
          (sum: number, item: any) => sum + (item.inputTokens || 0),
          0
        );
        const outputTokens = targetOutput.usage.reduce(
          (sum: number, item: any) => sum + (item.outputTokens || 0),
          0
        );
        await createMergedEvaluationUsage({
          evalId,
          teamId: evaluation.teamId,
          tmbId: evaluation.tmbId,
          usageId: evaluation.usageId,
          totalPoints,
          type: 'target',
          inputTokens,
          outputTokens
        });
      }

      if (!targetOutput.actualOutput) {
        throw new Error(EvaluationErrEnum.evalTargetExecutionError);
      }
    } catch (error) {
      // Use BullMQ error type for retry handling
      throw createEvaluationError(error, 'TargetExecute', {
        evalId,
        evalItemId
      });
    }
  }

  // Execute evaluators (only missing ones)
  while (evaluatorOutputs.length < evaluation.evaluators.length) {
    const evaluatorIndex = evaluatorOutputs.length;
    evaluatorOutputs.push({
      metricName: evaluation.evaluators[evaluatorIndex].metric.name
    });
  }

  const errors: Array<{ evaluatorName: string; error: string }> = [];

  // Process each evaluator
  for (let i = 0; i < evaluation.evaluators.length; i++) {
    const evaluator = evaluation.evaluators[i];
    const existingOutput = evaluatorOutputs[i];

    // Skip if evaluator already has valid successful result
    if (
      existingOutput?.data?.score !== undefined &&
      existingOutput?.status === MetricResultStatusEnum.Success
    ) {
      continue;
    }

    try {
      const evaluatorInstance = await createEvaluatorInstance(evaluator, {
        validate: false
      });

      const evaluatorOutput = await evaluatorInstance.evaluate({
        userInput: evalItem.dataItem.userInput,
        expectedOutput: evalItem.dataItem.expectedOutput,
        actualOutput: targetOutput.actualOutput,
        context: evalItem.dataItem.context,
        retrievalContext: targetOutput.retrievalContext
      });

      await createMergedEvaluationUsage({
        evalId,
        teamId: evaluation.teamId,
        tmbId: evaluation.tmbId,
        usageId: evaluation.usageId,
        totalPoints: evaluatorOutput.totalPoints || 0,
        inputTokens:
          evaluatorOutput.usages?.reduce((sum, usage) => sum + (usage.promptTokens || 0), 0) || 0,
        outputTokens:
          evaluatorOutput.usages?.reduce((sum, usage) => sum + (usage.completionTokens || 0), 0) ||
          0,
        type: 'metric'
      });

      // Record error and continue
      if (evaluatorOutput.status !== MetricResultStatusEnum.Success || evaluatorOutput.error) {
        const errorMessage = evaluatorOutput.error || 'Evaluator execution failed';
        const evaluatorName = evaluator.metric.name || `Evaluator ${i + 1}`;
        errors.push({ evaluatorName, error: errorMessage });
      }

      // Update evaluator output
      evaluatorOutputs[i] = evaluatorOutput;

      // Save evaluator progress
      await MongoEvalItem.updateOne(
        { _id: new Types.ObjectId(evalItemId) },
        { $set: { evaluatorOutputs: evaluatorOutputs } }
      );
    } catch (error) {
      // Handle evaluator error
      const errorMessage = getErrText(error) || 'Evaluator execution failed';
      const evaluatorName = evaluator.metric.name || `Evaluator ${i + 1}`;
      errors.push({ evaluatorName, error: errorMessage });
    }
  }

  // Check for evaluator errors
  if (errors.length > 0) {
    const errorDetails = errors.map((e) => `${e.evaluatorName}: ${e.error}`).join('; ');
    addLog.error('[Evaluation] Multiple evaluator execution errors', {
      errorCount: errors.length,
      details: errorDetails,
      errors: errors
    });

    // Use BullMQ error type
    throw createEvaluationError(
      EvaluationErrEnum.evalEvaluatorExecutionErrors,
      'EvaluatorExecute',
      {
        evalId,
        evalItemId
      },
      true
    );
  }
};

/**
 * Initialize evaluation task workers
 */
export const initEvalTaskWorker = () => {
  return getEvaluationTaskWorker(evaluationTaskProcessor);
};

export const initEvalTaskItemWorker = () => {
  return getEvaluationItemWorker(evaluationItemProcessor);
};

/**
 * Export processors for testing
 */
export { evaluationTaskProcessor, evaluationItemProcessor };

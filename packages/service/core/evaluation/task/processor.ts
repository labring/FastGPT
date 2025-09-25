import { addLog } from '../../../common/system/log';
import type { Job } from '../../../common/bullmq';
import type {
  EvaluationTaskJobData,
  EvaluationItemJobData,
  TargetOutput,
  EvaluationItemSchemaType,
  EvaluationDataItemType
} from '@fastgpt/global/core/evaluation/type';
import { getEvaluationItemWorker, getEvaluationTaskWorker, addEvaluationItemJobs } from './mq';
import { MongoEvaluation, MongoEvalItem } from './schema';
import { MongoEvalDatasetData } from '../dataset/evalDatasetDataSchema';
import { createTargetInstance } from '../target';
import { createEvaluatorInstance } from '../evaluator';
import { Types } from 'mongoose';
import { EvaluationStatusEnum } from '@fastgpt/global/core/evaluation/constants';
import { checkTeamAIPoints } from '../../../support/permission/teamLimit';
import { EvaluationErrEnum } from '@fastgpt/global/common/error/code/evaluation';
import { getErrText } from '@fastgpt/global/common/error/utils';
import { createMergedEvaluationUsage } from '../utils/usage';
import { EvaluationSummaryService } from '../summary';
import { getBatchEvaluationItemStatus } from './statusCalculator';
import { createEvaluationError } from './errors';

import type { MetricResult } from '@fastgpt/global/core/evaluation/metric/type';
import { MetricResultStatusEnum } from '@fastgpt/global/core/evaluation/metric/constants';

/**
 * Complete evaluation task and trigger summary generation
 */
export const finishEvaluationTask = async (evalId: string) => {
  try {
    // Get all evaluation items for this task
    const allItems = await MongoEvalItem.find({ evalId: new Types.ObjectId(evalId) }, '_id').lean();

    if (allItems.length === 0) {
      addLog.warn(`[Evaluation] Evaluation task has no evaluation item data: ${evalId}`);
      return;
    }

    const totalCount = allItems.length;
    const itemIds = allItems.map((item) => item._id.toString());

    const statusMap = await getBatchEvaluationItemStatus(itemIds);

    let completedCount = 0;
    let errorCount = 0;
    let evaluatingCount = 0;
    let queuingCount = 0;

    for (const itemId of itemIds) {
      const status = statusMap.get(itemId) || EvaluationStatusEnum.completed;
      switch (status) {
        case EvaluationStatusEnum.completed:
          completedCount++;
          break;
        case EvaluationStatusEnum.error:
          errorCount++;
          break;
        case EvaluationStatusEnum.evaluating:
          evaluatingCount++;
          break;
        case EvaluationStatusEnum.queuing:
          queuingCount++;
          break;
      }
    }

    // Check if all items are truly completed
    const pendingCount = evaluatingCount + queuingCount;

    if (pendingCount > 0) {
      addLog.debug(
        `[Evaluation] Task still has pending items, skipping completion: ${evalId}, total: ${totalCount}, ` +
          `success: ${completedCount}, failed: ${errorCount}, pending: ${pendingCount}`
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
    await EvaluationSummaryService.triggerSummaryGeneration(evalId, completedCount);
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
            errorMessage: `System error occurred while completing task: ${error instanceof Error ? error.message : 'Unknown error'}`
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

  // Report progress
  await job.updateProgress(0);

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

  // Report validation progress
  await job.updateProgress(20);

  // Check if evaluation items already exist
  const existingItems = await MongoEvalItem.find({ evalId }).lean();
  if (existingItems.length > 0) {
    // Items exist, submit to queue
    const itemIds = existingItems.map((item) => item._id.toString());
    const statusMap = await getBatchEvaluationItemStatus(itemIds);

    const itemsToProcess = existingItems.filter((item) => {
      const realTimeStatus = statusMap.get(item._id.toString()) || EvaluationStatusEnum.completed;
      // Only process items in queuing status
      return realTimeStatus === EvaluationStatusEnum.queuing;
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

    // Report completion
    await job.updateProgress(100);
    return;
  }

  // Fallback: Create evaluation items if they don't exist
  addLog.warn(`[Evaluation] No existing items found for evaluation ${evalId}, creating items...`);

  // Load dataset to create items
  const dataItems = await MongoEvalDatasetData.find({
    evalDatasetCollectionId: evaluation.evalDatasetCollectionId,
    teamId: evaluation.teamId
  }).lean();

  if (dataItems.length === 0) {
    throw createEvaluationError(EvaluationErrEnum.evalDatasetLoadFailed, 'ResourceCheck');
  }

  // Create evaluation items
  const evalItems: Omit<EvaluationItemSchemaType, '_id' | 'status'>[] = [];
  for (const dataItem of dataItems) {
    const evaluationDataItem: EvaluationDataItemType = {
      _id: dataItem._id,
      userInput: dataItem.userInput,
      expectedOutput: dataItem.expectedOutput,
      context: dataItem.context,
      targetCallParams: undefined
    };

    evalItems.push({
      evalId,
      dataItem: evaluationDataItem
    });
  }

  // Insert evaluation items
  const insertedItems = await MongoEvalItem.insertMany(evalItems);

  // Submit items to queue
  const jobs = insertedItems.map((item, index) => ({
    data: {
      evalId,
      evalItemId: item._id.toString()
    },
    delay: index * 100
  }));

  await addEvaluationItemJobs(jobs);

  // Report completion
  await job.updateProgress(100);

  addLog.debug(
    `[Evaluation] Task decomposition completed: ${evalId}, submitted ${jobs.length} evaluation items to queue`
  );
};

/**
 * Process evaluation item: execute target and evaluators
 */
const evaluationItemProcessor = async (job: Job<EvaluationItemJobData>) => {
  const { evalId, evalItemId } = job.data;

  addLog.debug(`[Evaluation] Start processing evaluation item: ${evalItemId}`);

  // Report progress
  await job.updateProgress(0);

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

  // Report setup progress
  await job.updateProgress(10);

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

      // Report target execution progress
      await job.updateProgress(30);

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
        throw new Error(EvaluationErrEnum.evalTargetOutputRequired);
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

      // Report evaluator progress
      const completedEvaluators = evaluatorOutputs.filter(
        (output) => output?.data?.score !== undefined
      ).length;
      const evaluatorProgress = 30 + (60 * completedEvaluators) / evaluation.evaluators.length;
      await job.updateProgress(Math.round(evaluatorProgress));
    } catch (error) {
      // Handle evaluator error
      const errorMessage = getErrText(error) || 'Evaluator execution failed';
      const evaluatorName = evaluator.metric.name || `Evaluator ${i + 1}`;
      errors.push({ evaluatorName, error: errorMessage });
    }
  }

  // Check for evaluator errors
  if (errors.length > 0) {
    const errorMessage = `Evaluator errors: ${errors.map((e) => `${e.evaluatorName}: ${e.error}`).join('; ')}`;
    const aggregatedError = new Error(errorMessage);
    // Use BullMQ error type
    throw createEvaluationError(
      aggregatedError,
      'EvaluatorExecute',
      {
        evalId,
        evalItemId
      },
      true
    );
  }

  // Report final progress
  await job.updateProgress(100);
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

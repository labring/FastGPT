import { addLog } from '../../../common/system/log';
import type { Job } from '../../../common/bullmq';
import type {
  EvaluationTaskJobData,
  EvaluationItemJobData
} from '@fastgpt/global/core/evaluation/type';
import { evaluationItemQueue, getEvaluationTaskWorker, getEvaluationItemWorker } from '../mq';
import { MongoEvaluation, MongoEvalItem } from '../task/schema';
import { MongoEvalDataset } from '../dataset/schema';
import { createTargetInstance } from '../target';
import { createEvaluatorInstance } from '../evaluator';
import { Types } from 'mongoose';
import { EvaluationStatusEnum } from '@fastgpt/global/core/evaluation/constants';
import { checkTeamAIPoints } from '../../../support/permission/teamLimit';
import { TeamErrEnum } from '@fastgpt/global/common/error/code/team';
import { concatUsage } from '../../../support/wallet/usage/controller';
import { getErrText } from '@fastgpt/global/common/error/utils';
import type { MetricResult } from '@fastgpt/global/core/evaluation/type';

// Initialize evaluation workers
export const initEvaluationWorkers = () => {
  addLog.info('Init Evaluation Workers...');

  const taskWorker = getEvaluationTaskWorker(evaluationTaskProcessor);
  const itemWorker = getEvaluationItemWorker(evaluationItemProcessor);

  return { taskWorker, itemWorker };
};

// Handle AI Points insufficient error
const handleAiPointsError = async (evalId: string, error: any) => {
  if (error === TeamErrEnum.aiPointsNotEnough) {
    await MongoEvaluation.updateOne(
      { _id: new Types.ObjectId(evalId) },
      {
        $set: {
          errorMessage: 'AI Points balance insufficient, evaluation paused',
          status: EvaluationStatusEnum.error
        }
      }
    );

    // TODO: Send notification to team
    addLog.warn(`[Evaluation] AI Points insufficient, evaluation task paused: ${evalId}`);
    return;
  }

  throw error;
};

// Complete evaluation task - simplified version based on status enum statistics
const finishEvaluationTask = async (evalId: string) => {
  try {
    // Simplified aggregation query: based only on status statistics
    const [statsResult] = await MongoEvalItem.aggregate([
      {
        $match: { evalId: new Types.ObjectId(evalId) }
      },
      {
        $group: {
          _id: null,
          totalCount: { $sum: 1 },
          // Statistics by status
          completedCount: {
            $sum: { $cond: [{ $eq: ['$status', EvaluationStatusEnum.completed] }, 1, 0] }
          },
          errorCount: {
            $sum: { $cond: [{ $eq: ['$status', EvaluationStatusEnum.error] }, 1, 0] }
          },
          evaluatingCount: {
            $sum: { $cond: [{ $eq: ['$status', EvaluationStatusEnum.evaluating] }, 1, 0] }
          },
          queuingCount: {
            $sum: { $cond: [{ $eq: ['$status', EvaluationStatusEnum.queuing] }, 1, 0] }
          },
          // Calculate average score only for successfully completed items
          avgScore: {
            $avg: {
              $cond: [
                { $eq: ['$status', EvaluationStatusEnum.completed] },
                '$evaluator_output.score',
                null
              ]
            }
          }
        }
      }
    ]);

    // If no data, return (should not happen)
    if (!statsResult) {
      addLog.warn(`[Evaluation] Evaluation task has no evaluation item data: ${evalId}`);
      return;
    }

    const {
      totalCount = 0,
      completedCount = 0,
      errorCount = 0,
      evaluatingCount = 0,
      queuingCount = 0,
      avgScore = 0
    } = statsResult;

    // Check if truly completed
    const pendingCount = evaluatingCount + queuingCount;
    if (pendingCount > 0) {
      addLog.debug(
        `[Evaluation] Task not yet completed: ${evalId}, pending items: ${pendingCount}`
      );
      return; // Still have incomplete items, do not update task status
    }

    // Determine task status - simplified logic based on status enum
    let taskStatus: EvaluationStatusEnum;
    let errorMessage: string | undefined;

    if (errorCount === 0) {
      // No failed items, all successful
      taskStatus = EvaluationStatusEnum.completed;
    } else if (completedCount === 0) {
      // No successful items, all failed
      taskStatus = EvaluationStatusEnum.error;
      errorMessage = `All ${totalCount} evaluation items failed`;
    } else {
      // Partial failure
      const successRate = Math.round((completedCount / totalCount) * 100);
      if (successRate >= 80) {
        // Success rate >=80%, mark as completed but record error
        taskStatus = EvaluationStatusEnum.completed;
        errorMessage = `${errorCount} evaluation items failed (success rate: ${successRate}%)`;
      } else {
        // Success rate <80%, mark as error
        taskStatus = EvaluationStatusEnum.error;
        errorMessage = `${errorCount} evaluation items failed, success rate too low: ${successRate}%`;
      }
    }

    // Update task status
    await MongoEvaluation.updateOne(
      { _id: new Types.ObjectId(evalId) },
      {
        $set: {
          finishTime: new Date(),
          avgScore: avgScore != null ? Math.round(avgScore * 100) / 100 : undefined,
          status: taskStatus,
          errorMessage
        }
      }
    );

    addLog.info(
      `[Evaluation] Task completed: ${evalId}, status: ${taskStatus}, total: ${totalCount}, ` +
        `success: ${completedCount}, failed: ${errorCount}, avg score: ${avgScore ? avgScore.toFixed(2) : 'N/A'}`
    );
  } catch (error) {
    addLog.error(`[Evaluation] Error occurred while completing task: ${evalId}`, error);

    // When error occurs, mark task as error status
    try {
      await MongoEvaluation.updateOne(
        { _id: new Types.ObjectId(evalId) },
        {
          $set: {
            status: EvaluationStatusEnum.error,
            finishTime: new Date(),
            errorMessage: `System error occurred while completing task: ${error instanceof Error ? error.message : 'Unknown error'}`
          }
        }
      );
    } catch (updateError) {
      addLog.error(`[Evaluation] Failed to update task error status: ${evalId}`, updateError);
    }
  }
};

// Handle evaluation item error
const handleEvalItemError = async (evalItemId: string, error: any) => {
  const errorMessage = getErrText(error);

  // Get current retry count
  const evalItem = await MongoEvalItem.findById(evalItemId, 'retry');
  if (!evalItem) {
    addLog.error(`[Evaluation] Evaluation item does not exist: ${evalItemId}`);
    return;
  }

  const newRetryCount = evalItem.retry - 1;
  const newStatus = newRetryCount > 0 ? EvaluationStatusEnum.queuing : EvaluationStatusEnum.error;

  await MongoEvalItem.updateOne(
    { _id: new Types.ObjectId(evalItemId) },
    {
      $set: {
        retry: newRetryCount,
        errorMessage,
        status: newStatus,
        finishTime: newStatus === EvaluationStatusEnum.error ? new Date() : undefined
      }
    }
  );

  addLog.error(
    `[Evaluation] Evaluation item processing failed: ${evalItemId}, remaining retries: ${newRetryCount}`,
    error
  );
};

// Create merged evaluation usage record
const createMergedEvaluationUsage = async (params: {
  evalId: string;
  teamId: string;
  tmbId: string;
  usageId: string;
  totalPoints: number;
  type: 'target' | 'metric';
  inputTokens?: number;
  outputTokens?: number;
}) => {
  const { evalId, teamId, tmbId, usageId, totalPoints, type, inputTokens, outputTokens } = params;

  const listIndex = type === 'target' ? 0 : 1;

  await concatUsage({
    billId: usageId,
    teamId,
    tmbId,
    totalPoints,
    inputTokens: inputTokens || 0,
    outputTokens: outputTokens || 0,
    count: type === 'target' ? 1 : 0,
    listIndex
  });

  addLog.debug(`[Evaluation] Record usage: ${evalId}, ${type}, ${totalPoints} points`);
};

// Evaluation task processor
const evaluationTaskProcessor = async (job: Job<EvaluationTaskJobData>) => {
  const { evalId } = job.data;

  addLog.info(`[Evaluation] Start processing evaluation task: ${evalId}`);

  try {
    // Get evaluation task information
    const evaluation = await MongoEvaluation.findById(evalId).lean();
    if (!evaluation) {
      addLog.warn(`[Evaluation] Evaluation task does not exist: ${evalId}`);
      return;
    }

    // Load dataset
    const dataset = await MongoEvalDataset.findOne({
      _id: new Types.ObjectId(evaluation.datasetId),
      teamId: evaluation.teamId
    }).lean();

    if (!dataset) {
      throw new Error('Dataset loading failed');
    }

    // Validate target and evaluators configuration
    if (!evaluation.target || !evaluation.target.type || !evaluation.target.config) {
      throw new Error('Target configuration invalid');
    }

    if (!evaluation.evaluators || evaluation.evaluators.length === 0) {
      throw new Error('Evaluators configuration invalid');
    }

    // Create evaluation items for each dataItem and each evaluator (atomic structure)
    const evalItems = [];
    for (const dataItem of dataset.dataItems) {
      for (const evaluator of evaluation.evaluators) {
        evalItems.push({
          evalId,
          dataItem,
          target: evaluation.target,
          evaluator,
          status: EvaluationStatusEnum.queuing,
          retry: 3
        });
      }
    }

    // Batch insert evaluation items
    const insertedItems = await MongoEvalItem.insertMany(evalItems);
    addLog.info(`[Evaluation] Created ${insertedItems.length} atomic evaluation items`);

    // Submit to evaluation item queue for concurrent processing
    const jobs = insertedItems.map((item, index) => ({
      name: `eval_item_${evalId}_${index}`,
      data: {
        evalId,
        evalItemId: item._id.toString()
      },
      opts: {
        delay: index * 100 // Add small delay to avoid starting too many tasks simultaneously
      }
    }));

    await evaluationItemQueue.addBulk(jobs);

    addLog.info(
      `[Evaluation] Task decomposition completed: ${evalId}, submitted ${jobs.length} evaluation items to queue`
    );
  } catch (error) {
    addLog.error(`[Evaluation] Task processing failed: ${evalId}`, error);

    // Mark task as failed
    await MongoEvaluation.updateOne(
      { _id: new Types.ObjectId(evalId) },
      {
        $set: {
          errorMessage: getErrText(error),
          status: EvaluationStatusEnum.error,
          finishTime: new Date()
        }
      }
    );
  }
};

// Evaluation item processor
const evaluationItemProcessor = async (job: Job<EvaluationItemJobData>) => {
  const { evalId, evalItemId } = job.data;

  addLog.debug(`[Evaluation] Start processing evaluation item: ${evalItemId}`);

  try {
    // Get evaluation item information
    const evalItem = await MongoEvalItem.findById(evalItemId);
    if (!evalItem) {
      throw new Error('Evaluation item does not exist');
    }

    // Get evaluation information for AI Points check
    const evaluation = await MongoEvaluation.findById(evalId, 'teamId tmbId usageId');
    if (!evaluation) {
      throw new Error('Evaluation task does not exist');
    }

    // Check AI Points
    await checkTeamAIPoints(evaluation.teamId);

    // Update status to processing
    await MongoEvalItem.updateOne(
      { _id: new Types.ObjectId(evalItemId) },
      { $set: { status: EvaluationStatusEnum.evaluating } }
    );

    // 1. Call evaluation target
    const targetInstance = createTargetInstance(evalItem.target);
    const output = await targetInstance.execute({
      userInput: evalItem.dataItem.userInput,
      context: evalItem.dataItem.context,
      globalVariables: evalItem.dataItem.globalVariables
    });

    // Record usage from target call
    if (output.usage) {
      const totalPoints = output.usage.reduce(
        (sum: number, item: any) => sum + (item.totalPoints || 0),
        0
      );
      await createMergedEvaluationUsage({
        evalId,
        teamId: evaluation.teamId,
        tmbId: evaluation.tmbId,
        usageId: evaluation.usageId,
        totalPoints,
        type: 'target'
      });
    }

    // 2. Execute evaluator
    let result: MetricResult;
    let totalMetricPoints = 0;

    try {
      const evaluatorInstance = createEvaluatorInstance(evalItem.evaluator);

      result = await evaluatorInstance.evaluate({
        userInput: evalItem.dataItem.userInput,
        expectedOutput: evalItem.dataItem.expectedOutput,
        actualOutput: output.actualOutput,
        context: evalItem.dataItem.context,
        retrievalContext: output.retrievalContext
      });

      // If it's an AI model metric, record usage
      if (evalItem.evaluator.metric.type === 'ai_model' && result.details?.usage) {
        totalMetricPoints += result.details.usage.totalPoints || 0;
      }
    } catch (error) {
      // Evaluator failed
      result = {
        metricId: evalItem.evaluator.metric._id,
        metricName: evalItem.evaluator.metric.name,
        score: 0,
        error: getErrText(error)
      };
    }

    // Record usage from metric evaluation
    if (totalMetricPoints > 0) {
      await createMergedEvaluationUsage({
        evalId,
        teamId: evaluation.teamId,
        tmbId: evaluation.tmbId,
        usageId: evaluation.usageId,
        totalPoints: totalMetricPoints,
        type: 'metric'
      });
    }

    // 3. Store results
    await MongoEvalItem.updateOne(
      { _id: new Types.ObjectId(evalItemId) },
      {
        $set: {
          target_output: output,
          evaluator_output: result,
          status: EvaluationStatusEnum.completed,
          finishTime: new Date()
        }
      }
    );

    addLog.debug(`[Evaluation] Evaluation item completed: ${evalItemId}, score: ${result.score}`);
  } catch (error) {
    await handleEvalItemError(evalItemId, error);

    // If AI Points insufficient, pause entire task
    if (error === TeamErrEnum.aiPointsNotEnough) {
      await handleAiPointsError(evalId, error);
    }
  }

  // After try-catch, check if all evaluation items are completed
  try {
    const pendingCount = await MongoEvalItem.countDocuments({
      evalId: new Types.ObjectId(evalId),
      status: { $in: [EvaluationStatusEnum.queuing, EvaluationStatusEnum.evaluating] }
    });

    if (pendingCount === 0) {
      await finishEvaluationTask(evalId);
    }
  } catch (finishError) {
    addLog.error(
      `[Evaluation] Error occurred while checking task completion status: ${evalId}`,
      finishError
    );
  }
};

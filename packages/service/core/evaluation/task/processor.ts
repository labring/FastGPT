import { addLog } from '../../../common/system/log';
import type { Job } from '../../../common/bullmq';
import type {
  EvaluationTaskJobData,
  EvaluationItemJobData
} from '@fastgpt/global/core/evaluation/type';
import { evaluationItemQueue, getEvaluationItemWorker, getEvaluationTaskWorker } from './mq';
import { MongoEvaluation, MongoEvalItem } from './schema';
import { MongoEvalDatasetData } from '../dataset/evalDatasetDataSchema';
import { createTargetInstance } from '../target';
import { createEvaluatorInstance } from '../evaluator';
import { Types } from 'mongoose';
import { EvaluationStatusEnum } from '@fastgpt/global/core/evaluation/constants';
import { checkTeamAIPoints } from '../../../support/permission/teamLimit';
import { TeamErrEnum } from '@fastgpt/global/common/error/code/team';
import { concatUsage } from '../../../support/wallet/usage/controller';
import { getErrText } from '@fastgpt/global/common/error/utils';

// Sleep utility function
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Distributed lock implementation
const distributedLocks = new Map<string, { timestamp: number; timeout: number }>();

const acquireDistributedLock = async (
  lockKey: string,
  timeout: number = 30000
): Promise<{ release: () => Promise<void> }> => {
  const now = Date.now();
  const existing = distributedLocks.get(lockKey);

  // Clean expired locks
  if (existing && now > existing.timestamp + existing.timeout) {
    distributedLocks.delete(lockKey);
  }

  // Wait for lock to be available
  let attempts = 0;
  while (distributedLocks.has(lockKey) && attempts < 10) {
    await sleep(100);
    attempts++;
  }

  if (distributedLocks.has(lockKey)) {
    throw new Error(`Failed to acquire lock: ${lockKey}`);
  }

  // Acquire lock
  distributedLocks.set(lockKey, { timestamp: now, timeout });

  return {
    release: async () => {
      distributedLocks.delete(lockKey);
    }
  };
};

// Check if error is retriable
const isRetriableError = (error: any): boolean => {
  const retriableErrors = [
    'NETWORK_ERROR',
    'TIMEOUT',
    'RATE_LIMIT',
    'ECONNRESET',
    'ENOTFOUND',
    'ECONNREFUSED'
  ];

  const errorStr = error?.message || error?.code || String(error);
  return retriableErrors.some(
    (errType) => errorStr.includes(errType) || error === TeamErrEnum.aiPointsNotEnough
  );
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
  const lockKey = `eval_task_finish_${evalId}`;
  const lock = await acquireDistributedLock(lockKey, 30000);

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
                '$evaluatorOutput.score',
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

    // Task status is always completed when all items are finished
    const taskStatus = EvaluationStatusEnum.completed;

    // Update task status with statistical fields
    await MongoEvaluation.updateOne(
      { _id: new Types.ObjectId(evalId) },
      {
        $set: {
          finishTime: new Date(),
          avgScore: avgScore != null ? Math.round(avgScore * 100) / 100 : undefined,
          status: taskStatus,
          // Use statistics object to store execution statistics
          statistics: {
            totalItems: totalCount,
            completedItems: completedCount,
            errorItems: errorCount
          }
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
  } finally {
    await lock.release();
  }
};

// Handle evaluation item error
const handleEvalItemError = async (evalItemId: string, evalId: string, error: any) => {
  const errorMessage = getErrText(error);

  // Get current retry count
  const evalItem = await MongoEvalItem.findById(evalItemId, 'retry evalId');
  if (!evalItem) {
    addLog.error(`[Evaluation] Evaluation item does not exist: ${evalItemId}`);
    return;
  }

  const isRetriable = isRetriableError(error);
  const currentRetryCount = evalItem.retry || 3; // Default to 3 if not set
  const newRetryCount = isRetriable ? Math.max(currentRetryCount - 1, 0) : 0;
  const shouldRetry = isRetriable && newRetryCount > 0;
  const newStatus = shouldRetry ? EvaluationStatusEnum.queuing : EvaluationStatusEnum.error;

  await MongoEvalItem.updateOne(
    { _id: new Types.ObjectId(evalItemId) },
    {
      $set: {
        retry: newRetryCount,
        errorMessage,
        status: newStatus,
        finishTime: newStatus === EvaluationStatusEnum.error ? new Date() : undefined,
        // Clear partial results to allow clean retry
        ...(shouldRetry && {
          targetOutput: null,
          evaluatorOutput: null
        })
      }
    }
  );

  // Critical fix: Re-enqueue for retry
  if (shouldRetry) {
    const retryDelay = Math.min(1000 * Math.pow(2, 3 - newRetryCount), 30000); // Exponential backoff
    await evaluationItemQueue.add(
      `eval_item_retry_${evalItemId}_${Date.now()}`,
      {
        evalId,
        evalItemId
      },
      {
        delay: retryDelay
      }
    );

    addLog.info(
      `[Evaluation] Item requeued for retry: ${evalItemId}, remaining: ${newRetryCount}, delay: ${retryDelay}ms`
    );
  } else {
    addLog.error(
      `[Evaluation] Item failed permanently: ${evalItemId}, retriable: ${isRetriable}`,
      error
    );
  }
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
    const dataItems = await MongoEvalDatasetData.find({
      datasetId: evaluation.datasetId,
      teamId: evaluation.teamId
    }).lean();

    if (dataItems.length === 0) {
      throw new Error('Dataset loading failed');
    }

    // Validate target and evaluators configuration
    if (!evaluation.target || !evaluation.target.type || !evaluation.target.config) {
      throw new Error('Target configuration invalid');
    }

    if (!evaluation.evaluators || evaluation.evaluators.length === 0) {
      throw new Error('Evaluators configuration invalid');
    }

    // Check if evaluation items already exist (reentrant handling)
    const existingItems = await MongoEvalItem.find({ evalId }).lean();
    if (existingItems.length > 0) {
      addLog.info(`[Evaluation] Task already has ${existingItems.length} items, resuming...`);

      // Re-submit unfinished items to queue
      const pendingItems = existingItems.filter(
        (item) =>
          item.status === EvaluationStatusEnum.queuing ||
          (item.status === EvaluationStatusEnum.error && item.retry > 0)
      );

      if (pendingItems.length > 0) {
        const jobs = pendingItems.map((item, index) => ({
          name: `eval_item_${evalId}_resume_${index}`,
          data: {
            evalId,
            evalItemId: item._id.toString()
          },
          opts: {
            delay: index * 100
          }
        }));

        await evaluationItemQueue.addBulk(jobs);
        addLog.info(`[Evaluation] Resumed ${jobs.length} pending items`);
      }
      return;
    }

    // Create evaluation items for each dataItem and each evaluator (atomic structure)
    const evalItems = [];
    for (const dataItem of dataItems) {
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

    // Check if item is already completed (reentrant handling)
    if (evalItem.status === EvaluationStatusEnum.completed) {
      addLog.debug(`[Evaluation] Item already completed: ${evalItemId}`);
      return;
    }

    // Get evaluation information for AI Points check
    const evaluation = await MongoEvaluation.findById(evalId, 'teamId tmbId usageId');
    if (!evaluation) {
      throw new Error('Evaluation task does not exist');
    }

    // Check AI Points
    await checkTeamAIPoints(evaluation.teamId);

    let targetOutput = evalItem.targetOutput;
    let evaluatorOutput = evalItem.evaluatorOutput;
    let shouldExecuteTarget = true;
    let shouldExecuteEvaluator = true;

    // Resume from checkpoint if partially completed
    if (evalItem.status === EvaluationStatusEnum.evaluating) {
      if (evalItem.evaluatorOutput) {
        addLog.info(`[Evaluation] Item already completed evaluator: ${evalItemId}`);
        return; // Already completed, nothing to do
      } else if (evalItem.targetOutput) {
        addLog.info(`[Evaluation] Resuming from evaluator: ${evalItemId}`);
        targetOutput = evalItem.targetOutput;
        shouldExecuteTarget = false;
      } else {
        addLog.info(`[Evaluation] Restarting item: ${evalItemId}`);
      }
    }

    // Update status to processing
    await MongoEvalItem.updateOne(
      { _id: new Types.ObjectId(evalItemId) },
      { $set: { status: EvaluationStatusEnum.evaluating } }
    );

    // 1. Call evaluation target (if not already done)
    if (shouldExecuteTarget) {
      const targetInstance = createTargetInstance(evalItem.target);
      targetOutput = await targetInstance.execute({
        userInput: evalItem.dataItem.userInput,
        context: evalItem.dataItem.context
      });

      // Save target output as checkpoint
      await MongoEvalItem.updateOne(
        { _id: new Types.ObjectId(evalItemId) },
        { $set: { targetOutput: targetOutput } }
      );

      // Record usage from target call
      if (targetOutput.usage) {
        const totalPoints = targetOutput.usage.reduce(
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
    }

    // Ensure output is available for evaluator
    if (!targetOutput) {
      throw new Error('Target output is required for evaluation');
    }

    // 2. Execute evaluator (if not already done)
    let totalMetricPoints = 0;

    if (shouldExecuteEvaluator) {
      const evaluatorInstance = createEvaluatorInstance(evalItem.evaluator);

      evaluatorOutput = await evaluatorInstance.evaluate({
        userInput: evalItem.dataItem.userInput,
        expectedOutput: evalItem.dataItem.expectedOutput,
        actualOutput: targetOutput.actualOutput,
        context: evalItem.dataItem.context,
        retrievalContext: targetOutput.retrievalContext
      });
    }

    // Ensure evaluatorOutput is available
    if (!evaluatorOutput) {
      throw new Error('Evaluator output is required for completion');
    }

    // Record usage from metric evaluation
    if (evalItem.evaluator.metric.type === 'ai_model' && evaluatorOutput.details?.usage) {
      totalMetricPoints += evaluatorOutput.details.usage.totalPoints || 0;
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
          targetOutput: targetOutput,
          evaluatorOutput: evaluatorOutput,
          status: EvaluationStatusEnum.completed,
          finishTime: new Date()
        }
      }
    );

    addLog.debug(
      `[Evaluation] Evaluation item completed: ${evalItemId}, score: ${evaluatorOutput.score}`
    );
  } catch (error) {
    await handleEvalItemError(evalItemId, evalId, error);

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

// Initialize worker
export const initEvalTaskWorker = () => {
  return getEvaluationTaskWorker(evaluationTaskProcessor);
};

export const initEvalTaskItemWorker = () => {
  return getEvaluationItemWorker(evaluationItemProcessor);
};

// Export for testing
export { evaluationTaskProcessor, evaluationItemProcessor, finishEvaluationTask };

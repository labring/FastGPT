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
import { EvaluationErrEnum } from '@fastgpt/global/common/error/code/evaluation';
import { getErrText } from '@fastgpt/global/common/error/utils';
import { createMergedEvaluationUsage } from '../utils/usage';

// Sleep utility function
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Evaluation stage error types
export enum EvaluationStageEnum {
  TaskExecute = 'TaskExecute',
  EvaluatorExecute = 'EvaluatorExecute',
  ResourceCheck = 'ResourceCheck'
}

// Structured error class for evaluation stages
export class EvaluationStageError extends Error {
  public readonly stage: EvaluationStageEnum;
  public readonly originalError: any;
  public readonly retriable: boolean;

  constructor(
    stage: EvaluationStageEnum,
    errorMsg: string,
    retriable: boolean,
    originalError?: any
  ) {
    super(errorMsg);
    this.name = 'EvaluationStageError';
    this.stage = stage;
    this.originalError = originalError;
    this.retriable = retriable;
  }

  toString(): string {
    return `[${this.stage}] ${this.message}`;
  }
}

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
    throw new Error(EvaluationErrEnum.evalLockAcquisitionFailed);
  }

  // Acquire lock
  distributedLocks.set(lockKey, { timestamp: now, timeout });

  return {
    release: async () => {
      distributedLocks.delete(lockKey);
    }
  };
};

// Enhanced retriable error patterns with categories
const RETRIABLE_ERROR_PATTERNS = {
  // Network connectivity issues
  network: [
    'NETWORK_ERROR',
    'ECONNRESET',
    'ENOTFOUND',
    'ECONNREFUSED',
    'Connection refused',
    'socket hang up',
    'connect timeout',
    'EHOSTUNREACH',
    'ENETUNREACH'
  ],
  // Timeout related errors
  timeout: ['TIMEOUT', 'timeout', 'ETIMEDOUT', 'Request timeout', 'Connection timeout'],
  // Rate limiting and temporary service issues
  rateLimit: [
    'RATE_LIMIT',
    'rate limit',
    'too many requests',
    '429',
    'quota exceeded',
    'throttled'
  ],
  // Temporary server errors
  serverError: [
    '502',
    '503',
    '504',
    'bad gateway',
    'service unavailable',
    'gateway timeout',
    'temporary failure',
    'server overloaded'
  ]
};

const maxRetries = Number(process.env.EVAL_ITEM_MAX_RETRY) || 3; // Default max retry count

// Enhanced error analysis with category detection
const analyzeError = (
  error: any
): { isRetriable: boolean; category?: string; pattern?: string } => {
  const errorStr = error?.message || error?.code || String(error);
  const lowerErrorStr = errorStr.toLowerCase();

  // Check each category for matches
  for (const [category, patterns] of Object.entries(RETRIABLE_ERROR_PATTERNS)) {
    for (const pattern of patterns) {
      if (lowerErrorStr.includes(pattern.toLowerCase())) {
        return { isRetriable: true, category, pattern };
      }
    }
  }

  // Check HTTP status codes directly
  const httpStatusMatch = errorStr.match(/\b(4\d{2}|5\d{2})\b/);
  if (httpStatusMatch) {
    const statusCode = httpStatusMatch[1];
    // 4xx errors are generally not retriable except 429
    if (statusCode === '429') {
      return { isRetriable: true, category: 'rateLimit', pattern: statusCode };
    }
    // 5xx errors are generally retriable
    if (statusCode.startsWith('5')) {
      return { isRetriable: true, category: 'serverError', pattern: statusCode };
    }
  }

  return { isRetriable: false };
};

// Backward compatibility function
const matchesRetriablePattern = (error: any): boolean => {
  return analyzeError(error).isRetriable;
};

// Determine if target execution error should be retriable
const isTargetExecutionRetriable = (error: any): boolean => {
  if (error === TeamErrEnum.aiPointsNotEnough) return false;
  return matchesRetriablePattern(error);
};

// Determine if evaluator execution error should be retriable
const isEvaluatorExecutionRetriable = (error: any): boolean => {
  if (error === TeamErrEnum.aiPointsNotEnough) return false;
  return matchesRetriablePattern(error);
};

// General error retriability check for handleEvalItemError
const isRetriableError = (error: any): boolean => {
  // If it's a structured stage error, use its retriable flag
  if (error instanceof EvaluationStageError) {
    return error.retriable;
  }

  return matchesRetriablePattern(error);
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
                '$evaluatorOutput?.data?.score',
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

    addLog.debug(
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
  let errorMessage = getErrText(error);
  let stage = 'Unknown';

  // Extract stage and error information from structured errors
  if (error instanceof EvaluationStageError) {
    stage = error.stage;
    errorMessage = `[${stage}] ${error.message}`;
  }

  // Get current evaluation item
  const evalItem = await MongoEvalItem.findById(evalItemId, 'retry evalId');
  if (!evalItem) {
    addLog.error(`[Evaluation] Evaluation item does not exist: ${evalItemId}`);
    return;
  }

  const isRetriable = isRetriableError(error);
  const currentRetryCount = evalItem.retry || 0;
  const newRetryCount = isRetriable ? Math.max(currentRetryCount - 1, 0) : 0;
  const shouldRetry = isRetriable && newRetryCount > 0;
  const newStatus = shouldRetry ? EvaluationStatusEnum.queuing : EvaluationStatusEnum.error;

  // Build retry attempt info for logging
  const retryAttempt = maxRetries - currentRetryCount + 1;

  const updateData: any = {
    retry: newRetryCount,
    errorMessage,
    status: newStatus,
    finishTime: newStatus === EvaluationStatusEnum.error ? new Date() : undefined
  };

  await MongoEvalItem.updateOne({ _id: new Types.ObjectId(evalItemId) }, updateData);

  // Re-enqueue for retry with improved job naming
  if (shouldRetry) {
    const retryDelay = Math.min(1000 * Math.pow(2, maxRetries - newRetryCount), 30000); // Exponential backoff
    await evaluationItemQueue.add(
      `eval_item_${evalItemId}_retry_${retryAttempt}`,
      {
        evalId,
        evalItemId
      },
      {
        delay: retryDelay
      }
    );

    addLog.debug(
      `[Evaluation] Item requeued for retry: ${evalItemId}, stage: ${stage}, remaining: ${newRetryCount}, delay: ${retryDelay}ms`
    );
  } else {
    addLog.error(
      `[Evaluation] Item failed permanently: ${evalItemId}, stage: ${stage}, retriable: ${isRetriable}`,
      error instanceof EvaluationStageError ? error.originalError || error : error
    );
  }
};

// Evaluation task processor
const evaluationTaskProcessor = async (job: Job<EvaluationTaskJobData>) => {
  const { evalId } = job.data;

  addLog.debug(`[Evaluation] Start processing evaluation task: ${evalId}`);

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

    // TODO: Handle targetCallParams population for evaluation data items
    // The dataItems loaded from dataset only contain basic EvalDatasetDataSchemaType fields
    // but evaluation items need EvaluationDataItemType (including targetCallParams).
    // Need to:
    // 1. Determine source of targetCallParams (evaluation config, dataset metadata, or default)
    // 2. Transform dataItems to include targetCallParams before creating evaluation items
    // 3. Consider caching strategy for targetCallParams if they are dynamic per evaluation

    if (dataItems.length === 0) {
      throw new Error(EvaluationErrEnum.evalDatasetLoadFailed);
    }

    // Validate target and evaluators configuration
    if (!evaluation.target || !evaluation.target.type || !evaluation.target.config) {
      throw new Error(EvaluationErrEnum.evalTargetConfigInvalid);
    }

    if (!evaluation.evaluators || evaluation.evaluators.length === 0) {
      throw new Error(EvaluationErrEnum.evalEvaluatorsConfigInvalid);
    }

    // Check if evaluation items already exist (reentrant handling)
    const existingItems = await MongoEvalItem.find({ evalId }).lean();
    if (existingItems.length > 0) {
      addLog.debug(`[Evaluation] Task already has ${existingItems.length} items, resuming...`);

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
        addLog.debug(`[Evaluation] Resumed ${jobs.length} pending items`);
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
          retry: maxRetries
        });
      }
    }

    // Batch insert evaluation items
    const insertedItems = await MongoEvalItem.insertMany(evalItems);
    addLog.debug(`[Evaluation] Created ${insertedItems.length} atomic evaluation items`);

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

    addLog.debug(
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
      throw new EvaluationStageError(
        EvaluationStageEnum.ResourceCheck,
        getErrText(EvaluationErrEnum.evalItemNotFound),
        false // Resource not found errors are not retriable
      );
    }

    // Check if item is already completed (reentrant handling)
    if (evalItem.status === EvaluationStatusEnum.completed) {
      addLog.debug(`[Evaluation] Item already completed: ${evalItemId}`);
      return;
    }

    // Get evaluation information for AI Points check
    const evaluation = await MongoEvaluation.findById(evalId, 'teamId tmbId usageId');
    if (!evaluation) {
      throw new EvaluationStageError(
        EvaluationStageEnum.ResourceCheck,
        getErrText(EvaluationErrEnum.evalTaskNotFound),
        false // Resource not found errors are not retriable
      );
    }

    // Check AI Points
    try {
      await checkTeamAIPoints(evaluation.teamId);
    } catch (error) {
      throw new EvaluationStageError(
        EvaluationStageEnum.ResourceCheck,
        getErrText(error),
        false // AI Point errors are not retriable
      );
    }

    // Initialize outputs - check for existing results first for resume capability
    let targetOutput: any = undefined;
    let evaluatorOutput: any = undefined;

    // Resume from checkpoint only if in evaluating status
    if (evalItem.status === EvaluationStatusEnum.evaluating) {
      if (evalItem.targetOutput?.actualOutput) {
        addLog.debug(`[Evaluation] Resuming targetOutput from evalItem: ${evalItemId}`);
        targetOutput = evalItem.targetOutput;
      }
      if (evalItem.evaluatorOutput?.data?.score) {
        addLog.debug(`[Evaluation] Resuming evaluatorOutput from evalItem: ${evalItemId}`);
        evaluatorOutput = evalItem.evaluatorOutput;
      }
    } else {
      // For queuing or error status, always start from scratch
      addLog.debug(
        `[Evaluation] Starting/restarting item from scratch: ${evalItemId}, status: ${evalItem.status}`
      );
    }

    // Update status to processing
    await MongoEvalItem.updateOne(
      { _id: new Types.ObjectId(evalItemId) },
      { $set: { status: EvaluationStatusEnum.evaluating } }
    );

    // 1. Call evaluation target (if not already done)
    if (!targetOutput || !targetOutput.actualOutput) {
      try {
        const targetInstance = createTargetInstance(evalItem.target);
        targetOutput = await targetInstance.execute({
          userInput: evalItem.dataItem.userInput,
          context: evalItem.dataItem.context,
          targetCallParams: evalItem.dataItem.targetCallParams
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
      } catch (error) {
        // Normalize target execution error
        const retriable = isTargetExecutionRetriable(error);
        const errorMessage = getErrText(error) || 'Target execution failed';

        throw new EvaluationStageError(
          EvaluationStageEnum.TaskExecute,
          errorMessage,
          retriable,
          error
        );
      }
    }

    // 2. Execute evaluator (if not already done)
    let totalMetricPoints = 0;

    if (!evaluatorOutput || !evaluatorOutput.data?.score) {
      try {
        const evaluatorInstance = createEvaluatorInstance(evalItem.evaluator);

        evaluatorOutput = await evaluatorInstance.evaluate({
          userInput: evalItem.dataItem.userInput,
          expectedOutput: evalItem.dataItem.expectedOutput,
          actualOutput: targetOutput.actualOutput,
          context: evalItem.dataItem.context,
          retrievalContext: targetOutput.retrievalContext
        });
      } catch (error) {
        // Normalize evaluator execution error
        const retriable = isEvaluatorExecutionRetriable(error);
        const errorMessage = getErrText(error) || 'Evaluator execution failed';

        throw new EvaluationStageError(
          EvaluationStageEnum.EvaluatorExecute,
          errorMessage,
          retriable,
          error
        );
      }
    }

    // Record usage from metric evaluation
    if (evaluatorOutput.totalPoints) {
      totalMetricPoints += evaluatorOutput.totalPoints || 0;
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
      `[Evaluation] Evaluation item completed: ${evalItemId}, score: ${evaluatorOutput?.data?.score}`
    );
  } catch (error) {
    addLog.error(`[Evaluation] Evaluation item error: ${evalItemId}, error: ${error}`);
    await handleEvalItemError(evalItemId, evalId, error);
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

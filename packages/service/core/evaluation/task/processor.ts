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

// Aggregated error class for multiple evaluator errors
export class EvaluatorAggregatedError extends Error {
  public readonly errors: Array<{
    evaluatorName: string;
    error: string;
    retriable: boolean;
  }>;
  public readonly retriable: boolean;

  constructor(errors: Array<{ evaluatorName: string; error: string }>) {
    const errorMessages = errors.map((e) => `${e.evaluatorName}: ${e.error}`);
    super(`Evaluator errors: ${errorMessages.join('; ')}`);
    this.name = 'EvaluatorAggregatedError';

    // Check retriability for each error and determine overall retriability
    this.errors = errors.map((e) => ({
      ...e,
      retriable: isEvaluatorExecutionRetriable(e.error)
    }));

    // Consider aggregated error retriable if any individual error is retriable
    this.retriable = this.errors.some((e) => e.retriable);
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

// Determine if target execution error should be retriable
const isTargetExecutionRetriable = (error: any): boolean => {
  if (error === TeamErrEnum.aiPointsNotEnough) return false;
  if (error === EvaluationErrEnum.evalTargetOutputRequired) return true;
  return analyzeError(error).isRetriable;
};

// Determine if evaluator execution error should be retriable
const isEvaluatorExecutionRetriable = (error: any): boolean => {
  if (error === TeamErrEnum.aiPointsNotEnough) return false;
  return analyzeError(error).isRetriable;
};

// General error retriability check for handleEvalItemError
const isRetriableError = (error: any): boolean => {
  // If it's a structured stage error, use its retriable flag
  if (error instanceof EvaluationStageError) {
    return error.retriable;
  }

  // If it's an aggregated error, use its retriable flag
  if (error instanceof EvaluatorAggregatedError) {
    return error.retriable;
  }

  return analyzeError(error).isRetriable;
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

    // Calculate metric scores and trigger summary generation

    if (completedCount > 0 || itemsWithSuccessfulOutputs > 0) {
      try {
        // Scores are now calculated in real-time when getEvaluationSummary is called
        // No need to pre-calculate and save scores

        // Check which metrics need summary generation
        const currentEvaluation = await MongoEvaluation.findById(
          evalId,
          'evaluators summaryConfigs'
        ).lean();

        if (currentEvaluation?.evaluators && currentEvaluation.evaluators.length > 0) {
          // Find metrics with empty summaries
          const metricsNeedingSummary: string[] = [];

          currentEvaluation.evaluators.forEach((evaluator: any, index: number) => {
            const metricId = evaluator.metric._id.toString();
            const summaryConfig = currentEvaluation.summaryConfigs[index];

            // Check if summary is empty
            if (!summaryConfig?.summary || summaryConfig.summary.trim() === '') {
              metricsNeedingSummary.push(metricId);
            }
          });

          if (metricsNeedingSummary.length > 0) {
            // Trigger async summary generation for metrics with empty summaries
            setImmediate(() => {
              EvaluationSummaryService.generateSummaryReports(evalId, metricsNeedingSummary).catch(
                (error) => {
                  addLog.error(
                    `[Evaluation] Failed to trigger async summary generation: ${evalId}`,
                    error
                  );
                }
              );
            });

            addLog.debug(
              `[Evaluation] Triggered async summary generation for ${metricsNeedingSummary.length} metrics with empty summaries: ${evalId}, taskStatus: ${taskStatus}`
            );
          } else {
            addLog.debug(
              `[Evaluation] All metrics already have summaries, skipping summary generation: ${evalId}, taskStatus: ${taskStatus}`
            );
          }
        }
      } catch (summaryError) {
        // Log error without affecting main completion flow
        addLog.warn(`[Evaluation] Failed to trigger summary generation: ${evalId}`, {
          error: summaryError instanceof Error ? summaryError.message : String(summaryError)
        });
      }
    }
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
    throw createEvaluationError(aggregatedError, 'EvaluatorExecute', {
      evalId,
      evalItemId
    });
  }

  // Report final progress
  await job.updateProgress(100);

    const scores = evaluatorOutputs
      .map((output) => output?.data?.score)
      .filter((score) => score !== undefined);
    addLog.debug(
      `[Evaluation] Evaluation item completed: ${evalItemId}, scores: [${scores.join(', ')}], aggregateScore: ${aggregateScore}`
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

/**
 * Export processors for testing
 */
export { evaluationTaskProcessor, evaluationItemProcessor };

import { MongoEvaluation, MongoEvalItem } from './schema';
import type {
  EvaluationSchemaType,
  EvaluationItemSchemaType,
  CreateEvaluationParams,
  EvaluationItemDisplayType
} from '@fastgpt/global/core/evaluation/type';
import { Types } from 'mongoose';
import { EvaluationStatusEnum } from '@fastgpt/global/core/evaluation/constants';
import {
  evaluationTaskQueue,
  evaluationItemQueue,
  removeEvaluationTaskJob,
  removeEvaluationItemJobs,
  removeEvaluationItemJobsByItemId
} from './mq';
import { createTrainingUsage } from '../../../support/wallet/usage/controller';
import { UsageSourceEnum } from '@fastgpt/global/support/wallet/usage/constants';
import { addLog } from '../../../common/system/log';
import { checkTeamAIPoints } from '../../../support/permission/teamLimit';
import { EvaluationErrEnum } from '@fastgpt/global/common/error/code/evaluation';

export class EvaluationTaskService {
  static async createEvaluation(
    params: CreateEvaluationParams & {
      teamId: string;
      tmbId: string;
    }
  ): Promise<EvaluationSchemaType> {
    const { teamId, tmbId, ...evaluationParams } = params;

    // Check AI Points balance
    await checkTeamAIPoints(teamId);

    // Create usage record
    const { billId } = await createTrainingUsage({
      teamId,
      tmbId,
      appName: evaluationParams.name,
      billSource: UsageSourceEnum.evaluation
    });

    const evaluation = await MongoEvaluation.create({
      ...evaluationParams,
      teamId,
      tmbId,
      usageId: billId,
      status: EvaluationStatusEnum.queuing,
      createTime: new Date()
    });

    return evaluation.toObject();
  }

  static async getEvaluation(evalId: string, teamId: string): Promise<EvaluationSchemaType> {
    const evaluation = await MongoEvaluation.findOne({
      _id: new Types.ObjectId(evalId),
      teamId: new Types.ObjectId(teamId)
    }).lean();
    if (!evaluation) {
      throw new Error(EvaluationErrEnum.evalTaskNotFound);
    }
    return evaluation;
  }

  static async updateEvaluation(
    evalId: string,
    updates: Partial<CreateEvaluationParams>,
    teamId: string
  ): Promise<void> {
    const result = await MongoEvaluation.updateOne(
      { _id: new Types.ObjectId(evalId), teamId: new Types.ObjectId(teamId) },
      { $set: updates }
    );
    if (result.matchedCount === 0) {
      throw new Error(EvaluationErrEnum.evalTaskNotFound);
    }
  }

  static async deleteEvaluation(evalId: string, teamId: string): Promise<void> {
    // Remove related tasks from queue to prevent further processing
    const [taskCleanupResult, itemCleanupResult] = await Promise.all([
      removeEvaluationTaskJob(evalId, {
        forceCleanActiveJobs: true,
        retryAttempts: 3,
        retryDelay: 200
      }),
      removeEvaluationItemJobs(evalId, {
        forceCleanActiveJobs: true,
        retryAttempts: 3,
        retryDelay: 200
      })
    ]);

    addLog.debug('Queue cleanup completed for evaluation deletion', {
      evalId,
      taskCleanup: taskCleanupResult,
      itemCleanup: itemCleanupResult
    });

    // Delete all evaluation items for this evaluation task
    await MongoEvalItem.deleteMany({ evalId: evalId });

    const result = await MongoEvaluation.deleteOne({
      _id: new Types.ObjectId(evalId),
      teamId: new Types.ObjectId(teamId)
    });

    if (result.deletedCount === 0) {
      throw new Error(EvaluationErrEnum.evalTaskNotFound);
    }

    addLog.debug(`[Evaluation] Evaluation task deleted including queue cleanup: ${evalId}`);
  }

  static async listEvaluations(
    teamId: string,
    page: number = 1,
    pageSize: number = 20,
    searchKey?: string,
    accessibleIds?: string[],
    tmbId?: string,
    isOwner: boolean = false
  ): Promise<{
    list: any[];
    total: number;
  }> {
    // Build basic filter and pagination
    const filter: any = { teamId: new Types.ObjectId(teamId) };
    if (searchKey) {
      filter.$or = [
        { name: { $regex: searchKey, $options: 'i' } },
        { description: { $regex: searchKey, $options: 'i' } }
      ];
    }
    const skip = (page - 1) * pageSize;
    const limit = pageSize;
    const sort = { createTime: -1 as const };

    // If not owner, filter by accessible resources
    let finalFilter = filter;
    if (!isOwner && accessibleIds) {
      finalFilter = {
        ...filter,
        $or: [
          { _id: { $in: accessibleIds.map((id) => new Types.ObjectId(id)) } },
          ...(tmbId ? [{ tmbId: new Types.ObjectId(tmbId) }] : []) // Own evaluations
        ]
      };
    }

    const [evaluations, total] = await Promise.all([
      MongoEvaluation.aggregate([
        { $match: finalFilter },
        {
          $lookup: {
            from: 'eval_datasets',
            localField: 'datasetId',
            foreignField: '_id',
            as: 'dataset'
          }
        },
        {
          $lookup: {
            from: 'teammembers',
            localField: 'tmbId',
            foreignField: '_id',
            as: 'executor'
          }
        },
        {
          $lookup: {
            from: 'eval_items',
            localField: '_id',
            foreignField: 'evalId',
            as: 'evalItems'
          }
        },
        {
          $addFields: {
            datasetName: { $arrayElemAt: ['$dataset.name', 0] },
            targetName: {
              $switch: {
                branches: [
                  {
                    case: { $eq: ['$target.type', 'workflow'] },
                    then: { $concat: ['Workflow: ', { $toString: '$target.config.appId' }] }
                  }
                ],
                default: 'Unknown Target'
              }
            },
            metricNames: {
              $map: {
                input: '$evaluators',
                as: 'evaluator',
                in: { $concat: ['Evaluator: ', { $toString: '$$evaluator.metricId' }] }
              }
            },
            executorName: { $arrayElemAt: ['$executor.memberName', 0] },
            executorAvatar: { $arrayElemAt: ['$executor.avatar', 0] },
            totalCount: { $size: '$evalItems' },
            completedCount: {
              $size: {
                $filter: {
                  input: '$evalItems',
                  cond: { $eq: ['$$this.status', EvaluationStatusEnum.completed] }
                }
              }
            },
            errorCount: {
              $size: {
                $filter: {
                  input: '$evalItems',
                  cond: { $ne: ['$$this.errorMessage', null] }
                }
              }
            }
          }
        },
        {
          $project: {
            _id: 1,
            name: 1,
            createTime: 1,
            finishTime: 1,
            status: 1,
            errorMessage: 1,
            avgScore: 1,
            datasetName: 1,
            targetName: 1,
            metricNames: 1,
            executorName: 1,
            executorAvatar: 1,
            totalCount: 1,
            completedCount: 1,
            errorCount: 1,
            tmbId: 1
          }
        },
        { $sort: sort },
        { $skip: skip },
        { $limit: limit }
      ]),
      MongoEvaluation.countDocuments(finalFilter)
    ]);

    // Return raw data - permissions will be handled in API layer
    return {
      list: evaluations,
      total
    };
  }

  static async listEvaluationItems(
    evalId: string,
    teamId: string,
    page: number = 1,
    pageSize: number = 20
  ): Promise<{
    items: EvaluationItemDisplayType[];
    total: number;
  }> {
    const evaluation = await this.getEvaluation(evalId, teamId);

    const skip = (page - 1) * pageSize;
    const limit = pageSize;

    const [items, total] = await Promise.all([
      MongoEvalItem.find({ evalId: evaluation._id })
        .sort({ createTime: -1 })
        .skip(skip)
        .limit(limit)
        .lean()
        .then((items) =>
          items.map((item) => ({
            ...item,
            evalItemId: item._id.toString()
          }))
        ),
      MongoEvalItem.countDocuments({ evalId: evaluation._id })
    ]);

    return { items, total };
  }

  static async startEvaluation(evalId: string, teamId: string): Promise<void> {
    const evaluation = await this.getEvaluation(evalId, teamId);

    if (evaluation.status !== EvaluationStatusEnum.queuing) {
      throw new Error(EvaluationErrEnum.evalOnlyQueuingCanStart);
    }

    // Update status to processing
    await MongoEvaluation.updateOne(
      { _id: new Types.ObjectId(evalId) },
      { $set: { status: EvaluationStatusEnum.evaluating } }
    );

    // Submit to queue
    await evaluationTaskQueue.add(`eval_task_${evalId}`, {
      evalId: evalId
    });

    addLog.debug(`[Evaluation] Task submitted to queue: ${evalId}`);
  }

  static async stopEvaluation(evalId: string, teamId: string): Promise<void> {
    const evaluation = await this.getEvaluation(evalId, teamId);

    if (
      ![EvaluationStatusEnum.evaluating, EvaluationStatusEnum.queuing].includes(evaluation.status)
    ) {
      throw new Error(EvaluationErrEnum.evalOnlyRunningCanStop);
    }

    // Remove related tasks from queue
    const [taskCleanupResult, itemCleanupResult] = await Promise.all([
      removeEvaluationTaskJob(evalId, {
        forceCleanActiveJobs: true,
        retryAttempts: 3,
        retryDelay: 200
      }),
      removeEvaluationItemJobs(evalId, {
        forceCleanActiveJobs: true,
        retryAttempts: 3,
        retryDelay: 200
      })
    ]);

    addLog.debug('Queue cleanup completed for evaluation stop', {
      evalId,
      taskCleanup: taskCleanupResult,
      itemCleanup: itemCleanupResult
    });

    // Update status to error (manually stopped)
    await MongoEvaluation.updateOne(
      { _id: new Types.ObjectId(evalId) },
      {
        $set: {
          status: EvaluationStatusEnum.error,
          finishTime: new Date(),
          errorMessage: 'Manually stopped'
        }
      }
    );

    // Stop all related evaluation items
    await MongoEvalItem.updateMany(
      {
        evalId: new Types.ObjectId(evalId),
        status: { $in: [EvaluationStatusEnum.queuing, EvaluationStatusEnum.evaluating] }
      },
      {
        $set: {
          status: EvaluationStatusEnum.error,
          errorMessage: 'Manually stopped',
          finishTime: new Date()
        }
      }
    );

    addLog.debug(`[Evaluation] Task manually stopped and removed from queue: ${evalId}`);
  }

  static async getEvaluationStats(
    evalId: string,
    teamId: string
  ): Promise<{
    total: number;
    completed: number;
    evaluating: number;
    queuing: number;
    error: number;
    avgScore?: number;
  }> {
    const evaluation = await this.getEvaluation(evalId, teamId);

    const stats = await MongoEvalItem.aggregate([
      { $match: { evalId: evaluation._id } },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
          avgScore: { $avg: '$evaluatorOutput?.data?.score' }
        }
      }
    ]);

    const result = {
      total: 0,
      completed: 0,
      evaluating: 0,
      queuing: 0,
      error: 0,
      avgScore: undefined as number | undefined
    };

    stats.forEach((stat) => {
      result.total += stat.count;
      switch (stat._id) {
        case EvaluationStatusEnum.completed:
          result.completed = stat.count;
          if (stat.avgScore) {
            result.avgScore = Math.round(stat.avgScore * 100) / 100;
          }
          break;
        case EvaluationStatusEnum.evaluating:
          result.evaluating = stat.count;
          break;
        case EvaluationStatusEnum.queuing:
          result.queuing = stat.count;
          break;
      }
    });

    // Count error items
    result.error = await MongoEvalItem.countDocuments({
      evalId: evaluation._id,
      errorMessage: { $ne: null }
    });

    return result;
  }

  // ========================= Evaluation Item Related APIs =========================

  static async getEvaluationItem(
    itemId: string,
    teamId: string
  ): Promise<EvaluationItemSchemaType> {
    const item = await MongoEvalItem.findById(itemId).lean();

    if (!item) {
      throw new Error(EvaluationErrEnum.evalItemNotFound);
    }

    await this.getEvaluation(item.evalId, teamId);

    return item;
  }

  static async updateEvaluationItem(
    itemId: string,
    updates: Partial<EvaluationItemSchemaType>,
    teamId: string
  ): Promise<void> {
    await this.getEvaluationItem(itemId, teamId);

    const result = await MongoEvalItem.updateOne({ _id: itemId }, { $set: updates });

    if (result.matchedCount === 0) {
      throw new Error(EvaluationErrEnum.evalItemNotFound);
    }
  }

  static async deleteEvaluationItem(itemId: string, teamId: string): Promise<void> {
    await this.getEvaluationItem(itemId, teamId);

    // Remove related jobs from queue before deleting the item
    const cleanupResult = await removeEvaluationItemJobsByItemId(itemId, {
      forceCleanActiveJobs: true,
      retryAttempts: 3,
      retryDelay: 200
    });

    addLog.debug('Queue cleanup completed for evaluation item deletion', {
      itemId,
      cleanup: cleanupResult
    });

    const result = await MongoEvalItem.deleteOne({ _id: itemId });

    if (result.deletedCount === 0) {
      throw new Error(EvaluationErrEnum.evalItemNotFound);
    }

    addLog.debug(`[Evaluation] Evaluation item deleted including queue cleanup: ${itemId}`);
  }

  static async retryEvaluationItem(itemId: string, teamId: string): Promise<void> {
    const item = await this.getEvaluationItem(itemId, teamId);

    // Only completed evaluation items without errors cannot be retried
    if (item.status === EvaluationStatusEnum.completed && !item.errorMessage) {
      throw new Error(EvaluationErrEnum.evalOnlyFailedCanRetry);
    }

    // Check if there is error message or in retryable status
    if (!item.errorMessage && item.status !== EvaluationStatusEnum.queuing) {
      throw new Error(EvaluationErrEnum.evalItemNoErrorToRetry);
    }

    // Remove existing jobs for this item to prevent duplicates
    const cleanupResult = await removeEvaluationItemJobsByItemId(itemId, {
      forceCleanActiveJobs: true,
      retryAttempts: 3,
      retryDelay: 200
    });

    addLog.debug('Queue cleanup completed for evaluation item retry', {
      itemId,
      cleanup: cleanupResult
    });

    // Update status
    await MongoEvalItem.updateOne(
      { _id: itemId },
      {
        $set: {
          status: EvaluationStatusEnum.queuing,
          targetOutput: null,
          evaluatorOutput: null,
          finishTime: null,
          errorMessage: null,
          retry: Math.max(item.retry || 0, 1) // Ensure at least 1 retry chance
        }
      }
    );

    // Resubmit to queue
    await evaluationItemQueue.add(`eval_item_retry_${itemId}`, {
      evalId: item.evalId,
      evalItemId: itemId
    });

    addLog.debug(`[Evaluation] Evaluation item reset to queuing status and resubmitted: ${itemId}`);
  }

  static async retryFailedItems(evalId: string, teamId: string): Promise<number> {
    const evaluation = await this.getEvaluation(evalId, teamId);

    // Find items that need to be retried
    const itemsToRetry = await MongoEvalItem.find(
      {
        evalId: evaluation._id,
        $or: [
          // Items with failed status
          { status: EvaluationStatusEnum.error },
          // Or items with error messages (regardless of status)
          { errorMessage: { $ne: null } }
        ]
      },
      '_id'
    ).lean();

    if (itemsToRetry.length === 0) {
      return 0;
    }

    // Clean up existing jobs for all items that will be retried to prevent duplicates
    const itemIds = itemsToRetry.map((item) => item._id.toString());
    const cleanupPromises = itemIds.map((itemId) =>
      removeEvaluationItemJobsByItemId(itemId, {
        forceCleanActiveJobs: true,
        retryAttempts: 3,
        retryDelay: 200
      })
    );

    const cleanupResults = await Promise.allSettled(cleanupPromises);
    const successfulCleanups = cleanupResults.filter((r) => r.status === 'fulfilled').length;

    addLog.debug('Queue cleanup completed for batch retry failed items', {
      evalId,
      totalItems: itemsToRetry.length,
      successfulCleanups,
      failedCleanups: cleanupResults.length - successfulCleanups
    });

    // Batch update status
    await MongoEvalItem.updateMany(
      {
        _id: { $in: itemsToRetry.map((item) => item._id) }
      },
      {
        $set: {
          status: EvaluationStatusEnum.queuing,
          targetOutput: null,
          evaluatorOutput: null,
          finishTime: null,
          errorMessage: null
        },
        $inc: {
          retry: 1
        }
      }
    );

    // Batch resubmit to queue
    const jobs = itemsToRetry.map((item, index) => ({
      name: `eval_item_batch_retry_${evalId}_${index}`,
      data: {
        evalId: evaluation._id,
        evalItemId: item._id.toString()
      },
      opts: {
        delay: index * 100 // Add small delay to avoid starting too many tasks simultaneously
      }
    }));

    await evaluationItemQueue.addBulk(jobs);

    addLog.debug(
      `[Evaluation] Batch retry failed items: ${evalId}, affected count: ${itemsToRetry.length}`
    );

    return itemsToRetry.length;
  }

  static async getEvaluationItemResult(
    itemId: string,
    teamId: string
  ): Promise<{
    item: EvaluationItemSchemaType;
    dataItem: any;
    response?: string;
    result?: any;
    score?: number;
  }> {
    const item = await this.getEvaluationItem(itemId, teamId);

    return {
      item,
      dataItem: item.dataItem,
      response: item.targetOutput?.actualOutput,
      result: item.evaluatorOutput,
      score: item.evaluatorOutput?.data?.score
    };
  }

  // Search evaluation items
  static async searchEvaluationItems(
    evalId: string,
    teamId: string,
    options: {
      status?: EvaluationStatusEnum;
      hasError?: boolean;
      scoreRange?: { min?: number; max?: number };
      keyword?: string;
      page?: number;
      pageSize?: number;
    } = {}
  ): Promise<{
    items: EvaluationItemDisplayType[];
    total: number;
  }> {
    const evaluation = await this.getEvaluation(evalId, teamId);

    const { status, hasError, scoreRange, keyword, page = 1, pageSize = 20 } = options;

    // Build query conditions
    const filter: any = { evalId: evaluation._id };

    if (status !== undefined) {
      filter.status = status;
    }

    if (hasError === true) {
      filter.errorMessage = { $ne: null };
    } else if (hasError === false) {
      filter.errorMessage = null;
    }

    if (scoreRange) {
      const scoreFilter: any = {};
      if (scoreRange.min !== undefined) {
        scoreFilter.$gte = scoreRange.min;
      }
      if (scoreRange.max !== undefined) {
        scoreFilter.$lte = scoreRange.max;
      }
      if (Object.keys(scoreFilter).length > 0) {
        filter['evaluatorOutput.data.score'] = scoreFilter;
      }
    }

    if (keyword) {
      filter.$or = [
        { 'dataItem.userInput': { $regex: keyword, $options: 'i' } },
        { 'dataItem.expectedOutput': { $regex: keyword, $options: 'i' } },
        { 'targetOutput.actualOutput': { $regex: keyword, $options: 'i' } }
      ];
    }

    const skip = (page - 1) * pageSize;

    const [items, total] = await Promise.all([
      MongoEvalItem.find(filter)
        .sort({ createTime: -1 })
        .skip(skip)
        .limit(pageSize)
        .lean()
        .then((items) =>
          items.map((item) => ({
            ...item,
            evalItemId: item._id.toString()
          }))
        ),
      MongoEvalItem.countDocuments(filter)
    ]);

    return { items, total };
  }

  // Export evaluation item results
  static async exportEvaluationResults(
    evalId: string,
    teamId: string,
    format: 'csv' | 'json' = 'json'
  ): Promise<{ results: Buffer; total: number }> {
    const evaluation = await this.getEvaluation(evalId, teamId);

    const items = await MongoEvalItem.find({ evalId: evaluation._id })
      .sort({ createTime: 1 })
      .lean();

    const total = items.length;

    if (format === 'json') {
      const results = items.map((item) => ({
        itemId: item._id,
        userInput: item.dataItem?.userInput,
        expectedOutput: item.dataItem?.expectedOutput,
        actualOutput: item.targetOutput?.actualOutput,
        score: item.evaluatorOutput?.data?.score,
        status: item.status,
        targetOutput: item.targetOutput,
        evaluatorOutput: item.evaluatorOutput,
        errorMessage: item.errorMessage,
        finishTime: item.finishTime
      }));

      return { results: Buffer.from(JSON.stringify(results, null, 2)), total };
    } else {
      // CSV format
      if (items.length === 0) {
        return { results: Buffer.from(''), total: 0 };
      }

      const headers = [
        'ItemId',
        'UserInput',
        'ExpectedOutput',
        'ActualOutput',
        'Score',
        'Status',
        'ErrorMessage',
        'FinishTime'
      ];

      const csvRows = [headers.join(',')];

      items.forEach((item) => {
        const row = [
          item._id.toString(),
          `"${(item.dataItem?.userInput || '').replace(/"/g, '""')}"`,
          `"${(item.dataItem?.expectedOutput || '').replace(/"/g, '""')}"`,
          `"${(item.targetOutput?.actualOutput || '').replace(/"/g, '""')}"`,
          item.evaluatorOutput?.data?.score || '',
          item.status || '',
          `"${(item.errorMessage || '').replace(/"/g, '""')}"`,
          item.finishTime || ''
        ];
        csvRows.push(row.join(','));
      });

      return { results: Buffer.from(csvRows.join('\n')), total };
    }
  }
}
export { MongoEvaluation };

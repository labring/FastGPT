import { MongoEvaluation, MongoEvalItem } from './schema';
import type {
  EvaluationSchemaType,
  EvaluationItemSchemaType,
  CreateEvaluationParams,
  EvaluationDisplayType,
  EvaluationItemDisplayType
} from '@fastgpt/global/core/evaluation/type';
import type { AuthModeType } from '../../../support/permission/type';
import {
  validateResourceAccess,
  validateResourceCreate,
  validateListAccess,
  checkUpdateResult,
  checkDeleteResult
} from '../common';
import { EvaluationStatusEnum } from '@fastgpt/global/core/evaluation/constants';
import {
  evaluationTaskQueue,
  evaluationItemQueue,
  removeEvaluationTaskJob,
  removeEvaluationItemJobs
} from '../mq';
import { createTrainingUsage } from '../../../support/wallet/usage/controller';
import { UsageSourceEnum } from '@fastgpt/global/support/wallet/usage/constants';
import { addLog } from '../../../common/system/log';
import { checkTeamAIPoints } from '../../../support/permission/teamLimit';

export class EvaluationTaskService {
  static async createEvaluation(
    params: CreateEvaluationParams,
    auth: AuthModeType
  ): Promise<EvaluationSchemaType> {
    const { teamId, tmbId } = await validateResourceCreate(auth);

    // Check AI Points balance
    await checkTeamAIPoints(teamId);

    // Create usage record
    const { billId } = await createTrainingUsage({
      teamId,
      tmbId,
      appName: params.name,
      billSource: UsageSourceEnum.evaluation
    });

    const evaluation = await MongoEvaluation.create({
      ...params,
      teamId,
      tmbId,
      usageId: billId,
      status: EvaluationStatusEnum.queuing,
      createTime: new Date()
    });

    return evaluation.toObject();
  }

  static async getEvaluation(
    evaluationId: string,
    auth: AuthModeType
  ): Promise<EvaluationSchemaType> {
    const { resourceFilter, notFoundError } = await validateResourceAccess(
      evaluationId,
      auth,
      'Evaluation'
    );

    const evaluation = await MongoEvaluation.findOne(resourceFilter).lean();

    if (!evaluation) {
      throw new Error(notFoundError);
    }

    return evaluation;
  }

  static async updateEvaluation(
    evaluationId: string,
    updates: Partial<CreateEvaluationParams>,
    auth: AuthModeType
  ): Promise<void> {
    const { resourceFilter } = await validateResourceAccess(evaluationId, auth, 'Evaluation');

    const result = await MongoEvaluation.updateOne(resourceFilter, { $set: updates });

    checkUpdateResult(result, 'Evaluation');
  }

  static async deleteEvaluation(evaluationId: string, auth: AuthModeType): Promise<void> {
    const { resourceFilter } = await validateResourceAccess(evaluationId, auth, 'Evaluation');

    // Remove related tasks from queue to prevent further processing
    await Promise.all([
      removeEvaluationTaskJob(evaluationId),
      removeEvaluationItemJobs(evaluationId)
    ]);

    // Delete all evaluation items for this evaluation task
    await MongoEvalItem.deleteMany({ evalId: evaluationId });

    const result = await MongoEvaluation.deleteOne(resourceFilter);

    checkDeleteResult(result, 'Evaluation');

    addLog.info(`[Evaluation] Evaluation task deleted including queue cleanup: ${evaluationId}`);
  }

  static async listEvaluations(
    auth: AuthModeType,
    page: number = 1,
    pageSize: number = 20,
    searchKey?: string
  ): Promise<{
    evaluations: EvaluationDisplayType[];
    total: number;
  }> {
    const { filter, skip, limit, sort } = await validateListAccess(auth, searchKey, page, pageSize);

    const [evaluations, total] = await Promise.all([
      MongoEvaluation.aggregate([
        { $match: filter },
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
                  },
                  {
                    case: { $eq: ['$target.type', 'api'] },
                    then: { $concat: ['API: ', '$target.config.url'] }
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
            errorCount: 1
          }
        },
        { $sort: sort },
        { $skip: skip },
        { $limit: limit }
      ]),
      MongoEvaluation.countDocuments(filter)
    ]);

    return { evaluations, total };
  }

  static async listEvaluationItems(
    evaluationId: string,
    auth: AuthModeType,
    page: number = 1,
    pageSize: number = 20
  ): Promise<{
    items: EvaluationItemDisplayType[];
    total: number;
  }> {
    await this.getEvaluation(evaluationId, auth);

    const skip = (page - 1) * pageSize;
    const limit = pageSize;

    const [items, total] = await Promise.all([
      MongoEvalItem.find({ evalId: evaluationId })
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
      MongoEvalItem.countDocuments({ evalId: evaluationId })
    ]);

    return { items, total };
  }

  static async startEvaluation(evaluationId: string, auth: AuthModeType): Promise<void> {
    const evaluation = await this.getEvaluation(evaluationId, auth);

    if (evaluation.status !== EvaluationStatusEnum.queuing) {
      throw new Error('Only queuing evaluations can be started');
    }

    // Update status to processing
    await MongoEvaluation.updateOne(
      { _id: evaluationId },
      { $set: { status: EvaluationStatusEnum.evaluating } }
    );

    // Submit to queue
    await evaluationTaskQueue.add(`eval_task_${evaluationId}`, {
      evalId: evaluationId
    });

    addLog.info(`[Evaluation] Task submitted to queue: ${evaluationId}`);
  }

  static async stopEvaluation(evaluationId: string, auth: AuthModeType): Promise<void> {
    const evaluation = await this.getEvaluation(evaluationId, auth);

    if (
      ![EvaluationStatusEnum.evaluating, EvaluationStatusEnum.queuing].includes(evaluation.status)
    ) {
      throw new Error('Only running or queuing evaluations can be stopped');
    }

    // Remove related tasks from queue
    await Promise.all([
      removeEvaluationTaskJob(evaluationId),
      removeEvaluationItemJobs(evaluationId)
    ]);

    // Update status to error (manually stopped)
    await MongoEvaluation.updateOne(
      { _id: evaluationId },
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
        evalId: evaluationId,
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

    addLog.info(`[Evaluation] Task manually stopped and removed from queue: ${evaluationId}`);
  }

  static async getEvaluationStats(
    evaluationId: string,
    auth: AuthModeType
  ): Promise<{
    total: number;
    completed: number;
    evaluating: number;
    queuing: number;
    error: number;
    avgScore?: number;
  }> {
    await this.getEvaluation(evaluationId, auth);

    const stats = await MongoEvalItem.aggregate([
      { $match: { evalId: evaluationId } },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
          avgScore: { $avg: '$evaluator_output.score' }
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
      evalId: evaluationId,
      errorMessage: { $ne: null }
    });

    return result;
  }

  // ========================= Evaluation Item Related APIs =========================

  static async getEvaluationItem(
    itemId: string,
    auth: AuthModeType
  ): Promise<EvaluationItemSchemaType> {
    const item = await MongoEvalItem.findById(itemId).lean();

    if (!item) {
      throw new Error('Evaluation item not found');
    }

    // Validate access permission for evaluation task
    await this.getEvaluation(item.evalId, auth);

    return item;
  }

  static async updateEvaluationItem(
    itemId: string,
    updates: Partial<EvaluationItemSchemaType>,
    auth: AuthModeType
  ): Promise<void> {
    await this.getEvaluationItem(itemId, auth);

    const result = await MongoEvalItem.updateOne({ _id: itemId }, { $set: updates });

    checkUpdateResult(result, 'Evaluation item');
  }

  static async deleteEvaluationItem(itemId: string, auth: AuthModeType): Promise<void> {
    await this.getEvaluationItem(itemId, auth);

    const result = await MongoEvalItem.deleteOne({ _id: itemId });

    checkDeleteResult(result, 'Evaluation item');
  }

  static async retryEvaluationItem(itemId: string, auth: AuthModeType): Promise<void> {
    const item = await this.getEvaluationItem(itemId, auth);

    // Only completed evaluation items without errors cannot be retried
    if (item.status === EvaluationStatusEnum.completed && !item.errorMessage) {
      throw new Error('Only failed evaluation items can be retried');
    }

    // Check if there is error message or in retryable status
    if (!item.errorMessage && item.status !== EvaluationStatusEnum.queuing) {
      throw new Error('Evaluation item has no error to retry');
    }

    // Update status
    await MongoEvalItem.updateOne(
      { _id: itemId },
      {
        $set: {
          status: EvaluationStatusEnum.queuing,
          target_output: null,
          evaluator_output: null,
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

    addLog.info(`[Evaluation] Evaluation item reset to queuing status and resubmitted: ${itemId}`);
  }

  static async retryFailedItems(evaluationId: string, auth: AuthModeType): Promise<number> {
    await this.getEvaluation(evaluationId, auth);

    // Find items that need to be retried
    const itemsToRetry = await MongoEvalItem.find(
      {
        evalId: evaluationId,
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

    // Batch update status
    await MongoEvalItem.updateMany(
      {
        _id: { $in: itemsToRetry.map((item) => item._id) }
      },
      {
        $set: {
          status: EvaluationStatusEnum.queuing,
          target_output: null,
          evaluator_output: null,
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
      name: `eval_item_batch_retry_${evaluationId}_${index}`,
      data: {
        evalId: evaluationId,
        evalItemId: item._id.toString()
      },
      opts: {
        delay: index * 100 // Add small delay to avoid starting too many tasks simultaneously
      }
    }));

    await evaluationItemQueue.addBulk(jobs);

    addLog.info(
      `[Evaluation] Batch retry failed items: ${evaluationId}, affected count: ${itemsToRetry.length}`
    );

    return itemsToRetry.length;
  }

  static async getEvaluationItemResult(
    itemId: string,
    auth: AuthModeType
  ): Promise<{
    item: EvaluationItemSchemaType;
    dataItem: any;
    response?: string;
    result?: any;
    score?: number;
  }> {
    const item = await this.getEvaluationItem(itemId, auth);

    return {
      item,
      dataItem: item.dataItem,
      response: item.target_output?.actualOutput,
      result: item.evaluator_output,
      score: item.evaluator_output?.score
    };
  }

  // Cleanup hook function when deleting apps
  static async deleteAppHook(appIds: string[]): Promise<void> {
    // Find all evaluation tasks using these apps as workflow targets
    const evalJobs = await MongoEvaluation.find(
      {
        'target.type': 'workflow',
        'target.config.appId': { $in: appIds }
      },
      '_id status'
    ).lean();

    // Process each evaluation task
    for (const evalJob of evalJobs) {
      try {
        const evaluationId = String(evalJob._id);

        // Remove related tasks from queue
        await Promise.all([
          removeEvaluationTaskJob(evaluationId),
          removeEvaluationItemJobs(evaluationId)
        ]);

        // If evaluation task is still running, update status to error (app deleted)
        if (
          [EvaluationStatusEnum.evaluating, EvaluationStatusEnum.queuing].includes(evalJob.status)
        ) {
          await MongoEvaluation.updateOne(
            { _id: evalJob._id },
            {
              $set: {
                status: EvaluationStatusEnum.error,
                finishTime: new Date(),
                errorMessage: 'App deleted'
              }
            }
          );

          // Stop all related evaluation items
          await MongoEvalItem.updateMany(
            {
              evalId: evaluationId,
              status: { $in: [EvaluationStatusEnum.queuing, EvaluationStatusEnum.evaluating] }
            },
            {
              $set: {
                status: EvaluationStatusEnum.error,
                errorMessage: 'App deleted',
                finishTime: new Date()
              }
            }
          );
        }

        addLog.info(`[Evaluation] Cleanup evaluation task when app deleted: ${evaluationId}`);
      } catch (error) {
        addLog.error(`[Evaluation] Failed to cleanup evaluation task: ${evalJob._id}`, error);
        // Continue processing other evaluations even if one fails
      }
    }
  }

  // Search evaluation items
  static async searchEvaluationItems(
    evaluationId: string,
    auth: AuthModeType,
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
    await this.getEvaluation(evaluationId, auth);

    const { status, hasError, scoreRange, keyword, page = 1, pageSize = 20 } = options;

    // Build query conditions
    const filter: any = { evalId: evaluationId };

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
        filter['evaluator_output.score'] = scoreFilter;
      }
    }

    if (keyword) {
      filter.$or = [
        { 'dataItem.userInput': { $regex: keyword, $options: 'i' } },
        { 'dataItem.expectedOutput': { $regex: keyword, $options: 'i' } },
        { 'target_output.actualOutput': { $regex: keyword, $options: 'i' } }
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
    evaluationId: string,
    auth: AuthModeType,
    format: 'csv' | 'json' = 'json'
  ): Promise<Buffer> {
    await this.getEvaluation(evaluationId, auth);

    const items = await MongoEvalItem.find({ evalId: evaluationId }).sort({ createTime: 1 }).lean();

    if (format === 'json') {
      const results = items.map((item) => ({
        itemId: item._id,
        userInput: item.dataItem?.userInput,
        expectedOutput: item.dataItem?.expectedOutput,
        actualOutput: item.target_output?.actualOutput,
        score: item.evaluator_output?.score,
        status: item.status,
        targetOutput: item.target_output,
        evaluatorOutput: item.evaluator_output,
        errorMessage: item.errorMessage,
        finishTime: item.finishTime
      }));

      return Buffer.from(JSON.stringify(results, null, 2));
    } else {
      // CSV format
      if (items.length === 0) {
        return Buffer.from('');
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
          `"${(item.target_output?.actualOutput || '').replace(/"/g, '""')}"`,
          item.evaluator_output?.score || '',
          item.status || '',
          `"${(item.errorMessage || '').replace(/"/g, '""')}"`,
          item.finishTime || ''
        ];
        csvRows.push(row.join(','));
      });

      return Buffer.from(csvRows.join('\n'));
    }
  }
}
export { MongoEvaluation };

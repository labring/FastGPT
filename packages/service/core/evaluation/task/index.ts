import { MongoEvaluation, MongoEvalItem } from './schema';
import { MongoEvalMetric } from '../metric/schema';
import type {
  EvaluationSchemaType,
  EvalItemSchemaType,
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

export class EvaluationTaskService {
  // 创建评估任务
  static async createEvaluation(
    params: CreateEvaluationParams,
    auth: AuthModeType
  ): Promise<EvaluationSchemaType> {
    const { teamId, tmbId } = await validateResourceCreate(auth);

    // 创建用量记录
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

  // 获取评估任务
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

  // 更新评估任务
  static async updateEvaluation(
    evaluationId: string,
    updates: Partial<CreateEvaluationParams>,
    auth: AuthModeType
  ): Promise<void> {
    const { resourceFilter } = await validateResourceAccess(evaluationId, auth, 'Evaluation');

    const result = await MongoEvaluation.updateOne(resourceFilter, { $set: updates });

    checkUpdateResult(result, 'Evaluation');
  }

  // 删除评估任务
  static async deleteEvaluation(evaluationId: string, auth: AuthModeType): Promise<void> {
    const { resourceFilter } = await validateResourceAccess(evaluationId, auth, 'Evaluation');

    // 先从队列中移除相关任务，防止继续处理
    await Promise.all([
      removeEvaluationTaskJob(evaluationId),
      removeEvaluationItemJobs(evaluationId)
    ]);

    // 删除评估任务的所有评估项
    await MongoEvalItem.deleteMany({ evalId: evaluationId });

    const result = await MongoEvaluation.deleteOne(resourceFilter);

    checkDeleteResult(result, 'Evaluation');

    addLog.info(`[Evaluation] 评估任务已删除，包含队列清理: ${evaluationId}`);
  }

  // 获取评估任务列表
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
        // Target 信息已嵌入，不需要 lookup
        // 不再需要lookup metrics，因为现在使用evaluators
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

  // 获取评估项列表
  static async listEvaluationItems(
    evaluationId: string,
    auth: AuthModeType,
    page: number = 1,
    pageSize: number = 20
  ): Promise<{
    items: EvaluationItemDisplayType[];
    total: number;
  }> {
    // 验证评估任务访问权限
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

  // 启动评估任务
  static async startEvaluation(evaluationId: string, auth: AuthModeType): Promise<void> {
    const evaluation = await this.getEvaluation(evaluationId, auth);

    if (evaluation.status !== EvaluationStatusEnum.queuing) {
      throw new Error('Only queuing evaluations can be started');
    }

    // 更新状态为处理中
    await MongoEvaluation.updateOne(
      { _id: evaluationId },
      { $set: { status: EvaluationStatusEnum.evaluating } }
    );

    // 提交到队列
    await evaluationTaskQueue.add(`eval_task_${evaluationId}`, {
      evalId: evaluationId
    });

    addLog.info(`[Evaluation] 任务已提交到队列: ${evaluationId}`);
  }

  // 停止评估任务
  static async stopEvaluation(evaluationId: string, auth: AuthModeType): Promise<void> {
    const evaluation = await this.getEvaluation(evaluationId, auth);

    if (
      ![EvaluationStatusEnum.evaluating, EvaluationStatusEnum.queuing].includes(evaluation.status)
    ) {
      throw new Error('Only running or queuing evaluations can be stopped');
    }

    // 从队列中移除相关任务
    await Promise.all([
      removeEvaluationTaskJob(evaluationId),
      removeEvaluationItemJobs(evaluationId)
    ]);

    // 更新状态为异常（手动停止）
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

    // 停止所有相关的评估项
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

    addLog.info(`[Evaluation] 任务已手动停止，并从队列中移除: ${evaluationId}`);
  }

  // 获取评估任务统计信息
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

    // 统计错误项
    result.error = await MongoEvalItem.countDocuments({
      evalId: evaluationId,
      errorMessage: { $ne: null }
    });

    return result;
  }

  // ========================= 评估项相关接口 =========================

  // 获取评估项详情
  static async getEvaluationItem(itemId: string, auth: AuthModeType): Promise<EvalItemSchemaType> {
    const item = await MongoEvalItem.findById(itemId).lean();

    if (!item) {
      throw new Error('Evaluation item not found');
    }

    // 验证评估任务的访问权限
    await this.getEvaluation(item.evalId, auth);

    return item;
  }

  // 更新评估项
  static async updateEvaluationItem(
    itemId: string,
    updates: Partial<EvalItemSchemaType>,
    auth: AuthModeType
  ): Promise<void> {
    await this.getEvaluationItem(itemId, auth);

    const result = await MongoEvalItem.updateOne({ _id: itemId }, { $set: updates });

    checkUpdateResult(result, 'Evaluation item');
  }

  // 删除评估项
  static async deleteEvaluationItem(itemId: string, auth: AuthModeType): Promise<void> {
    await this.getEvaluationItem(itemId, auth);

    const result = await MongoEvalItem.deleteOne({ _id: itemId });

    checkDeleteResult(result, 'Evaluation item');
  }

  // 重试评估项
  static async retryEvaluationItem(itemId: string, auth: AuthModeType): Promise<void> {
    const item = await this.getEvaluationItem(itemId, auth);

    // 只有已完成且无错误的评估项不能重试
    if (item.status === EvaluationStatusEnum.completed && !item.errorMessage) {
      throw new Error('Only failed evaluation items can be retried');
    }

    // 检查是否有错误信息或者处于可重试状态
    if (!item.errorMessage && item.status !== EvaluationStatusEnum.queuing) {
      throw new Error('Evaluation item has no error to retry');
    }

    // 更新状态
    await MongoEvalItem.updateOne(
      { _id: itemId },
      {
        $set: {
          status: EvaluationStatusEnum.queuing,
          target_output: null,
          evaluator_output: null,
          finishTime: null,
          errorMessage: null,
          retry: Math.max(item.retry || 0, 1) // 确保至少有1次重试机会
        }
      }
    );

    // 重新提交到队列
    await evaluationItemQueue.add(`eval_item_retry_${itemId}`, {
      evalId: item.evalId,
      evalItemId: itemId
    });

    addLog.info(`[Evaluation] 评估项已重置为排队状态并重新提交: ${itemId}`);
  }

  // 批量重试失败的评估项
  static async retryFailedItems(evaluationId: string, auth: AuthModeType): Promise<number> {
    await this.getEvaluation(evaluationId, auth);

    // 查找需要重试的项目
    const itemsToRetry = await MongoEvalItem.find(
      {
        evalId: evaluationId,
        $or: [
          // 失败状态的项
          { status: EvaluationStatusEnum.error },
          // 或者有错误信息的项（不管状态）
          { errorMessage: { $ne: null } }
        ]
      },
      '_id'
    ).lean();

    if (itemsToRetry.length === 0) {
      return 0;
    }

    // 批量更新状态
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

    // 批量重新提交到队列
    const jobs = itemsToRetry.map((item, index) => ({
      name: `eval_item_batch_retry_${evaluationId}_${index}`,
      data: {
        evalId: evaluationId,
        evalItemId: item._id.toString()
      },
      opts: {
        delay: index * 100 // 添加小延迟避免同时启动过多任务
      }
    }));

    await evaluationItemQueue.addBulk(jobs);

    addLog.info(`[Evaluation] 批量重试失败项: ${evaluationId}, 影响数量: ${itemsToRetry.length}`);

    return itemsToRetry.length;
  }

  // 获取评估项的详细结果
  static async getEvaluationItemResult(
    itemId: string,
    auth: AuthModeType
  ): Promise<{
    item: EvalItemSchemaType;
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

  // 删除应用时的清理钩子函数
  static async deleteAppHook(appIds: string[]): Promise<void> {
    // 查找所有使用这些应用作为workflow目标的评估任务
    const evalJobs = await MongoEvaluation.find(
      {
        'target.type': 'workflow',
        'target.config.appId': { $in: appIds }
      },
      '_id status'
    ).lean();

    // 处理每个评估任务
    for (const evalJob of evalJobs) {
      try {
        const evaluationId = String(evalJob._id);

        // 从队列中移除相关任务
        await Promise.all([
          removeEvaluationTaskJob(evaluationId),
          removeEvaluationItemJobs(evaluationId)
        ]);

        // 如果评估任务还在运行中，更新状态为错误（应用被删除）
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

          // 停止所有相关的评估项
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

        addLog.info(`[Evaluation] 应用删除时清理评估任务: ${evaluationId}`);
      } catch (error) {
        addLog.error(`[Evaluation] 清理评估任务失败: ${evalJob._id}`, error);
        // Continue processing other evaluations even if one fails
      }
    }
  }

  // 搜索评估项
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

    // 构建查询条件
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

  // 导出评估项结果
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
      // CSV格式
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

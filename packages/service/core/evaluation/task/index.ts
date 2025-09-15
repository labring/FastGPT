import { MongoEvaluation, MongoEvalItem } from './schema';
import type {
  EvaluationSchemaType,
  EvaluationItemSchemaType,
  CreateEvaluationParams,
  EvaluationItemDisplayType,
  TargetCallParams,
  EvaluationDataItemType,
  EvaluationDisplayType
} from '@fastgpt/global/core/evaluation/type';
import type { DataItemListResponse } from '@fastgpt/global/core/evaluation/api';
import type { MetricResult } from '@fastgpt/global/core/evaluation/metric/type';
import { Types } from 'mongoose';
import { EvaluationStatusEnum } from '@fastgpt/global/core/evaluation/constants';
import {
  evaluationTaskQueue,
  evaluationItemQueue,
  removeEvaluationTaskJob,
  removeEvaluationItemJobs,
  removeEvaluationItemJobsByItemId
} from './mq';
import { createEvaluationUsage } from '../../../support/wallet/usage/controller';
import { addLog } from '../../../common/system/log';
import { buildEvalDataConfig } from '../summary/util/weightCalculator';
import { EvaluationErrEnum } from '@fastgpt/global/common/error/code/evaluation';
import { mongoSessionRun } from '../../../common/mongo/sessionRun';
import { type ClientSession } from '../../../common/mongo';

// Constants
const MAX_EXPORT_PAGE_SIZE = 100000;

export class EvaluationTaskService {
  static async createEvaluation(
    params: CreateEvaluationParams & {
      teamId: string;
      tmbId: string;
    }
  ): Promise<EvaluationSchemaType> {
    const { teamId, tmbId, autoStart = true, ...evaluationParams } = params;

    // Create usage record
    const { billId } = await createEvaluationUsage({
      teamId,
      tmbId,
      appName: evaluationParams.name
    });

    // Apply default configuration to evaluators (weights, thresholds, etc.)
    const evaluatorsWithDefaultConfig = buildEvalDataConfig(evaluationParams.evaluators);

    const createAndStart = async (session: ClientSession) => {
      // Create evaluation within transaction
      const evaluation = await MongoEvaluation.create(
        [
          {
            ...evaluationParams,
            evaluators: evaluatorsWithDefaultConfig,
            teamId,
            tmbId,
            usageId: billId,
            status: EvaluationStatusEnum.queuing,
            createTime: new Date()
          }
        ],
        { session }
      );

      const evaluationObject = evaluation[0].toObject();

      // Auto-start the evaluation if autoStart is true
      if (autoStart) {
        // Update status to evaluating within transaction
        await MongoEvaluation.updateOne(
          { _id: evaluationObject._id },
          { $set: { status: EvaluationStatusEnum.evaluating } },
          { session }
        );

        // Queue operation within transaction - if it fails, transaction will rollback
        await evaluationTaskQueue.add(`eval_task_${evaluationObject._id}`, {
          evalId: evaluationObject._id.toString()
        });

        // Update status in returned object
        evaluationObject.status = EvaluationStatusEnum.evaluating;
        addLog.debug(`[Evaluation] Task created and auto-started: ${evaluationObject._id}`);
      } else {
        addLog.debug(`[Evaluation] Task created: ${evaluationObject._id}`);
      }

      return evaluationObject;
    };

    return await mongoSessionRun(createAndStart);
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
    const del = async (session: ClientSession) => {
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
      await MongoEvalItem.deleteMany({ evalId: new Types.ObjectId(evalId) }, { session });

      const result = await MongoEvaluation.deleteOne(
        {
          _id: new Types.ObjectId(evalId),
          teamId: new Types.ObjectId(teamId)
        },
        { session }
      );

      if (result.deletedCount === 0) {
        throw new Error(EvaluationErrEnum.evalTaskNotFound);
      }

      addLog.debug(`[Evaluation] Evaluation task deleted including queue cleanup: ${evalId}`);
    };

    await mongoSessionRun(del);
  }

  static async listEvaluations(
    teamId: string,
    offset: number = 0,
    pageSize: number = 20,
    searchKey?: string,
    accessibleIds?: string[],
    tmbId?: string,
    isOwner: boolean = false
  ): Promise<{ list: EvaluationDisplayType[]; total: number }> {
    // Build basic filter and pagination
    const filter: any = { teamId: new Types.ObjectId(teamId) };
    if (searchKey) {
      filter.$or = [
        { name: { $regex: searchKey, $options: 'i' } },
        { description: { $regex: searchKey, $options: 'i' } }
      ];
    }
    const skip = offset;
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
            from: 'eval_dataset_collections',
            localField: 'datasetId',
            foreignField: '_id',
            as: 'dataset'
          }
        },
        {
          $addFields: {
            'target.config.appObjectId': { $toObjectId: '$target.config.appId' }
          }
        },
        {
          $lookup: {
            from: 'apps',
            localField: 'target.config.appObjectId',
            foreignField: '_id',
            as: 'app'
          }
        },
        {
          $addFields: {
            'target.config.versionObjectId': { $toObjectId: '$target.config.versionId' }
          }
        },
        {
          $lookup: {
            from: 'app_versions',
            localField: 'target.config.versionObjectId',
            foreignField: '_id',
            as: 'appVersion'
          }
        },
        // Add real-time statistics lookup
        {
          $lookup: {
            from: 'eval_items',
            localField: '_id',
            foreignField: 'evalId',
            pipeline: [
              {
                $group: {
                  _id: null,
                  totalItems: { $sum: 1 },
                  completedItems: {
                    $sum: { $cond: [{ $eq: ['$status', EvaluationStatusEnum.completed] }, 1, 0] }
                  },
                  errorItems: {
                    $sum: { $cond: [{ $eq: ['$status', EvaluationStatusEnum.error] }, 1, 0] }
                  }
                }
              }
            ],
            as: 'realTimeStats'
          }
        },
        {
          $addFields: {
            datasetName: { $arrayElemAt: ['$dataset.name', 0] },
            // Add app name and avatar to target.config
            'target.config.appName': { $arrayElemAt: ['$app.name', 0] },
            'target.config.avatar': { $arrayElemAt: ['$app.avatar', 0] },
            'target.config.versionName': { $arrayElemAt: ['$appVersion.versionName', 0] },
            metricNames: {
              $map: {
                input: '$evaluators',
                as: 'evaluator',
                in: '$$evaluator.metric.name'
              }
            },
            // Use real-time statistics if available, otherwise fallback to stored statistics
            statistics: {
              $cond: {
                if: { $gt: [{ $size: '$realTimeStats' }, 0] },
                then: {
                  $let: {
                    vars: { stats: { $arrayElemAt: ['$realTimeStats', 0] } },
                    in: {
                      totalItems: '$$stats.totalItems',
                      completedItems: '$$stats.completedItems',
                      errorItems: '$$stats.errorItems'
                    }
                  }
                },
                else: '$statistics'
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
            datasetName: 1,
            target: {
              type: '$target.type',
              config: {
                appId: '$target.config.appId',
                versionId: '$target.config.versionId',
                avatar: '$target.config.avatar',
                appName: '$target.config.appName',
                versionName: '$target.config.versionName'
              }
            },
            metricNames: 1,
            statistics: 1,
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

  static async getEvaluationDetail(evalId: string, teamId: string): Promise<EvaluationDisplayType> {
    const evaluationResult = await MongoEvaluation.aggregate([
      { $match: { _id: new Types.ObjectId(evalId), teamId: new Types.ObjectId(teamId) } },
      {
        $addFields: {
          'target.config.appObjectId': { $toObjectId: '$target.config.appId' }
        }
      },
      {
        $lookup: {
          from: 'apps',
          localField: 'target.config.appObjectId',
          foreignField: '_id',
          as: 'app'
        }
      },
      {
        $addFields: {
          'target.config.versionObjectId': { $toObjectId: '$target.config.versionId' }
        }
      },
      {
        $lookup: {
          from: 'app_versions',
          localField: 'target.config.versionObjectId',
          foreignField: '_id',
          as: 'appVersion'
        }
      },
      // Add real-time statistics lookup
      {
        $lookup: {
          from: 'eval_items',
          localField: '_id',
          foreignField: 'evalId',
          pipeline: [
            {
              $group: {
                _id: null,
                totalItems: { $sum: 1 },
                completedItems: {
                  $sum: { $cond: [{ $eq: ['$status', EvaluationStatusEnum.completed] }, 1, 0] }
                },
                errorItems: {
                  $sum: { $cond: [{ $eq: ['$status', EvaluationStatusEnum.error] }, 1, 0] }
                }
              }
            }
          ],
          as: 'realTimeStats'
        }
      },
      {
        $addFields: {
          'target.config.appName': { $arrayElemAt: ['$app.name', 0] },
          'target.config.avatar': { $arrayElemAt: ['$app.avatar', 0] },
          'target.config.versionName': { $arrayElemAt: ['$appVersion.versionName', 0] },
          // Use real-time statistics if available, otherwise fallback to stored statistics
          statistics: {
            $cond: {
              if: { $gt: [{ $size: '$realTimeStats' }, 0] },
              then: {
                $let: {
                  vars: { stats: { $arrayElemAt: ['$realTimeStats', 0] } },
                  in: {
                    totalItems: '$$stats.totalItems',
                    completedItems: '$$stats.completedItems',
                    errorItems: '$$stats.errorItems'
                  }
                }
              },
              else: '$statistics'
            }
          }
        }
      },
      {
        $project: {
          _id: 1,
          teamId: 1,
          tmbId: 1,
          name: 1,
          description: 1,
          datasetId: 1,
          target: {
            type: '$target.type',
            config: {
              appId: '$target.config.appId',
              versionId: '$target.config.versionId',
              avatar: '$target.config.avatar',
              appName: '$target.config.appName',
              versionName: '$target.config.versionName'
            }
          },
          evaluators: 1,
          usageId: 1,
          status: 1,
          createTime: 1,
          finishTime: 1,
          errorMessage: 1,
          statistics: 1
        }
      }
    ]);

    const evaluation = evaluationResult[0];
    if (!evaluation) {
      throw new Error('Evaluation not found');
    }

    return evaluation;
  }

  static async listEvaluationItems(
    evalId: string,
    teamId: string,
    offset: number = 0,
    pageSize: number = 20
  ): Promise<{ items: EvaluationItemDisplayType[]; total: number }> {
    const evaluation = await this.getEvaluation(evalId, teamId);

    const skip = offset;
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

    // Check if task can be started/restarted
    const canStart =
      evaluation.status === EvaluationStatusEnum.queuing ||
      (evaluation.status === EvaluationStatusEnum.error &&
        evaluation.errorMessage === 'Manually stopped');

    if (!canStart) {
      throw new Error(EvaluationErrEnum.evalInvalidStateTransition);
    }

    // Update status to processing and clear error message if restarting
    const updateData: any = { status: EvaluationStatusEnum.evaluating };
    const unsetData: any = {};

    if (evaluation.status === EvaluationStatusEnum.error) {
      unsetData.errorMessage = 1;
      unsetData.finishTime = 1;
    }

    const updateQuery: any = { $set: updateData };
    if (Object.keys(unsetData).length > 0) {
      updateQuery.$unset = unsetData;
    }

    // Use transaction to ensure atomicity between status update and queue submission
    const startEval = async (session: ClientSession) => {
      // Update status within transaction
      const result = await MongoEvaluation.updateOne(
        { _id: new Types.ObjectId(evalId), teamId: new Types.ObjectId(teamId) },
        updateQuery,
        { session }
      );

      if (result.matchedCount === 0) {
        throw new Error(EvaluationErrEnum.evalTaskNotFound);
      }

      // Queue operation within transaction - if it fails, transaction will rollback
      await evaluationTaskQueue.add(`eval_task_${evalId}`, {
        evalId: evalId
      });
    };

    await mongoSessionRun(startEval);

    const action = evaluation.status === EvaluationStatusEnum.error ? 'restarted' : 'started';
    addLog.debug(`[Evaluation] Task ${action}: ${evalId}`);
  }

  static async stopEvaluation(evalId: string, teamId: string): Promise<void> {
    const evaluation = await this.getEvaluation(evalId, teamId);

    if (
      ![EvaluationStatusEnum.evaluating, EvaluationStatusEnum.queuing].includes(evaluation.status)
    ) {
      throw new Error(EvaluationErrEnum.evalOnlyRunningCanStop);
    }

    const stopEval = async (session: ClientSession) => {
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
        },
        { session }
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
        },
        { session }
      );

      addLog.debug(`[Evaluation] Task manually stopped and removed from queue: ${evalId}`);
    };

    await mongoSessionRun(stopEval);
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
  }> {
    const evaluation = await this.getEvaluation(evalId, teamId);

    const [statsResult] = await MongoEvalItem.aggregate([
      { $match: { evalId: evaluation._id } },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          completed: {
            $sum: { $cond: [{ $eq: ['$status', EvaluationStatusEnum.completed] }, 1, 0] }
          },
          evaluating: {
            $sum: { $cond: [{ $eq: ['$status', EvaluationStatusEnum.evaluating] }, 1, 0] }
          },
          queuing: {
            $sum: { $cond: [{ $eq: ['$status', EvaluationStatusEnum.queuing] }, 1, 0] }
          },
          error: {
            $sum: { $cond: [{ $eq: ['$status', EvaluationStatusEnum.error] }, 1, 0] }
          }
        }
      }
    ]);

    // Return stats with defaults for empty results
    const result = {
      total: statsResult?.total || 0,
      completed: statsResult?.completed || 0,
      evaluating: statsResult?.evaluating || 0,
      queuing: statsResult?.queuing || 0,
      error: statsResult?.error || 0
    };

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

  /**
   * Build MongoDB update object with dot notation for evaluation data item updates
   * @private
   */
  private static buildEvaluationDataItemUpdateObject(updates: {
    userInput?: string;
    expectedOutput?: string;
    context?: string[];
    targetCallParams?: TargetCallParams;
  }): any {
    const updateObj: any = {};

    if (updates.userInput !== undefined) {
      updateObj['dataItem.userInput'] = updates.userInput;
    }
    if (updates.expectedOutput !== undefined) {
      updateObj['dataItem.expectedOutput'] = updates.expectedOutput;
    }
    if (updates.context !== undefined) {
      updateObj['dataItem.context'] = updates.context;
    }
    if (updates.targetCallParams !== undefined) {
      updateObj['dataItem.targetCallParams'] = updates.targetCallParams;
    }

    return updateObj;
  }

  /**
   * Update evaluation item with data item fields
   * Unified method for API layers to update evaluation items
   */
  static async updateEvaluationItem(
    itemId: string,
    updates: {
      userInput?: string;
      expectedOutput?: string;
      context?: string[];
      targetCallParams?: TargetCallParams;
    },
    teamId: string
  ): Promise<void> {
    await this.getEvaluationItem(itemId, teamId);

    // Build MongoDB update object with dot notation
    const updateObj = this.buildEvaluationDataItemUpdateObject(updates);
    if (Object.keys(updateObj).length === 0) {
      return;
    }

    const result = await MongoEvalItem.updateOne(
      { _id: new Types.ObjectId(itemId) },
      { $set: updateObj }
    );

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

    const result = await MongoEvalItem.deleteOne({ _id: new Types.ObjectId(itemId) });

    if (result.deletedCount === 0) {
      throw new Error(EvaluationErrEnum.evalItemNotFound);
    }

    addLog.debug(`[Evaluation] Evaluation item deleted including queue cleanup: ${itemId}`);
  }

  static async retryEvaluationItem(itemId: string, teamId: string): Promise<void> {
    const item = await this.getEvaluationItem(itemId, teamId);

    // Only completed evaluation items without errors cannot be retried
    if (item.status === EvaluationStatusEnum.completed) {
      throw new Error(EvaluationErrEnum.evalOnlyFailedCanRetry);
    }

    // Check if item is in error status or retryable status
    if (
      item.status !== EvaluationStatusEnum.error &&
      item.status !== EvaluationStatusEnum.queuing
    ) {
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

    // Use transaction for atomic status update and queue submission
    const retryItem = async (session: ClientSession) => {
      // Update status within transaction
      const result = await MongoEvalItem.updateOne(
        { _id: new Types.ObjectId(itemId) },
        {
          $set: {
            status: EvaluationStatusEnum.queuing,
            retry: Math.max(item.retry || 0, 1), // Ensure at least 1 retry chance
            targetOutput: {},
            evaluatorOutput: {}
          },
          $unset: {
            finishTime: 1,
            errorMessage: 1
          }
        },
        { session }
      );

      if (result.matchedCount === 0) {
        throw new Error(EvaluationErrEnum.evalItemNotFound);
      }

      // Queue operation within transaction - if it fails, transaction will rollback
      await evaluationItemQueue.add(`eval_item_retry_${itemId}`, {
        evalId: item.evalId,
        evalItemId: itemId
      });
    };

    await mongoSessionRun(retryItem);

    addLog.debug(`[Evaluation] Evaluation item reset to queuing status and resubmitted: ${itemId}`);
  }

  static async retryFailedItems(evalId: string, teamId: string): Promise<number> {
    const evaluation = await this.getEvaluation(evalId, teamId);

    const retryItems = async (session: ClientSession): Promise<number> => {
      // Find items that need to be retried
      const itemsToRetry = await MongoEvalItem.find(
        {
          evalId: evaluation._id,
          status: EvaluationStatusEnum.error
        },
        '_id',
        { session }
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
            targetOutput: {},
            evaluatorOutput: {}
          },
          $unset: {
            finishTime: 1,
            errorMessage: 1
          },
          $inc: {
            retry: 1
          }
        },
        { session }
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

      try {
        await evaluationItemQueue.addBulk(jobs);
      } catch (queueError) {
        // If queue operation fails, the transaction will rollback the status updates
        addLog.error(`[Evaluation] Failed to resubmit jobs to queue: ${evalId}`, queueError);
        throw queueError;
      }

      addLog.debug(
        `[Evaluation] Batch retry failed items: ${evalId}, affected count: ${itemsToRetry.length}`
      );

      return itemsToRetry.length;
    };

    const retriedCount = await mongoSessionRun(retryItems);

    return retriedCount;
  }

  static async getEvaluationItemResult(
    itemId: string,
    teamId: string
  ): Promise<{
    item: EvaluationItemSchemaType;
    dataItem: EvaluationDataItemType;
    response?: string;
    result?: MetricResult;
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
  ): Promise<{ items: EvaluationItemDisplayType[]; total: number }> {
    const evaluation = await this.getEvaluation(evalId, teamId);

    const { status, hasError, scoreRange, keyword, page = 1, pageSize = 20 } = options;

    // Build query conditions
    const filter: any = { evalId: evaluation._id };

    if (status !== undefined) {
      filter.status = status;
    }

    if (hasError === true) {
      filter.status = EvaluationStatusEnum.error;
    } else if (hasError === false) {
      filter.status = { $ne: EvaluationStatusEnum.error };
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

  // ========================= DataItem Aggregation APIs =========================

  static async listDataItemsGrouped(
    teamId: string,
    options: {
      evalId: string;
      status?: number;
      keyword?: string;
      offset?: number;
      pageSize?: number;
    }
  ): Promise<DataItemListResponse> {
    const { evalId, status, keyword, offset = 0, pageSize = 20 } = options;

    // Verify team access to the evaluation task
    await this.getEvaluation(evalId, teamId);

    // Build match stage
    const matchStage: any = {
      evalId: new Types.ObjectId(evalId)
    };

    if (status !== undefined) {
      matchStage.status = status;
    }

    if (keyword) {
      matchStage.$or = [
        { 'dataItem.userInput': { $regex: keyword, $options: 'i' } },
        { 'dataItem.expectedOutput': { $regex: keyword, $options: 'i' } }
      ];
    }

    // Build aggregation pipeline
    const aggregationPipeline = [
      { $match: matchStage },
      {
        $group: {
          _id: '$dataItem._id',
          dataItem: { $first: '$dataItem' },
          items: { $push: '$$ROOT' },
          totalItems: { $sum: 1 },
          completedItems: {
            $sum: { $cond: [{ $eq: ['$status', EvaluationStatusEnum.completed] }, 1, 0] }
          },
          errorItems: {
            $sum: { $cond: [{ $eq: ['$status', EvaluationStatusEnum.error] }, 1, 0] }
          }
        }
      },
      {
        $addFields: {
          dataItemId: '$_id',
          'statistics.totalItems': '$totalItems',
          'statistics.completedItems': '$completedItems',
          'statistics.errorItems': '$errorItems'
        }
      },
      { $sort: { totalItems: -1 as const, _id: 1 as const } }
    ];

    // Simple Promise.all approach like listEvaluationItems
    const [list, total] = await Promise.all([
      // Get paginated results with projection
      MongoEvalItem.aggregate([
        ...aggregationPipeline,
        { $skip: offset },
        { $limit: pageSize },
        {
          $project: {
            dataItemId: 1,
            dataItem: 1,
            items: {
              $map: {
                input: '$items',
                as: 'item',
                in: {
                  $mergeObjects: ['$$item', { evalItemId: { $toString: '$$item._id' } }]
                }
              }
            },
            statistics: {
              totalItems: '$totalItems',
              completedItems: '$completedItems',
              errorItems: '$errorItems'
            }
          }
        }
      ]),
      // Get total count
      MongoEvalItem.aggregate([...aggregationPipeline, { $count: 'total' }]).then(
        (result) => result[0]?.total || 0
      )
    ]);

    return {
      list,
      total
    };
  }

  static async deleteEvaluationItemsByDataItem(
    dataItemId: string,
    teamId: string,
    evalId: string
  ): Promise<{ deletedCount: number }> {
    // Verify team access to the evaluation task
    await this.getEvaluation(evalId, teamId);

    const filter: any = {
      'dataItem._id': new Types.ObjectId(dataItemId),
      evalId: new Types.ObjectId(evalId)
    };

    // Find items to delete
    const itemsToDelete = await MongoEvalItem.find(filter).lean();

    if (itemsToDelete.length === 0) {
      return { deletedCount: 0 };
    }

    const deleteOperation = async (session: ClientSession) => {
      // Clean up queue jobs for items to be deleted
      const itemIds = itemsToDelete.map((item) => item._id.toString());
      const cleanupPromises = itemIds.map((itemId) =>
        removeEvaluationItemJobsByItemId(itemId, {
          forceCleanActiveJobs: true,
          retryAttempts: 3,
          retryDelay: 200
        })
      );

      await Promise.allSettled(cleanupPromises);

      // Delete the items
      const result = await MongoEvalItem.deleteMany(filter, { session });

      addLog.debug(`[Evaluation] Deleted ${result.deletedCount} items for dataItem: ${dataItemId}`);

      return result.deletedCount;
    };

    const deletedCount = await mongoSessionRun(deleteOperation);

    return {
      deletedCount
    };
  }

  static async retryEvaluationItemsByDataItem(
    dataItemId: string,
    teamId: string,
    evalId: string
  ): Promise<{ retriedCount: number }> {
    // Verify evaluation access first
    await this.getEvaluation(evalId, teamId);

    const filter: any = {
      'dataItem._id': new Types.ObjectId(dataItemId),
      evalId: new Types.ObjectId(evalId),
      status: EvaluationStatusEnum.error
    };

    // Find items to retry
    const itemsToRetry = await MongoEvalItem.find(filter).lean();

    if (itemsToRetry.length === 0) {
      return { retriedCount: 0 };
    }

    const retryOperation = async (session: ClientSession) => {
      // Clean up existing jobs
      const itemIds = itemsToRetry.map((item) => item._id.toString());
      const cleanupPromises = itemIds.map((itemId) =>
        removeEvaluationItemJobsByItemId(itemId, {
          forceCleanActiveJobs: true,
          retryAttempts: 3,
          retryDelay: 200
        })
      );

      await Promise.allSettled(cleanupPromises);

      // Update items status
      const result = await MongoEvalItem.updateMany(
        { _id: { $in: itemsToRetry.map((item) => item._id) } },
        {
          $set: {
            status: EvaluationStatusEnum.queuing,
            targetOutput: {},
            evaluatorOutput: {}
          },
          $unset: {
            finishTime: 1,
            errorMessage: 1
          },
          $inc: { retry: 1 }
        },
        { session }
      );

      // Resubmit to queue
      const jobs = itemsToRetry.map((item, index) => ({
        name: `eval_item_dataitem_retry_${dataItemId}_${index}`,
        data: {
          evalId: item.evalId,
          evalItemId: item._id.toString()
        },
        opts: {
          delay: index * 100
        }
      }));

      await evaluationItemQueue.addBulk(jobs);

      addLog.debug(
        `[Evaluation] Retried ${result.modifiedCount} items for dataItem: ${dataItemId}`
      );

      return result.modifiedCount;
    };

    const retriedCount = await mongoSessionRun(retryOperation);

    return {
      retriedCount
    };
  }

  static async updateEvaluationItemsByDataItem(
    dataItemId: string,
    updates: {
      userInput?: string;
      expectedOutput?: string;
      context?: string[];
      targetCallParams?: TargetCallParams;
    },
    teamId: string,
    evalId: string
  ): Promise<{ updatedCount: number }> {
    // Verify evaluation access first
    await this.getEvaluation(evalId, teamId);

    // Build MongoDB update object with dot notation
    const updateObj = this.buildEvaluationDataItemUpdateObject(updates);
    if (Object.keys(updateObj).length === 0) {
      return { updatedCount: 0 };
    }

    const filter: any = {
      'dataItem._id': new Types.ObjectId(dataItemId),
      evalId: new Types.ObjectId(evalId)
    };

    const result = await MongoEvalItem.updateMany(filter, { $set: updateObj });

    addLog.debug(`[Evaluation] Updated ${result.modifiedCount} items for dataItem: ${dataItemId}`);

    return {
      updatedCount: result.modifiedCount
    };
  }

  static async exportEvaluationResultsGroupedByDataItem(
    teamId: string,
    evalId: string,
    format: 'csv' | 'json' = 'json'
  ): Promise<{ results: Buffer; totalItems: number }> {
    // Get evaluation config for metric names
    const evaluation = await this.getEvaluation(evalId, teamId);

    // Use listDataItemsGrouped to get all dataItems (large pageSize to get all)
    const { list: dataItems } = await this.listDataItemsGrouped(teamId, {
      evalId,
      offset: 0,
      pageSize: MAX_EXPORT_PAGE_SIZE // Large pageSize to get all items
    });

    if (dataItems.length === 0) {
      const emptyResult = format === 'json' ? '[]' : '';
      return {
        results: Buffer.from(emptyResult),
        totalItems: 0
      };
    }

    // Extract metric names from evaluation config
    const metricNames = evaluation.evaluators.map(
      (evaluator) => evaluator.metric.name || evaluator.metric._id || 'Unknown Metric'
    );

    // Transform listDataItemsGrouped result to export format (remove totalItems, completedItems, errorItems)
    const exportData = dataItems.map((groupedItem: any) => {
      const dataItemExport = {
        dataItemId: groupedItem.dataItemId,
        userInput: groupedItem.dataItem?.userInput,
        expectedOutput: groupedItem.dataItem?.expectedOutput,
        actualOutput: groupedItem.items.find((item: any) => item.targetOutput?.actualOutput)
          ?.targetOutput?.actualOutput,
        // Build metric scores object
        metricScores: {} as Record<string, number>
      };

      // Add scores for each metric from the grouped items
      groupedItem.items.forEach((item: any) => {
        if (item.evaluator?.metric?.name && item.evaluatorOutput?.data?.score !== undefined) {
          const metricName = item.evaluator.metric.name;
          dataItemExport.metricScores[metricName] = item.evaluatorOutput.data.score;
        }
      });

      return dataItemExport;
    });

    if (format === 'json') {
      return {
        results: Buffer.from(JSON.stringify(exportData, null, 2)),
        totalItems: exportData.length
      };
    } else {
      // CSV format with dynamic metric columns (remove totalItems, completedItems, errorItems)
      const baseHeaders = ['DataItemId', 'UserInput', 'ExpectedOutput', 'ActualOutput'];

      const headers = [...baseHeaders, ...metricNames];
      const csvRows = [headers.join(',')];

      exportData.forEach((dataItem) => {
        const row = [
          dataItem.dataItemId,
          `"${(dataItem.userInput || '').replace(/"/g, '""')}"`,
          `"${(dataItem.expectedOutput || '').replace(/"/g, '""')}"`,
          `"${(dataItem.actualOutput || '').replace(/"/g, '""')}"`,
          // Add metric scores in the same order as headers
          ...metricNames.map((metricName) => dataItem.metricScores[metricName] || '')
        ];

        csvRows.push(row.join(','));
      });

      return {
        results: Buffer.from(csvRows.join('\n')),
        totalItems: exportData.length
      };
    }
  }
}
export { MongoEvaluation };

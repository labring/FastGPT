import { MongoEvaluation, MongoEvalItem } from './schema';
import { MongoEvalDatasetData } from '../dataset/evalDatasetDataSchema';
import type {
  EvaluationSchemaType,
  EvaluationItemSchemaType,
  CreateEvaluationParams,
  EvaluationItemDisplayType,
  TargetCallParams,
  EvaluationDisplayType
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
import { createEvaluationUsage } from '../../../support/wallet/usage/controller';
import { addLog } from '../../../common/system/log';
import { buildEvalDataConfig } from '../summary/util/weightCalculator';
import { EvaluationErrEnum } from '@fastgpt/global/common/error/code/evaluation';
import { mongoSessionRun } from '../../../common/mongo/sessionRun';
import { type ClientSession } from '../../../common/mongo';

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
    const { evaluators: evaluatorsWithDefaultConfig, summaryConfigs } = buildEvalDataConfig(
      evaluationParams.evaluators
    );
    const createAndStart = async (session: ClientSession) => {
      // Create evaluation within transaction
      const evaluation = await MongoEvaluation.create(
        [
          {
            ...evaluationParams,
            evaluators: evaluatorsWithDefaultConfig,
            summaryConfigs,
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

      // Load dataset and create evaluation items immediately
      const dataItems = await MongoEvalDatasetData.find({
        evalDatasetCollectionId: evaluationParams.evalDatasetCollectionId,
        teamId
      })
        .session(session)
        .lean();

      if (dataItems.length === 0) {
        throw new Error(EvaluationErrEnum.evalDatasetLoadFailed);
      }

      // Create evaluation items for each dataItem
      const evalItems: Omit<EvaluationItemSchemaType, '_id'>[] = [];
      for (const dataItem of dataItems) {
        const evaluationDataItem = {
          _id: dataItem._id,
          userInput: dataItem.userInput,
          expectedOutput: dataItem.expectedOutput,
          context: dataItem.context,
          targetCallParams: undefined
        };

        evalItems.push({
          evalId: evaluationObject._id,
          dataItem: evaluationDataItem,
          status: EvaluationStatusEnum.queuing,
          retry: 3
        });
      }

      // Batch insert evaluation items within transaction
      const insertedItems = await MongoEvalItem.insertMany(evalItems, { session });
      addLog.debug(`[Evaluation] Created ${insertedItems.length} evaluation items`);

      // Update evaluation statistics
      await MongoEvaluation.updateOne(
        { _id: evaluationObject._id },
        {
          $set: {
            'statistics.totalItems': insertedItems.length
          }
        },
        { session }
      );

      // Auto-start the evaluation if autoStart is true
      if (autoStart) {
        // Queue operation within transaction - processor will handle status updates
        await evaluationTaskQueue.add(`eval_task_${evaluationObject._id}`, {
          evalId: evaluationObject._id.toString()
        });

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
    isOwner: boolean = false,
    appName?: string,
    appId?: string
  ): Promise<{ list: EvaluationDisplayType[]; total: number }> {
    // Build basic filter and pagination
    const filter: any = { teamId: new Types.ObjectId(teamId) };
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

    // Build aggregation pipeline with target filtering
    const aggregationPipeline = [
      { $match: finalFilter },
      {
        $lookup: {
          from: 'eval_dataset_collections',
          localField: 'evalDatasetCollectionId',
          foreignField: '_id',
          as: 'evalDatasetCollection'
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
      {
        $addFields: {
          'target.config.appName': { $arrayElemAt: ['$app.name', 0] },
          'target.config.avatar': { $arrayElemAt: ['$app.avatar', 0] },
          'target.config.versionName': { $arrayElemAt: ['$appVersion.versionName', 0] }
        }
      }
    ];

    // Add target filtering stage if any target filters are provided
    if (appName || appId) {
      const targetFilter: any = {};

      if (appName) {
        targetFilter['target.config.appName'] = { $regex: appName, $options: 'i' };
      }

      if (appId) {
        targetFilter['target.config.appId'] = appId;
      }

      aggregationPipeline.push({ $match: targetFilter });
    }

    // Add searchKey filtering after target config is populated (includes versionId/versionName search)
    if (searchKey) {
      aggregationPipeline.push({
        $match: {
          $or: [
            { name: { $regex: searchKey, $options: 'i' } },
            { description: { $regex: searchKey, $options: 'i' } },
            { 'target.config.versionId': { $regex: searchKey, $options: 'i' } },
            { 'target.config.versionName': { $regex: searchKey, $options: 'i' } }
          ]
        }
      });
    }

    const [evaluations, total] = await Promise.all([
      MongoEvaluation.aggregate([
        ...aggregationPipeline,
        // Add real-time statistics lookup
        {
          $lookup: {
            from: 'eval_items',
            let: { evalId: '$_id' },
            pipeline: [
              {
                $match: {
                  $expr: { $eq: ['$evalId', '$$evalId'] }
                }
              },
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
            evalDatasetCollectionName: { $arrayElemAt: ['$evalDatasetCollection.name', 0] },
            evalDatasetCollectionId: '$evalDatasetCollectionId',
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
            evalDatasetCollectionName: 1,
            evalDatasetCollectionId: 1,
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
            summaryConfigs: 1,
            tmbId: 1
          }
        },
        { $sort: sort },
        { $skip: skip },
        { $limit: limit }
      ]),
      // Get total count using the same aggregation pipeline (without pagination)
      MongoEvaluation.aggregate([...aggregationPipeline, { $count: 'total' }]).then(
        (result) => result[0]?.total || 0
      )
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
        $lookup: {
          from: 'eval_dataset_collections',
          localField: 'evalDatasetCollectionId',
          foreignField: '_id',
          as: 'evalDatasetCollection'
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
          let: { evalId: '$_id' },
          pipeline: [
            {
              $match: {
                $expr: { $eq: ['$evalId', '$$evalId'] }
              }
            },
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
          evalDatasetCollectionName: { $arrayElemAt: ['$evalDatasetCollection.name', 0] },
          evalDatasetCollectionId: '$evalDatasetCollectionId',
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
          evalDatasetCollectionId: 1,
          evalDatasetCollectionName: 1,
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

    // Clear error message if restarting
    const updateQuery: any = {};
    if (evaluation.status === EvaluationStatusEnum.error) {
      updateQuery.$unset = {
        errorMessage: 1,
        finishTime: 1
      };
    }

    // Use transaction to ensure atomicity between cleanup and queue submission
    const startEval = async (session: ClientSession) => {
      // Clear error state if needed, but leave status as queuing for processor to handle
      if (Object.keys(updateQuery).length > 0) {
        const result = await MongoEvaluation.updateOne(
          { _id: new Types.ObjectId(evalId), teamId: new Types.ObjectId(teamId) },
          updateQuery,
          { session }
        );

        if (result.matchedCount === 0) {
          throw new Error(EvaluationErrEnum.evalTaskNotFound);
        }
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

  static async listEvaluationItems(
    evalId: string,
    teamId: string,
    offset: number = 0,
    pageSize: number = 20,
    options: {
      status?: EvaluationStatusEnum;
      belowThreshold?: boolean;
      userInput?: string;
      expectedOutput?: string;
      actualOutput?: string;
    } = {}
  ): Promise<{ items: EvaluationItemDisplayType[]; total: number }> {
    const evaluation = await this.getEvaluation(evalId, teamId);

    const { status, belowThreshold, userInput, expectedOutput, actualOutput } = options;

    // Build query conditions
    const filter: any = { evalId: evaluation._id };

    // Handle special belowThreshold filter
    if (belowThreshold) {
      // Filter for completed items where aggregateScore is below weighted threshold
      filter.status = EvaluationStatusEnum.completed;

      // Calculate weighted threshold from evaluators and summaryConfigs
      let totalWeightedThreshold = 0;
      let totalWeight = 0;

      evaluation.evaluators.forEach((evaluator, index) => {
        const weight = evaluation.summaryConfigs[index]?.weight || 0;
        const threshold = evaluator.thresholdValue || 0;
        totalWeightedThreshold += weight * threshold;
        totalWeight += weight;
      });

      const weightedThreshold = totalWeight > 0 ? totalWeightedThreshold / totalWeight : 0;

      // Build aggregation pipeline to filter items with aggregateScore below weighted threshold
      const aggregationPipeline: any[] = [
        { $match: filter },
        {
          $match: {
            $and: [
              { aggregateScore: { $exists: true } },
              { aggregateScore: { $lt: weightedThreshold } }
            ]
          }
        }
      ];

      // Add other filters
      if (userInput) {
        aggregationPipeline.push({
          $match: { 'dataItem.userInput': { $regex: userInput, $options: 'i' } }
        });
      }

      if (expectedOutput) {
        aggregationPipeline.push({
          $match: { 'dataItem.expectedOutput': { $regex: expectedOutput, $options: 'i' } }
        });
      }

      if (actualOutput) {
        aggregationPipeline.push({
          $match: { 'targetOutput.actualOutput': { $regex: actualOutput, $options: 'i' } }
        });
      }

      // Get total count
      const totalPipeline = [...aggregationPipeline, { $count: 'total' }];
      const totalResult = await MongoEvalItem.aggregate(totalPipeline);
      const total = totalResult.length > 0 ? totalResult[0].total : 0;

      // Get paginated results
      aggregationPipeline.push(
        { $sort: { createTime: -1 } },
        { $skip: offset },
        { $limit: pageSize }
      );

      const items = await MongoEvalItem.aggregate(aggregationPipeline);

      // Add evaluators data from parent evaluation
      const itemsWithEvaluators = items.map((item) => ({
        ...item,
        evaluators: evaluation.evaluators.map((evaluator) => ({
          metric: evaluator.metric,
          thresholdValue: evaluator.thresholdValue
        }))
      }));

      return { items: itemsWithEvaluators, total };
    } else {
      // Handle normal status filtering
      if (status !== undefined) {
        filter.status = status;
      }

      if (userInput) {
        filter['dataItem.userInput'] = { $regex: userInput, $options: 'i' };
      }

      if (expectedOutput) {
        filter['dataItem.expectedOutput'] = { $regex: expectedOutput, $options: 'i' };
      }

      if (actualOutput) {
        filter['targetOutput.actualOutput'] = { $regex: actualOutput, $options: 'i' };
      }

      const skip = offset;
      const limit = pageSize;

      const [items, total] = await Promise.all([
        MongoEvalItem.find(filter).sort({ createTime: -1 }).skip(skip).limit(limit).lean(),
        MongoEvalItem.countDocuments(filter)
      ]);

      // Add evaluators data from parent evaluation
      const itemsWithEvaluators = items.map((item) => ({
        ...item,
        evaluators: evaluation.evaluators.map((evaluator) => ({
          metric: evaluator.metric,
          thresholdValue: evaluator.thresholdValue
        }))
      }));

      return { items: itemsWithEvaluators, total };
    }
  }

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

    // If actual update occurred, re-queue the item for evaluation
    if (result.modifiedCount > 0) {
      // Get the updated item to determine the evalId
      const updatedItem = await MongoEvalItem.findById(itemId, 'evalId');
      if (updatedItem) {
        // Reset evaluation results and re-queue
        await MongoEvalItem.updateOne(
          { _id: new Types.ObjectId(itemId) },
          {
            $set: {
              status: EvaluationStatusEnum.queuing,
              retry: 3
            },
            $unset: {
              targetOutput: 1,
              evaluatorOutputs: 1,
              finishTime: 1,
              errorMessage: 1
            }
          }
        );

        // Re-submit to evaluation queue
        await evaluationItemQueue.add(`eval_item_update_${itemId}`, {
          evalId: updatedItem.evalId.toString(),
          evalItemId: itemId
        });

        addLog.debug(`[Evaluation] Item updated and re-queued for evaluation: ${itemId}`);
      }
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

    // Get evaluation to access evaluators for proper evaluatorOutputs initialization
    const evaluation = await this.getEvaluation(item.evalId, teamId);

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
      // Initialize evaluatorOutputs based on evaluators schema definition
      const evaluatorOutputs = evaluation.evaluators.map((evaluator) => ({
        metricName: evaluator.metric.name
      }));

      // Update status within transaction
      const result = await MongoEvalItem.updateOne(
        { _id: new Types.ObjectId(itemId) },
        {
          $set: {
            status: EvaluationStatusEnum.queuing,
            retry: Math.max(item.retry || 0, 1), // Ensure at least 1 retry chance
            targetOutput: {},
            evaluatorOutputs
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

      // Initialize evaluatorOutputs based on evaluators schema definition
      const evaluatorOutputs = evaluation.evaluators.map((evaluator) => ({
        metricName: evaluator.metric.name
      }));

      // Batch update status
      await MongoEvalItem.updateMany(
        {
          _id: { $in: itemsToRetry.map((item) => item._id) }
        },
        {
          $set: {
            status: EvaluationStatusEnum.queuing,
            targetOutput: {},
            evaluatorOutputs
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

    // Note: Score recalculation will be triggered when items complete in finishEvaluationTask
    if (retriedCount > 0) {
      addLog.debug(
        `[Evaluation] Queued ${retriedCount} failed items for retry, scores will be recalculated when items complete: ${evalId}`
      );
    }

    return retriedCount;
  }

  static async getEvaluationItemResult(
    itemId: string,
    teamId: string
  ): Promise<EvaluationItemSchemaType> {
    const item = await this.getEvaluationItem(itemId, teamId);
    return item;
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
        scores: item.evaluatorOutputs?.map((output) => output?.data?.score) || [],
        status: item.status,
        targetOutput: item.targetOutput,
        evaluatorOutputs: item.evaluatorOutputs,
        errorMessage: item.errorMessage,
        finishTime: item.finishTime
      }));

      return { results: Buffer.from(JSON.stringify(results, null, 2)), total };
    } else {
      // CSV format
      if (items.length === 0) {
        return { results: Buffer.from(''), total: 0 };
      }

      // Collect all unique metric names from evaluator outputs
      const metricNames = new Set<string>();
      items.forEach((item) => {
        item.evaluatorOutputs?.forEach((output) => {
          if (output?.data?.metricName) {
            metricNames.add(output.data.metricName);
          }
        });
      });
      const sortedMetricNames = Array.from(metricNames).sort();

      const headers = [
        'ItemId',
        'UserInput',
        'ExpectedOutput',
        'ActualOutput',
        ...sortedMetricNames, // Dynamic metric columns
        'Status',
        'ErrorMessage',
        'FinishTime'
      ];

      const csvRows = [headers.join(',')];

      items.forEach((item) => {
        // Create a map of metric name to score for easier lookup
        const metricScoreMap = new Map<string, number>();
        item.evaluatorOutputs?.forEach((output) => {
          if (output?.data?.metricName && output.data.score !== undefined) {
            metricScoreMap.set(output.data.metricName, output.data.score);
          }
        });

        const row = [
          item._id.toString(),
          `"${(item.dataItem?.userInput || '').replace(/"/g, '""')}"`,
          `"${(item.dataItem?.expectedOutput || '').replace(/"/g, '""')}"`,
          `"${(item.targetOutput?.actualOutput || '').replace(/"/g, '""')}"`,
          // Add scores for each metric column in the same order as headers
          ...sortedMetricNames.map((metricName) => {
            const score = metricScoreMap.get(metricName);
            return score !== undefined ? score : '';
          }),
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

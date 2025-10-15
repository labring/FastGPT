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
import type { MetricResult } from '@fastgpt/global/core/evaluation/metric/type';
import { Types } from 'mongoose';
import { EvaluationStatusEnum } from '@fastgpt/global/core/evaluation/constants';
import {
  removeEvaluationItemJobs,
  removeEvaluationItemJobsByItemId,
  addEvaluationItemJob,
  evaluationItemQueue,
  checkEvaluationItemQueueHealth
} from './mq';
import { createEvaluationUsage } from '../../../support/wallet/usage/controller';
import { addLog } from '../../../common/system/log';
import { buildEvalDataConfig } from '../summary/util/weightCalculator';
import { EvaluationErrEnum } from '@fastgpt/global/common/error/code/evaluation';
import { mongoSessionRun } from '../../../common/mongo/sessionRun';
import { type ClientSession } from '../../../common/mongo';

// Constants
const MAX_EXPORT_PAGE_SIZE = 100000;

// ===== Service Layer Response Types =====

// List response type for evaluations
export interface EvaluationListResponse {
  list: EvaluationDisplayType[];
  total: number;
}

// List response type for evaluation items
export interface EvaluationItemListResponse {
  items: EvaluationItemDisplayType[];
  total: number;
}

// Statistics response for evaluation task
export interface EvaluationStatsResponse {
  total: number;
  completed: number;
  evaluating: number;
  queuing: number;
  error: number;
  avgScore?: number;
}

// Result response for individual evaluation item
export interface EvaluationItemResultResponse {
  item: EvaluationItemSchemaType;
  dataItem: EvaluationDataItemType;
  response?: string;
  result?: MetricResult;
  score?: number;
}

// Export response for evaluation results
export interface EvaluationExportResponse {
  results: Buffer;
  total: number;
}

// Export response for grouped data items
export interface EvaluationExportByDataItemResponse {
  results: Buffer;
  totalItems: number;
}

// Grouped data item response
export interface DataItemGroupedResponse {
  list: DataItemGroupedType[];
  total: number;
}

// Individual grouped data item type
export interface DataItemGroupedType {
  dataItemId: string;
  dataItem: EvaluationDataItemType;
  items: EvaluationItemDisplayType[];
  summary: {
    totalItems: number;
    completedItems: number;
    errorItems: number;
    avgScore?: number;
  };
}

// Batch operation response types
export interface BatchDeleteResponse {
  deletedCount: number;
}

export interface BatchRetryResponse {
  retriedCount: number;
}

export interface BatchUpdateResponse {
  updatedCount: number;
}

export class EvaluationTaskService {
  /**
   * Build evaluator failure checks for MongoDB aggregation
   */
  private static buildEvaluatorFailChecks(evaluators: any[]) {
    return evaluators.map((evaluator, index) => {
      const threshold = evaluator.thresholdValue || 0.8;
      return {
        $or: [
          {
            $eq: [
              {
                $let: {
                  vars: {
                    evaluatorOutput: { $arrayElemAt: ['$evaluatorOutputs', index] }
                  },
                  in: '$$evaluatorOutput.data.score'
                }
              },
              null
            ]
          },
          {
            $eq: [
              {
                $type: {
                  $let: {
                    vars: {
                      evaluatorOutput: { $arrayElemAt: ['$evaluatorOutputs', index] }
                    },
                    in: '$$evaluatorOutput.data.score'
                  }
                }
              },
              'missing'
            ]
          },
          {
            $lt: [
              {
                $let: {
                  vars: {
                    evaluatorOutput: { $arrayElemAt: ['$evaluatorOutputs', index] }
                  },
                  in: '$$evaluatorOutput.data.score'
                }
              },
              threshold
            ]
          }
        ]
      };
    });
  }

  static async createEvaluation(
    params: CreateEvaluationParams & {
      teamId: string;
      tmbId: string;
    }
  ): Promise<EvaluationSchemaType> {
    const { teamId, tmbId, ...evaluationParams } = params;

    const evaluationParams = buildEvalDataConfig(evaluationParamsInput);

    const { billId } = await createEvaluationUsage({
      teamId,
      tmbId,
      appName: evaluationParams.name
    });

    // Apply default configuration to evaluators (weights, thresholds, etc.)
    const evaluatorsWithDefaultConfig = buildEvalDataConfig(evaluationParams.evaluators);

    const evaluation = await MongoEvaluation.create({
      ...evaluationParams,
      evaluators: evaluatorsWithDefaultConfig,
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

    // Get real-time status from job queues
    const status = await getEvaluationTaskStatus(evalId);

    return {
      ...evaluation,
      status
    };
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
      // Remove tasks from queue to prevent further processing
      const [itemCleanupResult, summaryCleanupResult] = await Promise.all([
        removeEvaluationItemJobs(evalId, {
          forceCleanActiveJobs: true,
          retryAttempts: 3,
          retryDelay: 200
        }),
        removeEvaluationSummaryJobs(evalId, {
          forceCleanActiveJobs: true,
          retryAttempts: 3,
          retryDelay: 200
        })
      ]);

      addLog.debug('Queue cleanup completed for evaluation deletion', {
        evalId,
        itemCleanup: itemCleanupResult,
        summaryCleanup: summaryCleanupResult
      });

      // Delete all evaluation items
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
  ): Promise<EvaluationListResponse> {
    // Build basic filter and pagination
    const filter: any = { teamId: new Types.ObjectId(teamId) };
    const skip = offset;
    const limit = pageSize;
    const sort = { createTime: -1 as const };

    // Filter by accessible resources if not owner
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
            }
          }
        },
        {
          $project: {
            _id: 1,
            name: 1,
            createTime: 1,
            finishTime: 1,
            errorMessage: 1,
            avgScore: 1,
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
            evaluators: 1, // Add evaluators field for real-time calculation
            summaryData: 1,
            aggregateScore: 1,
            tmbId: 1
          }
        },
        { $sort: sort },
        { $skip: skip },
        { $limit: limit }
      ]),
      // Get total count without pagination
      MongoEvaluation.aggregate([...aggregationPipeline, { $count: 'total' }]).then(
        (result) => result[0]?.total || 0
      )
    ]);

    // Get real-time status and statistics
    const evaluationsWithStatus = await Promise.all(
      evaluations.map(async (evaluation) => {
        const [status, statistics] = await Promise.all([
          getEvaluationTaskStatus(evaluation._id.toString()),
          getEvaluationTaskStats(evaluation._id.toString())
        ]);
        return {
          ...evaluation,
          status,
          statistics
        };
      })
    );

    // Return data (permissions handled in API layer)
    // Calculate real-time scores for each evaluation
    const evaluationsWithRealTimeScores = await Promise.all(
      evaluationsWithStatus.map(async (evaluation) => {
        try {
          // Calculate real-time metric scores and aggregate score
          const calculatedData = await EvaluationSummaryService.calculateMetricScores(evaluation);

          // Update summaryConfigs with real-time calculated values
          const updatedSummaryConfigs = evaluation.summaryData.summaryConfigs.map(
            (summaryConfig: any) => {
              const metricData = calculatedData.metricsData.find(
                (m) => m.metricId === summaryConfig.metricId
              );
              return {
                ...summaryConfig,
                score: metricData?.metricScore || 0,
                completedItemCount: metricData?.totalCount || 0,
                overThresholdItemCount: metricData?.aboveThresholdCount || 0
              };
            }
          );

          return {
            ...evaluation,
            summaryData: {
              ...evaluation.summaryData,
              summaryConfigs: updatedSummaryConfigs
            },
            aggregateScore: calculatedData.aggregateScore
          };
        } catch (error) {
          addLog.error('[listEvaluations] Failed to calculate real-time scores', {
            evalId: evaluation._id,
            error
          });
          // Return evaluation with default score values if calculation fails
          const defaultSummaryConfigs =
            evaluation.summaryData?.summaryConfigs?.map((summaryConfig: any) => ({
              ...summaryConfig,
              score: 0,
              completedItemCount: 0,
              overThresholdItemCount: 0
            })) || [];

          return {
            ...evaluation,
            summaryData: {
              ...evaluation.summaryData,
              summaryConfigs: defaultSummaryConfigs
            },
            aggregateScore: 0
          };
        }
      })
    );

    // Return data with real-time scores - permissions will be handled in API layer
    return {
      list: evaluationsWithRealTimeScores,
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
      {
        $addFields: {
          'target.config.appName': { $arrayElemAt: ['$app.name', 0] },
          'target.config.avatar': { $arrayElemAt: ['$app.avatar', 0] },
          'target.config.versionName': { $arrayElemAt: ['$appVersion.versionName', 0] }
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
          summary: 1,
          usageId: 1,
          createTime: 1,
          finishTime: 1,
          errorMessage: 1
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
  ): Promise<EvaluationItemListResponse> {
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

    // Check if task can be started using job status
    const isJobActive = await checkEvaluationTaskJobActive(evalId);

    if (isJobActive) {
      throw new Error('Evaluation task is already running');
    }

    // Let BullMQ handle most scenarios
    const canStart =
      evaluation.status === EvaluationStatusEnum.queuing ||
      evaluation.status === EvaluationStatusEnum.completed ||
      evaluation.status === EvaluationStatusEnum.error;

    if (!canStart) {
      throw new Error(EvaluationErrEnum.evalInvalidStateTransition);
    }

    await enqueueEvaluationItems(evalId);

    const action =
      evaluation.status === EvaluationStatusEnum.error
        ? 'restarted'
        : evaluation.status === EvaluationStatusEnum.completed
          ? 'restarted'
          : 'started';
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
      // Remove tasks from queue
      const [itemCleanupResult, summaryCleanupResult] = await Promise.all([
        removeEvaluationItemJobs(evalId, {
          forceCleanActiveJobs: true,
          retryAttempts: 3,
          retryDelay: 200
        }),
        removeEvaluationSummaryJobs(evalId, {
          forceCleanActiveJobs: true,
          retryAttempts: 3,
          retryDelay: 200
        })
      ]);

      addLog.debug('Queue cleanup completed for evaluation stop', {
        evalId,
        itemCleanup: itemCleanupResult,
        summaryCleanup: summaryCleanupResult
      });

      // Set error state for manual stop
      await MongoEvaluation.updateOne(
        { _id: new Types.ObjectId(evalId) },
        {
          $set: {
            finishTime: new Date(),
            errorMessage: EvaluationErrEnum.evalManuallyStopped
          }
        },
        { session }
      );

      // Mark evaluation items as manually stopped
      await MongoEvalItem.updateMany(
        {
          evalId: new Types.ObjectId(evalId)
        },
        {
          $set: {
            errorMessage: EvaluationErrEnum.evalManuallyStopped,
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
  ): Promise<EvaluationStatsResponse> {
    const evaluation = await this.getEvaluation(evalId, teamId);

    // Get real-time status from job queues
    const basicStats = await getEvaluationTaskStats(evalId);

    // Calculate belowThreshold count using threshold checks
    const evaluators = evaluation.evaluators || [];
    let belowThresholdCount = 0;

    if (evaluators.length > 0) {
      const evaluatorFailChecks = this.buildEvaluatorFailChecks(evaluators);

    const pipeline = [
      { $match: { evalId: evaluation._id } },
      {
        $addFields: {
          // Add a field to check if this item has any failed evaluators
          hasFailedEvaluator: evaluatorFailChecks.length > 0 ? { $or: evaluatorFailChecks } : false
        }
      },
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
          },
          avgScore: {
            $avg: {
              $cond: [
                {
                  $and: [
                    { $eq: ['$status', EvaluationStatusEnum.completed] },
                    { $ne: ['$evaluatorOutput.data.score', null] }
                  ]
                },
                '$evaluatorOutput.data.score',
                null
              ]
            }
          }
        }
      }
    ]);

    // Return stats with defaults for empty results
    const result: EvaluationStatsResponse = {
      total: statsResult?.total || 0,
      completed: statsResult?.completed || 0,
      evaluating: statsResult?.evaluating || 0,
      queuing: statsResult?.queuing || 0,
      error: statsResult?.error || 0,
      avgScore: statsResult?.avgScore ? Math.round(statsResult.avgScore * 100) / 100 : undefined
    };
  }

  /**
   * Evaluation Item Management
   */

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

    // Build aggregation pipeline
    const pipeline = this.buildEvaluationItemsPipeline(
      evaluation,
      { status, belowThreshold, userInput, expectedOutput, actualOutput },
      offset,
      pageSize
    );

    try {
      const [dataResult, countResult] = await Promise.all([
        MongoEvalItem.aggregate(pipeline.dataPipeline),
        MongoEvalItem.aggregate(pipeline.countPipeline)
      ]);

      const total = countResult[0]?.total || 0;
      const items = dataResult.map((item) => ({
        ...item,
        _id: String(item._id),
        // Add evaluator info
        evaluators: evaluation.evaluators.map((evaluator, index) => ({
          metric: evaluator.metric,
          thresholdValue: evaluator.thresholdValue,
          //check mongo schema need to change or not,add this for Front-end calculate aggreatescore threshold
          weight: evaluation.summaryData.summaryConfigs[index]?.weight || 0
        })),
        // Add summaryData
        summaryData: evaluation.summaryData
      }));

      return { items, total };
    } catch (error) {
      console.error('Failed to list evaluation items', {
        evalId,
        options,
        offset,
        pageSize,
        error
      });
      throw new Error('Failed to list evaluation items');
    }
  }

  /**
   * Build aggregation pipeline for evaluation items listing
   */
  private static buildEvaluationItemsPipeline(
    evaluation: any,
    filters: {
      status?: EvaluationStatusEnum;
      belowThreshold?: boolean;
      userInput?: string;
      expectedOutput?: string;
      actualOutput?: string;
    },
    offset: number,
    pageSize: number
  ) {
    const { status, belowThreshold, userInput, expectedOutput, actualOutput } = filters;

    // Base match conditions
    const matchConditions: Record<string, any> = {
      evalId: evaluation._id
    };

    // Use status for status filtering
    if (status !== undefined) {
      matchConditions['status'] = status;
    }

    // Add text search conditions
    const searchConditions: any[] = [];
    if (userInput && typeof userInput === 'string' && userInput.trim().length > 0) {
      searchConditions.push({
        'dataItem.userInput': { $regex: new RegExp(userInput.trim(), 'i') }
      });
    }
    if (expectedOutput && typeof expectedOutput === 'string' && expectedOutput.trim().length > 0) {
      searchConditions.push({
        'dataItem.expectedOutput': { $regex: new RegExp(expectedOutput.trim(), 'i') }
      });
    }
    if (actualOutput && typeof actualOutput === 'string' && actualOutput.trim().length > 0) {
      searchConditions.push({
        'targetOutput.actualOutput': { $regex: new RegExp(actualOutput.trim(), 'i') }
      });
    }

    if (searchConditions.length > 0) {
      matchConditions.$and = searchConditions;
    }

    // Build pipeline stages
    const commonPipeline: any[] = [{ $match: matchConditions }];

    // Status field is already available directly

    // Add threshold filter if specified
    if (belowThreshold) {
      const evaluators = evaluation.evaluators || [];
      if (evaluators.length > 0) {
        const evaluatorFailChecks = this.buildEvaluatorFailChecks(evaluators);
        commonPipeline.push({
          $addFields: {
            hasFailedEvaluator:
              evaluatorFailChecks.length > 0 ? { $or: evaluatorFailChecks } : false
          }
        });
        commonPipeline.push({
          $match: {
            hasFailedEvaluator: true,
            status: EvaluationStatusEnum.completed, // Only completed items
            evaluatorOutputs: { $exists: true, $ne: null, $not: { $size: 0 } } // Valid evaluator outputs
          }
        });
      }
    }

    // Data pipeline
    const dataPipeline = [
      ...commonPipeline,
      { $sort: { createTime: -1 } },
      { $skip: offset },
      { $limit: pageSize },
      {
        $project: {
          _id: 1,
          evalId: 1,
          dataItem: 1,
          targetOutput: 1,
          evaluatorOutputs: 1,
          status: 1,
          createTime: 1,
          updateTime: 1,
          errorMessage: 1
        }
      }
    ];

    // Count pipeline
    const countPipeline = [...commonPipeline, { $count: 'total' }];

    return { dataPipeline, countPipeline };
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
   * Build MongoDB update object for evaluation data items
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
    const item = await this.getEvaluationItem(itemId, teamId);
    const evaluation = await this.getEvaluation(item.evalId, teamId);

    // Build MongoDB update object
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

    // Re-queue item if updated
    if (result.modifiedCount > 0) {
      // Get the updated item to determine the evalId
      const updatedItem = await MongoEvalItem.findById(itemId, 'evalId');
      if (updatedItem) {
        const cleanupResult = await removeEvaluationItemJobsByItemId(itemId, {
          forceCleanActiveJobs: true,
          retryAttempts: 3,
          retryDelay: 200
        });

        addLog.debug('Queue cleanup completed for evaluation item deletion', {
          itemId,
          cleanup: cleanupResult
        });

        // Reset results and re-queue
        const evaluatorOutputs = evaluation.evaluators.map((evaluator) => ({
          metricName: evaluator.metric.name
        }));

        await MongoEvalItem.updateOne(
          { _id: new Types.ObjectId(itemId) },
          {
            $set: {
              targetOutput: {},
              evaluatorOutputs
            }
          }
        );
        // Re-submit to evaluation queue
        await addEvaluationItemJob({
          evalId: updatedItem.evalId.toString(),
          evalItemId: itemId
        });

        addLog.debug(`[Evaluation] Item updated and re-queued for evaluation: ${itemId}`);
      }
    }
  }

  static async deleteEvaluationItem(itemId: string, teamId: string): Promise<void> {
    await this.getEvaluationItem(itemId, teamId);

    // Remove jobs from queue before deleting
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

    // Find the failed job for this item by searching through failed jobs
    const failedJobs = await evaluationItemQueue.getJobs(['failed']);
    const job = failedJobs.find((j) => j.data.evalItemId === itemId);

    if (!job) {
      throw new Error(EvaluationErrEnum.evalItemJobNotFound);
    }

    // Retry the job directly (active event will clear error state automatically)
    await job.retry();

    addLog.debug('Evaluation item retried successfully', {
      itemId,
      evalId: item.evalId,
      teamId
    });
  }

  static async retryFailedItems(evalId: string, teamId: string): Promise<number> {
    await this.getEvaluation(evalId, teamId); // Validate evalId and teamId

    // Get all failed jobs for this evaluation
    const failedJobs = await evaluationItemQueue.getJobs(['failed']);
    const evaluationFailedJobs = failedJobs.filter((job) => job.data.evalId === evalId);

    if (evaluationFailedJobs.length === 0) {
      addLog.warn('No failed jobs found to retry for evaluation', { evalId });
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

    return await mongoSessionRun(retryItems);
  }

  static async getEvaluationItemResult(
    itemId: string,
    teamId: string
  ): Promise<EvaluationItemResultResponse> {
    const item = await this.getEvaluationItem(itemId, teamId);
    return item;
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
  ): Promise<EvaluationItemListResponse> {
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
        filter['evaluatorOutputs.0.data.score'] = scoreFilter;
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
  ): Promise<EvaluationExportResponse> {
    const evaluation = await this.getEvaluation(evalId, teamId);

    const items = await MongoEvalItem.find({ evalId: evaluation._id })
      .sort({ createTime: 1 })
      .lean();

    const total = items.length;

    // Get real-time status for all items
    const itemIds = items.map((item) => item._id.toString());
    const statusMap = await getBatchEvaluationItemStatus(itemIds);

    if (format === 'json') {
      const results = items.map((item) => ({
        itemId: item._id,
        userInput: item.dataItem?.userInput,
        expectedOutput: item.dataItem?.expectedOutput,
        actualOutput: item.targetOutput?.actualOutput,
        scores: item.evaluatorOutputs?.map((output) => output?.data?.score) || [],
        status: statusMap.get(item._id.toString()) || EvaluationStatusEnum.completed,
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

      // Translate metric names for CSV headers
      const translatedMetricNames = sortedMetricNames.map((metricName) =>
        translateBuiltinMetricName(metricName, locale)
      );

      // Translate column headers
      const baseHeaders = ['ItemId', 'UserInput', 'ExpectedOutput', 'ActualOutput'];
      const translatedBaseHeaders = baseHeaders.map((header) =>
        translateCsvColumnName(header, locale)
      );

      const footerHeaders = ['Status', 'ErrorMessage'];
      const translatedFooterHeaders = footerHeaders.map((header) =>
        translateCsvColumnName(header, locale)
      );

      const headers = [
        ...translatedBaseHeaders,
        ...translatedMetricNames,
        ...translatedFooterHeaders
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

        const itemStatus = statusMap.get(item._id.toString()) || EvaluationStatusEnum.completed;

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
          itemStatus || '',
          `"${(item.errorMessage || '').replace(/"/g, '""')}"`
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
  ): Promise<DataItemGroupedResponse> {
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
          },
          avgScore: { $avg: '$evaluatorOutput.data.score' }
        }
      },
      {
        $addFields: {
          dataItemId: '$_id',
          'summary.totalItems': '$totalItems',
          'summary.completedItems': '$completedItems',
          'summary.errorItems': '$errorItems',
          'summary.avgScore': { $round: ['$avgScore', 2] }
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
            summary: {
              totalItems: '$totalItems',
              completedItems: '$completedItems',
              errorItems: '$errorItems',
              avgScore: '$summary.avgScore'
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
  ): Promise<BatchDeleteResponse> {
    // Verify team access to the evaluation task
    await this.getEvaluation(evalId, teamId);

    const filter: any = {
      'dataItem._id': dataItemId,
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
  ): Promise<BatchRetryResponse> {
    // Verify evaluation access first
    await this.getEvaluation(evalId, teamId);

    const filter: any = {
      'dataItem._id': dataItemId,
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
  ): Promise<BatchUpdateResponse> {
    // Verify evaluation access first
    await this.getEvaluation(evalId, teamId);

    // Build MongoDB update object with dot notation
    const updateObj = this.buildEvaluationDataItemUpdateObject(updates);
    if (Object.keys(updateObj).length === 0) {
      return { updatedCount: 0 };
    }

    const filter: any = {
      'dataItem._id': dataItemId,
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
  ): Promise<EvaluationExportByDataItemResponse> {
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

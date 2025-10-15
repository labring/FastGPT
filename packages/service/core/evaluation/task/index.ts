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
  removeEvaluationTaskJob,
  removeEvaluationItemJobs,
  removeEvaluationItemJobsByItemId,
  addEvaluationTaskJob,
  addEvaluationItemJob,
  evaluationItemQueue
} from './mq';
import { createEvaluationUsage } from '../../../support/wallet/usage/controller';
import { addLog } from '../../../common/system/log';
import { buildEvalDataConfig } from '../summary/util/weightCalculator';
import { EvaluationErrEnum } from '@fastgpt/global/common/error/code/evaluation';
import { mongoSessionRun } from '../../../common/mongo/sessionRun';
import { type ClientSession } from '../../../common/mongo';
import { getEvaluationTaskStatus, getEvaluationTaskStats } from './statusCalculator';
import { EvaluationSummaryService } from '../summary';
import { removeEvaluationSummaryJobs } from '../summary/queue';

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
    const { teamId, tmbId, autoStart = true, ...evaluationParams } = params;

    // Create evaluation usage record
    const { billId } = await createEvaluationUsage({
      teamId,
      tmbId,
      appName: evaluationParams.name
    });

    // Apply default configuration to evaluators
    const { evaluators: evaluatorsWithDefaultConfig, summaryConfigs } = buildEvalDataConfig(
      evaluationParams.evaluators
    );
    const createAndStart = async (session: ClientSession) => {
      // Create evaluation in transaction
      const evaluation = await MongoEvaluation.create(
        [
          {
            ...evaluationParams,
            evaluators: evaluatorsWithDefaultConfig,
            summaryConfigs,
            teamId,
            tmbId,
            usageId: billId,
            createTime: new Date()
          }
        ],
        { session }
      );

      const evaluationObject = evaluation[0].toObject();

      // Load dataset and create evaluation items
      const dataItems = await MongoEvalDatasetData.find({
        evalDatasetCollectionId: evaluationParams.evalDatasetCollectionId,
        teamId
      })
        .session(session)
        .lean();

      if (dataItems.length === 0) {
        throw new Error(EvaluationErrEnum.evalDatasetLoadFailed);
      }

      // Create evaluation items
      const evalItems: Omit<EvaluationItemSchemaType, '_id' | 'status'>[] = [];
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
          dataItem: evaluationDataItem
        });
      }

      // Insert evaluation items in transaction
      const insertedItems = await MongoEvalItem.insertMany(evalItems, { session });
      addLog.debug(`[Evaluation] Created ${insertedItems.length} evaluation items`);

      // Auto-start evaluation if enabled
      if (autoStart) {
        // Add to task queue with deduplication
        await addEvaluationTaskJob({
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
      const [taskCleanupResult, itemCleanupResult, summaryCleanupResult] = await Promise.all([
        removeEvaluationTaskJob(evalId, {
          forceCleanActiveJobs: true,
          retryAttempts: 3,
          retryDelay: 200
        }),
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
        taskCleanup: taskCleanupResult,
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
    isOwner: boolean = false,
    appName?: string,
    appId?: string
  ): Promise<{ list: EvaluationDisplayType[]; total: number }> {
    // Build filter and pagination
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

    // Build aggregation pipeline
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

    // Add target filtering if provided
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

    // Add search key filtering
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
            evaluators: 1, // Add evaluators field for real-time calculation
            summaryConfigs: 1,
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
          const updatedSummaryConfigs = evaluation.summaryConfigs.map((summaryConfig: any) => {
            const metricData = calculatedData.metricsData.find(
              (m) => m.metricId === summaryConfig.metricId
            );
            return {
              ...summaryConfig,
              score: metricData?.metricScore || 0,
              completedItemCount: metricData?.totalCount || 0,
              overThresholdItemCount: metricData?.aboveThresholdCount || 0
            };
          });

          return {
            ...evaluation,
            summaryConfigs: updatedSummaryConfigs,
            aggregateScore: calculatedData.aggregateScore
          };
        } catch (error) {
          addLog.error('[listEvaluations] Failed to calculate real-time scores', {
            evalId: evaluation._id,
            error
          });
          // Return evaluation with default score values if calculation fails
          const defaultSummaryConfigs = evaluation.summaryConfigs.map((summaryConfig: any) => ({
            ...summaryConfig,
            score: 0,
            completedItemCount: 0,
            overThresholdItemCount: 0
          }));

          return {
            ...evaluation,
            summaryConfigs: defaultSummaryConfigs,
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
          'target.config.versionName': { $arrayElemAt: ['$appVersion.versionName', 0] },
          evalDatasetCollectionName: { $arrayElemAt: ['$evalDatasetCollection.name', 0] },
          evalDatasetCollectionId: '$evalDatasetCollectionId'
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
          summaryConfigs: 1,
          usageId: 1,
          createTime: 1,
          finishTime: 1,
          errorMessage: 1
        }
      }
    ]);

    const evaluation = evaluationResult[0];
    if (!evaluation) {
      throw new Error(EvaluationErrEnum.evalTaskNotFound);
    }

    const status = await getEvaluationTaskStatus(evalId);
    const stats = await getEvaluationTaskStats(evalId);

    return {
      ...evaluation,
      status,
      statistics: stats
    };
  }

  static async startEvaluation(evalId: string, teamId: string): Promise<void> {
    const evaluation = await this.getEvaluation(evalId, teamId);

    // Let BullMQ handle most scenarios
    const canStart =
      evaluation.status === EvaluationStatusEnum.queuing ||
      evaluation.status === EvaluationStatusEnum.completed ||
      evaluation.status === EvaluationStatusEnum.error;

    if (!canStart) {
      throw new Error(EvaluationErrEnum.evalInvalidStateTransition);
    }

    await addEvaluationTaskJob({
      evalId: evalId
    });

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
      const [taskCleanupResult, itemCleanupResult, summaryCleanupResult] = await Promise.all([
        removeEvaluationTaskJob(evalId, {
          forceCleanActiveJobs: true,
          retryAttempts: 3,
          retryDelay: 200
        }),
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
        taskCleanup: taskCleanupResult,
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
  ): Promise<{
    total: number;
    completed: number;
    evaluating: number;
    queuing: number;
    error: number;
    belowThreshold: number;
  }> {
    const evaluation = await this.getEvaluation(evalId, teamId); // Validate access

    // Get real-time status from job queues
    const basicStats = await getEvaluationTaskStats(evalId);

    // Calculate belowThreshold count using threshold checks
    const evaluators = evaluation.evaluators || [];
    let belowThresholdCount = 0;

    if (evaluators.length > 0) {
      const evaluatorFailChecks = this.buildEvaluatorFailChecks(evaluators);

      // Count items that are below threshold checks
      const belowThresholdResult = await MongoEvalItem.aggregate([
        { $match: { evalId: new Types.ObjectId(evalId) } },
        {
          $addFields: {
            hasFailedEvaluator:
              evaluatorFailChecks.length > 0 ? { $or: evaluatorFailChecks } : false
          }
        },
        {
          $match: {
            hasFailedEvaluator: true,
            finishTime: { $exists: true }, // Only completed items
            errorMessage: { $exists: false } // Exclude errors
          }
        },
        { $count: 'belowThreshold' }
      ]);

      belowThresholdCount = belowThresholdResult[0]?.belowThreshold || 0;
    }

    return {
      ...basicStats,
      belowThreshold: belowThresholdCount
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
          weight: evaluation.summaryConfigs[index]?.weight || 0
        })),
        // Add summary configs
        summaryConfigs: evaluation.summaryConfigs
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

    if (item.status !== EvaluationStatusEnum.error) {
      throw new Error(EvaluationErrEnum.evalItemNoErrorToRetry);
    }

    const [failedJobs, pendingJobs] = await Promise.all([
      evaluationItemQueue.getJobs(['failed']),
      evaluationItemQueue.getJobs(['waiting', 'delayed', 'active', 'prioritized'])
    ]);

    const pendingJob = pendingJobs.find((job) => job.data?.evalItemId === itemId);
    if (pendingJob) {
      addLog.debug('Evaluation item retry skipped (job already pending)', {
        itemId,
        evalId: item.evalId,
        teamId,
        jobId: pendingJob.id
      });
      return;
    }

    const failedJob = failedJobs.find((job) => job.data?.evalItemId === itemId);
    if (failedJob) {
      // Retry the failed job first
      await failedJob.retry();

      // Update status to queuing after successful retry
      await MongoEvalItem.updateOne(
        { _id: new Types.ObjectId(itemId) },
        {
          $set: {
            status: EvaluationStatusEnum.queuing
          },
          $unset: {
            finishTime: 1,
            errorMessage: 1
          }
        }
      );

      addLog.debug('Evaluation item retried successfully (existing failed job)', {
        itemId,
        evalId: item.evalId,
        teamId,
        jobId: failedJob.id
      });
      return;
    }

    // Add new job first
    await addEvaluationItemJob({
      evalId: item.evalId.toString(),
      evalItemId: itemId
    });

    // Update status to queuing after successful job addition
    await MongoEvalItem.updateOne(
      { _id: new Types.ObjectId(itemId) },
      {
        $set: {
          status: EvaluationStatusEnum.queuing
        },
        $unset: {
          finishTime: 1,
          errorMessage: 1
        }
      }
    );

    addLog.debug('Evaluation item retried successfully (new job queued)', {
      itemId,
      evalId: item.evalId,
      teamId
    });
  }

  static async retryFailedItems(evalId: string, teamId: string): Promise<number> {
    const evaluation = await this.getEvaluation(evalId, teamId); // Validate evalId and teamId

    const itemsToProcess = await MongoEvalItem.find({
      evalId: evaluation._id,
      status: EvaluationStatusEnum.error
    }).lean();

    if (itemsToProcess.length === 0) {
      addLog.warn('No failed jobs found to retry for evaluation', { evalId });
      return 0;
    }

    const [failedJobs, pendingJobs] = await Promise.all([
      evaluationItemQueue.getJobs(['failed']),
      evaluationItemQueue.getJobs(['waiting', 'delayed', 'active', 'prioritized'])
    ]);

    const failedJobMap = new Map<string, (typeof failedJobs)[number]>();
    failedJobs.forEach((job) => {
      const evalItemId = job.data?.evalItemId;
      if (evalItemId) {
        failedJobMap.set(evalItemId, job);
      }
    });

    const pendingJobSet = new Set<string>();
    pendingJobs.forEach((job) => {
      const evalItemId = job.data?.evalItemId;
      if (evalItemId) {
        pendingJobSet.add(evalItemId);
      }
    });

    let retriedJobs = 0;
    let addedJobs = 0;
    let skippedJobs = 0;

    // Collect successfully processed items for batch status update
    const itemsToUpdate: string[] = [];

    // Process each item: retry/add job first, then collect for status update
    for (const item of itemsToProcess) {
      const evalItemId = item._id.toString();

      if (pendingJobSet.has(evalItemId)) {
        skippedJobs += 1;
        continue;
      }

      try {
        const failedJob = failedJobMap.get(evalItemId);
        if (failedJob) {
          // Retry the failed job first
          await failedJob.retry();
          retriedJobs += 1;
          itemsToUpdate.push(evalItemId);
          pendingJobSet.add(evalItemId);
        } else {
          // Add new job first
          await addEvaluationItemJob({
            evalId,
            evalItemId
          });
          addedJobs += 1;
          itemsToUpdate.push(evalItemId);
          pendingJobSet.add(evalItemId);
        }
      } catch (error) {
        addLog.error('Failed to retry evaluation item', {
          evalId,
          evalItemId,
          error
        });
        // Don't add to itemsToUpdate if job operation failed
      }
    }

    // Update status to queuing for all successfully processed items
    if (itemsToUpdate.length > 0) {
      await MongoEvalItem.updateMany(
        { _id: { $in: itemsToUpdate.map((id) => new Types.ObjectId(id)) } },
        {
          $set: {
            status: EvaluationStatusEnum.queuing
          },
          $unset: {
            finishTime: 1,
            errorMessage: 1
          }
        }
      );
    }

    const totalProcessed = retriedJobs + addedJobs;

    addLog.debug('All failed evaluation items retry completed', {
      evalId,
      teamId,
      retriedJobs,
      addedJobs,
      skippedJobs,
      totalProcessed
    });

    return totalProcessed;
  }

  static async getEvaluationItemResult(
    itemId: string,
    teamId: string
  ): Promise<EvaluationItemSchemaType> {
    const item = await this.getEvaluationItem(itemId, teamId);
    return item;
  }
}
export { MongoEvaluation };

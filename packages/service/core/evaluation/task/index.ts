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
  checkEvaluationTaskJobActive,
  evaluationItemQueue
} from './mq';
import { createEvaluationUsage } from '../../../support/wallet/usage/controller';
import { addLog } from '../../../common/system/log';
import { buildEvalDataConfig } from '../summary/util/weightCalculator';
import { EvaluationErrEnum } from '@fastgpt/global/common/error/code/evaluation';
import { mongoSessionRun } from '../../../common/mongo/sessionRun';
import { type ClientSession } from '../../../common/mongo';
import {
  getEvaluationTaskStatus,
  getEvaluationItemStatus,
  getEvaluationTaskStats,
  getBatchEvaluationItemStatus
} from './statusCalculator';
import { EvaluationSummaryService } from '../summary';

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

    // Check if task can be started using job status
    const isJobActive = await checkEvaluationTaskJobActive(evalId);

    if (isJobActive) {
      throw new Error('Evaluation task is already running');
    }

    // Let BullMQ handle most scenarios
    const canStart =
      evaluation.status === EvaluationStatusEnum.queuing ||
      evaluation.status === EvaluationStatusEnum.completed ||
      (evaluation.status === EvaluationStatusEnum.error &&
        evaluation.errorMessage === 'Manually stopped');

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

    // Check if task is running using job status
    const isJobActive = await checkEvaluationTaskJobActive(evalId);

    if (
      !isJobActive &&
      ![EvaluationStatusEnum.evaluating, EvaluationStatusEnum.queuing].includes(evaluation.status)
    ) {
      throw new Error(EvaluationErrEnum.evalOnlyRunningCanStop);
    }

    const stopEval = async (session: ClientSession) => {
      // Remove tasks from queue
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

      // Set error state for manual stop
      await MongoEvaluation.updateOne(
        { _id: new Types.ObjectId(evalId) },
        {
          $set: {
            finishTime: new Date(),
            errorMessage: 'Manually stopped'
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
    failed: number;
  }> {
    const evaluation = await this.getEvaluation(evalId, teamId); // Validate access

    // Get real-time status from job queues
    const basicStats = await getEvaluationTaskStats(evalId);

    // Calculate failed count using threshold checks
    const evaluators = evaluation.evaluators || [];
    let failedCount = 0;

    if (evaluators.length > 0) {
      const evaluatorFailChecks = this.buildEvaluatorFailChecks(evaluators);

      // Count items that fail threshold checks
      const failedResult = await MongoEvalItem.aggregate([
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
        { $count: 'failed' }
      ]);

      failedCount = failedResult[0]?.failed || 0;
    }

    return {
      ...basicStats,
      failed: failedCount
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

    // Use metadata.status for status filtering
    if (status !== undefined) {
      matchConditions['metadata.status'] = status;
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

    // Add status field using metadata.status
    commonPipeline.push({
      $addFields: {
        status: '$metadata.status'
      }
    });

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
            'metadata.status': EvaluationStatusEnum.completed, // Only completed items
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

    // Get real-time status
    const status = await getEvaluationItemStatus(itemId);

    return {
      ...item,
      status
    };
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

    let retriedItems = 0;
    let failedRetries = 0;

    // Process each failed job
    for (const job of evaluationFailedJobs) {
      try {
        // Retry the job directly (active event will clear error state automatically)
        await job.retry();
        retriedItems++;
      } catch (error) {
        failedRetries++;
        addLog.error('Failed to retry individual evaluation item job', {
          jobId: job.id,
          evalId,
          evalItemId: job.data.evalItemId,
          teamId,
          error
        });
      }
    }

    addLog.debug('All failed evaluation items retry completed', {
      evalId,
      teamId,
      totalFailedJobs: evaluationFailedJobs.length,
      retriedItems,
      failedRetries
    });

    return retriedItems;
  }

  static async getEvaluationItemResult(
    itemId: string,
    teamId: string
  ): Promise<EvaluationItemSchemaType> {
    const item = await this.getEvaluationItem(itemId, teamId);
    return item;
  }

  /**
   * Export evaluation results
   */
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

import {
  CaculateMethodMap,
  EvaluationStatusEnum,
  CalculateMethodEnum
} from '@fastgpt/global/core/evaluation/constants';
import { MongoEvaluation, MongoEvalItem } from '../task/schema';
import type {
  EvaluationSchemaType,
  EvaluationItemSchemaType
} from '@fastgpt/global/core/evaluation/type';
import { Types } from '../../../common/mongo';
import { addLog } from '../../../common/system/log';
import { SummaryStatusEnum, PERFECT_SCORE } from '@fastgpt/global/core/evaluation/constants';
import { getEvaluationSummaryTokenLimit } from '../utils/tokenLimiter';
import { createChatCompletion } from '../../ai/config';
import { getLLMModel, getEvaluationModel } from '../../ai/model';
import { countGptMessagesTokens } from '../../../common/string/tiktoken';
import type { ChatCompletionMessageParam } from '@fastgpt/global/core/ai/type';
import { ChatCompletionRequestMessageRoleEnum } from '@fastgpt/global/core/ai/constants';
import { loadRequestMessages } from '../../chat/utils';
import {
  problemAnalysisTemplate,
  strengthAnalysisTemplate,
  goodExample,
  badExample
} from '@fastgpt/global/core/ai/prompt/eval';
import { checkTeamAIPoints } from '../../../support/permission/teamLimit';
import { addAuditLog } from '../../../support/user/audit/util';
import { AuditEventEnum } from '@fastgpt/global/support/user/audit/constants';
import { concatUsage, evaluationUsageIndexMap } from '../../../support/wallet/usage/controller';
import { createMergedEvaluationUsage } from '../utils/usage';
import { formatModelChars2Points } from '../../../support/wallet/usage/utils';
import { ModelTypeEnum } from '@fastgpt/global/core/ai/model';
import { EvaluationErrEnum } from '@fastgpt/global/common/error/code/evaluation';
import { MetricResultStatusEnum } from '@fastgpt/global/core/evaluation/metric/constants';
import { addSummaryTaskToQueue } from './queue';
import { mongoSessionRun } from '../../../common/mongo/sessionRun';
import type { ClientSession } from '../../../common/mongo';

export class EvaluationSummaryService {
  // Get evaluation summary report
  static async getEvaluationSummary(evalId: string): Promise<{
    data: Array<{
      metricId: string;
      metricName: string;
      metricScore: number;
      summary: string;
      summaryStatus: string;
      errorReason?: string;
      completedItemCount: number;
      overThresholdItemCount: number;
      underThresholdRate: number;
      threshold: number;
      weight: number;
      customSummary: string;
    }>;
    aggregateScore: number;
  }> {
    const evaluation = await MongoEvaluation.findById(evalId).lean();
    if (!evaluation) throw new Error(EvaluationErrEnum.evalTaskNotFound);

    // Real-time calculate metric scores
    const calculatedData = await this.calculateMetricScores(evaluation);

    // Build return data using real-time calculated values
    const data = evaluation.evaluators.map((evaluator, index) => {
      const metricId = evaluator.metric._id.toString();
      const summaryConfig = evaluation.summaryConfigs[index];

      // Find calculated metric data
      const metricData = calculatedData.metricsData.find((m) => m.metricId === metricId);
      const completedItemCount = metricData?.totalCount || 0;
      const overThresholdItemCount = metricData?.aboveThresholdCount || 0;
      const metricScore = metricData?.metricScore || 0;

      const threshold = evaluator.thresholdValue || 0;
      const underThresholdRate =
        completedItemCount > 0
          ? Math.round(((completedItemCount - overThresholdItemCount) / completedItemCount) * 100)
          : 0;
      const underThresholdItemCount = completedItemCount - overThresholdItemCount;
      // Generate customSummary in format: "(完成个数个)summary"
      const customSummary = `${underThresholdRate}%(${underThresholdItemCount}个)${summaryConfig.summary || ''}`;

      return {
        metricId: metricId,
        metricName: evaluator.metric.name,
        metricScore: metricScore, // Use real-time calculated score
        summary: summaryConfig.summary,
        summaryStatus: summaryConfig.summaryStatus,
        errorReason: summaryConfig.errorReason,
        completedItemCount: completedItemCount, // Use real-time calculated count
        overThresholdItemCount: overThresholdItemCount, // Use real-time calculated count
        underThresholdRate: underThresholdRate, // Percentage of items that failed the threshold (0-100)
        threshold: threshold, // Add threshold field
        weight: summaryConfig.weight || 0, // Add weight field
        customSummary: customSummary // Add customSummary field with specified format
      };
    });

    return {
      data,
      aggregateScore: calculatedData.aggregateScore
    };
  }

  // This method is no longer needed as scores are calculated in real-time
  // Keeping for backward compatibility but will be deprecated
  static async calculateAndSaveMetricScores(
    evalId: string,
    session?: any // 支持在事务中调用
  ): Promise<void> {
    addLog.warn(
      '[Evaluation] calculateAndSaveMetricScores is deprecated, scores are now calculated in real-time',
      {
        evalId
      }
    );
    // No-op: scores are calculated in real-time when getEvaluationSummary is called
  }

  // Real-time calculation of metricScore and aggregateScore (pure calculation, no database updates)
  static async calculateMetricScores(evaluation: EvaluationSchemaType): Promise<{
    metricsData: Array<{
      metricId: string;
      metricName: string;
      metricScore: number;
      weight: number;
      thresholdValue: number;
      aboveThresholdCount: number;
      totalCount: number;
    }>;
    aggregateScore: number;
  }> {
    try {
      const evalId = new Types.ObjectId(evaluation._id);

      // Check if evaluation has required fields
      if (!evaluation.evaluators || !Array.isArray(evaluation.evaluators)) {
        addLog.warn('[calculateMetricScores] Evaluation has no evaluators', {
          evalId: evaluation._id
        });
        return {
          metricsData: [],
          aggregateScore: 0
        };
      }

      if (!evaluation.summaryConfigs || !Array.isArray(evaluation.summaryConfigs)) {
        addLog.warn('[calculateMetricScores] Evaluation has no summaryConfigs', {
          evalId: evaluation._id
        });
        return {
          metricsData: [],
          aggregateScore: 0
        };
      }

      // MongoDB aggregation pipeline - Calculate both successful scores and total completed count per metric
      const pipeline = [
        // Step 1: Filter evaluation items that have evaluator outputs
        {
          $match: {
            evalId: evalId,
            evaluatorOutputs: { $exists: true, $nin: [null, []] }
          }
        },
        // Step 2: Add fields to find matching metric results
        {
          $addFields: {
            // Create an array of metric results for easier processing
            metricResults: {
              $map: {
                input: '$evaluatorOutputs',
                as: 'output',
                in: {
                  metricName: '$$output.metricName',
                  status: '$$output.status',
                  score: '$$output.data.score',
                  hasValidScore: {
                    $and: [
                      { $eq: ['$$output.status', MetricResultStatusEnum.Success] },
                      { $ne: ['$$output.data.score', null] }
                    ]
                  }
                }
              }
            }
          }
        },
        // Step 3: Unwind the metric results
        {
          $unwind: '$metricResults'
        },
        // Step 4: Group by metric name and calculate statistics
        {
          $group: {
            _id: '$metricResults.metricName',
            // Collect all valid scores for this metric
            successfulScores: {
              $push: {
                $cond: ['$metricResults.hasValidScore', '$metricResults.score', '$$REMOVE']
              }
            },
            // Count unique evaluation items that have this metric (regardless of success/failure)
            uniqueItemIds: {
              $addToSet: '$_id'
            },
            metricName: { $first: '$metricResults.metricName' }
          }
        },
        // Step 5: Calculate final statistics
        {
          $addFields: {
            avgScore: {
              $cond: [
                { $gt: [{ $size: '$successfulScores' }, 0] },
                { $avg: '$successfulScores' },
                0
              ]
            },
            successCount: { $size: '$successfulScores' },
            totalCompletedCount: { $size: '$uniqueItemIds' }
          }
        }
      ];

      const metricsStats = await MongoEvalItem.aggregate(pipeline as any);

      // Calculate median for each statistic (since different evaluators may have different calculation methods)
      const processedStats = metricsStats.map((stats) => {
        let medianScore = 0;

        if (stats.successfulScores && stats.successfulScores.length > 0) {
          const sortedScores = [...stats.successfulScores].sort((a, b) => a - b);
          const length = sortedScores.length;

          if (length % 2 === 0) {
            // Even number of data points, take average of the two middle values
            const mid1 = sortedScores[length / 2 - 1];
            const mid2 = sortedScores[length / 2];
            medianScore = (mid1 + mid2) / 2;
          } else {
            // Odd number of data points, take the middle value
            medianScore = sortedScores[Math.floor(length / 2)];
          }
        }

        return {
          ...stats,
          medianScore
        };
      });

      // Process results, combine with evaluators configuration
      const metricsData: Array<{
        metricId: string;
        metricName: string;
        metricScore: number;
        weight: number;
        thresholdValue: number;
        aboveThresholdCount: number;
        totalCount: number;
      }> = [];

      let totalWeightedScore = 0;
      let totalWeight = 0;

      evaluation.evaluators.forEach((evaluator, index) => {
        const metricId = evaluator.metric._id.toString();
        const metricName = evaluator.metric.name;
        const stats = processedStats.find((s) => s._id === metricName);
        const summaryConfig = evaluation.summaryConfigs[index];

        if (stats) {
          // Select score based on current evaluator's calculation method with NaN protection
          let rawScore =
            summaryConfig.calculateType === CalculateMethodEnum.median
              ? stats.medianScore
              : stats.avgScore;

          // Ensure score is valid number
          if (isNaN(rawScore) || rawScore === null || rawScore === undefined) {
            rawScore = 0;
          }

          const metricScore = Math.round(rawScore * 100) / 100;

          // Calculate threshold statistics - count successful scores that meet threshold
          const aboveThresholdCount = stats.successfulScores.filter(
            (score: number) => score >= (evaluator.thresholdValue || 0)
          ).length;

          const weight = summaryConfig.weight;

          metricsData.push({
            metricId: metricId,
            metricName: evaluator.metric.name,
            metricScore,
            weight,
            thresholdValue: evaluator.thresholdValue || 0,
            aboveThresholdCount,
            totalCount: stats.totalCompletedCount
          });

          // Accumulate weighted scores
          totalWeightedScore += metricScore * weight;
          totalWeight += weight;
        } else {
          // Metrics with no data
          const weight = summaryConfig.weight;

          metricsData.push({
            metricId: metricId,
            metricName: evaluator.metric.name,
            metricScore: 0,
            weight: weight,
            thresholdValue: evaluator.thresholdValue || 0,
            aboveThresholdCount: 0,
            totalCount: 0
          });

          // Accumulate weighted scores for metrics with no data (score = 0)
          totalWeightedScore += 0 * weight;
          totalWeight += weight;
        }
      });

      // Calculate aggregate score with NaN protection
      let aggregateScore = 0;
      if (totalWeight > 0 && !isNaN(totalWeightedScore) && !isNaN(totalWeight)) {
        const rawScore = totalWeightedScore / totalWeight;
        aggregateScore = isNaN(rawScore) ? 0 : Math.round(rawScore * 100) / 100;
      }

      return {
        metricsData,
        aggregateScore
      };
    } catch (error) {
      addLog.error('[Evaluation] Real-time calculation failed', {
        evalId: evaluation._id.toString(),
        error
      });

      // Return default values
      const defaultData = evaluation.evaluators.map((evaluator, index) => {
        const summaryConfig = evaluation.summaryConfigs[index];
        return {
          metricId: evaluator.metric._id.toString(),
          metricName: evaluator.metric.name,
          metricScore: 0,
          weight: summaryConfig.weight,
          thresholdValue: evaluator.thresholdValue || 0,
          aboveThresholdCount: 0,
          totalCount: 0
        };
      });

      return {
        metricsData: defaultData,
        aggregateScore: 0
      };
    }
  }

  // Update evaluation summary configuration (threshold, weight, calculation method)
  // 使用MongoDB事务保证配置更新的原子性
  static async updateEvaluationSummaryConfig(
    evalId: string,
    metricsConfig: Array<{
      metricId: string;
      thresholdValue: number;
      weight?: number;
      calculateType?: CalculateMethodEnum;
    }>
  ): Promise<void> {
    addLog.info('[Evaluation] Starting configuration update', {
      evalId,
      metricsCount: metricsConfig.length
    });

    // 检查基本参数有效性
    const evaluation = await MongoEvaluation.findById(evalId).lean();
    if (!evaluation) throw new Error(EvaluationErrEnum.evalTaskNotFound);

    const evalMetricIdSet = new Set(
      (evaluation.evaluators || []).map((evaluator: any) => evaluator.metric._id.toString())
    );
    for (const m of metricsConfig) {
      if (!evalMetricIdSet.has(m.metricId)) {
        throw new Error(EvaluationErrEnum.summaryMetricsConfigError);
      }
    }

    // 使用事务更新配置
    await mongoSessionRun(async (session: ClientSession) => {
      const configMap = new Map(metricsConfig.map((m) => [m.metricId, m]));

      // 更新evaluators
      const updatedEvaluators = evaluation.evaluators.map((evaluator: any) => {
        const config = configMap.get(evaluator.metric._id.toString());
        return config ? { ...evaluator, thresholdValue: config.thresholdValue } : evaluator;
      });

      // 更新summaryConfigs
      const updatedSummaryConfigs = evaluation.summaryConfigs.map(
        (summaryConfig: any, index: number) => {
          const metricId = evaluation.evaluators[index].metric._id.toString();
          const config = configMap.get(metricId);

          if (config) {
            return {
              ...summaryConfig,
              ...(config.weight !== undefined && { weight: config.weight }),
              ...(config.calculateType !== undefined && { calculateType: config.calculateType })
            };
          }
          return summaryConfig;
        }
      );

      await MongoEvaluation.updateOne(
        { _id: evalId },
        { $set: { evaluators: updatedEvaluators, summaryConfigs: updatedSummaryConfigs } },
        { session }
      );

      addLog.info('[Evaluation] Configuration updated successfully', {
        evalId,
        evaluatorsCount: updatedEvaluators.length,
        summaryConfigsCount: updatedSummaryConfigs.length
      });
    });

    addLog.info('[Evaluation] Configuration update completed successfully', {
      evalId,
      metricsCount: metricsConfig.length
    });
  }

  // Get evaluation summary configuration details
  static async getEvaluationSummaryConfig(evalId: string): Promise<{
    calculateType: CalculateMethodEnum;
    calculateTypeName: string;
    metricsConfig: Array<{
      metricId: string;
      metricName: string;
      metricDescription: string;
      thresholdValue: number;
      weight: number;
    }>;
  }> {
    const evaluation = await MongoEvaluation.findById(evalId).lean();
    if (!evaluation) throw new Error(EvaluationErrEnum.evalTaskNotFound);

    // Get calculation type from first summary config (since all metrics use the same type)
    const firstSummaryConfig = evaluation.summaryConfigs[0];
    const calculateType = firstSummaryConfig.calculateType;
    const calculateTypeName = CaculateMethodMap[calculateType]?.name || 'Unknown';

    // Build return data, remove calculation type from individual metrics
    const metricsConfig = evaluation.evaluators.map((evaluator, index) => {
      const summaryConfig = evaluation.summaryConfigs[index];
      return {
        metricId: evaluator.metric._id.toString(),
        metricName: evaluator.metric.name,
        metricDescription: evaluator.metric.description || '',
        thresholdValue: evaluator.thresholdValue || 0,
        weight: summaryConfig.weight
      };
    });

    return {
      calculateType,
      calculateTypeName,
      metricsConfig
    };
  }

  static async queryEvalItems(
    evalId: string,
    status: EvaluationStatusEnum
  ): Promise<EvaluationItemSchemaType[]> {
    try {
      const items = await MongoEvalItem.find({
        evalId,
        status
      })
        .sort({ createTime: -1 })
        .lean();

      return items;
    } catch (error) {
      throw new Error(`查询评估项失败: ${error}`);
    }
  }

  // ===== Summary Generation Methods =====

  /**
   * 生成多个指标的总结报告 - 使用BullMQ队列化处理，解决系统崩溃导致状态卡死问题
   */
  static async generateSummaryReports(evalId: string, metricIds: string[]): Promise<void> {
    try {
      const evaluation = await MongoEvaluation.findById(evalId).lean();

      if (!evaluation) {
        throw new Error(EvaluationErrEnum.evalTaskNotFound);
      }

      addLog.info(
        '[EvaluationSummary] Starting validation and preparation of report generation tasks',
        {
          evalId,
          metricIds,
          totalMetrics: metricIds.length
        }
      );

      // Validate metric ownership and find corresponding evaluator index
      const validMetricIds: string[] = [];
      const skippedMetrics: Array<{
        metricId: string;
        metricName: string;
        reason: string;
      }> = [];

      metricIds.forEach((metricId) => {
        const evaluatorIndex = evaluation.evaluators.findIndex(
          (evaluator: any) => evaluator.metric._id.toString() === metricId
        );

        if (evaluatorIndex === -1) {
          addLog.warn('[EvaluationSummary] Metric does not belong to this evaluation task', {
            evalId,
            metricId
          });
          skippedMetrics.push({
            metricId,
            metricName: 'Unknown',
            reason: 'Metric does not belong to this evaluation task'
          });
          return;
        }

        // Get metric name for logging
        const metricName = evaluation.evaluators[evaluatorIndex].metric.name;

        validMetricIds.push(metricId);
      });

      // 记录跳过的指标信息
      if (skippedMetrics.length > 0) {
        addLog.info('[EvaluationSummary] Some metrics were skipped', {
          evalId,
          skippedCount: skippedMetrics.length,
          skippedMetrics: skippedMetrics.map((m) => ({
            metricId: m.metricId,
            metricName: m.metricName,
            reason: m.reason
          }))
        });
      }

      if (validMetricIds.length === 0) {
        if (skippedMetrics.length > 0) {
          addLog.info('[EvaluationSummary] All metrics were skipped, no tasks to execute', {
            evalId,
            totalRequested: metricIds.length,
            skippedCount: skippedMetrics.length
          });
          return; // 如果所有指标都被跳过，直接返回而不抛出错误
        }
        throw new Error(EvaluationErrEnum.summaryNoValidMetricsFound);
      }

      // 将任务添加到BullMQ队列中，让队列负责状态管理
      await addSummaryTaskToQueue(evalId, validMetricIds);

      addLog.info('[EvaluationSummary] Task successfully added to queue', {
        evalId,
        totalRequested: metricIds.length,
        validMetricsCount: validMetricIds.length,
        skippedCount: skippedMetrics.length
      });
    } catch (error) {
      addLog.error('[EvaluationSummary] Report generation task creation failed', {
        evalId,
        metricIds,
        error
      });
      throw error;
    }
  }

  /**
   * 生成单个指标的总结报告
   */
  static async generateSingleMetricSummary(
    evaluation: EvaluationSchemaType,
    metricId: string,
    evaluatorIndex: number,
    evaluator: any
  ): Promise<void> {
    const evalId = evaluation._id.toString();

    try {
      addLog.info('[EvaluationSummary] Starting single metric report generation', {
        evalId,
        metricId,
        metricName: evaluator.metric.name
      });

      // 1. Get and filter data
      const { filteredData, totalDataCount } = await this.getFilteredEvaluationData(
        evalId,
        metricId,
        evaluator.thresholdValue || 0,
        evaluator
      );

      if (filteredData.length === 0) {
        addLog.warn('[EvaluationSummary] No matching data found', {
          evalId,
          metricId
        });
        throw new Error('No matching evaluation data found, cannot generate summary report');
      }

      // 2. Token control and content preparation
      const tokenLimit = getEvaluationSummaryTokenLimit(evaluator.runtimeConfig?.llm);
      const { truncatedData, truncatedCount } = await this.truncateDataByTokens(
        filteredData,
        tokenLimit,
        evaluator.thresholdValue || 0,
        evaluator.runtimeConfig?.llm
      );

      // 3. Check balance
      try {
        await checkTeamAIPoints(evaluation.teamId);
        addLog.info('[EvaluationSummary] Balance check passed, starting LLM call', {
          evalId,
          metricId,
          metricName: evaluator.metric.name
        });
      } catch (balanceError) {
        addLog.error('[EvaluationSummary] Insufficient balance, cannot generate summary report', {
          evalId,
          metricId,
          metricName: evaluator.metric.name,
          error: balanceError
        });
        await this.updateSummaryResult(
          evalId,
          evaluatorIndex,
          SummaryStatusEnum.failed,
          '',
          'Insufficient balance'
        );
        return;
      }

      // 4. Call LLM to generate report
      const { summary, usage } = await this.callLLMForSummary(
        evaluator,
        truncatedData,
        totalDataCount,
        truncatedCount
      );

      // 5. Record costs and usage
      const llmModel = evaluator.runtimeConfig?.llm;
      await this.recordUsage(evaluation, evaluator, usage, llmModel);

      // 6. Update results
      await this.updateSummaryResult(evalId, evaluatorIndex, SummaryStatusEnum.completed, summary);

      // 7. Add audit log
      (async () => {
        addAuditLog({
          tmbId: evaluation.tmbId,
          teamId: evaluation.teamId.toString(),
          event: AuditEventEnum.GENERATE_EVALUATION_SUMMARY,
          params: {
            evalName: evaluation.name,
            metricName: evaluator.metric.name
          }
        });
      })();

      addLog.info('[EvaluationSummary] Single metric report generated successfully', {
        evalId,
        metricId,
        summaryLength: summary.length,
        tokensUsed: usage?.total_tokens || 0
      });
    } catch (error) {
      addLog.error('[EvaluationSummary] Single metric report generation failed', {
        evalId,
        metricId,
        error
      });

      // Update to failed status
      const errorMessage =
        error instanceof Error
          ? error.message
          : typeof error === 'string'
            ? error
            : 'Unknown error';
      await this.updateSummaryResult(
        evalId,
        evaluatorIndex,
        SummaryStatusEnum.failed,
        '',
        errorMessage
      );

      throw error;
    }
  }

  /**
   * 更新摘要结果
   */
  private static async updateSummaryResult(
    evalId: string,
    evaluatorIndex: number,
    status: SummaryStatusEnum,
    summary: string,
    errorReason?: string
  ): Promise<void> {
    const updateData: any = {
      [`summaryConfigs.${evaluatorIndex}.summaryStatus`]: status,
      [`summaryConfigs.${evaluatorIndex}.summary`]: summary
    };

    if (errorReason) {
      updateData[`summaryConfigs.${evaluatorIndex}.errorReason`] = errorReason;
    } else {
      updateData[`summaryConfigs.${evaluatorIndex}.errorReason`] = undefined;
    }

    await MongoEvaluation.updateOne({ _id: evalId }, { $set: updateData });
  }

  /**
   * 获取和筛选评估数据
   */
  private static async getFilteredEvaluationData(
    evalId: string,
    metricId: string,
    thresholdValue: number,
    evaluator: any
  ): Promise<{
    filteredData: any[];
    totalDataCount: number;
  }> {
    addLog.debug('[getFilteredEvaluationData] 入参:', {
      evalId,
      metricId,
      metricName: evaluator.metric.name,
      thresholdValue
    });
    try {
      // Get evaluation to check metric count
      const evaluation = await MongoEvaluation.findById(evalId).lean();
      if (!evaluation) {
        throw new Error('Evaluation not found');
      }

      // Query successfully completed evaluation items for specific metric, sorted by score (low priority)
      // Note: evaluator.metric._id is stored as string, not ObjectId
      const pipeline = [
        {
          $match: {
            evalId: new Types.ObjectId(evalId),
            evaluatorOutputs: { $exists: true, $nin: [null, []] }
          }
        },
        {
          $addFields: {
            // Find the matching metric result in evaluatorOutputs array
            matchingMetricResult: {
              $arrayElemAt: [
                {
                  $filter: {
                    input: '$evaluatorOutputs',
                    as: 'output',
                    cond: {
                      $and: [
                        { $eq: ['$$output.metricName', evaluator.metric.name] },
                        { $eq: ['$$output.status', MetricResultStatusEnum.Success] }
                      ]
                    }
                  }
                },
                0
              ]
            }
          }
        },
        {
          $match: {
            'matchingMetricResult.data.score': { $exists: true, $ne: null }
          }
        },
        {
          $addFields: {
            score: '$matchingMetricResult.data.score',
            isBelowThreshold: {
              $lt: ['$matchingMetricResult.data.score', thresholdValue]
            }
          }
        },
        {
          $sort: {
            isBelowThreshold: -1, // Below threshold items come first
            score: 1 // Score from low to high
          }
        },
        {
          $project: {
            dataItem: 1,
            targetOutput: 1,
            evaluatorOutputs: 1,
            matchingMetricResult: 1,
            score: 1,
            isBelowThreshold: 1
          }
        }
      ];

      const results = await MongoEvalItem.aggregate(pipeline as any);

      addLog.info('[EvaluationSummary] Data query completed', {
        evalId,
        metricId,
        totalCount: results.length,
        belowThresholdCount: results.filter((item) => item.isBelowThreshold).length
      });

      return {
        filteredData: results,
        totalDataCount: results.length
      };
    } catch (error) {
      addLog.error('[EvaluationSummary] Data query failed', {
        evalId,
        metricId,
        error
      });
      throw error;
    }
  }

  /**
   * 根据Token限制截断数据
   */
  private static async truncateDataByTokens(
    data: any[],
    tokenLimit: number,
    thresholdValue: number,
    llmModel?: string
  ): Promise<{
    truncatedData: any[];
    truncatedCount: number;
  }> {
    if (data.length === 0) {
      return { truncatedData: [], truncatedCount: 0 };
    }

    try {
      // Check if all scores are perfect (calculated only once)
      const isAllPerfect = this.isAllPerfectScores(data);

      // Select optimal data and example type
      const optimizedData = this.selectOptimalDataWithFlag(data, isAllPerfect);
      const selectedExample = isAllPerfect ? goodExample : badExample;

      // Calculate base template tokens (excluding specific data)
      const selectedTemplate = isAllPerfect ? strengthAnalysisTemplate : problemAnalysisTemplate;
      const baseTemplate = selectedTemplate
        .replace('{example}', selectedExample)
        .replace('{evaluation_result_for_single_metric}', '');

      let currentTokens = await countGptMessagesTokens([
        {
          role: ChatCompletionRequestMessageRoleEnum.User,
          content: baseTemplate
        }
      ]);

      const truncatedData: any[] = [];

      for (const item of optimizedData) {
        const itemContent = this.formatDataItemForPrompt(item);
        const itemTokens = await countGptMessagesTokens([
          {
            role: ChatCompletionRequestMessageRoleEnum.User,
            content: itemContent
          }
        ]);

        if (currentTokens + itemTokens > tokenLimit) {
          addLog.info('[EvaluationSummary] Token limit reached, stopping data addition', {
            currentTokens,
            itemTokens,
            tokenLimit,
            includedItems: truncatedData.length,
            totalItems: optimizedData.length
          });
          break;
        }

        truncatedData.push(item);
        currentTokens += itemTokens;
      }

      return {
        truncatedData,
        truncatedCount: truncatedData.length
      };
    } catch (error) {
      addLog.error('[EvaluationSummary] Token calculation failed', {
        error
      });
      // If token calculation fails, select data based on perfect score status
      const optimizedData = this.selectOptimalData(data);
      const fallbackCount = Math.ceil(optimizedData.length * 0.5);
      return {
        truncatedData: optimizedData.slice(0, fallbackCount),
        truncatedCount: fallbackCount
      };
    }
  }

  /**
   * 调用LLM生成总结
   */
  private static async callLLMForSummary(
    evaluator: any,
    data: any[],
    totalDataCount: number,
    includedDataCount: number
  ): Promise<{
    summary: string;
    usage: any;
  }> {
    try {
      const llmModel = evaluator.runtimeConfig?.llm;
      const modelData = llmModel ? getLLMModel(llmModel) : getEvaluationModel() || getLLMModel();

      const userPrompt = this.buildUserPrompt(data);

      const messages: ChatCompletionMessageParam[] = [
        {
          role: ChatCompletionRequestMessageRoleEnum.User,
          content: userPrompt
        }
      ];

      // Convert messages to SDK compatible format
      const requestMessages = await loadRequestMessages({
        messages,
        useVision: false
      });

      const { response, isStreamResponse } = await createChatCompletion({
        body: {
          model: llmModel,
          messages: requestMessages,
          temperature: 1e-7,
          max_tokens: 1000,
          stream: false
        },
        modelData
      });

      if (isStreamResponse) {
        throw new Error(EvaluationErrEnum.summaryStreamResponseNotSupported);
      }

      const summary = response.choices[0]?.message?.content || '生成总结失败';
      const usage = response.usage;

      return { summary, usage };
    } catch (error) {
      addLog.error('[EvaluationSummary] LLM call failed', {
        error
      });
      throw error;
    }
  }

  /**
   * 记录使用量和费用
   */
  private static async recordUsage(
    evaluation: EvaluationSchemaType,
    evaluator: any,
    usage: any,
    llmModel: string | undefined
  ): Promise<void> {
    if (!usage) return;

    try {
      const modelData = llmModel ? getLLMModel(llmModel) : getEvaluationModel() || getLLMModel();
      const inputTokens = usage?.prompt_tokens || 0;
      const outputTokens = usage?.completion_tokens || 0;
      const totalTokens = inputTokens + outputTokens;

      // Convert tokens to points using standard utility function
      const { totalPoints } = formatModelChars2Points({
        model: llmModel || modelData?.model || '',
        inputTokens,
        outputTokens,
        modelType: (modelData?.type as `${ModelTypeEnum}`) || ModelTypeEnum.llm
      });

      // Use unified evaluation usage recording
      await createMergedEvaluationUsage({
        evalId: evaluation._id.toString(),
        teamId: evaluation.teamId.toString(),
        tmbId: evaluation.tmbId.toString(),
        usageId: evaluation.usageId,
        totalPoints,
        type: 'summary',
        inputTokens,
        outputTokens
      });

      addLog.info('[EvaluationSummary] Usage recorded successfully', {
        evalId: evaluation._id.toString(),
        metricId: evaluator.metric._id.toString(),
        totalTokens: usage.total_tokens,
        totalPoints
      });
    } catch (error) {
      addLog.error('[EvaluationSummary] Usage recording failed', {
        evalId: evaluation._id.toString(),
        metricId: evaluator.metric._id.toString(),
        error
      });
      // Don't affect main flow
    }
  }

  /**
   * 构建用户提示词
   */
  private static buildUserPrompt(data: any[]): string {
    // Check if all scores are perfect to determine which template to use
    const isAllPerfect = this.isAllPerfectScores(data);

    // Select appropriate template and example based on data quality
    const selectedTemplate = isAllPerfect ? strengthAnalysisTemplate : problemAnalysisTemplate;
    const selectedExample = isAllPerfect ? goodExample : badExample;

    // Format evaluation data
    const evaluationResult = data.map((item) => this.formatDataItemForPrompt(item)).join('\n\n');

    // Render template variables
    return selectedTemplate
      .replace('{example}', selectedExample)
      .replace('{evaluation_result_for_single_metric}', evaluationResult);
  }

  /**
   * 格式化数据项用于提示词
   */
  private static formatDataItemForPrompt(item: any): string {
    // const score = item.matchingMetricResult?.data?.score || 0;
    // const userInput = item.dataItem?.userInput || '无';
    // const expectedOutput = item.dataItem?.expectedOutput || '无';
    // const actualOutput = item.targetOutput?.actualOutput || '无';
    const reason = item.matchingMetricResult?.data?.reason || '无评估原因';

    return `
评估原因: ${reason}`;
  }

  /**
   * 判断数据是否全部满分
   */
  private static isAllPerfectScores(data: any[]): boolean {
    if (data.length === 0) return false;
    return data.every((item) => (item.matchingMetricResult?.data?.score || 0) >= PERFECT_SCORE);
  }

  /**
   * 智能选择示例类型
   */
  private static selectExampleType(data: any[]): string {
    return this.isAllPerfectScores(data) ? goodExample : badExample;
  }

  /**
   * 优化数据选择策略 - 根据满分情况选择最合适的数据用于分析
   */
  private static selectOptimalData(data: any[]): any[] {
    if (data.length === 0) return [];

    // Check if all scores are perfect
    const isAllPerfect = this.isAllPerfectScores(data);
    return this.selectOptimalDataWithFlag(data, isAllPerfect);
  }

  /**
   * 优化数据选择策略 - 使用预计算的满分标志
   */
  private static selectOptimalDataWithFlag(data: any[], isAllPerfect: boolean): any[] {
    if (data.length === 0) return [];

    if (isAllPerfect) {
      // When all perfect scores, return original data (quantity will be controlled by token limit later)
      return data;
    } else {
      // When non-perfect scores exist, prioritize non-perfect score data
      const nonPerfectData = data.filter(
        (item) => (item.matchingMetricResult?.data?.score || 0) < PERFECT_SCORE
      );
      // Return non-perfect score data first (sorted by score from low to high)
      return [...nonPerfectData];
    }
  }

  /**
   * Trigger summary generation for completed evaluation task
   */
  static async triggerSummaryGeneration(evalId: string, completedCount: number): Promise<void> {
    try {
      // Check if all evaluation items have error status - skip summary generation if true
      const allEvalItemsStatus = await MongoEvalItem.find(
        { evalId: new Types.ObjectId(evalId) },
        { 'metadata.status': 1 }
      ).lean();

      const allItemsAbnormal =
        allEvalItemsStatus.length > 0 &&
        allEvalItemsStatus.every((item) => item.metadata?.status === EvaluationStatusEnum.error);

      if (allItemsAbnormal) {
        addLog.warn(
          '[Evaluation] All evaluation items have error status, skipping summary generation for all metrics',
          {
            evalId,
            totalItems: allEvalItemsStatus.length
          }
        );
        return; // Skip summary generation entirely
      }

      // Check if there are any successful evaluatorOutputs, regardless of overall item status
      const itemsWithSuccessfulOutputs = await MongoEvalItem.countDocuments({
        evalId: new Types.ObjectId(evalId),
        evaluatorOutputs: {
          $elemMatch: {
            status: MetricResultStatusEnum.Success,
            'data.score': { $exists: true, $ne: null }
          }
        }
      });

      if (completedCount === 0 && itemsWithSuccessfulOutputs === 0) {
        return; // No successful items, skip summary generation
      }
      // Scores are now calculated in real-time when getEvaluationSummary is called
      // No need to pre-calculate and save scores

      // Check which metrics need summary generation
      const currentEvaluation = await MongoEvaluation.findById(
        evalId,
        'evaluators summaryConfigs'
      ).lean();

      if (!currentEvaluation?.evaluators || currentEvaluation.evaluators.length === 0) {
        return; // No evaluators to process
      }

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
        await EvaluationSummaryService.generateSummaryReports(evalId, metricsNeedingSummary);
      } else {
        addLog.debug(
          `[Evaluation] All metrics already have summaries, skipping summary generation: ${evalId}`
        );
      }
    } catch (error) {
      // Log error without affecting main completion flow
      addLog.warn(`[Evaluation] Failed to trigger summary generation: ${evalId}`, {
        error
      });
    }
  }
}

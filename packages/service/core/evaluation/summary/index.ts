import type { EvaluationStatusEnum } from '@fastgpt/global/core/evaluation/constants';
import {
  CaculateMethodMap,
  EvaluationStatusEnum as EvalStatus,
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
import { getLLMModel } from '../../ai/model';
import { countGptMessagesTokens } from '../../../common/string/tiktoken';
import type { ChatCompletionMessageParam } from '@fastgpt/global/core/ai/type';
import { ChatCompletionRequestMessageRoleEnum } from '@fastgpt/global/core/ai/constants';
import { loadRequestMessages } from '../../chat/utils';
import { evalSummaryTemplate, goodExample, badExample } from '@fastgpt/global/core/ai/prompt/eval';
import { checkTeamAIPoints } from '../../../support/permission/teamLimit';
import { addAuditLog } from '../../../support/user/audit/util';
import { AuditEventEnum } from '@fastgpt/global/support/user/audit/constants';
import { concatUsage, evaluationUsageIndexMap } from '../../../support/wallet/usage/controller';
import { createMergedEvaluationUsage } from '../utils/usage';
import { EvaluationErrEnum } from '@fastgpt/global/common/error/code/evaluation';

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
      thresholdPassRate: number;
      threshold: number;
      customSummary: string;
    }>;
    aggregateScore: number;
  }> {
    const evaluation = await MongoEvaluation.findById(evalId).lean();
    if (!evaluation) throw new Error(EvaluationErrEnum.evalTaskNotFound);

    // Build return data using pre-calculated values from MongoDB summaryConfigs
    const data = evaluation.evaluators.map((evaluator, index) => {
      const metricId = evaluator.metric._id.toString();
      const summaryConfig = evaluation.summaryConfigs[index];
      const completedItemCount = summaryConfig.completedItemCount || 0;
      const overThresholdItemCount = summaryConfig.overThresholdItemCount || 0;
      const thresholdPassRate = summaryConfig.thresholdPassRate || 0;
      const threshold = evaluator.thresholdValue || 0;

      // Generate customSummary in format: "过阈值百分率(完成个数个)summary"
      const customSummary = `${thresholdPassRate}%(${overThresholdItemCount}个)${summaryConfig.summary || ''}`;

      return {
        metricId: metricId,
        metricName: evaluator.metric.name,
        metricScore: summaryConfig.score || 0, // Use pre-calculated score from MongoDB
        summary: summaryConfig.summary,
        summaryStatus: summaryConfig.summaryStatus,
        errorReason: summaryConfig.errorReason,
        completedItemCount: completedItemCount, // Use pre-calculated count from MongoDB
        overThresholdItemCount: overThresholdItemCount, // Use pre-calculated count from MongoDB
        thresholdPassRate: thresholdPassRate, // Use pre-calculated pass rate from MongoDB
        threshold: threshold, // Add threshold field
        customSummary: customSummary // Add customSummary field with specified format
      };
    });

    // Use stored aggregateScore if available, otherwise calculate from pre-calculated scores
    let aggregateScore = evaluation.aggregateScore;

    if (aggregateScore === undefined || aggregateScore === null) {
      let totalWeightedScore = 0;
      let totalWeight = 0;

      evaluation.summaryConfigs.forEach((summaryConfig) => {
        const score = summaryConfig.score || 0;
        const weight = summaryConfig.weight || 0;
        totalWeightedScore += score * weight;
        totalWeight += weight;
      });

      aggregateScore =
        totalWeight > 0 ? Math.round((totalWeightedScore / totalWeight) * 100) / 100 : 0;
    }

    return {
      data,
      aggregateScore
    };
  }

  // Calculate and save metric scores to MongoDB summaryConfigs
  static async calculateAndSaveMetricScores(evalId: string): Promise<void> {
    try {
      const evaluation = await MongoEvaluation.findById(evalId).lean();
      if (!evaluation) throw new Error(EvaluationErrEnum.evalTaskNotFound);

      // Use the existing calculateMetricScores method to get calculated scores
      const calculatedData = await this.calculateMetricScores(evaluation);

      // Update the calculated scores to database
      await this.updateSummaryConfigsScores(
        evalId,
        calculatedData.metricsData,
        calculatedData.aggregateScore
      );

      addLog.info('[Evaluation] Metric scores calculated and saved to MongoDB', {
        evalId,
        metricsCount: calculatedData.metricsData.length,
        aggregateScore: calculatedData.aggregateScore
      });
    } catch (error) {
      addLog.error('[Evaluation] Failed to calculate and save metric scores', {
        evalId,
        error
      });
      // Don't throw error to avoid affecting main flow
    }
  }

  // Real-time calculation of metricScore and aggregateScore (pure calculation, no database updates)
  private static async calculateMetricScores(evaluation: EvaluationSchemaType): Promise<{
    metricsData: Array<{
      metricId: string;
      metricName: string;
      metricScore: number;
      weight: number;
      thresholdValue: number;
      aboveThresholdCount: number;
      thresholdPassRate: number;
      totalCount: number;
    }>;
    aggregateScore: number;
  }> {
    try {
      const evalId = new Types.ObjectId(evaluation._id);

      // MongoDB aggregation pipeline - compatible with older MongoDB versions
      const pipeline = [
        // Step 1: Filter successful evaluation items that have evaluator outputs
        {
          $match: {
            evalId: evalId,
            status: EvalStatus.completed,
            evaluatorOutputs: { $exists: true, $nin: [null, []] }
          }
        },
        // Step 2: Unwind the evaluatorOutputs array to process each metric result separately
        {
          $unwind: '$evaluatorOutputs'
        },
        // Step 3: Filter only results with valid scores
        {
          $match: {
            'evaluatorOutputs.data.score': { $exists: true, $ne: null }
          }
        },
        // Step 4: Group by metric name and calculate statistics
        {
          $group: {
            _id: '$evaluatorOutputs.metricName',
            scores: { $push: '$evaluatorOutputs.data.score' },
            avgScore: { $avg: '$evaluatorOutputs.data.score' },
            count: { $sum: 1 },
            metricName: { $first: '$evaluatorOutputs.metricName' }
          }
        }
      ];

      const metricsStats = await MongoEvalItem.aggregate(pipeline as any);
      addLog.info(`mongo实时计算结果为${JSON.stringify(metricsStats)}`);

      // Calculate median for each statistic (since different evaluators may have different calculation methods)
      const processedStats = metricsStats.map((stats) => {
        let medianScore = 0;

        if (stats.scores && stats.scores.length > 0) {
          const sortedScores = [...stats.scores].sort((a, b) => a - b);
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
        thresholdPassRate: number;
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
          // Select score based on current evaluator's calculation method
          const metricScore =
            summaryConfig.calculateType === CalculateMethodEnum.median
              ? Math.round(stats.medianScore * 100) / 100
              : Math.round(stats.avgScore * 100) / 100;

          // Calculate threshold statistics
          const aboveThresholdCount = stats.scores.filter(
            (score: number) => score >= (evaluator.thresholdValue || 0)
          ).length;

          const thresholdPassRate =
            stats.count > 0 ? Math.round((aboveThresholdCount / stats.count) * 10000) / 100 : 0;

          const weight = summaryConfig.weight;

          metricsData.push({
            metricId: metricId,
            metricName: evaluator.metric.name,
            metricScore,
            weight,
            thresholdValue: evaluator.thresholdValue || 0,
            aboveThresholdCount,
            thresholdPassRate,
            totalCount: stats.count
          });

          // Accumulate weighted scores
          totalWeightedScore += metricScore * weight;
          totalWeight += weight;
        } else {
          // Metrics with no data
          metricsData.push({
            metricId: metricId,
            metricName: evaluator.metric.name,
            metricScore: 0,
            weight: summaryConfig.weight,
            thresholdValue: evaluator.thresholdValue || 0,
            aboveThresholdCount: 0,
            thresholdPassRate: 0,
            totalCount: 0
          });
        }
      });

      // Calculate aggregate score
      const aggregateScore =
        totalWeight > 0 ? Math.round((totalWeightedScore / totalWeight) * 100) / 100 : 0;

      addLog.info('[Evaluation] Metric calculation completed', {
        evalId: evaluation._id.toString(),
        metricsCount: metricsData.length,
        aggregateScore
      });

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
          thresholdPassRate: 0,
          totalCount: 0
        };
      });

      return {
        metricsData: defaultData,
        aggregateScore: 0
      };
    }
  }

  // Update summaryConfigs scores and aggregateScore together based on calculated metric scores
  private static async updateSummaryConfigsScores(
    evalId: string,
    metricsData: Array<{
      metricId: string;
      metricName: string;
      metricScore: number;
      weight: number;
      thresholdValue: number;
      aboveThresholdCount: number;
      thresholdPassRate: number;
      totalCount: number;
    }>,
    aggregateScore: number
  ): Promise<void> {
    try {
      // Build update fields for each summaryConfig score
      const updateFields: Record<string, any> = {};

      const evaluation = await MongoEvaluation.findById(evalId).lean();
      if (!evaluation) return;

      // Build update fields using pre-calculated data
      evaluation.summaryConfigs.forEach((summaryConfig, index) => {
        const metricData = metricsData.find((m) => m.metricId === summaryConfig.metricId);
        if (metricData) {
          updateFields[`summaryConfigs.${index}.score`] = metricData.metricScore;
          updateFields[`summaryConfigs.${index}.completedItemCount`] = metricData.totalCount;
          updateFields[`summaryConfigs.${index}.overThresholdItemCount`] =
            metricData.aboveThresholdCount;
          updateFields[`summaryConfigs.${index}.thresholdPassRate`] = metricData.thresholdPassRate;
        }
      });

      // Use pre-calculated aggregateScore
      updateFields['aggregateScore'] = aggregateScore;

      await MongoEvaluation.updateOne({ _id: evalId }, { $set: updateFields });

      addLog.info('[Evaluation] Updated summaryConfigs scores, counts and aggregateScore', {
        evalId,
        updatedFieldsCount: Object.keys(updateFields).length,
        aggregateScore,
        scores: metricsData.map((m) => ({
          metricId: m.metricId,
          score: m.metricScore,
          completedItemCount: m.totalCount,
          overThresholdItemCount: m.aboveThresholdCount,
          thresholdPassRate: m.thresholdPassRate
        }))
      });
    } catch (error) {
      addLog.error(
        '[Evaluation] Failed to update summaryConfigs scores, counts and aggregateScore',
        {
          evalId,
          error
        }
      );
      // Don't throw error to avoid affecting main calculation flow
    }
  }

  // Update evaluation summary configuration (threshold, weight, calculation method)
  static async updateEvaluationSummaryConfig(
    evalId: string,
    metricsConfig: Array<{
      metricId: string;
      thresholdValue: number;
      weight?: number;
      calculateType?: CalculateMethodEnum;
    }>
  ): Promise<void> {
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

    // Update configuration and recalculate
    await this.updateConfigurationAndRecalculate(evalId, evaluation, metricsConfig);
  }

  // Simplified method to update configuration and recalculate everything
  private static async updateConfigurationAndRecalculate(
    evalId: string,
    evaluation: EvaluationSchemaType,
    metricsConfig: Array<{
      metricId: string;
      thresholdValue: number;
      weight?: number;
      calculateType?: CalculateMethodEnum;
    }>
  ): Promise<void> {
    const configMap = new Map(metricsConfig.map((m) => [m.metricId, m]));

    // Update database configuration
    await this.updateDatabaseConfig(evalId, evaluation, metricsConfig, configMap);

    // Update eval_items thresholds
    await this.updateEvalItemThresholds(evalId, metricsConfig);

    // Get updated evaluation and recalculate everything
    const updatedEvaluation = await MongoEvaluation.findById(evalId).lean();
    if (updatedEvaluation) {
      addLog.info('[Evaluation] Configuration updated, recalculating all metrics', { evalId });
      const calculatedData = await this.calculateMetricScores(updatedEvaluation);
      await this.updateSummaryConfigsScores(
        evalId,
        calculatedData.metricsData,
        calculatedData.aggregateScore
      );
    }
  }

  // Update database configuration (evaluators and summaryConfigs)
  private static async updateDatabaseConfig(
    evalId: string,
    evaluation: EvaluationSchemaType,
    metricsConfig: Array<{
      metricId: string;
      thresholdValue: number;
      weight?: number;
      calculateType?: CalculateMethodEnum;
    }>,
    configMap: Map<string, any>
  ): Promise<void> {
    // Update evaluators
    const updatedEvaluators = evaluation.evaluators.map((evaluator: any) => {
      const config = configMap.get(evaluator.metric._id.toString());
      return config ? { ...evaluator, thresholdValue: config.thresholdValue } : evaluator;
    });

    // Update summaryConfigs
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
      { $set: { evaluators: updatedEvaluators, summaryConfigs: updatedSummaryConfigs } }
    );
  }

  // Update thresholds in eval_items
  private static async updateEvalItemThresholds(
    evalId: string,
    metricsConfig: Array<{ metricId: string; thresholdValue: number }>
  ): Promise<void> {
    for (const config of metricsConfig) {
      await MongoEvalItem.updateMany(
        { evalId, 'evaluator.metric._id': config.metricId },
        { $set: { 'evaluator.thresholdValue': config.thresholdValue } }
      );
    }
  }

  // Get evaluation summary configuration details
  static async getEvaluationSummaryConfig(evalId: string): Promise<{
    calculateType: CalculateMethodEnum;
    calculateTypeName: string;
    metricsConfig: Array<{
      metricId: string;
      metricName: string;
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
   * 生成多个指标的总结报告 - 异步触发，立即返回
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

      addLog.info(
        '[EvaluationSummary] Updated metric scores and counts before generating summaries',
        {
          evalId
        }
      );

      // Validate metric ownership and find corresponding evaluator index
      const evaluatorTasks: Array<{
        metricId: string;
        evaluatorIndex: number;
        evaluator: any;
      }> = [];

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

        // 检查该指标是否已经在生成中
        const summaryConfig = evaluation.summaryConfigs[evaluatorIndex];
        if (summaryConfig.summaryStatus === SummaryStatusEnum.generating) {
          const metricName = evaluation.evaluators[evaluatorIndex].metric.name;
          addLog.info('[EvaluationSummary] Metric is already generating, skipping', {
            evalId,
            metricId,
            metricName,
            currentStatus: summaryConfig.summaryStatus
          });
          skippedMetrics.push({
            metricId,
            metricName,
            reason: 'Already generating'
          });
          return;
        }

        evaluatorTasks.push({
          metricId,
          evaluatorIndex,
          evaluator: evaluation.evaluators[evaluatorIndex]
        });
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

      if (evaluatorTasks.length === 0) {
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

      // Immediately update all related evaluator status to generating (batch update)
      const updateFields: Record<string, any> = {};
      evaluatorTasks.forEach((task) => {
        updateFields[`summaryConfigs.${task.evaluatorIndex}.summaryStatus`] =
          SummaryStatusEnum.generating;
      });

      await MongoEvaluation.updateOne({ _id: evalId }, { $set: updateFields });

      addLog.info('[EvaluationSummary] Status updated to generating, starting async processing', {
        evalId,
        totalRequested: metricIds.length,
        validMetricsCount: evaluatorTasks.length,
        skippedCount: skippedMetrics.length,
        validMetrics: evaluatorTasks.map((task) => ({
          metricId: task.metricId,
          metricName: task.evaluator.metric.name
        }))
      });

      // Execute report generation asynchronously, don't wait for results
      setImmediate(() => {
        this.executeAsyncSummaryGeneration(evaluation, evaluatorTasks);
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
   * 异步执行报告生成 - 后台处理
   */
  private static async executeAsyncSummaryGeneration(
    evaluation: EvaluationSchemaType,
    evaluatorTasks: Array<{
      metricId: string;
      evaluatorIndex: number;
      evaluator: any;
    }>
  ): Promise<void> {
    const evalId = evaluation._id.toString();

    addLog.info('[EvaluationSummary] Starting async concurrent report generation', {
      evalId,
      totalTasks: evaluatorTasks.length
    });

    try {
      // Generate reports concurrently
      await Promise.all(
        evaluatorTasks.map((task) =>
          this.generateSingleMetricSummary(
            evaluation,
            task.metricId,
            task.evaluatorIndex,
            task.evaluator
          ).catch((error) => {
            addLog.error('[EvaluationSummary] Single metric report generation failed', {
              evalId,
              metricId: task.metricId,
              error
            });
            // Don't block other metrics generation
          })
        )
      );

      addLog.info('[EvaluationSummary] Async concurrent report generation completed', {
        evalId,
        completedCount: evaluatorTasks.length
      });
    } catch (error) {
      addLog.error('[EvaluationSummary] Error occurred during async report generation', {
        evalId,
        error
      });
    }
  }

  /**
   * 生成单个指标的总结报告
   */
  private static async generateSingleMetricSummary(
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
        evaluator.thresholdValue || 0
      );

      if (filteredData.length === 0) {
        addLog.warn('[EvaluationSummary] No matching data found', {
          evalId,
          metricId
        });
        await this.updateSummaryResult(
          evalId,
          evaluatorIndex,
          SummaryStatusEnum.failed,
          'No matching evaluation data found, cannot generate summary report'
        );
        return;
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
   * 更新摘要状态
   */
  private static async updateSummaryStatus(
    evalId: string,
    evaluatorIndex: number,
    status: SummaryStatusEnum
  ): Promise<void> {
    await MongoEvaluation.updateOne(
      { _id: evalId },
      {
        $set: {
          [`summaryConfigs.${evaluatorIndex}.summaryStatus`]: status
        }
      }
    );
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
    thresholdValue: number
  ): Promise<{
    filteredData: any[];
    totalDataCount: number;
  }> {
    addLog.debug('[getFilteredEvaluationData] 入参:', {
      evalId,
      metricId,
      thresholdValue
    });

    try {
      // Process evalId, ensure correct ObjectId format
      const evalObjectId =
        typeof evalId === 'string' && evalId.length === 24 ? new Types.ObjectId(evalId) : evalId;

      // Query successfully completed evaluation items for specific metric, sorted by score (low priority)
      // Note: evaluator.metric._id is stored as string, not ObjectId
      const pipeline = [
        {
          $match: {
            evalId: evalObjectId,
            status: EvalStatus.completed,
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
                    cond: { $eq: ['$$output.metricName', metricId] }
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
      const baseTemplate = evalSummaryTemplate
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
      const modelData = llmModel ? getLLMModel(llmModel) : getLLMModel();

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
          temperature: 0.3,
          max_tokens: 1000,
          stream: false
        },
        modelData
      });
      addLog.info('[EvaluationSummary] LLM request messages', {
        messages: JSON.stringify(messages, null, 2)
      });
      addLog.info('[EvaluationSummary] LLM response', {
        response: JSON.stringify(response, null, 2)
      });

      if (isStreamResponse) {
        throw new Error(EvaluationErrEnum.summaryStreamResponseNotSupported);
      }

      const summary = response.choices[0]?.message?.content || '生成总结失败';
      const usage = response.usage;

      addLog.info('[EvaluationSummary] Extracted summary', {
        summary: summary,
        summaryLength: summary.length
      });
      addLog.info('[EvaluationSummary] Extracted usage', {
        usage: usage
      });

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
      const modelData = llmModel ? getLLMModel(llmModel) : getLLMModel();
      const inputTokens = usage?.prompt_tokens || 0;
      const outputTokens = usage?.completion_tokens || 0;
      const totalTokens = inputTokens + outputTokens;

      // Convert tokens to points
      const totalPoints = modelData
        ? Math.ceil(
            (inputTokens * (modelData.inputPrice || 0) +
              outputTokens * (modelData.outputPrice || 0)) /
              1000
          )
        : 0;

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
    // Select appropriate example type
    const selectedExample = this.selectExampleType(data);

    // Format evaluation data
    const evaluationResult = data.map((item) => this.formatDataItemForPrompt(item)).join('\n\n');

    // Render template variables
    return evalSummaryTemplate
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
**评估原因**: ${reason}`;
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
}

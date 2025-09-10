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

export class EvaluationSummaryService {
  // Get evaluation summary report
  static async getEvaluationSummary(evalId: string): Promise<{
    data: Array<{
      metricsId: string;
      metricsName: string;
      metricsScore: number;
      summary: string;
      summaryStatus: string;
      errorReason?: string;
      completedItemCount: number;
      overThresholdItemCount: number;
    }>;
    aggregateScore: number;
  }> {
    // Query evaluation task
    const evaluation = await MongoEvaluation.findById(evalId).lean();

    if (!evaluation) {
      throw new Error('Evaluation task not found');
    }

    // Real-time calculation of metricsScore and aggregateScore
    const calculatedData = await this.calculateMetricsScores(evaluation);

    // Build return data, merge calculation results and existing configurations
    const data = (evaluation.evaluators || []).map((evaluator) => {
      const metricId = evaluator.metric._id.toString();
      const calculatedMetric = calculatedData.metricsData.find(
        (item) => item.metricsId === metricId
      );

      return {
        metricsId: metricId,
        metricsName: evaluator.metric.name,
        metricsScore: calculatedMetric?.metricsScore || 0,
        summary: evaluator.summary || '',
        summaryStatus: evaluator.summaryStatus?.toString() || '0',
        errorReason: evaluator.errorReason,
        completedItemCount: calculatedMetric?.totalCount || 0,
        overThresholdItemCount: calculatedMetric?.aboveThresholdCount || 0
      };
    });

    return {
      data,
      aggregateScore: calculatedData.aggregateScore
    };
  }

  // Real-time calculation of metricsScore and aggregateScore
  private static async calculateMetricsScores(evaluation: EvaluationSchemaType): Promise<{
    metricsData: Array<{
      metricsId: string;
      metricsName: string;
      metricsScore: number;
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
        // Step 1: Filter successful evaluation items
        {
          $match: {
            evalId: evalId,
            status: EvalStatus.completed,
            'evaluator_output.data.score': { $exists: true, $ne: null }
          }
        },
        // Step 2: Group by metric ID and calculate statistics
        {
          $group: {
            _id: '$evaluator_output.metricId',
            scores: { $push: '$evaluator_output.data.score' },
            avgScore: { $avg: '$evaluator_output.data.score' },
            count: { $sum: 1 },
            metricName: { $first: '$evaluator_output.metricName' }
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
        metricsId: string;
        metricsName: string;
        metricsScore: number;
        weight: number;
        thresholdValue: number;
        aboveThresholdCount: number;
        thresholdPassRate: number;
        totalCount: number;
      }> = [];

      let totalWeightedScore = 0;
      let totalWeight = 0;

      (evaluation.evaluators || []).forEach((evaluator) => {
        const metricId = evaluator.metric._id.toString();
        const stats = processedStats.find((s) => s._id === metricId);

        if (stats) {
          // Select score based on current evaluator's calculation method
          const metricsScore =
            evaluator.calculateType === CalculateMethodEnum.median
              ? Math.round(stats.medianScore * 100) / 100
              : Math.round(stats.avgScore * 100) / 100;

          // Calculate threshold statistics
          const aboveThresholdCount = stats.scores.filter(
            (score: number) => score >= (evaluator.thresholdValue || 0)
          ).length;

          const thresholdPassRate =
            stats.count > 0 ? Math.round((aboveThresholdCount / stats.count) * 10000) / 100 : 0;

          const weight = evaluator.weight || 0;

          metricsData.push({
            metricsId: metricId,
            metricsName: evaluator.metric.name,
            metricsScore,
            weight,
            thresholdValue: evaluator.thresholdValue || 0,
            aboveThresholdCount,
            thresholdPassRate,
            totalCount: stats.count
          });

          // Accumulate weighted scores
          totalWeightedScore += metricsScore * weight;
          totalWeight += weight;
        } else {
          // Metrics with no data
          metricsData.push({
            metricsId: metricId,
            metricsName: evaluator.metric.name,
            metricsScore: 0,
            weight: evaluator.weight || 0,
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

      addLog.info('[Evaluation] Real-time calculation completed', {
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
      const defaultData = (evaluation.evaluators || []).map((evaluator) => ({
        metricsId: evaluator.metric._id.toString(),
        metricsName: evaluator.metric.name,
        metricsScore: 0,
        weight: evaluator.weight || 0,
        thresholdValue: evaluator.thresholdValue || 0,
        aboveThresholdCount: 0,
        thresholdPassRate: 0,
        totalCount: 0
      }));

      return {
        metricsData: defaultData,
        aggregateScore: 0
      };
    }
  }

  // Update evaluation summary configuration (threshold, weight, calculation method)
  static async updateEvaluationSummaryConfig(
    evalId: string,
    metricsConfig: Array<{
      metricsId: string;
      thresholdValue: number;
      weight?: number;
      calculateType?: CalculateMethodEnum;
    }>
  ): Promise<void> {
    const evaluation = await MongoEvaluation.findById(evalId).lean();
    if (!evaluation) throw new Error('Evaluation not found');

    const evalMetricIdSet = new Set(
      (evaluation.evaluators || []).map((evaluator: any) => evaluator.metric._id.toString())
    );
    for (const m of metricsConfig) {
      if (!evalMetricIdSet.has(m.metricsId)) {
        throw new Error(`metricsId ${m.metricsId} 不属于该评估任务`);
      }
    }

    // Update configuration based on existing evaluators (threshold, weight, calculation method)
    const configMap = new Map(
      metricsConfig.map((m) => [
        m.metricsId,
        { thresholdValue: m.thresholdValue, weight: m.weight, calculateType: m.calculateType }
      ])
    );

    // Update corresponding configuration in evaluators array
    const updatedEvaluators = (evaluation.evaluators || []).map((evaluator: any) => {
      const metricId = evaluator.metric._id.toString();
      const config = configMap.get(metricId);
      if (config) {
        return {
          ...evaluator,
          thresholdValue: config.thresholdValue,
          ...(config.weight !== undefined ? { weight: config.weight } : {}),
          ...(config.calculateType !== undefined ? { calculateType: config.calculateType } : {})
        };
      }
      return evaluator;
    });

    await MongoEvaluation.updateOne(
      { _id: evalId },
      {
        $set: {
          evaluators: updatedEvaluators
        }
      }
    );
  }

  // Get evaluation summary configuration details
  static async getEvaluationSummaryConfig(evalId: string): Promise<{
    calculateType: CalculateMethodEnum;
    calculateTypeName: string;
    metricsConfig: Array<{
      metricsId: string;
      metricsName: string;
      thresholdValue: number;
      weight: number;
    }>;
  }> {
    // Query evaluation task
    const evaluation = await MongoEvaluation.findById(evalId).lean();

    if (!evaluation) {
      throw new Error('评估任务不存在或无权限访问');
    }

    // Get calculation type from first evaluator (since all metrics use the same type)
    const firstEvaluator = evaluation.evaluators?.[0];
    const calculateType = firstEvaluator?.calculateType || CalculateMethodEnum.mean;
    const calculateTypeName =
      CaculateMethodMap[calculateType as CalculateMethodEnum]?.name || 'Unknown';

    // Build return data, remove calculation type from individual metrics
    const metricsConfig = (evaluation.evaluators || []).map((evaluator) => {
      return {
        metricsId: evaluator.metric._id.toString(),
        metricsName: evaluator.metric.name,
        thresholdValue: evaluator.thresholdValue || 0,
        weight: evaluator.weight || 0
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
  static async generateSummaryReports(evalId: string, metricsIds: string[]): Promise<void> {
    try {
      const evaluation = await MongoEvaluation.findById(evalId).lean();

      if (!evaluation) {
        throw new Error('评估任务不存在或无权限访问');
      }

      addLog.info(
        '[EvaluationSummary] Starting validation and preparation of report generation tasks',
        {
          evalId,
          metricsIds,
          totalMetrics: metricsIds.length
        }
      );

      // Validate metric ownership and find corresponding evaluator index
      const evaluatorTasks: Array<{
        metricId: string;
        evaluatorIndex: number;
        evaluator: any;
      }> = [];

      metricsIds.forEach((metricId) => {
        const evaluatorIndex = evaluation.evaluators.findIndex(
          (evaluator: any) => evaluator.metric._id.toString() === metricId
        );

        if (evaluatorIndex === -1) {
          addLog.warn('[EvaluationSummary] Metric does not belong to this evaluation task', {
            evalId,
            metricId
          });
          return;
        }

        evaluatorTasks.push({
          metricId,
          evaluatorIndex,
          evaluator: evaluation.evaluators[evaluatorIndex]
        });
      });

      if (evaluatorTasks.length === 0) {
        throw new Error('没有找到有效的指标');
      }

      // Immediately update all related evaluator status to generating
      const updatePromises = evaluatorTasks.map((task) =>
        this.updateSummaryStatus(evalId, task.evaluatorIndex, SummaryStatusEnum.generating)
      );
      await Promise.all(updatePromises);

      addLog.info('[EvaluationSummary] Status updated to generating, starting async processing', {
        evalId,
        validMetricsCount: evaluatorTasks.length
      });

      // Execute report generation asynchronously, don't wait for results
      setImmediate(() => {
        this.executeAsyncSummaryGeneration(evaluation, evaluatorTasks);
      });
    } catch (error) {
      addLog.error('[EvaluationSummary] Report generation task creation failed', {
        evalId,
        metricsIds,
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
          SummaryStatusEnum.completed,
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
          [`evaluators.${evaluatorIndex}.summaryStatus`]: status
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
      [`evaluators.${evaluatorIndex}.summaryStatus`]: status,
      [`evaluators.${evaluatorIndex}.summary`]: summary
    };

    if (errorReason) {
      updateData[`evaluators.${evaluatorIndex}.errorReason`] = errorReason;
    } else {
      updateData[`evaluators.${evaluatorIndex}.errorReason`] = undefined;
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
    try {
      // Process evalId, ensure correct ObjectId format
      const evalObjectId =
        typeof evalId === 'string' && evalId.length === 24 ? new Types.ObjectId(evalId) : evalId;

      // Query successfully completed evaluation items, sorted by score (low priority)
      const pipeline = [
        {
          $match: {
            evalId: evalObjectId,
            'evaluator_output.metricId': metricId,
            status: EvalStatus.completed,
            'evaluator_output.data.score': { $exists: true, $ne: null }
          }
        },
        {
          $addFields: {
            score: '$evaluator_output.data.score',
            isBelowThreshold: {
              $lt: ['$evaluator_output.data.score', thresholdValue]
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
            target_output: 1,
            evaluator_output: 1,
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
        throw new Error('不支持流式响应');
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
    const score = item.evaluator_output?.data?.score || 0;
    const userInput = item.dataItem?.userInput || '无';
    const expectedOutput = item.dataItem?.expectedOutput || '无';
    const actualOutput = item.target_output?.actualOutput || '无';
    const details = item.evaluator_output?.details || {};

    return `**得分**: ${score}
**用户输入**: ${userInput}
**期望输出**: ${expectedOutput}  
**实际输出**: ${actualOutput}
**详细信息**: ${JSON.stringify(details, null, 2)}`;
  }

  /**
   * 判断数据是否全部满分
   */
  private static isAllPerfectScores(data: any[]): boolean {
    if (data.length === 0) return false;
    return data.every((item) => (item.evaluator_output?.data?.score || 0) >= PERFECT_SCORE);
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
        (item) => (item.evaluator_output?.data?.score || 0) < PERFECT_SCORE
      );
      // Return non-perfect score data first (sorted by score from low to high)
      return [...nonPerfectData];
    }
  }
}

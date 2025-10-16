import {
  CaculateMethodMap,
  EvaluationStatusEnum,
  CalculateMethodEnum
} from '@fastgpt/global/core/evaluation/constants';
import { MongoEvaluation, MongoEvalItem } from '../task/schema';
import type { EvaluationSchemaType } from '@fastgpt/global/core/evaluation/type';
import { Types } from '../../../common/mongo';
import { addLog } from '../../../common/system/log';
import {
  SummaryStatusEnum,
  PERFECT_SCORE,
  MAX_TOKEN_FOR_EVALUATION_SUMMARY,
  TEMPERATURE_FOR_EVALUATION_SUMMARY
} from '@fastgpt/global/core/evaluation/constants';
import { getEvaluationSummaryTokenLimit, getEvaluationSummaryModel } from '../utils/tokenLimiter';
import { createChatCompletion } from '../../ai/config';
import { countGptMessagesTokens } from '../../../common/string/tiktoken';
import type { ChatCompletionMessageParam } from '@fastgpt/global/core/ai/type';
import { ChatCompletionRequestMessageRoleEnum } from '@fastgpt/global/core/ai/constants';
import { loadRequestMessages } from '../../chat/utils';
import {
  problemAnalysisTemplateZhCN,
  strengthAnalysisTemplateZhCN,
  goodExampleZhCN,
  badExampleZhCN,
  problemAnalysisTemplateZhTW,
  strengthAnalysisTemplateZhTW,
  goodExampleZhTW,
  badExampleZhTW,
  problemAnalysisTemplateEn,
  strengthAnalysisTemplateEn,
  goodExampleEn,
  badExampleEn
} from '@fastgpt/global/core/ai/prompt/eval';
import { LanguageType, LanguageDisplayNameMap } from './util/languageUtil';
import { checkTeamAIPoints } from '../../../support/permission/teamLimit';
import { addAuditLog } from '../../../support/user/audit/util';
import { AuditEventEnum } from '@fastgpt/global/support/user/audit/constants';
import { createMergedEvaluationUsage } from '../utils/usage';
import { formatModelChars2Points } from '../../../support/wallet/usage/utils';
import { ModelTypeEnum } from '@fastgpt/global/core/ai/model';
import { EvaluationErrEnum } from '@fastgpt/global/common/error/code/evaluation';
import { MetricResultStatusEnum } from '@fastgpt/global/core/evaluation/metric/constants';
import { addSummaryTaskToQueue } from './queue';
import { mongoSessionRun } from '../../../common/mongo/sessionRun';
import type { ClientSession } from '../../../common/mongo';

export class EvaluationSummaryService {
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

    const calculatedData = await this.calculateMetricScores(evaluation);

    const data = evaluation.evaluators.map((evaluator, index) => {
      const metricId = evaluator.metric._id.toString();
      const summaryConfig = evaluation.summaryData.summaryConfigs[index];

      const metricData = calculatedData.metricsData.find((m) => m.metricId === metricId);
      const completedItemCount = metricData?.totalCount || 0;
      const overThresholdItemCount = metricData?.aboveThresholdCount || 0;
      const underThresholdItemCount = metricData?.belowThresholdCount || 0;
      const metricScore = metricData?.metricScore || 0;

      const threshold = evaluator.thresholdValue || 0;
      const underThresholdRate =
        completedItemCount > 0
          ? Math.round((underThresholdItemCount / completedItemCount) * 100)
          : 0;
      const customSummary = `${underThresholdRate}%(${underThresholdItemCount})${summaryConfig.summary || ''}`;

      return {
        metricId: metricId,
        metricName: evaluator.metric.name,
        metricScore: metricScore,
        summary: summaryConfig.summary,
        summaryStatus: summaryConfig.summaryStatus,
        errorReason: summaryConfig.errorReason,
        completedItemCount: completedItemCount,
        overThresholdItemCount: overThresholdItemCount,
        underThresholdRate: underThresholdRate,
        threshold: threshold,
        weight: summaryConfig.weight || 0,
        customSummary: customSummary
      };
    });

    return {
      data,
      aggregateScore: calculatedData.aggregateScore
    };
  }

  // Pure calculation of metric scores and aggregate score without database updates
  static async calculateMetricScores(evaluation: EvaluationSchemaType): Promise<{
    metricsData: Array<{
      metricId: string;
      metricName: string;
      metricScore: number;
      weight: number;
      thresholdValue: number;
      aboveThresholdCount: number;
      belowThresholdCount: number;
      totalCount: number;
    }>;
    aggregateScore: number;
  }> {
    try {
      const evalId = new Types.ObjectId(evaluation._id);

      if (!evaluation.evaluators || !Array.isArray(evaluation.evaluators)) {
        addLog.warn('[calculateMetricScores] Evaluation has no evaluators', {
          evalId: evaluation._id
        });
        return {
          metricsData: [],
          aggregateScore: 0
        };
      }

      if (
        !evaluation.summaryData ||
        !evaluation.summaryData.summaryConfigs ||
        !Array.isArray(evaluation.summaryData.summaryConfigs)
      ) {
        addLog.warn('[calculateMetricScores] Evaluation has no summary or summaryConfigs', {
          evalId: evaluation._id
        });
        return {
          metricsData: [],
          aggregateScore: 0
        };
      }

      // Calculate successful scores and total completed count per metric
      const pipeline = [
        {
          $match: {
            evalId: evalId,
            evaluatorOutputs: { $exists: true, $nin: [null, []] }
          }
        },
        {
          $addFields: {
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
        {
          $unwind: '$metricResults'
        },
        {
          $group: {
            _id: '$metricResults.metricName',
            successfulScores: {
              $push: {
                $cond: ['$metricResults.hasValidScore', '$metricResults.score', '$$REMOVE']
              }
            },
            metricName: { $first: '$metricResults.metricName' }
          }
        },
        {
          $addFields: {
            avgScore: {
              $cond: [
                { $gt: [{ $size: '$successfulScores' }, 0] },
                { $avg: '$successfulScores' },
                0
              ]
            },
            successCount: { $size: '$successfulScores' }
          }
        }
      ];

      const metricsStats = await MongoEvalItem.aggregate(pipeline as any);

      const processedStats = metricsStats.map((stats) => {
        let medianScore = 0;

        if (stats.successfulScores && stats.successfulScores.length > 0) {
          const sortedScores = [...stats.successfulScores].sort((a, b) => a - b);
          const length = sortedScores.length;

          if (length % 2 === 0) {
            const mid1 = sortedScores[length / 2 - 1];
            const mid2 = sortedScores[length / 2];
            medianScore = (mid1 + mid2) / 2;
          } else {
            medianScore = sortedScores[Math.floor(length / 2)];
          }
        }

        return {
          ...stats,
          medianScore
        };
      });

      const metricsData: Array<{
        metricId: string;
        metricName: string;
        metricScore: number;
        weight: number;
        thresholdValue: number;
        aboveThresholdCount: number;
        belowThresholdCount: number;
        totalCount: number;
      }> = [];

      let totalWeightedScore = 0;
      let totalWeight = 0;

      evaluation.evaluators.forEach((evaluator, index) => {
        const metricId = evaluator.metric._id.toString();
        const metricName = evaluator.metric.name;
        const stats = processedStats.find((s) => s._id === metricName);
        const summaryConfig = evaluation.summaryData.summaryConfigs[index];

        if (stats) {
          let rawScore =
            evaluation.summaryData.calculateType === CalculateMethodEnum.median
              ? stats.medianScore
              : stats.avgScore;

          if (isNaN(rawScore) || rawScore === null || rawScore === undefined) {
            rawScore = 0;
          }

          const metricScore = Math.round(rawScore * 100) / 100;

          const thresholdValue = evaluator.thresholdValue || 0;
          const aboveThresholdCount = stats.successfulScores.filter(
            (score: number) => score >= thresholdValue
          ).length;

          // Calculate belowThresholdCount from successful scores that are below threshold
          const belowThresholdCount = stats.successfulScores.filter(
            (score: number) => score < thresholdValue
          ).length;

          const weight = summaryConfig.weight;

          metricsData.push({
            metricId: metricId,
            metricName: evaluator.metric.name,
            metricScore,
            weight,
            thresholdValue: thresholdValue,
            aboveThresholdCount,
            belowThresholdCount,
            totalCount: stats.successCount
          });

          totalWeightedScore += metricScore * weight;
          totalWeight += weight;
        } else {
          const weight = summaryConfig.weight;

          metricsData.push({
            metricId: metricId,
            metricName: evaluator.metric.name,
            metricScore: 0,
            weight: weight,
            thresholdValue: evaluator.thresholdValue || 0,
            aboveThresholdCount: 0,
            belowThresholdCount: 0,
            totalCount: 0
          });

          totalWeightedScore += 0 * weight;
          totalWeight += weight;
        }
      });

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

      const defaultData = evaluation.evaluators.map((evaluator, index) => {
        const summaryConfig = evaluation.summaryData.summaryConfigs[index];
        return {
          metricId: evaluator.metric._id.toString(),
          metricName: evaluator.metric.name,
          metricScore: 0,
          weight: summaryConfig.weight,
          thresholdValue: evaluator.thresholdValue || 0,
          aboveThresholdCount: 0,
          belowThresholdCount: 0,
          totalCount: 0
        };
      });

      return {
        metricsData: defaultData,
        aggregateScore: 0
      };
    }
  }

  static async updateEvaluationSummaryConfig(
    evalId: string,
    calculateType: CalculateMethodEnum,
    metricsConfig: Array<{
      metricId: string;
      thresholdValue: number;
      weight?: number;
    }>
  ): Promise<void> {
    addLog.info('[Evaluation] Starting configuration update', {
      evalId,
      metricsCount: metricsConfig.length
    });

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

    await mongoSessionRun(async (session: ClientSession) => {
      const configMap = new Map(metricsConfig.map((m) => [m.metricId, m]));

      const updatedEvaluators = evaluation.evaluators.map((evaluator: any) => {
        const config = configMap.get(evaluator.metric._id.toString());
        return config ? { ...evaluator, thresholdValue: config.thresholdValue } : evaluator;
      });

      const updatedSummaryConfigs = evaluation.summaryData.summaryConfigs.map(
        (summaryConfig: any, index: number) => {
          const metricId = evaluation.evaluators[index].metric._id.toString();
          const config = configMap.get(metricId);

          if (config) {
            return {
              ...summaryConfig,
              ...(config.weight !== undefined && { weight: config.weight })
            };
          }
          return summaryConfig;
        }
      );

      await MongoEvaluation.updateOne(
        { _id: evalId },
        {
          $set: {
            'summaryData.calculateType': calculateType,
            evaluators: updatedEvaluators,
            'summaryData.summaryConfigs': updatedSummaryConfigs
          }
        },
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

    const calculateType = evaluation.summaryData.calculateType;
    const calculateTypeName = CaculateMethodMap[calculateType]?.name || 'Unknown';

    const metricsConfig = evaluation.evaluators.map((evaluator, index) => {
      const summaryConfig = evaluation.summaryData.summaryConfigs[index];
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

  // Generate summary reports for multiple metrics using BullMQ queue to prevent status deadlock on system crashes
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

        validMetricIds.push(metricId);
      });

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
          return;
        }
        throw new Error(EvaluationErrEnum.summaryNoValidMetricsFound);
      }

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

  static async generateSingleMetricSummary(
    evaluation: EvaluationSchemaType,
    metricId: string,
    evaluatorIndex: number,
    evaluator: any,
    languageType: LanguageType
  ): Promise<void> {
    const evalId = evaluation._id.toString();

    addLog.info('[EvaluationSummary] Starting single metric report generation', {
      evalId,
      metricId,
      metricName: evaluator.metric.name,
      languageType
    });

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

    // Use languageType from job data instead of detecting again
    addLog.info('[EvaluationSummary] Using language type from job data', {
      evalId,
      metricId,
      language: languageType
    });

    const modelData = getEvaluationSummaryModel();
    const tokenLimit = getEvaluationSummaryTokenLimit(modelData.name);
    const { truncatedData, truncatedCount } = await this.truncateDataByTokens(
      filteredData,
      tokenLimit,
      languageType
    );

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
    const summaryModel = undefined;
    const { summary, usage } = await this.callLLMForSummary(
      truncatedData,
      languageType,
      summaryModel
    );

    // undefine will use deafulatevaluation model
    const llmModel = undefined;
    await this.recordUsage(evaluation, evaluator, usage, llmModel);

    await this.updateSummaryResult(evalId, evaluatorIndex, SummaryStatusEnum.completed, summary);

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
  }

  private static async updateSummaryResult(
    evalId: string,
    evaluatorIndex: number,
    status: SummaryStatusEnum,
    summary: string,
    errorReason?: string
  ): Promise<void> {
    const updateData: any = {
      [`summaryData.summaryConfigs.${evaluatorIndex}.summaryStatus`]: status,
      [`summaryData.summaryConfigs.${evaluatorIndex}.summary`]: summary
    };

    if (errorReason) {
      updateData[`summaryData.summaryConfigs.${evaluatorIndex}.errorReason`] = errorReason;
    } else {
      updateData[`summaryData.summaryConfigs.${evaluatorIndex}.errorReason`] = undefined;
    }

    await MongoEvaluation.updateOne({ _id: evalId }, { $set: updateData });
  }

  private static async getFilteredEvaluationData(
    evalId: string,
    metricId: string,
    thresholdValue: number,
    evaluator: any
  ): Promise<{
    filteredData: any[];
    totalDataCount: number;
  }> {
    try {
      const evaluation = await MongoEvaluation.findById(evalId).lean();
      if (!evaluation) {
        throw new Error('Evaluation not found');
      }

      // Query evaluation items for specific metric, sorted by threshold then score
      const pipeline = [
        {
          $match: {
            evalId: new Types.ObjectId(evalId),
            evaluatorOutputs: { $exists: true, $nin: [null, []] }
          }
        },
        {
          $addFields: {
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
            isBelowThreshold: -1,
            score: 1
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

  // Truncate data to fit within token limit while selecting optimal items
  private static async truncateDataByTokens(
    data: any[],
    tokenLimit: number,
    language: LanguageType
  ): Promise<{
    truncatedData: any[];
    truncatedCount: number;
  }> {
    if (data.length === 0) {
      return { truncatedData: [], truncatedCount: 0 };
    }

    try {
      const isAllPerfect = this.isAllPerfectScores(data);
      const optimizedData = this.selectOptimalDataWithFlag(data, isAllPerfect);

      let selectedTemplate: string;
      let selectedExample: string;

      if (language === LanguageType.English) {
        selectedTemplate = isAllPerfect ? strengthAnalysisTemplateEn : problemAnalysisTemplateEn;
        selectedExample = isAllPerfect ? goodExampleEn : badExampleEn;
      } else if (language === LanguageType.TraditionalChinese) {
        selectedTemplate = isAllPerfect
          ? strengthAnalysisTemplateZhTW
          : problemAnalysisTemplateZhTW;
        selectedExample = isAllPerfect ? goodExampleZhTW : badExampleZhTW;
      } else {
        selectedTemplate = isAllPerfect
          ? strengthAnalysisTemplateZhCN
          : problemAnalysisTemplateZhCN;
        selectedExample = isAllPerfect ? goodExampleZhCN : badExampleZhCN;
      }

      const baseTemplate = selectedTemplate
        .replace('{language}', LanguageDisplayNameMap[language])
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
      const optimizedData = this.selectOptimalData(data);
      const fallbackCount = Math.ceil(optimizedData.length * 0.5);
      return {
        truncatedData: optimizedData.slice(0, fallbackCount),
        truncatedCount: fallbackCount
      };
    }
  }

  private static async callLLMForSummary(
    data: any[],
    language: LanguageType,
    llmModel?: string
  ): Promise<{
    summary: string;
    usage: any;
  }> {
    try {
      const modelData = getEvaluationSummaryModel(llmModel);
      const userPrompt = this.buildUserPrompt(data, language);

      const messages: ChatCompletionMessageParam[] = [
        {
          role: ChatCompletionRequestMessageRoleEnum.User,
          content: userPrompt
        }
      ];

      const requestMessages = await loadRequestMessages({
        messages,
        useVision: false
      });

      const { response, isStreamResponse } = await createChatCompletion({
        body: {
          model: modelData.model,
          messages: requestMessages,
          temperature: TEMPERATURE_FOR_EVALUATION_SUMMARY,
          max_tokens: MAX_TOKEN_FOR_EVALUATION_SUMMARY,
          stream: false
        },
        modelData,
        timeout: 30000
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

  private static async recordUsage(
    evaluation: EvaluationSchemaType,
    evaluator: any,
    usage: any,
    llmModel: string | undefined
  ): Promise<void> {
    if (!usage) return;

    try {
      const modelData = getEvaluationSummaryModel(llmModel);
      const inputTokens = usage?.prompt_tokens || 0;
      const outputTokens = usage?.completion_tokens || 0;

      const { totalPoints } = formatModelChars2Points({
        model: modelData.model,
        inputTokens,
        outputTokens,
        modelType: (modelData.type as `${ModelTypeEnum}`) || ModelTypeEnum.llm
      });

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
    }
  }

  private static buildUserPrompt(data: any[], language: LanguageType): string {
    const isAllPerfect = this.isAllPerfectScores(data);

    let selectedTemplate: string;
    let selectedExample: string;

    if (language === LanguageType.English) {
      selectedTemplate = isAllPerfect ? strengthAnalysisTemplateEn : problemAnalysisTemplateEn;
      selectedExample = isAllPerfect ? goodExampleEn : badExampleEn;
    } else if (language === LanguageType.TraditionalChinese) {
      selectedTemplate = isAllPerfect ? strengthAnalysisTemplateZhTW : problemAnalysisTemplateZhTW;
      selectedExample = isAllPerfect ? goodExampleZhTW : badExampleZhTW;
    } else {
      selectedTemplate = isAllPerfect ? strengthAnalysisTemplateZhCN : problemAnalysisTemplateZhCN;
      selectedExample = isAllPerfect ? goodExampleZhCN : badExampleZhCN;
    }

    const evaluationResult = data.map((item) => this.formatDataItemForPrompt(item)).join('\n\n');

    return selectedTemplate
      .replace('{language}', LanguageDisplayNameMap[language])
      .replace('{example}', selectedExample)
      .replace('{evaluation_result_for_single_metric}', evaluationResult);
  }

  private static formatDataItemForPrompt(item: any): string {
    const reason = item.matchingMetricResult?.data?.reason || 'no content';

    return `
eval_reason: ${reason}`;
  }

  private static isAllPerfectScores(data: any[]): boolean {
    if (data.length === 0) return false;
    return data.every((item) => (item.matchingMetricResult?.data?.score || 0) >= PERFECT_SCORE);
  }

  private static selectOptimalData(data: any[]): any[] {
    if (data.length === 0) return [];

    // Check if all scores are perfect
    const isAllPerfect = this.isAllPerfectScores(data);
    return this.selectOptimalDataWithFlag(data, isAllPerfect);
  }

  private static selectOptimalDataWithFlag(data: any[], isAllPerfect: boolean): any[] {
    if (data.length === 0) return [];

    if (isAllPerfect) {
      return data;
    } else {
      // Prioritize non-perfect score data for problem analysis
      const nonPerfectData = data.filter(
        (item) => (item.matchingMetricResult?.data?.score || 0) < PERFECT_SCORE
      );
      return [...nonPerfectData];
    }
  }

  // Trigger summary generation when evaluation completes, only for metrics without existing summaries
  static async triggerSummaryGeneration(evalId: string): Promise<void> {
    try {
      const allEvalItemsStatus = await MongoEvalItem.find(
        { evalId: new Types.ObjectId(evalId) },
        { status: 1 }
      ).lean();

      const allItemsAbnormal =
        allEvalItemsStatus.length > 0 &&
        allEvalItemsStatus.every((item) => item.status === EvaluationStatusEnum.error);

      if (allItemsAbnormal) {
        addLog.warn(
          '[Evaluation] All evaluation items have error status, skipping summary generation for all metrics',
          {
            evalId,
            totalItems: allEvalItemsStatus.length
          }
        );
        return;
      }

      const itemsWithSuccessfulOutputs = await MongoEvalItem.countDocuments({
        evalId: new Types.ObjectId(evalId),
        evaluatorOutputs: {
          $elemMatch: {
            status: MetricResultStatusEnum.Success,
            'data.score': { $exists: true, $ne: null }
          }
        }
      });

      if (itemsWithSuccessfulOutputs === 0) {
        return;
      }

      const currentEvaluation = await MongoEvaluation.findById(evalId).lean();

      if (!currentEvaluation?.evaluators || currentEvaluation.evaluators.length === 0) {
        return;
      }

      const metricsNeedingSummary: string[] = [];

      currentEvaluation.evaluators.forEach((evaluator: any, index: number) => {
        const metricId = evaluator.metric._id.toString();
        const summaryConfig = currentEvaluation.summaryData.summaryConfigs[index];

        if (!summaryConfig?.summary || summaryConfig.summary.trim() === '') {
          metricsNeedingSummary.push(metricId);
        }
      });

      if (metricsNeedingSummary.length > 0) {
        await EvaluationSummaryService.generateSummaryReports(evalId, metricsNeedingSummary);
      } else {
        addLog.debug(
          `[Evaluation] All metrics already have summaries, skipping summary generation: ${evalId}`
        );
      }
    } catch (error) {
      addLog.warn(`[Evaluation] Failed to trigger summary generation: ${evalId}`, {
        error
      });
    }
  }
}

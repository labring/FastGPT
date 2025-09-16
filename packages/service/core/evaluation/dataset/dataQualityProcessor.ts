import type { Job } from 'bullmq';
import { addLog } from '../../../common/system/log';
import { MongoEvalDatasetData } from './evalDatasetDataSchema';
import { getEvalDatasetDataQualityWorker, type EvalDatasetDataQualityData } from './dataQualityMq';
import {
  EvalDatasetDataKeyEnum,
  EvalDatasetDataQualityStatusEnum,
  EvalDatasetDataQualityResultEnum
} from '@fastgpt/global/core/evaluation/dataset/constants';
import { EvalMetricTypeEnum } from '@fastgpt/global/core/evaluation/metric/constants';
import type { EvalMetricSchemaType } from '@fastgpt/global/core/evaluation/metric/type';
import { createEvaluatorInstance } from '../evaluator';
import { checkTeamAIPoints } from '../../../support/permission/teamLimit';
import { createEvalDatasetDataQualityUsage } from '../../../support/wallet/usage/controller';

// Queue processor function
export const processEvalDatasetDataQuality = async (job: Job<EvalDatasetDataQualityData>) => {
  const { dataId, evaluationModel } = job.data;

  addLog.info('Processing eval dataset data quality job', { dataId, evaluationModel });

  if (!global.llmModelMap.has(evaluationModel)) {
    const errorMsg = `Invalid evaluation model: ${evaluationModel}`;
    addLog.error('Eval dataset data quality job failed - invalid model', {
      dataId,
      evaluationModel
    });

    await MongoEvalDatasetData.findByIdAndUpdate(dataId, {
      $set: {
        'qualityMetadata.status': EvalDatasetDataQualityStatusEnum.error,
        'qualityMetadata.error': errorMsg,
        'qualityMetadata.finishTime': new Date()
      }
    });

    throw new Error(errorMsg);
  }

  try {
    await MongoEvalDatasetData.findByIdAndUpdate(dataId, {
      $set: {
        'qualityMetadata.status': EvalDatasetDataQualityStatusEnum.evaluating,
        'qualityMetadata.startTime': new Date()
      }
    });

    const datasetData = await MongoEvalDatasetData.findById(dataId);
    if (!datasetData) {
      throw new Error(`Dataset data not found: ${dataId}`);
    }

    // Check AI points limit
    await checkTeamAIPoints(datasetData.teamId);

    // Create evaluator instance and run evaluation
    const metricSchema: EvalMetricSchemaType = {
      _id: '',
      teamId: '',
      tmbId: '',
      name: 'q_a_quality',
      type: EvalMetricTypeEnum.Builtin,
      userInputRequired: true,
      actualOutputRequired: false,
      expectedOutputRequired: true,
      contextRequired: false,
      retrievalContextRequired: false,
      embeddingRequired: false,
      llmRequired: true,
      createTime: new Date(),
      updateTime: new Date()
    };

    const evaluatorConfig = {
      metric: metricSchema,
      runtimeConfig: {
        llm: evaluationModel
      }
    };

    const evalCase = {
      [EvalDatasetDataKeyEnum.UserInput]: datasetData.userInput,
      [EvalDatasetDataKeyEnum.ActualOutput]: datasetData.actualOutput,
      [EvalDatasetDataKeyEnum.ExpectedOutput]: datasetData.expectedOutput,
      [EvalDatasetDataKeyEnum.Context]: datasetData.context,
      [EvalDatasetDataKeyEnum.RetrievalContext]: datasetData.retrievalContext
    };

    const evaluator = await createEvaluatorInstance(evaluatorConfig, { validate: false });
    const metricResult = await evaluator.evaluate(evalCase);

    if (metricResult.status === 'success' && metricResult.data) {
      // Save usage
      let totalPoints = 0;
      if (metricResult.usages?.length) {
        const { totalPoints: calculatedPoints } = await createEvalDatasetDataQualityUsage({
          teamId: datasetData.teamId,
          tmbId: datasetData.tmbId,
          model: evaluationModel,
          usages: metricResult.usages
        });
        totalPoints = calculatedPoints;
      }

      const qualityResult =
        metricResult.data.score >= 0.7
          ? EvalDatasetDataQualityResultEnum.highQuality
          : EvalDatasetDataQualityResultEnum.needsOptimization;

      await MongoEvalDatasetData.findByIdAndUpdate(dataId, {
        $set: {
          'qualityMetadata.status': EvalDatasetDataQualityStatusEnum.completed,
          'qualityMetadata.score': metricResult.data.score,
          'qualityMetadata.reason': metricResult.data?.reason,
          'qualityMetadata.runLogs': metricResult.data?.runLogs,
          'qualityMetadata.usages': metricResult?.usages,
          'qualityMetadata.finishTime': new Date(),
          'qualityMetadata.model': evaluationModel,
          qualityResult: qualityResult
        }
      });

      addLog.info('Eval dataset data quality job completed successfully', {
        dataId,
        score: metricResult.data.score,
        totalPoints
      });
    } else {
      throw new Error(metricResult.error || 'Evaluation failed');
    }
  } catch (error) {
    addLog.error('Eval dataset data quality job failed', { dataId, error });

    await MongoEvalDatasetData.findByIdAndUpdate(dataId, {
      $set: {
        'qualityMetadata.status': EvalDatasetDataQualityStatusEnum.error,
        'qualityMetadata.error': error instanceof Error ? error.message : 'Unknown error',
        'qualityMetadata.finishTime': new Date()
      }
    });

    throw error;
  }
};

// Initialize worker
export const initEvalDatasetDataQualityWorker = () => {
  return getEvalDatasetDataQualityWorker(processEvalDatasetDataQuality);
};

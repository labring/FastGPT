import type { Job } from 'bullmq';
import { addLog } from '../../../common/system/log';
import { MongoEvalDatasetData } from './evalDatasetDataSchema';
import { getEvalDatasetDataQualityWorker, type EvalDatasetDataQualityData } from './dataQualityMq';
import {
  EvalDatasetDataKeyEnum,
  EvalDatasetDataQualityStatusEnum
} from '@fastgpt/global/core/evaluation/dataset/constants';
import { EvalMetricTypeEnum } from '@fastgpt/global/core/evaluation/metric/constants';
import type { EvalMetricSchemaType } from '@fastgpt/global/core/evaluation/metric/type';
import { createEvaluatorInstance } from '../evaluator';
import { checkTeamAIPoints } from '../../../support/permission/teamLimit';
import { createEvalDatasetDataQualityUsage } from '../../../support/wallet/usage/controller';

// Queue processor function
export const processEvalDatasetDataQuality = async (job: Job<EvalDatasetDataQualityData>) => {
  const { dataId: DataId, evalModel } = job.data;

  addLog.info('Processing eval dataset data quality job', { DataId, evalModel });

  try {
    await MongoEvalDatasetData.findByIdAndUpdate(DataId, {
      $set: {
        'metadata.qualityStatus': EvalDatasetDataQualityStatusEnum.evaluating,
        'metadata.qualityStartTime': new Date()
      }
    });

    const datasetData = await MongoEvalDatasetData.findById(DataId);
    if (!datasetData) {
      throw new Error(`Dataset data not found: ${DataId}`);
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
        llm: evalModel
      }
    };

    const evalCase = {
      [EvalDatasetDataKeyEnum.UserInput]: datasetData.userInput,
      [EvalDatasetDataKeyEnum.ActualOutput]: datasetData.actualOutput,
      [EvalDatasetDataKeyEnum.ExpectedOutput]: datasetData.expectedOutput,
      [EvalDatasetDataKeyEnum.Context]: datasetData.context,
      [EvalDatasetDataKeyEnum.RetrievalContext]: datasetData.retrievalContext
    };

    const evaluator = createEvaluatorInstance(evaluatorConfig);
    const metricResult = await evaluator.evaluate(evalCase);

    if (metricResult.status === 'success' && metricResult.data) {
      // Save usage
      let totalPoints = 0;
      if (metricResult.usages?.length) {
        const { totalPoints: calculatedPoints } = await createEvalDatasetDataQualityUsage({
          teamId: datasetData.teamId,
          tmbId: datasetData.tmbId,
          model: evalModel,
          usages: metricResult.usages
        });
        totalPoints = calculatedPoints;
      }

      await MongoEvalDatasetData.findByIdAndUpdate(DataId, {
        $set: {
          'metadata.qualityStatus': EvalDatasetDataQualityStatusEnum.completed,
          'metadata.qualityScore': metricResult.data.score,
          'metadata.qualityReason': metricResult.data?.reason,
          'metadata.qualityRunLogs': metricResult.data?.run_logs,
          'metadata.qualityUsages': metricResult?.usages,
          'metadata.qualityFinishTime': new Date(),
          'metadata.qualityModel': evalModel
        }
      });

      addLog.info('Eval dataset data quality job completed successfully', {
        DataId,
        score: metricResult.data.score,
        totalPoints
      });
    } else {
      throw new Error(metricResult.error || 'Evaluation failed');
    }
  } catch (error) {
    addLog.error('Eval dataset data quality job failed', { DataId, error });

    await MongoEvalDatasetData.findByIdAndUpdate(DataId, {
      $set: {
        'metadata.qualityStatus': EvalDatasetDataQualityStatusEnum.error,
        'metadata.qualityError': error instanceof Error ? error.message : 'Unknown error',
        'metadata.qualityFinishTime': new Date()
      }
    });

    throw error;
  }
};

// Initialize worker
export const initEvalDatasetDataQualityWorker = () => {
  return getEvalDatasetDataQualityWorker(processEvalDatasetDataQuality);
};

import type { Job } from 'bullmq';
import { addLog } from '../../../common/system/log';
import { MongoEvalDatasetData } from './evalDatasetDataSchema';
import type { EvalDatasetDataQualityData } from './dataQualityMq';
import {
  EvalDatasetDataKeyEnum,
  EvalDatasetDataQualityStatusEnum
} from '@fastgpt/global/core/evaluation/constants';

// FastAPI service interface schemas
export type InputData = {
  [EvalDatasetDataKeyEnum.UserInput]?: string;
  [EvalDatasetDataKeyEnum.ActualOutput]?: string;
  [EvalDatasetDataKeyEnum.ExpectedOutput]?: string;
  [EvalDatasetDataKeyEnum.Context]?: string[];
  [EvalDatasetDataKeyEnum.RetrievalContext]?: string[];
  metadata?: Record<string, any>;
};

export type ModelConfig = {
  name: string;
  base_url?: string;
  api_key?: string;
  parameters?: Record<string, any>;
  timeout?: number;
};

export type MetricConfig = {
  metric_name: string;
  prompt?: string;
};

export type EvaluationRequest = {
  llm_config: ModelConfig;
  embedding_config: ModelConfig;
  metric_config: MetricConfig;
  input_data: InputData;
};

export type EvaluationResult = {
  metric_name: string;
  score: number;
  reason?: string;
  run_logs?: Record<string, any>;
};

export type Usage = {
  model_type: 'llm' | 'embed';
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
};

export type EvaluationResponse = {
  request_id: string;
  status: 'success' | 'failed';
  data?: EvaluationResult;
  usages?: Usage[];
  error?: string;
};
// TODO: function to simulate calling the FastAPI microservice
async function mockEvaluationService(request: EvaluationRequest): Promise<EvaluationResponse> {
  addLog.info('Mock: Calling evaluation microservice', {
    request_id: request.input_data.metadata?.request_id
  });

  // Simulate API delay
  await new Promise((resolve) => setTimeout(resolve, 1000 + Math.random() * 2000));

  // Mock successful response with random score
  const mockScore = 0.6 + Math.random() * 0.4; // Score between 0.6 and 1.0

  return {
    request_id: request.input_data.metadata?.request_id || 'mock-request-id',
    status: 'success',
    data: {
      metric_name: request.metric_config.metric_name,
      score: Math.round(mockScore * 100) / 100,
      reason: `Mock evaluation result for ${request.metric_config.metric_name}`,
      run_logs: {
        mock: true,
        timestamp: new Date().toISOString(),
        model: request.llm_config.name
      }
    },
    usages: [
      {
        model_type: 'llm',
        prompt_tokens: 100,
        completion_tokens: 50,
        total_tokens: 150
      }
    ]
  };
}

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

    // Prepare the evaluation request
    const evaluationRequest: EvaluationRequest = {
      llm_config: {
        name: evalModel,
        parameters: {
          temperature: 0.7,
          max_tokens: 1000
        },
        timeout: 600
      },
      embedding_config: {
        name: 'text-embedding-ada-002',
        timeout: 600
      },
      metric_config: {
        metric_name: 'quality_assessment'
      },
      input_data: {
        [EvalDatasetDataKeyEnum.UserInput]: datasetData.userInput,
        [EvalDatasetDataKeyEnum.ActualOutput]: datasetData.actualOutput,
        [EvalDatasetDataKeyEnum.ExpectedOutput]: datasetData.expectedOutput,
        [EvalDatasetDataKeyEnum.Context]: datasetData.context,
        [EvalDatasetDataKeyEnum.RetrievalContext]: datasetData.retrievalContext,
        metadata: {
          ...datasetData.metadata,
          request_id: `${DataId}-${Date.now()}`
        }
      }
    };

    // Call mock evaluation service
    const evaluationResult = await mockEvaluationService(evaluationRequest);

    if (evaluationResult.status === 'success' && evaluationResult.data) {
      // Update dataset data with successful evaluation result
      await MongoEvalDatasetData.findByIdAndUpdate(DataId, {
        $set: {
          'metadata.qualityStatus': EvalDatasetDataQualityStatusEnum.completed,
          'metadata.qualityScore': evaluationResult.data.score,
          'metadata.qualityReason': evaluationResult.data.reason,
          'metadata.qualityRunLogs': evaluationResult.data.run_logs,
          'metadata.qualityUsages': evaluationResult.usages,
          'metadata.qualityFinishTime': new Date(),
          'metadata.qualityModel': evalModel
        }
      });

      addLog.info('Eval dataset data quality job completed successfully', {
        DataId,
        score: evaluationResult.data.score
      });
    } else {
      throw new Error(evaluationResult.error || 'Evaluation failed');
    }
  } catch (error) {
    addLog.error('Eval dataset data quality job failed', { DataId, error });

    // Update status to failed
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

import type {
  RerankTrainTaskSchemaType,
  RerankEvalResult
} from '@fastgpt/global/core/train/rerank/type';
import { RerankTaskCheckpointStageEnum } from '@fastgpt/global/core/train/rerank/constants';
import { MongoApp } from '../../../../../core/app/schema';
import { MongoEvalDatasetCollection } from '../../../../../core/evaluation/dataset/evalDatasetCollectionSchema';
import { MongoEvalDatasetData } from '../../../../../core/evaluation/dataset/evalDatasetDataSchema';
import {
  EvalDatasetDataCreateFromEnum,
  EvalDatasetDataKeyEnum
} from '@fastgpt/global/core/evaluation/dataset/constants';
import {
  extractDatasetIdsFromApp,
  sampleDataFromDataset,
  pLimit,
  extractModelFromApp,
  buildModelEndpoint
} from '../../utils';
import { createEnhancedError } from '../../utils';
import {
  RerankTrainErrEnum,
  RerankTrainSuggestionEnum
} from '@fastgpt/global/common/error/code/train';
import { syntheticRerankEvalData, evaluateRerank } from '../../external';
import { getDefaultLLMModel, getRerankModel } from '../../../../ai/model';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { addLog } from '../../../../../common/system/log';
import { performDatasetSearch } from '../helpers/dataset-search';
import {
  DEFAULT_DITING_CONCURRENCY,
  MAX_DITING_CONCURRENCY,
  DEFAULT_DITING_TIMEOUT
} from '../../constants';
import { TrainTaskUnrecoverableError, TrainTaskRetriableError } from '../errors';
import { mockRunGenerateEvalDataset } from './evaluate.mock';

/**
 * Environment variable control for evaluation dataset generation
 * - USE_EVAL_DATASET_MOCK=true: Use mock implementation (XLSX file-based)
 * - USE_EVAL_DATASET_MOCK=false or not set: Use real implementation (default)
 *
 * Mock implementation uses XLSX file configured via EVAL_DATASET_MOCK_FILE environment variable
 */
const useEvalDatasetMock = process.env.USE_EVAL_DATASET_MOCK === 'true';

/**
 * Generate evaluation dataset
 * Routes to mock or real implementation based on USE_EVAL_DATASET_MOCK environment variable
 */
export const runGenerateEvalDataset = useEvalDatasetMock
  ? mockRunGenerateEvalDataset
  : realRunGenerateEvalDataset;

/**
 * Generate evaluation dataset
 *
 * Responsibilities:
 * 1. Sample data from datasets associated with the application
 * 2. Call DiTing API to generate evaluation QA pairs for each sample
 * 3. Perform dataset search for each QA pair (without rerank, embedding only)
 * 4. Create evaluation dataset collection
 * 5. Batch insert evaluation data
 * 6. Return evaluation dataset ID
 *
 * @param task - Rerank training task instance
 * @returns Evaluation dataset collection ID
 * @throws Error if application not found, no datasets found, or no data available
 */
async function realRunGenerateEvalDataset(task: RerankTrainTaskSchemaType): Promise<string> {
  addLog.info('Run generate eval dataset', { taskId: String(task._id) });

  const app = await MongoApp.findById(task.appId).lean();
  if (!app) {
    const enhancedError = createEnhancedError(
      RerankTaskCheckpointStageEnum.evaluating,
      RerankTrainErrEnum.evalAppDeleted,
      RerankTrainSuggestionEnum.evalAppDeleted
    );
    throw new TrainTaskUnrecoverableError(enhancedError);
  }

  const datasetIds = extractDatasetIdsFromApp(app);
  if (datasetIds.length === 0) {
    const enhancedError = createEnhancedError(
      RerankTaskCheckpointStageEnum.evaluating,
      RerankTrainErrEnum.evalNoDatasetConfigured,
      RerankTrainSuggestionEnum.evalNoDatasetConfigured
    );
    throw new TrainTaskUnrecoverableError(enhancedError);
  }

  addLog.info('Extracted dataset IDs from app', {
    taskId: String(task._id),
    datasetIds
  });

  // Use last 20% of data as evaluation set
  const sampledData = await sampleDataFromDataset(datasetIds, { datasetType: 'eval' });

  if (sampledData.length === 0) {
    const enhancedError = createEnhancedError(
      RerankTaskCheckpointStageEnum.evaluating,
      RerankTrainErrEnum.evalNoDataAvailable,
      RerankTrainSuggestionEnum.evalNoDataAvailable
    );
    throw new TrainTaskUnrecoverableError(enhancedError);
  }

  addLog.info('Sampled data from datasets', {
    taskId: String(task._id),
    sampleCount: sampledData.length
  });

  const aiModelName = extractModelFromApp(
    app,
    FlowNodeTypeEnum.chatNode,
    NodeInputKeyEnum.aiModel,
    getDefaultLLMModel
  );

  // Controlled concurrency for DiTing API calls
  const ditingConcurrency = Math.min(
    Math.max(
      parseInt(process.env.DITING_API_CONCURRENCY || String(DEFAULT_DITING_CONCURRENCY), 10),
      1
    ),
    MAX_DITING_CONCURRENCY
  );
  addLog.info('DiTing API concurrency configuration', {
    taskId: String(task._id),
    concurrency: ditingConcurrency,
    totalSamples: sampledData.length
  });

  const ditingLimit = pLimit(ditingConcurrency);
  const ditingResults = await Promise.allSettled(
    sampledData.map((sample) =>
      ditingLimit(async () => {
        const context = [sample.q, sample.a].filter(Boolean);

        const response = await syntheticRerankEvalData({
          synthesizerConfig: {
            synthesizerName: 'eval_q_a_synthesizer'
          },
          inputData: {
            context
          },
          llm_config: {
            name: aiModelName,
            timeout: DEFAULT_DITING_TIMEOUT / 1000
          }
        });

        if (!response.success || !response.data?.qaPair) {
          addLog.warn('Failed to generate eval QA pair for sample', {
            taskId: String(task._id),
            sampleDataId: sample.dataId,
            error: response.error
          });
          return null;
        }

        return {
          teamId: task.teamId,
          tmbId: task.tmbId,
          question: response.data.qaPair.question,
          answer: response.data.qaPair.answer,
          sourceDataId: sample.dataId,
          sourceDatasetId: sample.datasetId,
          synthesizedAt: new Date()
        };
      })
    )
  );

  const evalDataItems = ditingResults
    .filter((result): result is PromiseFulfilledResult<any> => result.status === 'fulfilled')
    .map((result) => result.value)
    .filter((value) => value !== null);

  if (evalDataItems.length === 0) {
    const enhancedError = createEnhancedError(
      RerankTaskCheckpointStageEnum.evaluating,
      RerankTrainErrEnum.evalDitingGenerationFailed,
      RerankTrainSuggestionEnum.evalDitingGenerationFailed
    );
    throw new TrainTaskRetriableError(enhancedError);
  }

  addLog.info('Generated eval QA pairs using DiTing', {
    taskId: String(task._id),
    generatedCount: evalDataItems.length
  });

  addLog.info('Performing dataset search for eval data items', {
    taskId: String(task._id),
    itemCount: evalDataItems.length
  });

  // Controlled concurrency for dataset search (without rerank, embedding only)
  const searchConcurrency = Math.min(
    Math.max(
      parseInt(process.env.DATASET_SEARCH_CONCURRENCY || String(DEFAULT_DITING_CONCURRENCY), 10),
      1
    ),
    MAX_DITING_CONCURRENCY
  );
  addLog.info('Dataset search concurrency configuration', {
    taskId: String(task._id),
    concurrency: searchConcurrency,
    totalItems: evalDataItems.length
  });

  const searchLimit = pLimit(searchConcurrency);
  const searchResults = await Promise.allSettled(
    evalDataItems.map((item) =>
      searchLimit(async () => {
        const retrievalResults = await performDatasetSearch(task, app, item.question);

        return {
          ...item,
          retrievalContextsFull: retrievalResults,
          expectedContextIds: [item.sourceDataId]
        };
      })
    )
  );

  const enrichedEvalDataItems = searchResults
    .filter((result): result is PromiseFulfilledResult<any> => result.status === 'fulfilled')
    .map((result) => result.value);

  addLog.info('Completed dataset search for eval data items', {
    taskId: String(task._id),
    enrichedItemCount: enrichedEvalDataItems.length
  });

  const evalCollectionName = `Eval Dataset - Task ${task._id}`;

  try {
    const [evalCollection] = await MongoEvalDatasetCollection.create([
      {
        teamId: task.teamId,
        tmbId: task.tmbId,
        name: evalCollectionName,
        description: `Rerank Model Evaluation Dataset - Training Task ${task.name}`,
        metadata: {
          taskId: String(task._id),
          taskName: task.name,
          generatedAt: new Date(),
          sampleSize: enrichedEvalDataItems.length
        }
      }
    ]);

    const evalDataDocs = enrichedEvalDataItems.map((item) => ({
      teamId: item.teamId,
      tmbId: item.tmbId,
      evalDatasetCollectionId: evalCollection._id,
      [EvalDatasetDataKeyEnum.UserInput]: item.question,
      [EvalDatasetDataKeyEnum.ExpectedOutput]: item.answer,
      [EvalDatasetDataKeyEnum.Context]: [],
      [EvalDatasetDataKeyEnum.RetrievalContext]: [],
      [EvalDatasetDataKeyEnum.RetrievalContextsFull]: item.retrievalContextsFull,
      [EvalDatasetDataKeyEnum.ExpectedContextIds]: item.expectedContextIds,
      createFrom: EvalDatasetDataCreateFromEnum.intelligentGeneration,
      synthesisMetadata: {
        sourceDataId: item.sourceDataId,
        sourceDatasetId: item.sourceDatasetId,
        intelligentGenerationModel: aiModelName,
        synthesizedAt: item.synthesizedAt,
        generatedAt: new Date()
      }
    }));

    await MongoEvalDatasetData.insertMany(evalDataDocs);

    addLog.info('Generated eval dataset', {
      taskId: String(task._id),
      datasetId: String(evalCollection._id),
      dataCount: evalDataDocs.length
    });

    return String(evalCollection._id);
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    const enhancedError = createEnhancedError(
      RerankTaskCheckpointStageEnum.evaluating,
      RerankTrainErrEnum.evalDatabaseSaveFailed,
      RerankTrainSuggestionEnum.evalDatabaseSaveFailed,
      errorMsg
    );
    throw new TrainTaskUnrecoverableError(enhancedError);
  }
}

/**
 * Evaluate model performance (used for both base and tuned models)
 *
 * @param taskId - Training task ID
 * @param evalDatasetId - Evaluation dataset collection ID
 * @param modelConfigId - Model configuration ID to evaluate
 * @param modelType - Type of model being evaluated
 * @returns Detailed evaluation results from DiTing API
 * @throws Error if dataset is empty, model config not found, or evaluation fails
 */
async function evaluateModel(
  taskId: string,
  evalDatasetId: string,
  modelConfigId: string,
  modelType: 'base' | 'tuned'
): Promise<RerankEvalResult> {
  const modelTypeName = modelType === 'base' ? 'base' : 'tuned';
  addLog.info(`Run evaluate ${modelTypeName} model`, { taskId });

  const evalDataItems = await MongoEvalDatasetData.find({
    evalDatasetCollectionId: evalDatasetId
  }).lean();

  if (evalDataItems.length === 0) {
    const enhancedError = createEnhancedError(
      RerankTaskCheckpointStageEnum.evaluating,
      RerankTrainErrEnum.evalDatasetEmptyBeforeEval,
      RerankTrainSuggestionEnum.evalDatasetEmptyBeforeEval
    );
    throw new TrainTaskUnrecoverableError(enhancedError);
  }

  const modelConfig = getRerankModel(modelConfigId);

  if (!modelConfig) {
    const enhancedError = createEnhancedError(
      RerankTaskCheckpointStageEnum.evaluating,
      RerankTrainErrEnum.evalModelNotFound,
      RerankTrainSuggestionEnum.evalModelNotFound,
      modelConfigId
    );
    throw new TrainTaskUnrecoverableError(enhancedError);
  }

  const dataset = evalDataItems.map((item) => ({
    q: item.userInput,
    retrieval_reference_list: (item.retrievalContextsFull || []).map((ctx) => ({
      id: ctx.id,
      q: ctx.q,
      a: ctx.a || '',
      score: ctx.score
    })),
    expected_dataid: item.expectedContextIds || []
  }));

  const modelEndpoint = buildModelEndpoint(modelConfig);
  const rerankerConfig = {
    name: modelEndpoint.model,
    base_url: modelEndpoint.base_url,
    api_key: modelEndpoint.api_key
  };

  const response = await evaluateRerank({
    dataset,
    reranker_config: rerankerConfig,
    metric_config: {
      metric_name: 'rerank_metric'
    }
  });

  if (!response.success || !response.data?.runLogs?.detailed_results) {
    const errorMsg = response.error;
    const enhancedError = createEnhancedError(
      RerankTaskCheckpointStageEnum.evaluating,
      RerankTrainErrEnum.evalDitingEvalFailed,
      RerankTrainSuggestionEnum.evalDitingEvalFailed,
      errorMsg
    );
    throw new TrainTaskRetriableError(enhancedError);
  }

  const runLogs = response.data.runLogs;
  const detailedResults = runLogs.detailed_results;

  addLog.info(`${modelTypeName} model evaluated`, {
    taskId,
    ndcg: detailedResults.rerank_top10_ndcg,
    mrr: detailedResults.rerank_top10_mrr,
    precision: detailedResults.rerank_top10_precision,
    hasRetrievalRanks: !!runLogs.retrieval_ranks
  });

  // Return full runLogs including retrieval_ranks for CSV download
  return runLogs;
}

/**
 * Evaluate base model performance
 *
 * @param taskId - Training task ID
 * @param baseEvalDatasetId - Evaluation dataset collection ID
 * @param baseModelConfigId - Base model configuration ID
 * @returns Detailed evaluation results
 */
export async function runEvaluateBaseModel(
  taskId: string,
  baseEvalDatasetId: string,
  baseModelConfigId: string
): Promise<RerankEvalResult> {
  return evaluateModel(taskId, baseEvalDatasetId, baseModelConfigId, 'base');
}

/**
 * Evaluate tuned model performance
 *
 * @param taskId - Training task ID
 * @param tunedEvalDatasetId - Evaluation dataset collection ID
 * @param tunedModelConfigId - Tuned model configuration ID
 * @returns Detailed evaluation results
 */
export async function runEvaluateTunedModel(
  taskId: string,
  tunedEvalDatasetId: string,
  tunedModelConfigId: string
): Promise<RerankEvalResult> {
  return evaluateModel(taskId, tunedEvalDatasetId, tunedModelConfigId, 'tuned');
}

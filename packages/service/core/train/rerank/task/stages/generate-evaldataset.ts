import type { RerankTrainTaskSchemaType } from '@fastgpt/global/core/train/rerank/type';
import { RerankTaskCheckpointStageEnum } from '@fastgpt/global/core/train/rerank/constants';
import { MongoEvalDatasetCollection } from '../../../../../core/evaluation/dataset/evalDatasetCollectionSchema';
import { MongoEvalDatasetData } from '../../../../../core/evaluation/dataset/evalDatasetDataSchema';
import {
  EvalDatasetDataCreateFromEnum,
  EvalDatasetDataKeyEnum
} from '@fastgpt/global/core/evaluation/dataset/constants';
import { sampleDataFromDataset, pLimit } from '../../utils';
import { createEnhancedError } from '../../utils';
import {
  RerankTrainErrEnum,
  RerankTrainSuggestionEnum
} from '@fastgpt/global/common/error/code/train';
import { syntheticRerankEvalData } from '../../external';
import { getDefaultLLMModel } from '../../../../ai/model';
import { addLog } from '../../../../../common/system/log';
import {
  DEFAULT_DITING_CONCURRENCY,
  MAX_DITING_CONCURRENCY,
  DEFAULT_DITING_TIMEOUT,
  MIN_EVAL_QA_COUNT
} from '../../constants';
import { TrainTaskUnrecoverableError, TrainTaskRetriableError } from '../errors';
import { MongoRerankTrainTask } from '../schema';
import { performDatasetSearch } from '../helpers/dataset-search';

/**
 * Generate evaluation dataset using DiTing (auto mode)
 *
 * Responsibilities:
 * 1. Sample data from task.datasetIds
 * 2. Call DiTing API to generate evaluation QA pairs for each sample
 *    (mock can be enabled via USE_DITING_MOCK=true in the external layer)
 * 3. Perform dataset search for each QA pair (without rerank, embedding only)
 * 4. Create evaluation dataset collection
 * 5. Batch insert evaluation data
 * 6. Return evaluation dataset ID
 *
 * @param task - Rerank training task instance
 * @returns Evaluation dataset collection ID
 */
async function generateEvalDatasetFromDatasets(task: RerankTrainTaskSchemaType): Promise<string> {
  addLog.info('Run generate eval dataset (auto mode)', { taskId: String(task._id) });

  if (!task.datasetIds || task.datasetIds.length === 0) {
    const enhancedError = createEnhancedError(
      RerankTaskCheckpointStageEnum.generate_evaldataset,
      RerankTrainErrEnum.evalNoDatasetConfigured,
      RerankTrainSuggestionEnum.evalNoDatasetConfigured
    );
    throw new TrainTaskUnrecoverableError(enhancedError);
  }

  const datasetIds = task.datasetIds;

  addLog.info('Using dataset IDs from task', {
    taskId: String(task._id),
    datasetIds
  });

  // Randomly sample from all data for evaluation
  const sampledData = await sampleDataFromDataset(datasetIds, {
    datasetType: 'random',
    sampleSize: MIN_EVAL_QA_COUNT
  });

  if (sampledData.length === 0) {
    const enhancedError = createEnhancedError(
      RerankTaskCheckpointStageEnum.generate_evaldataset,
      RerankTrainErrEnum.evalNoDataAvailable,
      RerankTrainSuggestionEnum.evalNoDataAvailable
    );
    throw new TrainTaskUnrecoverableError(enhancedError);
  }

  // If sampled data is less than MIN_EVAL_QA_COUNT, repeat samples cyclically to fill the gap
  let limitedSampledData = sampledData;
  if (sampledData.length < MIN_EVAL_QA_COUNT) {
    addLog.warn('Eval sampledData below minimum required count, repeating samples', {
      taskId: String(task._id),
      sampledCount: sampledData.length,
      required: MIN_EVAL_QA_COUNT
    });
    limitedSampledData = [];
    for (let i = 0; i < MIN_EVAL_QA_COUNT; i++) {
      limitedSampledData.push(sampledData[i % sampledData.length]);
    }
  } else {
    limitedSampledData = sampledData.slice(0, MIN_EVAL_QA_COUNT);
  }

  addLog.info('Sampled data from datasets', {
    taskId: String(task._id),
    sampleCount: sampledData.length,
    limitedCount: limitedSampledData.length
  });

  // In auto mode, there is no app reference - use the default LLM model name directly.
  const aiModelName = getDefaultLLMModel()?.model || '';

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
    totalSamples: limitedSampledData.length
  });

  const ditingLimit = pLimit(ditingConcurrency);
  const ditingResults = await Promise.allSettled(
    limitedSampledData.map((sample) =>
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
      RerankTaskCheckpointStageEnum.generate_evaldataset,
      RerankTrainErrEnum.evalDitingGenerationFailed,
      RerankTrainSuggestionEnum.evalDitingGenerationFailed
    );
    throw new TrainTaskRetriableError(enhancedError);
  }

  if (evalDataItems.length < MIN_EVAL_QA_COUNT) {
    addLog.warn('Generated eval QA pairs below minimum required count', {
      taskId: String(task._id),
      generatedCount: evalDataItems.length,
      required: MIN_EVAL_QA_COUNT
    });
    const enhancedError = createEnhancedError(
      RerankTaskCheckpointStageEnum.generate_evaldataset,
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
        const retrievalResults = await performDatasetSearch(task, datasetIds, item.question);

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

  const rejectedResults = searchResults.filter(
    (result): result is PromiseRejectedResult => result.status === 'rejected'
  );
  if (rejectedResults.length > 0) {
    addLog.warn('Some dataset searches failed during eval generation', {
      taskId: String(task._id),
      rejectedCount: rejectedResults.length,
      firstError: String(rejectedResults[0]?.reason?.message || rejectedResults[0]?.reason),
      firstStack: rejectedResults[0]?.reason?.stack?.split('\n').slice(0, 3).join('\n')
    });
  }

  addLog.info('Completed dataset search for eval data items', {
    taskId: String(task._id),
    enrichedItemCount: enrichedEvalDataItems.length
  });

  if (enrichedEvalDataItems.length === 0) {
    const enhancedError = createEnhancedError(
      RerankTaskCheckpointStageEnum.generate_evaldataset,
      RerankTrainErrEnum.evalDatasetSearchAllFailed,
      RerankTrainSuggestionEnum.evalDatasetSearchAllFailed,
      `All ${searchResults.length} dataset searches failed or returned empty results`
    );
    throw new TrainTaskRetriableError(enhancedError);
  }

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
      RerankTaskCheckpointStageEnum.generate_evaldataset,
      RerankTrainErrEnum.evalDatabaseSaveFailed,
      RerankTrainSuggestionEnum.evalDatabaseSaveFailed,
      errorMsg
    );
    throw new TrainTaskUnrecoverableError(enhancedError);
  }
}

/**
 * Stage 2: Generate Evaluation Dataset
 *
 * - Exact mode (task.evalDatasetId is non-empty): Directly returns the existing evalDatasetId.
 * - Auto mode (task.evalDatasetId is empty): Samples from task.datasetIds, calls DiTing to
 *   generate QA pairs (mock via USE_DITING_MOCK=true), creates eval dataset collection,
 *   writes evalDatasetId back to task.
 *
 * @param task - Training task data
 * @returns Evaluation dataset ID
 */
export async function runGenerateEvalDatasetStage(task: RerankTrainTaskSchemaType): Promise<{
  evalDatasetId: string;
}> {
  addLog.info('Run generate eval dataset stage', { taskId: String(task._id) });

  if (task.evalDatasetId) {
    // Exact mode: use the provided eval dataset
    addLog.info('Exact mode: using existing eval dataset', {
      taskId: String(task._id),
      evalDatasetId: task.evalDatasetId
    });
    return { evalDatasetId: task.evalDatasetId };
  }

  // Auto mode: generate eval dataset from datasetIds
  const evalDatasetId = await generateEvalDatasetFromDatasets(task);

  // Write evalDatasetId back to task top-level field
  await MongoRerankTrainTask.updateOne({ _id: task._id }, { evalDatasetId });

  addLog.info('Auto mode: eval dataset generated and written back to task', {
    taskId: String(task._id),
    evalDatasetId
  });

  return { evalDatasetId };
}

import type { EmbeddingTrainTaskSchemaType } from '@fastgpt/global/core/train/embedding/type';
import { EmbeddingTaskCheckpointStageEnum } from '@fastgpt/global/core/train/embedding/constants';
import { MongoEvalDatasetCollection } from '../../../../../core/evaluation/dataset/evalDatasetCollectionSchema';
import { MongoEvalDatasetData } from '../../../../../core/evaluation/dataset/evalDatasetDataSchema';
import {
  EvalDatasetDataCreateFromEnum,
  EvalDatasetDataKeyEnum
} from '@fastgpt/global/core/evaluation/dataset/constants';
import { sampleDataFromDataset, pLimit } from '../../utils';
import { createEmbeddingEnhancedError } from '../../utils';
import {
  EmbeddingTrainErrEnum,
  EmbeddingTrainSuggestionEnum
} from '@fastgpt/global/common/error/code/train';
import { synthesizeEmbeddingEvalData } from '../../external';
import { getDefaultLLMModel } from '../../../../ai/model';
import { addLog } from '../../../../../common/system/log';
import {
  DEFAULT_DITING_CONCURRENCY,
  MAX_DITING_CONCURRENCY,
  DEFAULT_DITING_TIMEOUT,
  MIN_EVAL_QA_COUNT
} from '../../constants';
import { TrainTaskUnrecoverableError, TrainTaskRetriableError } from '../../../common/errors';
import { MongoEmbeddingTrainTask } from '../schema';

/**
 * Generate evaluation dataset using DiTing (auto mode)
 *
 * Key difference from rerank: does NOT perform dataset search.
 * Embedding evaluation only needs expectedContextIds (source data ID),
 * not retrieval_reference_list.
 *
 * Responsibilities:
 * 1. Sample data from task.datasetIds
 * 2. Call DiTing API to generate evaluation QA pairs for each sample
 *    (mock can be enabled via EMBEDDING_DITING_MOCK=true in the external layer)
 * 3. Create evaluation dataset collection
 * 4. Batch insert evaluation data (RetrievalContextsFull = [])
 * 5. Return evaluation dataset ID
 *
 * @param task - Embedding training task instance
 * @returns Evaluation dataset collection ID
 */
async function generateEvalDatasetFromDatasets(
  task: EmbeddingTrainTaskSchemaType
): Promise<string> {
  addLog.info('Run generate eval dataset (auto mode, embedding)', { taskId: String(task._id) });

  if (!task.datasetIds || task.datasetIds.length === 0) {
    const enhancedError = createEmbeddingEnhancedError(
      EmbeddingTaskCheckpointStageEnum.generate_evaldataset,
      EmbeddingTrainErrEnum.embeddingEvalNoDatasetConfigured,
      EmbeddingTrainSuggestionEnum.embeddingEvalNoDatasetConfigured
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
    const enhancedError = createEmbeddingEnhancedError(
      EmbeddingTaskCheckpointStageEnum.generate_evaldataset,
      EmbeddingTrainErrEnum.embeddingEvalNoDataAvailable,
      EmbeddingTrainSuggestionEnum.embeddingEvalNoDataAvailable
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

  // In auto mode, use the default LLM model name directly.
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

        const response = await synthesizeEmbeddingEvalData({
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
          synthesizedAt: new Date(),
          // Embedding: expectedContextIds = [sourceDataId], no retrieval search needed
          expectedContextIds: [sample.dataId]
        };
      })
    )
  );

  const evalDataItems = ditingResults
    .filter((result): result is PromiseFulfilledResult<any> => result.status === 'fulfilled')
    .map((result) => result.value)
    .filter((value) => value !== null);

  if (evalDataItems.length === 0) {
    const enhancedError = createEmbeddingEnhancedError(
      EmbeddingTaskCheckpointStageEnum.generate_evaldataset,
      EmbeddingTrainErrEnum.embeddingEvalDitingGenerationFailed,
      EmbeddingTrainSuggestionEnum.embeddingEvalDitingGenerationFailed
    );
    throw new TrainTaskRetriableError(enhancedError);
  }

  if (evalDataItems.length < MIN_EVAL_QA_COUNT) {
    addLog.warn('Generated eval QA pairs below minimum required count', {
      taskId: String(task._id),
      generatedCount: evalDataItems.length,
      required: MIN_EVAL_QA_COUNT
    });
    const enhancedError = createEmbeddingEnhancedError(
      EmbeddingTaskCheckpointStageEnum.generate_evaldataset,
      EmbeddingTrainErrEnum.embeddingEvalDitingGenerationFailed,
      EmbeddingTrainSuggestionEnum.embeddingEvalDitingGenerationFailed
    );
    throw new TrainTaskRetriableError(enhancedError);
  }

  addLog.info('Generated eval QA pairs using DiTing (embedding, no retrieval search)', {
    taskId: String(task._id),
    generatedCount: evalDataItems.length
  });

  const evalCollectionName = `Eval Dataset - Task ${task._id}`;

  try {
    const [evalCollection] = await MongoEvalDatasetCollection.create([
      {
        teamId: task.teamId,
        tmbId: task.tmbId,
        name: evalCollectionName,
        description: `Embedding Model Evaluation Dataset - Training Task ${task.name}`,
        metadata: {
          taskId: String(task._id),
          taskName: task.name,
          generatedAt: new Date(),
          sampleSize: evalDataItems.length
        }
      }
    ]);

    // Key difference from rerank: RetrievalContextsFull = [] (no dataset search performed)
    const evalDataDocs = evalDataItems.map((item: any) => ({
      teamId: item.teamId,
      tmbId: item.tmbId,
      evalDatasetCollectionId: evalCollection._id,
      [EvalDatasetDataKeyEnum.UserInput]: item.question,
      [EvalDatasetDataKeyEnum.ExpectedOutput]: item.answer,
      [EvalDatasetDataKeyEnum.Context]: [],
      [EvalDatasetDataKeyEnum.RetrievalContext]: [],
      [EvalDatasetDataKeyEnum.RetrievalContextsFull]: [], // embedding 不需要 retrieval 列表
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

    addLog.info('Generated embedding eval dataset', {
      taskId: String(task._id),
      datasetId: String(evalCollection._id),
      dataCount: evalDataDocs.length
    });

    return String(evalCollection._id);
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    const enhancedError = createEmbeddingEnhancedError(
      EmbeddingTaskCheckpointStageEnum.generate_evaldataset,
      EmbeddingTrainErrEnum.embeddingEvalDatabaseSaveFailed,
      EmbeddingTrainSuggestionEnum.embeddingEvalDatabaseSaveFailed,
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
 *   generate QA pairs (mock via EMBEDDING_DITING_MOCK=true), creates eval dataset collection,
 *   writes evalDatasetId back to task.
 *
 * @param task - Embedding training task data
 * @returns Evaluation dataset ID
 */
export async function runGenerateEvalDatasetStage(task: EmbeddingTrainTaskSchemaType): Promise<{
  evalDatasetId: string;
  autoGenerated: boolean;
}> {
  addLog.info('Run generate eval dataset stage (embedding)', { taskId: String(task._id) });

  if (task.evalDatasetId) {
    // Exact mode: use the provided eval dataset
    addLog.info('Exact mode: using existing eval dataset', {
      taskId: String(task._id),
      evalDatasetId: task.evalDatasetId
    });
    return { evalDatasetId: task.evalDatasetId, autoGenerated: false };
  }

  // Auto mode: generate eval dataset from datasetIds
  const evalDatasetId = await generateEvalDatasetFromDatasets(task);

  // Write evalDatasetId back to task top-level field
  await MongoEmbeddingTrainTask.updateOne({ _id: task._id }, { evalDatasetId });

  addLog.info('Auto mode: embedding eval dataset generated and written back to task', {
    taskId: String(task._id),
    evalDatasetId
  });

  return { evalDatasetId, autoGenerated: true };
}

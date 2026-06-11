import * as fs from 'fs';
import * as path from 'path';
import type { RerankTrainTaskSchemaType } from '@fastgpt/global/core/train/rerank/type';
import { RerankTaskCheckpointStageEnum } from '@fastgpt/global/core/train/rerank/constants';
import { MongoDatasetData } from '../../../../../core/dataset/data/schema';
import { getRerankTrainDataDir } from '../../constants';
import { MongoEvalDatasetCollection } from '../../../../../core/evaluation/dataset/evalDatasetCollectionSchema';
import { MongoEvalDatasetData } from '../../../../../core/evaluation/dataset/evalDatasetDataSchema';
import {
  EvalDatasetDataCreateFromEnum,
  EvalDatasetDataKeyEnum
} from '@fastgpt/global/core/evaluation/dataset/constants';
import { sampleDataFromDataset, pLimit, fetchSampledContent } from '../../utils';
import { createRerankEnhancedError } from '../../utils';
import {
  RerankTrainErrEnum,
  RerankTrainSuggestionEnum
} from '@fastgpt/global/common/error/code/train';
import { synthesizeRerankEvalData } from '../../external';
import { getDefaultLLMModel } from '../../../../ai/model';
import { getModelEndpointConfig } from '../../../../ai/config';
import { addLog } from '../../../../../common/system/log';
import { trainEnv } from '../../../common/env';
import { TrainTaskUnrecoverableError, TrainTaskRetriableError } from '../../../common/errors';
import { MongoRerankTrainTask } from '../schema';
import { performDatasetSearch } from '../helpers/dataset-search';

/**
 * Generate evaluation dataset using DiTing (auto mode)
 *
 * Responsibilities:
 * 1. Sample data from task.datasetIds
 * 2. Call DiTing API to generate evaluation QA pairs for each sample
 *    (mock can be enabled via DITING_MOCK_ENABLE=true in the external layer)
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

  const datasetIds = task.datasetIds;

  addLog.info('Using dataset IDs from task', {
    taskId: String(task._id),
    datasetIds
  });

  // Randomly sample from all data for evaluation
  const sampledData = await sampleDataFromDataset(datasetIds, {
    datasetType: 'eval'
  });

  if (sampledData.length === 0) {
    const enhancedError = createRerankEnhancedError(
      RerankTaskCheckpointStageEnum.generate_evaldataset,
      RerankTrainErrEnum.rerankEvalNoDataAvailable,
      RerankTrainSuggestionEnum.rerankEvalNoDataAvailable
    );
    throw new TrainTaskUnrecoverableError(enhancedError);
  }

  // Fetch q/a content for DiTing API calls (sampleDataFromDataset now returns ID-only items)
  const sampledDataWithContent = await fetchSampledContent(sampledData);

  if (sampledDataWithContent.length === 0) {
    const enhancedError = createRerankEnhancedError(
      RerankTaskCheckpointStageEnum.generate_evaldataset,
      RerankTrainErrEnum.rerankEvalNoDataAvailable,
      RerankTrainSuggestionEnum.rerankEvalNoDataAvailable
    );
    throw new TrainTaskUnrecoverableError(enhancedError);
  }

  // Calculate numCases for 1-to-many strategy when sampled data is below minimum
  const numCasesPerSample =
    sampledDataWithContent.length < trainEnv.TRAIN_MIN_EVAL_QA_COUNT
      ? Math.ceil(trainEnv.TRAIN_MIN_EVAL_QA_COUNT / sampledDataWithContent.length)
      : 1;

  addLog.info('Sampled data from datasets', {
    taskId: String(task._id),
    sampleCount: sampledDataWithContent.length,
    numCasesPerSample,
    required: trainEnv.TRAIN_MIN_EVAL_QA_COUNT
  });

  // Resolve full endpoint config for DiTing (model + channel credentials).
  const llm = getDefaultLLMModel();
  const endpointConfig = getModelEndpointConfig(llm);
  const aiModelId = llm?.id || '';

  // Controlled concurrency for DiTing API calls
  const ditingConcurrency = Math.min(
    Math.max(trainEnv.DITING_API_CONCURRENCY, 1),
    trainEnv.DITING_MAX_CONCURRENCY
  );
  addLog.info('DiTing API concurrency configuration', {
    taskId: String(task._id),
    concurrency: ditingConcurrency,
    totalSamples: sampledDataWithContent.length
  });

  const ditingLimit = pLimit(ditingConcurrency);
  const ditingResults = await Promise.allSettled(
    sampledDataWithContent.map((sample) =>
      ditingLimit(async () => {
        const context = [sample.q, sample.a].filter(Boolean);

        const response = await synthesizeRerankEvalData({
          inputData: {
            context,
            numCases: numCasesPerSample
          },
          llm_config: {
            name: endpointConfig.name,
            base_url: endpointConfig.baseUrl,
            api_key: endpointConfig.apiKey,
            timeout: trainEnv.DITING_TIMEOUT / 1000
          }
        });

        if (!response.success || !response.data) {
          addLog.warn('Failed to generate eval QA pairs for sample', {
            taskId: String(task._id),
            sampleDataId: sample.dataId,
            error: response.error
          });
          return null;
        }

        return {
          teamId: task.teamId,
          tmbId: task.tmbId,
          qaPairs: response.data.qaPairs,
          sourceDataId: sample.dataId,
          sourceDatasetId: sample.datasetId,
          synthesizedAt: new Date()
        };
      })
    )
  );

  // Flatten 1-to-many results: each DiTing call returns multiple qaPairs
  const evalDataItems = ditingResults
    .filter((result): result is PromiseFulfilledResult<any> => result.status === 'fulfilled')
    .flatMap((result) => {
      const value = result.value;
      if (!value || !Array.isArray(value.qaPairs)) return [];
      return value.qaPairs.map((qaPair: any) => ({
        teamId: value.teamId,
        tmbId: value.tmbId,
        question: qaPair.question,
        answer: qaPair.answer,
        sourceDataId: value.sourceDataId,
        sourceDatasetId: value.sourceDatasetId,
        synthesizedAt: value.synthesizedAt
      }));
    })
    .filter((value) => value !== null);

  if (evalDataItems.length < trainEnv.TRAIN_MIN_EVAL_QA_COUNT) {
    addLog.warn('Generated eval QA pairs below minimum required count', {
      taskId: String(task._id),
      generatedCount: evalDataItems.length,
      required: trainEnv.TRAIN_MIN_EVAL_QA_COUNT
    });
    const enhancedError = createRerankEnhancedError(
      RerankTaskCheckpointStageEnum.generate_evaldataset,
      RerankTrainErrEnum.rerankEvalDitingGenerationFailed,
      RerankTrainSuggestionEnum.rerankEvalDitingGenerationFailed
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
    Math.max(trainEnv.TRAIN_DATASET_SEARCH_CONCURRENCY, 1),
    trainEnv.DITING_MAX_CONCURRENCY
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
          retrievalContextsFull: retrievalResults.map((r: any) => ({
            id: r.id,
            score: r.score
          })),
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
    const enhancedError = createRerankEnhancedError(
      RerankTaskCheckpointStageEnum.generate_evaldataset,
      RerankTrainErrEnum.rerankEvalDatasetSearchAllFailed,
      RerankTrainSuggestionEnum.rerankEvalDatasetSearchAllFailed,
      `All ${searchResults.length} dataset searches failed or returned empty results`
    );
    throw new TrainTaskRetriableError(enhancedError);
  }

  const evalCollectionName = `Eval Dataset - Task ${task._id}`;

  let evalCollection;
  try {
    [evalCollection] = await MongoEvalDatasetCollection.create([
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
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    const enhancedError = createRerankEnhancedError(
      RerankTaskCheckpointStageEnum.generate_evaldataset,
      RerankTrainErrEnum.rerankEvalDatabaseSaveFailed,
      RerankTrainSuggestionEnum.rerankEvalDatabaseSaveFailed,
      errorMsg
    );
    throw new TrainTaskUnrecoverableError(enhancedError);
  }

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
      intelligentGenerationModelId: aiModelId,
      synthesizedAt: item.synthesizedAt,
      generatedAt: new Date()
    }
  }));

  try {
    await MongoEvalDatasetData.insertMany(evalDataDocs);
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    const enhancedError = createRerankEnhancedError(
      RerankTaskCheckpointStageEnum.generate_evaldataset,
      RerankTrainErrEnum.rerankEvalDatabaseSaveFailed,
      RerankTrainSuggestionEnum.rerankEvalDatabaseSaveFailed,
      errorMsg
    );
    throw new TrainTaskUnrecoverableError(enhancedError);
  }

  addLog.info('Generated eval dataset', {
    taskId: String(task._id),
    datasetId: String(evalCollection._id),
    dataCount: evalDataDocs.length
  });

  return String(evalCollection._id);
}

/**
 * Generate eval dataset JSONL file from saved MongoDB eval data.
 *
 * Reads eval data items, fetches doc text for pos/neg doc IDs,
 * and writes JSONL using streaming to avoid memory overflow.
 *
 * For rerank, RetrievalContextsFull already contains embedding search
 * candidates so no additional search is needed.
 */
async function generateEvalJsonlFromDB(
  evalDatasetCollectionId: string,
  taskId: string
): Promise<{ evalDatasetId: string; evalDatasetFilePath: string }> {
  const evalDataItems = await MongoEvalDatasetData.find({
    evalDatasetCollectionId
  }).lean();

  if (evalDataItems.length === 0) {
    const enhancedError = createRerankEnhancedError(
      RerankTaskCheckpointStageEnum.generate_evaldataset,
      RerankTrainErrEnum.rerankEvalNoDataAvailable,
      RerankTrainSuggestionEnum.rerankEvalNoDataAvailable
    );
    throw new TrainTaskUnrecoverableError(enhancedError);
  }

  // Collect all doc IDs and build item list
  const allDocIds = new Set<string>();
  const items: Array<{ query: string; posIds: string[]; negIds: string[] }> = [];

  for (const item of evalDataItems) {
    const query = ((item as any)[EvalDatasetDataKeyEnum.UserInput] as string) || '';
    const posIds: string[] = (item as any)[EvalDatasetDataKeyEnum.ExpectedContextIds] || [];
    const retrievalFull: Array<{ id: string }> =
      (item as any)[EvalDatasetDataKeyEnum.RetrievalContextsFull] || [];

    const candidateIds = retrievalFull.map((c) => String(c.id));
    const negIds = candidateIds.filter((id) => !posIds.includes(id)).slice(0, 20);

    posIds.forEach((id) => allDocIds.add(id));
    negIds.forEach((id) => allDocIds.add(id));

    items.push({ query, posIds, negIds });
  }

  // Fetch doc text in one batch
  let textMap = new Map<string, string>();
  if (allDocIds.size > 0) {
    const docs = await MongoDatasetData.find({ _id: { $in: [...allDocIds] } }, 'q a').lean();
    for (const doc of docs) {
      textMap.set(String(doc._id), [doc.q, doc.a].filter(Boolean).join('\n'));
    }
  }

  const dataDir = getRerankTrainDataDir();
  const filename = `rerank_eval_${taskId}_${Date.now()}.jsonl`;

  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  const filePath = path.join(dataDir, filename);

  let dataCount = 0;
  const writeStream = fs.createWriteStream(filePath, { encoding: 'utf-8' });
  for (const item of items) {
    writeStream.write(
      JSON.stringify({
        query: item.query,
        pos: item.posIds.map((id) => textMap.get(id) || ''),
        neg: item.negIds.map((id) => textMap.get(id) || ''),
        id: String(dataCount++)
      }) + '\n'
    );
  }
  await new Promise<void>((resolve, reject) => {
    writeStream.end((err: Error | null | undefined) => {
      if (err) reject(err);
      else resolve();
    });
  });

  addLog.info('Generated rerank eval JSONL file from DB', {
    taskId,
    filePath,
    dataCount
  });

  return { evalDatasetId: evalDatasetCollectionId, evalDatasetFilePath: filePath };
}

/**
 * Stage 2: Generate Evaluation Dataset
 *
 * - Exact mode (task.evalDatasetId is non-empty): Reads eval data from MongoDB,
 *   generates JSONL file, returns evalDatasetId and file path.
 * - Auto mode (task.evalDatasetId is empty): Samples from task.datasetIds, calls DiTing to
 *   generate QA pairs (mock via DITING_MOCK_ENABLE=true), creates eval dataset collection,
 *   writes evalDatasetId back to task, generates JSONL file.
 *
 * @param task - Training task data
 * @returns Evaluation dataset ID and JSONL file path
 */
export async function runGenerateEvalDatasetStage(task: RerankTrainTaskSchemaType): Promise<{
  evalDatasetId: string;
  evalDatasetFilePath: string;
  autoGenerated: boolean;
}> {
  addLog.info('Run generate eval dataset stage', { taskId: String(task._id) });

  // Resume from partial checkpoint
  if (task.checkpoint?.data?.generate_evaldataset?.evalDatasetFilePath) {
    return {
      ...task.checkpoint.data.generate_evaldataset,
      autoGenerated: task.checkpoint.data.generate_evaldataset.autoGenerated ?? false
    };
  }

  if (task.evalDatasetId) {
    // Exact mode: use the provided eval dataset
    addLog.info('Exact mode: using existing eval dataset', {
      taskId: String(task._id),
      evalDatasetId: task.evalDatasetId
    });
    const jsonlResult = await generateEvalJsonlFromDB(task.evalDatasetId, String(task._id));
    return { ...jsonlResult, autoGenerated: false };
  }

  // Auto mode: generate eval dataset from datasetIds
  const evalDatasetId = await generateEvalDatasetFromDatasets(task);

  // Write evalDatasetId back to task top-level field
  await MongoRerankTrainTask.updateOne({ _id: task._id }, { evalDatasetId });

  // Generate JSONL from the saved eval data
  const jsonlResult = await generateEvalJsonlFromDB(evalDatasetId, String(task._id));

  addLog.info('Auto mode: eval dataset generated and written back to task', {
    taskId: String(task._id),
    evalDatasetId
  });

  return { ...jsonlResult, autoGenerated: true };
}

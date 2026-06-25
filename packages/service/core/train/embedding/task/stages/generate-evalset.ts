import * as fs from 'fs';
import * as path from 'path';
import type { EmbeddingTrainTaskSchemaType } from '@fastgpt/global/core/train/embedding/type';
import { EmbeddingTaskCheckpointStageEnum } from '@fastgpt/global/core/train/embedding/constants';
import { MongoDatasetData } from '../../../../../core/dataset/data/schema';
import { getEmbeddingTrainDataDir } from '../../constants';
import { dispatchDatasetSearch } from '../../../../../core/workflow/dispatch/dataset/search';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { RerankMethodEnum, DatasetSearchModeEnum } from '@fastgpt/global/core/dataset/constants';
import { DispatchNodeResponseKeyEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import { Types } from 'mongoose';
import { MongoEvalDatasetCollection } from '../../../../../core/evaluation/dataset/evalDatasetCollectionSchema';
import { MongoEvalDatasetData } from '../../../../../core/evaluation/dataset/evalDatasetDataSchema';
import {
  EvalDatasetDataCreateFromEnum,
  EvalDatasetDataKeyEnum
} from '@fastgpt/global/core/evaluation/dataset/constants';
import {
  sampleDataFromDataset,
  pLimit,
  fetchSampledContent,
  propagateAbortFromResults
} from '../../utils';
import { createEmbeddingEnhancedError } from '../../utils';
import {
  EmbeddingTrainErrEnum,
  EmbeddingTrainSuggestionEnum
} from '@fastgpt/global/common/error/code/train';
import { synthesizeEmbeddingEvalData } from '../../external';
import { getDefaultLLMModel } from '../../../../ai/model';
import { getModelEndpointConfig } from '../../../../ai/config';
import { addLog } from '../../../../../common/system/log';
import { trainEnv } from '../../../common/env';
import { getTrainTaskAbortSignal } from '../../../common/task-abort-signal';
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

  const datasetIds = task.datasetIds;

  addLog.info('Using dataset IDs from task', {
    taskId: String(task._id),
    datasetIds
  });

  const sampledData = await sampleDataFromDataset(datasetIds, {
    datasetType: 'eval'
  });

  if (sampledData.length === 0) {
    const enhancedError = createEmbeddingEnhancedError(
      EmbeddingTaskCheckpointStageEnum.generate_evaldataset,
      EmbeddingTrainErrEnum.embeddingEvalNoDataAvailable,
      EmbeddingTrainSuggestionEnum.embeddingEvalNoDataAvailable
    );
    throw new TrainTaskUnrecoverableError(enhancedError);
  }

  // Fetch q/a content for DiTing API calls (sampleDataFromDataset now returns ID-only items)
  const sampledDataWithContent = await fetchSampledContent(sampledData);

  if (sampledDataWithContent.length === 0) {
    const enhancedError = createEmbeddingEnhancedError(
      EmbeddingTaskCheckpointStageEnum.generate_evaldataset,
      EmbeddingTrainErrEnum.embeddingEvalNoDataAvailable,
      EmbeddingTrainSuggestionEnum.embeddingEvalNoDataAvailable
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
        const abortReason = await getTrainTaskAbortSignal({
          type: 'embedding',
          taskId: String(task._id)
        });
        if (abortReason === 'deleted') {
          const enhancedError = createEmbeddingEnhancedError(
            EmbeddingTaskCheckpointStageEnum.generate_evaldataset,
            EmbeddingTrainErrEnum.embeddingTaskNotExist,
            EmbeddingTrainSuggestionEnum.embeddingTaskNotExist
          );
          throw new TrainTaskUnrecoverableError(enhancedError);
        }
        if (abortReason === 'cancelled') {
          const enhancedError = createEmbeddingEnhancedError(
            EmbeddingTaskCheckpointStageEnum.generate_evaldataset,
            EmbeddingTrainErrEnum.embeddingFinetuneCancelled,
            EmbeddingTrainSuggestionEnum.embeddingFinetuneCancelled
          );
          throw new TrainTaskUnrecoverableError(enhancedError);
        }

        const context = [sample.q, sample.a].filter(Boolean);

        const response = await synthesizeEmbeddingEvalData({
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
          synthesizedAt: new Date(),
          // Embedding: expectedContextIds = [sourceDataId], no retrieval search needed
          expectedContextIds: [sample.dataId]
        };
      })
    )
  );

  propagateAbortFromResults(ditingResults);

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
        synthesizedAt: value.synthesizedAt,
        expectedContextIds: value.expectedContextIds
      }));
    })
    .filter((value) => value !== null);

  if (evalDataItems.length < trainEnv.TRAIN_MIN_EVAL_QA_COUNT) {
    addLog.warn('Generated eval QA pairs below minimum required count', {
      taskId: String(task._id),
      generatedCount: evalDataItems.length,
      required: trainEnv.TRAIN_MIN_EVAL_QA_COUNT
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

  let evalCollection;
  try {
    [evalCollection] = await MongoEvalDatasetCollection.create([
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
      intelligentGenerationModelId: aiModelId,
      synthesizedAt: item.synthesizedAt,
      generatedAt: new Date()
    }
  }));

  try {
    await MongoEvalDatasetData.insertMany(evalDataDocs);
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

  addLog.info('Generated embedding eval dataset', {
    taskId: String(task._id),
    datasetId: String(evalCollection._id),
    dataCount: evalDataDocs.length
  });

  return String(evalCollection._id);
}

/**
 * Generate eval dataset JSONL file from saved MongoDB eval data.
 *
 * For embedding, RetrievalContextsFull is typically empty, so we perform
 * a fresh embedding search for each eval item to get candidate IDs.
 * pos = expectedContextIds text, neg = search candidates minus pos.
 */
async function generateEvalJsonlFromDB(
  evalDatasetCollectionId: string,
  datasetIds: string[],
  taskId: string,
  tmbId: string,
  teamId: string
): Promise<{ evalDatasetId: string; evalDatasetFilePath: string }> {
  const evalDataItems = await MongoEvalDatasetData.find({
    evalDatasetCollectionId
  }).lean();

  if (evalDataItems.length === 0) {
    const enhancedError = createEmbeddingEnhancedError(
      EmbeddingTaskCheckpointStageEnum.generate_evaldataset,
      EmbeddingTrainErrEnum.embeddingEvalNoDataAvailable,
      EmbeddingTrainSuggestionEnum.embeddingEvalNoDataAvailable
    );
    throw new TrainTaskUnrecoverableError(enhancedError);
  }

  // Dataset search for each eval item to get candidate IDs
  const searchLimit = pLimit(trainEnv.TRAIN_EVAL_CONCURRENCY);
  const searchResults = await Promise.allSettled(
    evalDataItems.map((item: any) =>
      searchLimit(async () => {
        const abortReason = await getTrainTaskAbortSignal({ type: 'embedding', taskId });
        if (abortReason === 'deleted') {
          const enhancedError = createEmbeddingEnhancedError(
            EmbeddingTaskCheckpointStageEnum.generate_evaldataset,
            EmbeddingTrainErrEnum.embeddingTaskNotExist,
            EmbeddingTrainSuggestionEnum.embeddingTaskNotExist
          );
          throw new TrainTaskUnrecoverableError(enhancedError);
        }
        if (abortReason === 'cancelled') {
          const enhancedError = createEmbeddingEnhancedError(
            EmbeddingTaskCheckpointStageEnum.generate_evaldataset,
            EmbeddingTrainErrEnum.embeddingFinetuneCancelled,
            EmbeddingTrainSuggestionEnum.embeddingFinetuneCancelled
          );
          throw new TrainTaskUnrecoverableError(enhancedError);
        }

        const query = (item[EvalDatasetDataKeyEnum.UserInput] as string) || '';
        const rsp = await dispatchDatasetSearch({
          mode: 'test',
          timezone: 'Asia/Shanghai',
          externalProvider: {},
          uid: tmbId,
          variables: {},
          query: [],
          stream: false,
          maxRunTimes: trainEnv.TRAIN_MAX_SEARCH_RUN_TIMES,
          chatId: '',
          checkIsStopping: () => false,
          workflowDispatchDeep: 0,
          runtimeNodesMap: new Map(),
          usagePush: () => {},
          runningAppInfo: {
            id: new Types.ObjectId().toString(),
            name: 'EvalJsonlSearch',
            teamId,
            tmbId
          },
          runningUserInfo: {
            username: '',
            teamName: '',
            memberName: '',
            contact: '',
            teamId,
            tmbId
          },
          histories: [],
          chatConfig: {},
          node: {
            nodeId: 'ds',
            name: 'DS',
            avatar: '',
            flowNodeType: FlowNodeTypeEnum.datasetSearchNode,
            showStatus: true,
            inputs: [],
            outputs: []
          },
          runtimeNodes: [],
          runtimeEdges: [],
          params: {
            datasets: datasetIds.map((id) => ({ datasetId: id, avatar: '', name: '' })),
            similarity: trainEnv.TRAIN_SEARCH_SIMILARITY,
            limit: trainEnv.TRAIN_SEARCH_LIMIT,
            userChatInput: query,
            searchMode: DatasetSearchModeEnum.embedding,
            embeddingWeight: undefined,
            usingReRank: false,
            rerankModelId: undefined,
            rerankMethod: RerankMethodEnum.question,
            collectionFilterMatch: '',
            datasetSearchUsingExtensionQuery: false,
            datasetSearchExtensionModelId: '',
            datasetSearchExtensionBg: ''
          }
        });
        const nr = (rsp as any)[DispatchNodeResponseKeyEnum.nodeResponse];
        return (nr?.retrievalResults || (rsp as any).data?.quoteQA || []).map((r: any) => r.id);
      })
    )
  );

  propagateAbortFromResults(searchResults);

  // Build pos/neg items
  const allDocIds = new Set<string>();
  const items: Array<{ query: string; posIds: string[]; negIds: string[] }> = [];

  for (let i = 0; i < evalDataItems.length; i++) {
    const item = evalDataItems[i] as any;
    const query = (item[EvalDatasetDataKeyEnum.UserInput] as string) || '';
    const posIds: string[] = item[EvalDatasetDataKeyEnum.ExpectedContextIds] || [];
    const result = searchResults[i];
    let candidateIds: string[] = [];
    if (result.status === 'fulfilled') {
      candidateIds = result.value;
    } else {
      addLog.warn('Eval dataset search failed for item, using empty candidates', {
        taskId,
        index: i,
        query: query.slice(0, 100),
        reason: result.reason?.message || String(result.reason)
      });
    }
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

  const dataDir = getEmbeddingTrainDataDir();
  const filename = `embedding_eval_${taskId}_${Date.now()}.jsonl`;

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

  addLog.info('Generated embedding eval JSONL file from DB', {
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
 *   performs dataset search for candidates, generates JSONL file.
 * - Auto mode (task.evalDatasetId is empty): Samples from task.datasetIds, calls DiTing to
 *   generate QA pairs (mock via EMBEDDING_DITING_MOCK=true), creates eval dataset collection,
 *   writes evalDatasetId back to task, generates JSONL file.
 *
 * @param task - Embedding training task data
 * @returns Evaluation dataset ID and JSONL file path
 */
export async function runGenerateEvalDatasetStage(task: EmbeddingTrainTaskSchemaType): Promise<{
  evalDatasetId: string;
  evalDatasetFilePath: string;
  autoGenerated: boolean;
}> {
  addLog.info('Run generate eval dataset stage (embedding)', { taskId: String(task._id) });

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
    const jsonlResult = await generateEvalJsonlFromDB(
      task.evalDatasetId,
      task.datasetIds,
      String(task._id),
      task.tmbId,
      task.teamId
    );
    return { ...jsonlResult, autoGenerated: false };
  }

  // Auto mode: generate eval dataset from datasetIds
  const evalDatasetId = await generateEvalDatasetFromDatasets(task);

  // Write evalDatasetId back to task top-level field
  await MongoEmbeddingTrainTask.updateOne({ _id: task._id }, { evalDatasetId });

  // Generate JSONL from the saved eval data (with fresh search for candidates)
  const jsonlResult = await generateEvalJsonlFromDB(
    evalDatasetId,
    task.datasetIds,
    String(task._id),
    task.tmbId,
    task.teamId
  );

  addLog.info('Auto mode: embedding eval dataset generated and written back to task', {
    taskId: String(task._id),
    evalDatasetId
  });

  return { ...jsonlResult, autoGenerated: true };
}

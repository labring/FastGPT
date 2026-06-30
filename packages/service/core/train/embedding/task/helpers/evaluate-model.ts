import type { EmbeddingEvalResult } from '@fastgpt/global/core/train/embedding/type';
import type { EmbeddingTaskCheckpointStageEnum } from '@fastgpt/global/core/train/embedding/constants';
import { MongoEvalDatasetData } from '../../../../../core/evaluation/dataset/evalDatasetDataSchema';
import { createEmbeddingEnhancedError } from '../../utils';
import {
  EmbeddingTrainErrEnum,
  EmbeddingTrainSuggestionEnum
} from '@fastgpt/global/common/error/code/train';
import { getEmbeddingModelById } from '../../../../ai/model';
import { addLog } from '../../../../../common/system/log';
import { TrainTaskUnrecoverableError } from '../../../common/errors';
import { getTrainTaskAbortSignal } from '../../../common/task-abort-signal';
import { computeRankingMetrics } from '../../../common/metrics/rankingMetrics';
import { dispatchDatasetSearch } from '../../../../../core/workflow/dispatch/dataset/search';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { RerankMethodEnum, DatasetSearchModeEnum } from '@fastgpt/global/core/dataset/constants';
import { trainEnv } from '../../../common/env';
import { pLimit } from '../../../common/utils';
import { DispatchNodeResponseKeyEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import { Types } from 'mongoose';

const K_VALUES = [5, 10, 15, 20];

/**
 * Evaluate an embedding model on the given evaluation dataset
 *
 * Replaces the previous DiTing-based evaluation.
 * For each query in the eval dataset:
 *   1. Calls dispatchDatasetSearch (embedding-only mode)
 *   2. Extracts the ordered document ID list
 *   3. Computes MRR, NDCG, MAP, Precision@K using computeRankingMetrics
 *
 * @param taskId      - Training task ID (for logging)
 * @param evalDatasetId - Evaluation dataset collection ID
 * @param modelId     - Model ID to evaluate (for config lookup)
 * @param stage       - Checkpoint stage enum, used for error attribution
 * @param teamId      - Team ID for dataset search auth
 * @param tmbId       - Team member ID for dataset search auth
 * @param datasetIds  - Dataset IDs to search against (required, must be non-empty)
 */
export async function evaluateEmbeddingModelHelper(
  taskId: string,
  evalDatasetId: string,
  modelId: string,
  stage: EmbeddingTaskCheckpointStageEnum,
  teamId: string,
  tmbId: string,
  datasetIds: string[]
): Promise<{
  evalResult: EmbeddingEvalResult;
  rankingResults: Array<{ itemId: string; rankedIds: string[] }>;
}> {
  addLog.info('Evaluate embedding model', { taskId, modelId, stage });

  const evalDataItems = await MongoEvalDatasetData.find({
    evalDatasetCollectionId: evalDatasetId
  }).lean();

  if (evalDataItems.length === 0) {
    const enhancedError = createEmbeddingEnhancedError(
      stage,
      EmbeddingTrainErrEnum.embeddingEvalDatasetEmptyBeforeEval,
      EmbeddingTrainSuggestionEnum.embeddingEvalDatasetEmptyBeforeEval
    );
    throw new TrainTaskUnrecoverableError(enhancedError);
  }

  const modelConfig = getEmbeddingModelById(modelId);
  if (!modelConfig) {
    const enhancedError = createEmbeddingEnhancedError(
      stage,
      EmbeddingTrainErrEnum.embeddingEvalModelNotFound,
      EmbeddingTrainSuggestionEnum.embeddingEvalModelNotFound,
      modelId
    );
    throw new TrainTaskUnrecoverableError(enhancedError);
  }

  // Run embedding search for each query and collect the ordered document ID list.
  // Inject modelConfig as vectorModel so dispatchDatasetSearch uses the specified
  // model instead of the dataset's default, enabling base vs tuned model comparison.
  const datasets = datasetIds.map((id) => ({
    datasetId: id,
    avatar: '',
    name: '',
    vectorModel: modelConfig
  }));

  // Run embedding search for each query with bounded concurrency to avoid overwhelming the vector DB
  const limit = pLimit(trainEnv.TRAIN_EVAL_CONCURRENCY);
  const cases = await Promise.all(
    evalDataItems.map((item) =>
      limit(async () => {
        const abortReason = await getTrainTaskAbortSignal({ type: 'embedding', taskId });
        if (abortReason === 'deleted') {
          const enhancedError = createEmbeddingEnhancedError(
            stage,
            EmbeddingTrainErrEnum.embeddingTaskNotExist,
            EmbeddingTrainSuggestionEnum.embeddingTaskNotExist
          );
          throw new TrainTaskUnrecoverableError(enhancedError);
        }
        if (abortReason === 'cancelled') {
          const enhancedError = createEmbeddingEnhancedError(
            stage,
            EmbeddingTrainErrEnum.embeddingFinetuneCancelled,
            EmbeddingTrainSuggestionEnum.embeddingFinetuneCancelled
          );
          throw new TrainTaskUnrecoverableError(enhancedError);
        }

        const query = item.userInput;
        const expectedIds = item.expectedContextIds || [];

        try {
          const searchResponse = await dispatchDatasetSearch({
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
              name: 'EmbeddingTrainEvalSearch',
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
              nodeId: 'dataset_search',
              name: 'Dataset Search',
              avatar: '',
              flowNodeType: FlowNodeTypeEnum.datasetSearchNode,
              showStatus: true,
              inputs: [],
              outputs: []
            },
            runtimeNodes: [],
            runtimeEdges: [],
            params: {
              datasets,
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

          const nodeResponse = (searchResponse as any)[DispatchNodeResponseKeyEnum.nodeResponse];
          const retrievalResults =
            nodeResponse?.retrievalResults || (searchResponse as any).data?.quoteQA || [];
          const rankedIds = retrievalResults.map((r: any) => r.id as string);

          return { rankedIds, expectedIds };
        } catch (err) {
          addLog.warn('Embedding eval search failed for query, treating as no results', {
            taskId,
            query: query?.substring(0, 50),
            error: err instanceof Error ? err.message : String(err)
          });
          return { rankedIds: [], expectedIds };
        }
      })
    )
  );

  const metrics = computeRankingMetrics(cases, K_VALUES, 'embed');

  const rankingResults = evalDataItems.map((item, idx) => ({
    itemId: (item as any)._id.toString(),
    rankedIds: cases[idx].rankedIds
  }));

  addLog.info('Embedding model evaluated', {
    taskId,
    modelId,
    stage,
    mrr10: metrics.detailed_results.embed_top10_mrr,
    ndcg10: metrics.detailed_results.embed_top10_ndcg,
    precision10: metrics.detailed_results.embed_top10_precision
  });

  return {
    evalResult: metrics as EmbeddingEvalResult,
    rankingResults
  };
}

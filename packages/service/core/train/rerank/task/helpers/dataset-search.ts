import type { RerankTrainTaskSchemaType } from '@fastgpt/global/core/train/rerank/type';
import type { RetrievalContextItem } from '@fastgpt/global/core/evaluation/dataset/type';
import { trainEnv } from '../../../common/env';
import { dispatchDatasetSearch } from '../../../../../core/workflow/dispatch/dataset/search';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { RerankMethodEnum, DatasetSearchModeEnum } from '@fastgpt/global/core/dataset/constants';
import { addLog } from '../../../../../common/system/log';
import { DispatchNodeResponseKeyEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import { Types } from 'mongoose';

/**
 * Perform dataset search and retrieve search results
 *
 * Note: This function is exported for unit testing only.
 *
 * For evaluation dataset generation, rerank is NOT used - only embedding search.
 * Uses default search parameters (similarity, limit, searchMode=embedding).
 *
 * @param task - Training task
 * @param datasetIds - List of dataset IDs to search
 * @param query - Query question
 * @returns Array of retrieval context items
 */
export async function performDatasetSearch(
  task: RerankTrainTaskSchemaType,
  datasetIds: string[],
  query: string
): Promise<RetrievalContextItem[]> {
  const datasets = datasetIds.map((id) => ({ datasetId: id, avatar: '', name: '' }));

  addLog.debug('performDatasetSearch - Starting dataset search', {
    taskId: task._id,
    query,
    datasetCount: datasets.length
  });

  const searchResponse = await dispatchDatasetSearch({
    mode: 'test',
    timezone: 'Asia/Shanghai',
    externalProvider: {},
    uid: task.tmbId,
    variables: {},
    query: [],
    stream: false,
    maxRunTimes: trainEnv.TRAIN_MAX_SEARCH_RUN_TIMES,
    chatId: '',
    checkIsStopping: () => false,
    workflowDispatchDeep: 0,

    runningAppInfo: {
      id: new Types.ObjectId().toString(),
      name: 'RerankTrainEvalSearch',
      teamId: task.teamId,
      tmbId: task.tmbId
    },

    runningUserInfo: {
      username: '',
      teamName: '',
      memberName: '',
      contact: '',
      teamId: task.teamId,
      tmbId: task.tmbId
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
    runtimeNodesMap: new Map(),
    runtimeEdges: [],
    usagePush: () => {},

    params: {
      datasets,
      similarity: trainEnv.TRAIN_SEARCH_SIMILARITY,
      limit: trainEnv.TRAIN_SEARCH_LIMIT,
      userChatInput: query,
      searchMode: DatasetSearchModeEnum.embedding,
      embeddingWeight: undefined,
      usingReRank: false,
      rerankModel: undefined,
      rerankMethod: RerankMethodEnum.question,
      collectionFilterMatch: '',
      datasetSearchUsingExtensionQuery: false, // disable for ensuring the retrieval contexts stable
      datasetSearchExtensionModel: '',
      datasetSearchExtensionBg: ''
    }
  } as any);

  // Prefer retrievalResults (top 20 results from retrieval stage, used for Assistant scenarios)
  // Fall back to quoteQA (final top 10 results after filtering)
  const nodeResponse = searchResponse[DispatchNodeResponseKeyEnum.nodeResponse] as any;
  const retrievalResults = nodeResponse?.retrievalResults || searchResponse.data?.quoteQA || [];

  addLog.debug('performDatasetSearch - Search response structure', {
    taskId: task._id,
    hasNodeResponse: !!nodeResponse,
    hasRetrievalResults: !!nodeResponse?.retrievalResults,
    retrievalResultsCount: nodeResponse?.retrievalResults?.length || 0,
    hasQuoteQA: !!searchResponse.data?.quoteQA,
    quoteQACount: searchResponse.data?.quoteQA?.length || 0,
    usedSource: nodeResponse?.retrievalResults ? 'retrievalResults' : 'quoteQA',
    finalResultCount: retrievalResults.length
  });

  if (retrievalResults.length > 0) {
    addLog.debug('performDatasetSearch - First 3 retrieval results sample', {
      taskId: task._id,
      sample: retrievalResults.slice(0, 3).map((item: any, index: number) => ({
        index,
        id: item.id,
        q: item.q?.substring(0, 50) + (item.q?.length > 50 ? '...' : ''),
        a: item.a?.substring(0, 50) + (item.a?.length > 50 ? '...' : ''),
        scoreTypes: item.score?.map((s: any) => s.type) || [],
        retrievalRank: item.retrievalRank
      }))
    });
  }

  return retrievalResults.map((item: any) => ({
    id: item.id,
    q: item.q,
    a: item.a,
    score: item.score
  }));
}

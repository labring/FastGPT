import type { RerankTrainTaskSchemaType } from '@fastgpt/global/core/train/rerank/type';
import type { RetrievalContextItem } from '@fastgpt/global/core/evaluation/dataset/type';
import { extractDatasetIdsFromApp, extractDatasetSearchParamsFromApp } from '../../utils';
import { dispatchDatasetSearch } from '../../../../../core/workflow/dispatch/dataset/search';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { RerankMethodEnum } from '@fastgpt/global/core/dataset/constants';
import type { AppSchema } from '@fastgpt/global/core/app/type';
import { MAX_SEARCH_RUN_TIMES } from '../../constants';
import { addLog } from '../../../../../common/system/log';
import { DispatchNodeResponseKeyEnum } from '@fastgpt/global/core/workflow/runtime/constants';

/**
 * Perform dataset search and retrieve search results
 *
 * Note: This function is exported for unit testing only.
 *
 * For evaluation dataset generation, rerank is NOT used - only embedding search.
 * Reuses app's actual search parameters (similarity, search mode, extension query, etc.).
 *
 * @param task - Training task
 * @param app - Application configuration
 * @param query - Query question
 * @returns Array of retrieval context items
 */
export async function performDatasetSearch(
  task: RerankTrainTaskSchemaType,
  app: AppSchema,
  query: string
): Promise<RetrievalContextItem[]> {
  const datasetIds = extractDatasetIdsFromApp(app);
  const datasets = datasetIds.map((id) => ({ datasetId: id }));

  const searchParams = extractDatasetSearchParamsFromApp(app);

  addLog.debug('performDatasetSearch - Starting dataset search', {
    taskId: task._id,
    appId: task.appId,
    query,
    searchParams,
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
    maxRunTimes: MAX_SEARCH_RUN_TIMES,
    chatId: '',
    checkIsStopping: () => false,
    workflowDispatchDeep: 0,
    mcpClientMemory: {},

    runningAppInfo: {
      id: task.appId,
      name: app.name,
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
    chatConfig: app.chatConfig || {},

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
      datasets: datasets as any,
      similarity: searchParams.similarity,
      limit: searchParams.limit,
      userChatInput: query,
      searchMode: searchParams.searchMode as any,
      embeddingWeight: searchParams.embeddingWeight,
      usingReRank: false,
      rerankModel: undefined,
      rerankMethod: RerankMethodEnum.question,
      collectionFilterMatch: searchParams.collectionFilterMatch || '',
      datasetSearchUsingExtensionQuery: false, // disable for ensuring the retrieval contexts stable
      datasetSearchExtensionModel: '',
      datasetSearchExtensionBg: ''
    }
  });

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

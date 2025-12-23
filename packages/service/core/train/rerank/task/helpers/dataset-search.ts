import type { RerankTrainTaskSchemaType } from '@fastgpt/global/core/train/rerank/type';
import type { RetrievalContextItem } from '@fastgpt/global/core/evaluation/dataset/type';
import { extractDatasetIdsFromApp, extractDatasetSearchParamsFromApp } from '../../utils';
import { dispatchDatasetSearch } from '../../../../../core/workflow/dispatch/dataset/search';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { RerankMethodEnum } from '@fastgpt/global/core/dataset/constants';
import type { AppSchema } from '@fastgpt/global/core/app/type';
import { MAX_SEARCH_RUN_TIMES } from '../../constants';

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

  const searchResponse = await dispatchDatasetSearch({
    mode: 'test',
    timezone: 'Asia/Shanghai',
    externalProvider: {},
    uid: task.tmbId,
    variables: {},
    query: [],
    stream: false,
    maxRunTimes: MAX_SEARCH_RUN_TIMES,

    runningAppInfo: {
      id: task.appId,
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
      rerankMethod: RerankMethodEnum.content,
      collectionFilterMatch: searchParams.collectionFilterMatch || '',
      datasetSearchUsingExtensionQuery: searchParams.datasetSearchUsingExtensionQuery ?? false,
      datasetSearchExtensionModel: searchParams.datasetSearchExtensionModel || '',
      datasetSearchExtensionBg: searchParams.datasetSearchExtensionBg || ''
    }
  });

  const retrievalResults = searchResponse.data?.quoteQA || [];

  return retrievalResults.map((item) => ({
    id: item.id,
    q: item.q,
    a: item.a,
    score: item.score
  }));
}

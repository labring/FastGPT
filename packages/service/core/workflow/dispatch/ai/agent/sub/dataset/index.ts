import type { ChatNodeUsageType } from '@fastgpt/global/support/wallet/bill/type';
import type { DatasetSearchToolConfig } from './utils';
import { dispatchDatasetSearch } from '../../../../dataset/search';
import type { SearchDataResponseItemType } from '@fastgpt/global/core/dataset/type';
import { addLog } from '../../../../../../../common/system/log';
import type { ChatItemType } from '@fastgpt/global/core/chat/type';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';

type DatasetSearchParams = {
  query: string;
  config: DatasetSearchToolConfig;

  teamId: string;
  tmbId: string;
  histories: ChatItemType[];
};

/**
 * 格式化知识库搜索结果为引用文本
 */
const formatDatasetSearchResponse = (searchResults: SearchDataResponseItemType[]): string => {
  if (searchResults.length === 0) {
    return '未找到相关信息。';
  }

  return searchResults
    .map((item, index) => {
      const sourceInfo = item.sourceName ? `[${item.sourceName}]` : `[来源${index + 1}]`;
      const content = `${item.q}\n${item.a || ''}`.trim();
      return `${sourceInfo} ${content}`;
    })
    .join('\n\n');
};

/**
 * 调度知识库搜索
 */
export const dispatchAgentDatasetSearch = async ({
  query,
  config,
  teamId,
  tmbId,
  histories
}: DatasetSearchParams): Promise<{
  response: string;
  usages: ChatNodeUsageType[];
}> => {
  addLog.debug('[Agent Dataset Search] Starting', {
    query,
    datasetCount: config.datasets.length,
    similarity: config.similarity,
    searchMode: config.searchMode
  });

  try {
    // 构造 dispatchDatasetSearch 需要的 props 对象
    const props: any = {
      runningAppInfo: { teamId, tmbId },
      runningUserInfo: { teamId, tmbId },
      histories,
      node: {
        nodeId: 'agent-dataset-search',
        name: '知识库检索',
        flowNodeType: FlowNodeTypeEnum.datasetSearchNode
      },
      runtimeNodes: [],
      runtimeEdges: [],
      query: [{ text: { content: query } }],
      variables: {},
      params: {
        datasets: config.datasets,
        similarity: config.similarity,
        limit: config.maxTokens,
        userChatInput: query,
        searchMode: config.searchMode,
        embeddingWeight: config.embeddingWeight,
        usingReRank: config.usingReRank,
        rerankModel: config.rerankModel,
        rerankWeight: config.rerankWeight,
        datasetSearchUsingExtensionQuery: config.usingExtensionQuery,
        datasetSearchExtensionModel: config.extensionModel,
        datasetSearchExtensionBg: config.extensionBg,
        collectionFilterMatch: config.collectionFilterMatch || '',
        authTmbId: false // Agent 场景下不需要权限验证（已在配置时验证）
      }
    };

    // 调用核心搜索逻辑
    const searchResult = await dispatchDatasetSearch(props);

    // 格式化响应
    const formattedResponse = formatDatasetSearchResponse(searchResult.data.quoteQA || []);

    addLog.info('[Agent Dataset Search] Complete', {
      query,
      resultCount: searchResult.data.quoteQA?.length || 0,
      totalPoints:
        searchResult.nodeDispatchUsages?.reduce(
          (sum: number, u: ChatNodeUsageType) => sum + u.totalPoints,
          0
        ) || 0
    });

    return {
      response: formattedResponse,
      usages: searchResult.nodeDispatchUsages || []
    };
  } catch (error) {
    addLog.error('[Agent Dataset Search] Failed', error);
    throw error;
  }
};

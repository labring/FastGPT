import type { ChatNodeUsageType } from '@fastgpt/global/support/wallet/bill/type';
import type { DatasetSearchToolConfig } from './utils';
import { dispatchDatasetSearch } from '../../../../dataset/search';
import type { SearchDataResponseItemType } from '@fastgpt/global/core/dataset/type';
import { addLog } from '../../../../../../../common/system/log';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { getLLMModel } from '../../../../../../ai/model';
import { createLLMResponse } from '../../../../../../ai/llm/request';
import { countGptMessagesTokens } from '../../../../../../../common/string/tiktoken/index';
import type { ChatCompletionMessageParam } from '@fastgpt/global/core/ai/type';
import { calculateCompressionThresholds } from '../../../../../../ai/llm/compress/constants';
import { GPTMessages2Chats } from '@fastgpt/global/core/chat/adapt';
import { formatModelChars2Points } from '../../../../../../../support/wallet/usage/utils';
import { i18nT } from '../../../../../../../../web/i18n/utils';
import type { SelectedDatasetType } from '@fastgpt/global/core/workflow/type/io';
import type { DatasetSearchModeEnum } from '@fastgpt/global/core/dataset/constants';

type DatasetSearchParams = {
  query: string;
  config: {
    datasets: SelectedDatasetType[];
    similarity: number;
    maxTokens: number;
    searchMode: `${DatasetSearchModeEnum}`;
    embeddingWeight?: number;
    usingReRank: boolean;
    rerankModel?: string;
    rerankWeight?: number;
    usingExtensionQuery: boolean;
    extensionModel?: string;
    extensionBg?: string;
    collectionFilterMatch?: string;
    model: string;
  };

  teamId: string;
  tmbId: string;
  histories: ChatCompletionMessageParam[];
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
 * 调用 LLM 自动选择最相关的分块
 * @returns 选中的分块 ID 列表和 usage
 */
const selectRelevantChunksByLLM = async ({
  query,
  chunks,
  model
}: {
  query: string;
  chunks: SearchDataResponseItemType[];
  model: string;
}): Promise<{
  ids: string[];
  usage?: ChatNodeUsageType;
}> => {
  const chunkSummaries = chunks
    .map((chunk, index) => {
      const source = chunk.sourceName || `来源${index + 1}`;
      const score = chunk.score?.[0]?.value.toFixed(3) || '0';
      const summary = chunk.q.substring(0, 150) + (chunk.q.length > 150 ? '...' : '');

      return `${index + 1}. [ID:${chunk.id}] ${source}\n   相似度: ${score}\n   内容: ${summary}`;
    })
    .join('\n\n');

  const prompt = `用户查询：${query}

以下是从知识库中搜索到的 ${chunks.length} 个相关分块：
${chunkSummaries}

请根据用户查询的相关性，选择最相关的 ${Math.floor(chunks.length / 2)} 个分块。

【重要】输出格式要求：
1. 只返回分块 ID，用方括号包裹，用逗号分隔
2. 格式必须严格为：[id1,id2,id3]
3. 不要添加任何其他文字、标点或解释
4. 不要添加换行符
5. 确保返回的 ID 都在上述列表中存在

示例：[chunk_id_1,chunk_id_2,chunk_id_3]`;

  try {
    const response = await createLLMResponse({
      body: {
        model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0,
        stream: false
      }
    });

    const content = response.answerText || '';
    const ids = content
      .replace(/[\[\]]/g, '')
      .split(/[,，\n]/)
      .map((id: string) => id.trim())
      .filter((id: string) => id && chunks.some((c) => c.id === id));

    // 计算 usage
    const { totalPoints, modelName } = formatModelChars2Points({
      model,
      inputTokens: response.usage.inputTokens,
      outputTokens: response.usage.outputTokens
    });

    const usage: ChatNodeUsageType = {
      totalPoints,
      moduleName: i18nT('account_usage:ai.dataset_chunk_selection'),
      model: modelName,
      inputTokens: response.usage.inputTokens,
      outputTokens: response.usage.outputTokens
    };

    addLog.info('[Agent Dataset Search] Exceeded threshold，AI selected chunks', {
      total: chunks.length,
      selected: ids.length,
      ids,
      usage
    });

    return { ids, usage };
  } catch (error) {
    addLog.error('[Agent Dataset Search] AI selection failed', error);
    return { ids: [] };
  }
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
    const adaptedHistories = GPTMessages2Chats({
      messages: histories,
      reserveTool: false
    });

    const props: any = {
      runningAppInfo: { teamId, tmbId },
      runningUserInfo: { teamId, tmbId },
      histories: adaptedHistories,
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
        authTmbId: false
      }
    };

    const searchResult = await dispatchDatasetSearch(props);
    let results = searchResult.data?.quoteQA || [];

    const modelData = getLLMModel(config.model);
    const threshold = calculateCompressionThresholds(modelData.maxContext).datasetSearchSelection;

    const messages: ChatCompletionMessageParam[] = results.map((item) => ({
      role: 'user',
      content: `[来源:${item.sourceName || '未知'}]\n${item.q}\n${item.a || ''}`
    }));

    const estimatedTokens = await countGptMessagesTokens(messages);

    addLog.debug('[Agent Dataset Search] Token estimation', {
      resultCount: results.length,
      estimatedTokens,
      threshold,
      maxContext: modelData.maxContext
    });

    if (estimatedTokens > threshold && results.length > 0) {
      const { ids: selectedIds, usage: selectionUsage } = await selectRelevantChunksByLLM({
        query,
        chunks: results,
        model: config.model
      });

      if (selectedIds.length > 0) {
        results = results.filter((item) => selectedIds.includes(item.id));
      }

      // 将 AI 分块选择的 usage 添加到总 usage 中
      if (selectionUsage) {
        searchResult.nodeDispatchUsages?.push(selectionUsage);
      }
    }

    const formattedResponse = formatDatasetSearchResponse(results);

    addLog.info('[Agent Dataset Search] Complete', {
      query,
      resultCount: results.length,
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

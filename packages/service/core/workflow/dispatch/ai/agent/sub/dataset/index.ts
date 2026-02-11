import type { ChatNodeUsageType } from '@fastgpt/global/support/wallet/bill/type';
import type { SearchDataResponseItemType } from '@fastgpt/global/core/dataset/type';
import { addLog } from '../../../../../../../common/system/log';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { getEmbeddingModel, getLLMModel, getRerankModel } from '../../../../../../ai/model';
import { createLLMResponse } from '../../../../../../ai/llm/request';
import { countPromptTokens } from '../../../../../../../common/string/tiktoken/index';
import { calculateCompressionThresholds } from '../../../../../../ai/llm/compress/constants';
import { formatModelChars2Points } from '../../../../../../../support/wallet/usage/utils';
import { i18nT } from '../../../../../../../../web/i18n/utils';
import type { SelectedDatasetType } from '@fastgpt/global/core/workflow/type/io';
import { DatasetSearchModeEnum } from '@fastgpt/global/core/dataset/constants';
import { MongoDataset } from '../../../../../../dataset/schema';
import {
  defaultSearchDatasetData,
  type DefaultSearchDatasetDataProps
} from '../../../../../../dataset/search/controller';
import { getErrText } from '@fastgpt/global/common/error/utils';
import type { ChatHistoryItemResType } from '@fastgpt/global/core/chat/type';
import { getNanoid } from '@fastgpt/global/common/string/tools';

type DatasetSearchParams = {
  teamId: string;
  tmbId: string;
  query: string;
  llmModel: string;
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
  };
};

/**
 * 格式化知识库搜索结果为引用文本
 */
const formatDatasetSearchResponse = (searchResults: SearchDataResponseItemType[]): string => {
  if (searchResults.length === 0) {
    return '未找到相关信息。';
  }

  const chunks = searchResults
    .map((item, index) => {
      const sourceName = item.sourceName || `来源${index + 1}`;
      const content = `${item.q}\n${item.a || ''}`.trim();

      return `【知识片段${index + 1}】\nid: ${item.id}\nsource: ${sourceName}\ncontent: ${content}`;
    })
    .join('\n\n');

  return chunks;
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
}): Promise<
  | {
      ids: string[];
      usage: ChatNodeUsageType;
    }
  | undefined
> => {
  const modelData = getLLMModel(model);
  const threshold = calculateCompressionThresholds(modelData.maxContext).datasetSearchSelection;
  const searchResponseText = chunks.map((item) => `${item.q}\n${item.a || ''}`).join('\n');
  const estimatedTokens = await countPromptTokens(searchResponseText);

  // 超过一定阈值才进行裁切
  if (estimatedTokens <= threshold) {
    return;
  }

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
      moduleName: i18nT('account_usage:dataset_chunk_selection'),
      model: modelName,
      inputTokens: response.usage.inputTokens,
      outputTokens: response.usage.outputTokens
    };

    return { ids, usage };
  } catch (error) {
    addLog.error('[Agent Dataset Search] AI selection failed', error);
    return;
  }
};

export const dispatchAgentDatasetSearch = async ({
  query,
  config,
  teamId,
  tmbId,
  llmModel
}: DatasetSearchParams): Promise<{
  response: string;
  usages: ChatNodeUsageType[];
  nodeResponse?: ChatHistoryItemResType;
}> => {
  const startTime = Date.now();
  addLog.debug('[Agent Dataset Search] Starting', {
    query,
    config
  });

  try {
    const datasetIds = await Promise.resolve(config.datasets.map((item) => item.datasetId));

    if (datasetIds.length === 0) {
      return {
        response: 'No dataset selected',
        usages: []
      };
    }

    // Get vector model
    const vectorModel = getEmbeddingModel(
      (await MongoDataset.findById(datasetIds[0], 'vectorModel').lean())?.vectorModel
    );
    // Get Rerank Model
    const rerankModelData = getRerankModel(config.rerankModel);

    const searchData: DefaultSearchDatasetDataProps = {
      histories: [],
      teamId,
      reRankQuery: query,
      queries: [query],
      model: vectorModel.model,
      similarity: config.similarity,
      limit: config.maxTokens,
      datasetIds,
      searchMode: config.searchMode,
      embeddingWeight: config.embeddingWeight,
      usingReRank: config.usingReRank,
      rerankModel: rerankModelData,
      rerankWeight: config.rerankWeight,
      datasetSearchUsingExtensionQuery: config.usingExtensionQuery,
      datasetSearchExtensionModel: config.extensionModel,
      datasetSearchExtensionBg: config.extensionBg
    };
    const {
      searchRes,
      embeddingTokens,
      reRankInputTokens,
      usingSimilarityFilter,
      usingReRank: searchUsingReRank,
      queryExtensionResult
    } = await defaultSearchDatasetData(searchData);

    // count bill results
    const usages: ChatNodeUsageType[] = [];
    let searchResults = searchRes;

    // LLM Pick Chunks (compress search results if too long)
    const pickResults = await selectRelevantChunksByLLM({
      query,
      chunks: searchRes,
      model: llmModel
    });
    if (pickResults) {
      if (pickResults.ids.length > 0) {
        searchResults = searchResults.filter((item) => pickResults.ids.includes(item.id));
      }
      // 将 AI 分块选择的 usage 添加到总 usage 中
      if (pickResults.usage) {
        usages.push(pickResults.usage);
      }
    }
    const formattedResponse = formatDatasetSearchResponse(searchResults);

    // 合并其他的 usages
    {
      // 1. Query extension
      if (queryExtensionResult) {
        const { totalPoints: llmPoints, modelName: llmModelName } = formatModelChars2Points({
          model: queryExtensionResult.llmModel,
          inputTokens: queryExtensionResult.inputTokens,
          outputTokens: queryExtensionResult.outputTokens
        });
        usages.push({
          totalPoints: llmPoints,
          moduleName: i18nT('common:core.module.template.Query extension'),
          model: llmModelName,
          inputTokens: queryExtensionResult.inputTokens,
          outputTokens: queryExtensionResult.outputTokens
        });

        const { totalPoints: embeddingPoints, modelName: embeddingModelName } =
          formatModelChars2Points({
            model: queryExtensionResult.embeddingModel,
            inputTokens: queryExtensionResult.embeddingTokens
          });
        usages.push({
          totalPoints: embeddingPoints,
          moduleName: `${i18nT('account_usage:ai.query_extension_embedding')}`,
          model: embeddingModelName,
          inputTokens: queryExtensionResult.embeddingTokens,
          outputTokens: 0
        });
      }
      // 2. Search vector
      const { totalPoints: embeddingTotalPoints, modelName: embeddingModelName } =
        formatModelChars2Points({
          model: vectorModel.model,
          inputTokens: embeddingTokens
        });
      usages.push({
        totalPoints: embeddingTotalPoints,
        moduleName: i18nT('account_usage:dataset_search'),
        model: embeddingModelName,
        inputTokens: embeddingTokens
      });
      // 3. Rerank
      if (searchUsingReRank) {
        const { totalPoints: reRankTotalPoints, modelName: reRankModelName } =
          formatModelChars2Points({
            model: rerankModelData?.model,
            inputTokens: reRankInputTokens
          });
        usages.push({
          totalPoints: reRankTotalPoints,
          moduleName: i18nT('account_usage:rerank'),
          model: reRankModelName,
          inputTokens: reRankInputTokens
        });
      }
    }
    const totalPoints = usages.reduce((acc, item) => acc + item.totalPoints, 0);

    const id = getNanoid(6);
    const nodeResponse: ChatHistoryItemResType = {
      nodeId: id,
      id: id,
      moduleType: FlowNodeTypeEnum.datasetSearchNode,
      moduleName: i18nT('chat:dataset_search'),
      totalPoints,
      query,
      embeddingModel: vectorModel.name,
      embeddingTokens,
      similarity: usingSimilarityFilter ? config.similarity : undefined,
      limit: config.maxTokens,
      searchMode: config.searchMode,
      embeddingWeight:
        config.searchMode === DatasetSearchModeEnum.mixedRecall
          ? config.embeddingWeight
          : undefined,
      // Rerank
      ...(searchUsingReRank && {
        rerankModel: rerankModelData?.name,
        rerankWeight: config.rerankWeight,
        reRankInputTokens
      }),
      searchUsingReRank,
      queryExtensionResult: queryExtensionResult
        ? {
            model: queryExtensionResult.llmModel,
            inputTokens: queryExtensionResult.inputTokens,
            outputTokens: queryExtensionResult.outputTokens,
            query: queryExtensionResult.query
          }
        : undefined,
      // Results
      quoteList: searchResults,
      runningTime: +((Date.now() - startTime) / 1000).toFixed(2)
    };

    return {
      response: formattedResponse,
      usages: usages,
      nodeResponse
    };
  } catch (error) {
    addLog.error('[Agent Dataset Search] Failed', error);
    return {
      response: `Failed to search dataset: ${getErrText(error)}`,
      usages: []
    };
  }
};

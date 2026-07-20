import type { ChatNodeUsageType } from '@fastgpt/global/support/wallet/bill/type';
import type { SearchDataResponseItemType } from '@fastgpt/global/core/dataset/type';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import {
  getEmbeddingModel,
  getLLMModel,
  getRerankModel,
  getVlmModel,
  assertModelUsable,
  assertModelActive
} from '../../../../../../ai/model/cache';
import { createLLMResponse } from '../../../../../../ai/llm/request';
import { countPromptTokens } from '../../../../../../../common/string/tiktoken/index';
import { calculateCompressionThresholds } from '../../../../../../ai/llm/compress/constants';
import { formatModelChars2Points } from '../../../../../../../support/wallet/usage/utils';
import { i18nT } from '@fastgpt/global/common/i18n/utils';
import { DatasetSearchModeEnum } from '@fastgpt/global/core/dataset/constants';
import { MongoDataset } from '../../../../../../dataset/schema';
import {
  defaultSearchDatasetData,
  type DefaultSearchDatasetDataProps
} from '../../../../../../dataset/search';
import { getErrText } from '@fastgpt/global/common/error/utils';
import { getLogger, LogCategories } from '../../../../../../../common/logger';
import type { DispatchSubAppResponse } from '../../type';
import type { AppFormEditFormType } from '@fastgpt/global/core/app/formEdit/type';
import { DatasetSearchToolSchema } from './utils';
import { parseJsonArgs } from '../../../../../../ai/utils';
import type { OpenaiAccountType } from '@fastgpt/global/support/user/team/type';
import type { ChatHistoryItemResType } from '@fastgpt/global/core/chat/type';
import {
  createImageCaptionChildNodeResponse,
  createChunkSelectionChildNodeResponse,
  createQueryExtensionChildNodeResponse
} from '../../../../dataset/nodeResponse';
import { filterDatasetsByTmbId, getDatasetModelIds } from '../../../../../../dataset/utils';
import { normalizeDatasetSearchInput } from '../../../../dataset/utils';
const logger = getLogger(LogCategories.MODULE.AI.AGENT);

type DatasetSearchParams = {
  teamId: string;
  tmbId: string;
  args: string;
  llmModelId: string;
  userKey?: OpenaiAccountType;
  datasetParams?: AppFormEditFormType['dataset'];
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
  modelId,
  userKey,
  teamId
}: {
  query: string;
  chunks: SearchDataResponseItemType[];
  modelId: string;
  userKey?: OpenaiAccountType;
  teamId: string;
}): Promise<
  | {
      ids: string[];
      usage: ChatNodeUsageType;
      requestId: string;
      seconds: number;
    }
  | undefined
> => {
  const modelData = getLLMModel(modelId);
  // Bail out if model missing or disabled (F2-S3-TC06); caller keeps raw results.
  if (!modelData || modelData.isActive === false) return;
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
    const llmStartTime = Date.now();
    const response = await createLLMResponse({
      userKey,
      teamId,
      modelData: modelData,
      body: {
        messages: [{ role: 'user', content: prompt }],
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
      modelData,
      inputTokens: response.usage.inputTokens,
      outputTokens: response.usage.outputTokens
    });

    const usage: ChatNodeUsageType = {
      totalPoints: response.usage.usedUserOpenAIKey ? 0 : totalPoints,
      moduleName: i18nT('account_usage:dataset_chunk_selection'),
      modelId: modelData.id,
      model: modelName,
      inputTokens: response.usage.inputTokens,
      outputTokens: response.usage.outputTokens
    };
    const seconds = +((Date.now() - llmStartTime) / 1000).toFixed(2);

    return { ids, usage, requestId: response.requestId, seconds };
  } catch (error) {
    getLogger(LogCategories.MODULE.AI.AGENT).error('[Agent Dataset Search] AI selection failed', {
      error
    });
    return;
  }
};

export const dispatchAgentDatasetSearch = async ({
  args,
  datasetParams,
  teamId,
  tmbId,
  llmModelId,
  userKey
}: DatasetSearchParams): Promise<DispatchSubAppResponse> => {
  if (!datasetParams || datasetParams.datasets.length === 0) {
    return {
      response: 'No dataset selected'
    };
  }

  const toolParams = DatasetSearchToolSchema.safeParse(parseJsonArgs(args));
  if (!toolParams.success) {
    return {
      response: toolParams.error.message
    };
  }

  const queries = toolParams.data.query;
  const { textQueries, imageQueries } = normalizeDatasetSearchInput(queries);
  if (textQueries.length === 0 && imageQueries.length === 0) {
    return {
      response: 'Query is empty'
    };
  }
  const query = textQueries.join('\n');

  logger.debug('[Agent Dataset Search] Starting', {
    queries,
    datasetParams
  });

  try {
    const datasetIds = datasetParams.authTmbId
      ? await filterDatasetsByTmbId({
          datasetIds: datasetParams.datasets.map((item) => item.datasetId),
          tmbId
        })
      : datasetParams.datasets.map((item) => item.datasetId);

    if (datasetIds.length === 0) {
      return {
        response: 'No authorized dataset selected'
      };
    }

    // Get vector model
    const dataset = await MongoDataset.findById(
      datasetIds[0],
      'vectorModelId vectorModel vlmModelId vlmModel'
    ).lean();
    // ⚠️ 热升级兼容：legacy-only dataset 回填 canonical 字段（getter 按名解析）
    const datasetModelIds = getDatasetModelIds(dataset ?? {});
    // Existence + active in one guard (F2-S3-TC06).
    const vectorModel = assertModelUsable(
      datasetModelIds.vectorModelId ? getEmbeddingModel(datasetModelIds.vectorModelId) : undefined
    );
    // Get Rerank Model (optional — undefined means no rerank step)
    const rerankModelData = datasetParams.rerankModelId
      ? getRerankModel(datasetParams.rerankModelId)
      : undefined;
    assertModelActive(rerankModelData);

    const searchData: DefaultSearchDatasetDataProps = {
      histories: [],
      teamId,
      textQueries,
      imageQueries,
      vectorModelId: vectorModel.id,
      vlmModelId: datasetModelIds.vlmModelId,
      similarity: datasetParams.similarity ?? 0.4,
      limit: datasetParams.limit || 5000,
      datasetIds,
      searchMode: datasetParams.searchMode,
      embeddingWeight: datasetParams.embeddingWeight,
      usingReRank: datasetParams.usingReRank,
      [NodeInputKeyEnum.datasetSearchRerankModelId]: rerankModelData?.id,
      rerankWeight: datasetParams.rerankWeight ?? 0.5,
      datasetSearchUsingExtensionQuery: datasetParams.datasetSearchUsingExtensionQuery ?? false,
      datasetSearchExtensionModelId: datasetParams.datasetSearchExtensionModelId,
      datasetSearchExtensionBg: datasetParams.datasetSearchExtensionBg,
      userKey
    };
    const {
      searchRes,
      embeddingTokens,
      reRankInputTokens,
      usingSimilarityFilter,
      usingReRank: searchUsingReRank,
      queryExtensionResult,
      imageCaptionResult
    } = await defaultSearchDatasetData(searchData);

    // count bill results
    const usages: ChatNodeUsageType[] = [];
    const childrenResponses: ChatHistoryItemResType[] = [];
    let searchResults = searchRes;

    // 合并其他的 usages
    {
      // 1. Query extension
      if (queryExtensionResult) {
        const { totalPoints, modelName: llmModelName } = formatModelChars2Points({
          modelData: getLLMModel(queryExtensionResult.llmModelId),
          inputTokens: queryExtensionResult.inputTokens,
          outputTokens: queryExtensionResult.outputTokens
        });
        const queryExtensionUsage: ChatNodeUsageType = {
          totalPoints: queryExtensionResult.usedUserOpenAIKey ? 0 : totalPoints,
          moduleName: i18nT('common:core.module.template.Query extension'),
          modelId: queryExtensionResult.llmModelId,
          model: llmModelName,
          inputTokens: queryExtensionResult.inputTokens,
          outputTokens: queryExtensionResult.outputTokens
        };
        usages.push(queryExtensionUsage);
        childrenResponses.push(
          createQueryExtensionChildNodeResponse({
            requestIds: [queryExtensionResult.requestId],
            usage: queryExtensionUsage,
            seconds: queryExtensionResult.seconds,
            query: queryExtensionResult.query
          })
        );

        const { totalPoints: embeddingPoints, modelName: embeddingModelName } =
          formatModelChars2Points({
            modelData: getEmbeddingModel(queryExtensionResult.embeddingModelId),
            inputTokens: queryExtensionResult.embeddingTokens
          });
        usages.push({
          totalPoints: embeddingPoints,
          moduleName: `${i18nT('account_usage:ai.query_extension_embedding')}`,
          modelId: queryExtensionResult.embeddingModelId,
          model: embeddingModelName,
          inputTokens: queryExtensionResult.embeddingTokens,
          outputTokens: 0
        });
      }

      if (imageCaptionResult) {
        const { totalPoints, modelName } = formatModelChars2Points({
          modelData: getVlmModel(imageCaptionResult.vlmModelId),
          inputTokens: imageCaptionResult.inputTokens,
          outputTokens: imageCaptionResult.outputTokens
        });
        const imageCaptionUsage: ChatNodeUsageType = {
          totalPoints: imageCaptionResult.usedUserOpenAIKey ? 0 : totalPoints,
          moduleName: i18nT('account_usage:image_parse'),
          modelId: imageCaptionResult.vlmModelId,
          model: modelName,
          inputTokens: imageCaptionResult.inputTokens,
          outputTokens: imageCaptionResult.outputTokens
        };
        usages.push(imageCaptionUsage);
        childrenResponses.push(
          createImageCaptionChildNodeResponse({
            requestIds: imageCaptionResult.requestIds,
            usage: imageCaptionUsage,
            seconds: imageCaptionResult.seconds,
            queries: imageCaptionResult.queries
          })
        );
      }
    }

    {
      // 2. Search vector
      const { totalPoints: embeddingTotalPoints, modelName: embeddingModelName } =
        formatModelChars2Points({
          modelData: vectorModel,
          inputTokens: embeddingTokens
        });
      usages.push({
        totalPoints: embeddingTotalPoints,
        moduleName: i18nT('account_usage:dataset_search'),
        modelId: vectorModel.id,
        model: embeddingModelName,
        inputTokens: embeddingTokens
      });
      // 3. Rerank
      if (searchUsingReRank && rerankModelData) {
        const { totalPoints: reRankTotalPoints, modelName: reRankModelName } =
          formatModelChars2Points({
            modelData: rerankModelData,
            inputTokens: reRankInputTokens
          });
        usages.push({
          totalPoints: reRankTotalPoints,
          moduleName: i18nT('account_usage:rerank'),
          modelId: rerankModelData.id,
          model: reRankModelName,
          inputTokens: reRankInputTokens
        });
      }
    }

    // LLM Pick Chunks (compress search results if too long)
    const selectionQuery = [query, ...(imageCaptionResult?.queries ?? [])]
      .filter(Boolean)
      .join('\n');
    const pickResults = await selectRelevantChunksByLLM({
      query: selectionQuery,
      chunks: searchRes,
      modelId: llmModelId,
      userKey,
      teamId
    });
    if (pickResults) {
      if (pickResults.ids.length > 0) {
        searchResults = searchResults.filter((item) => pickResults.ids.includes(item.id));
      }
      // 将 AI 分块选择记录为知识库搜索子调用，requestId 跟随 child nodeResponse 展示。
      if (pickResults.usage) {
        usages.push(pickResults.usage);
        childrenResponses.push(
          createChunkSelectionChildNodeResponse({
            requestIds: [pickResults.requestId],
            usage: pickResults.usage,
            seconds: pickResults.seconds,
            selectedChunkIds: pickResults.ids
          })
        );
      }
    }
    const formattedResponse = formatDatasetSearchResponse(searchResults);

    const nodeResponse: DispatchSubAppResponse['nodeResponse'] = {
      moduleType: FlowNodeTypeEnum.datasetSearchNode,
      moduleName: i18nT('chat:dataset_search'),
      datasetQueries: [...textQueries, ...imageQueries],
      embeddingModelId: vectorModel.id,
      embeddingTokens,
      similarity: usingSimilarityFilter ? searchData.similarity : undefined,
      limit: searchData.limit,
      searchMode: searchData.searchMode,
      embeddingWeight:
        searchData.searchMode === DatasetSearchModeEnum.mixedRecall
          ? searchData.embeddingWeight
          : undefined,
      // Rerank
      ...(searchUsingReRank && {
        rerankModelId: rerankModelData?.id,
        rerankWeight: searchData.rerankWeight,
        reRankInputTokens
      }),
      searchUsingReRank,
      ...(childrenResponses.length > 0 ? { childrenResponses } : {}),
      // Results
      quoteList: searchResults
    };

    return {
      response: formattedResponse,
      usages: usages,
      nodeResponse
    };
  } catch (error) {
    logger.error('[Agent Dataset Search] Failed', { error });
    const response = `Failed to search dataset: ${getErrText(error)}`;
    return {
      response,
      errorMessage: response
    };
  }
};

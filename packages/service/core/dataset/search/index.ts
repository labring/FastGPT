import type {
  DeepRagSearchProps,
  DefaultSearchDatasetDataProps,
  SearchDatasetDataResponse
} from './type';
import { getLLMModel } from '../../ai/model';
import { searchDatasetData } from './defaultRecall';
import { datasetSearchQueryExtension } from './utils';

export * from './type';

/**
 * 知识库搜索统一入口。
 *
 * 入口层负责搜索前置编排：文本 query extension、rerank query 生成，以及后续搜索方式分发。
 * 当前只接入默认召回实现，调用方不直接依赖具体 recall 目录。
 */
export const defaultSearchDatasetData = async ({
  datasetSearchUsingExtensionQuery,
  datasetSearchExtensionModel,
  datasetSearchExtensionBg,
  userKey,
  ...props
}: DefaultSearchDatasetDataProps): Promise<SearchDatasetDataResponse> => {
  const textQueries = props.textQueries.map((query) => query.trim()).filter(Boolean);
  const query = textQueries.join('\n');

  const { searchQueries, reRankQuery, aiExtensionResult } = query
    ? await datasetSearchQueryExtension({
        query,
        llmModel: datasetSearchUsingExtensionQuery
          ? getLLMModel(datasetSearchExtensionModel)?.model
          : undefined,
        embeddingModel: props.model,
        extensionBg: datasetSearchExtensionBg,
        histories: props.histories,
        userKey
      })
    : {
        searchQueries: [],
        reRankQuery: query,
        aiExtensionResult: undefined
      };

  const result = await searchDatasetData({
    ...props,
    userKey,
    reRankQuery,
    textQueries: searchQueries
  });

  return {
    ...result,
    queryExtensionResult: aiExtensionResult
      ? {
          llmModel: aiExtensionResult.llmModel,
          requestId: aiExtensionResult.requestId,
          seconds: aiExtensionResult.seconds,
          inputTokens: aiExtensionResult.inputTokens,
          outputTokens: aiExtensionResult.outputTokens,
          usedUserOpenAIKey: aiExtensionResult.usedUserOpenAIKey,
          embeddingModel: aiExtensionResult.embeddingModel,
          embeddingTokens: aiExtensionResult.embeddingTokens,
          query: searchQueries.join('\n')
        }
      : undefined
  };
};

/**
 * Deep RAG 搜索入口由搜索分发层统一暴露，避免具体 recall 实现持有全局 handler 适配。
 */
export const deepRagSearch = (data: DeepRagSearchProps): Promise<SearchDatasetDataResponse> =>
  global.deepRagHandler(data);

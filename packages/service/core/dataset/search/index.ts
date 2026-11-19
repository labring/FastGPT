import type { DefaultSearchDatasetDataProps, SearchDatasetDataResponse } from './type';
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
        llmModel: datasetSearchUsingExtensionQuery ? datasetSearchExtensionModel : undefined,
        embeddingModel: props.model,
        extensionBg: datasetSearchExtensionBg,
        histories: props.histories,
        datasetIds: props.datasetIds,
        userKey,
        teamId: props.teamId
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
    textQueries: searchQueries,
    // S2：同义词装饰只扫「用户原始问题」（props.textQueries 是扩展前的输入），
    // 扩展模型生成的同义词与装饰语义（原词出现在分块或用户问题中）无关。
    rawQueries: [...(props.rawQueries ?? []), ...textQueries]
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

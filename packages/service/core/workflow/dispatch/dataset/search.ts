import {
  type DispatchNodeResponseType,
  type DispatchNodeResultType
} from '@fastgpt/global/core/workflow/runtime/type.d';
import { formatModelChars2Points } from '../../../../support/wallet/usage/utils';
import type { SelectedDatasetType } from '@fastgpt/global/core/workflow/type/io';
import type { SearchDataResponseItemType } from '@fastgpt/global/core/dataset/type';
import type { SqlGenerationResponse , SearchDatasetDataResponse} from '../../../dataset/search/controller';
import type { ModuleDispatchProps } from '@fastgpt/global/core/workflow/runtime/type';
import { getDefaultLLMModel, getEmbeddingModel, getRerankModel } from '../../../ai/model';
import { deepRagSearch, defaultSearchDatasetData, SearchDatabaseData, generateAndExecuteSQL } from '../../../dataset/search/controller';
import type { NodeInputKeyEnum, NodeOutputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { DispatchNodeResponseKeyEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import { DatasetSearchModeEnum, DatasetTypeEnum } from '@fastgpt/global/core/dataset/constants';
import { type ChatNodeUsageType } from '@fastgpt/global/support/wallet/bill/type';
import { MongoDataset } from '../../../dataset/schema';
import { i18nT } from '../../../../../web/i18n/utils';
import { addLog } from '../../../../common/system/log';
import { filterDatasetsByTmbId } from '../../../dataset/utils';
import { ModelTypeEnum } from '@fastgpt/global/core/ai/model';
import { getDatasetSearchToolResponsePrompt } from '../../../../../global/core/ai/prompt/dataset';
import { getNodeErrResponse } from '../utils';

type SqlResultWithDatasetId = SqlGenerationResponse & { datasetId: string };
type DatasetSearchProps = ModuleDispatchProps<{
  [NodeInputKeyEnum.datasetSelectList]: SelectedDatasetType;
  [NodeInputKeyEnum.datasetSimilarity]: number;
  [NodeInputKeyEnum.datasetMaxTokens]: number;
  [NodeInputKeyEnum.userChatInput]?: string;
  [NodeInputKeyEnum.datasetSearchMode]: `${DatasetSearchModeEnum}`;
  [NodeInputKeyEnum.datasetSearchEmbeddingWeight]?: number;

  [NodeInputKeyEnum.datasetSearchUsingReRank]: boolean;
  [NodeInputKeyEnum.datasetSearchRerankModel]?: string;
  [NodeInputKeyEnum.datasetSearchRerankWeight]?: number;

  [NodeInputKeyEnum.collectionFilterMatch]: string;
  [NodeInputKeyEnum.authTmbId]?: boolean;

  [NodeInputKeyEnum.datasetSearchUsingExtensionQuery]: boolean;
  [NodeInputKeyEnum.datasetSearchExtensionModel]: string;
  [NodeInputKeyEnum.datasetSearchExtensionBg]: string;

  [NodeInputKeyEnum.datasetDeepSearch]?: boolean;
  [NodeInputKeyEnum.datasetDeepSearchModel]?: string;
  [NodeInputKeyEnum.datasetDeepSearchMaxTimes]?: number;
  [NodeInputKeyEnum.datasetDeepSearchBg]?: string;
  
  [NodeInputKeyEnum.generateSqlModel]?: string;
}>;
export type DatasetSearchResponse = DispatchNodeResultType<{
  [NodeOutputKeyEnum.datasetQuoteQA]: SearchDataResponseItemType[];
}>;

export async function dispatchDatasetSearch(
  props: DatasetSearchProps
): Promise<DatasetSearchResponse> {
  const {
    runningAppInfo: { teamId },
    runningUserInfo: { tmbId },
    histories,
    node,
    params: {
      datasets = [],
      similarity,
      limit = 5000,
      userChatInput = '',
      authTmbId = false,
      collectionFilterMatch,
      searchMode,
      embeddingWeight,
      usingReRank,
      rerankModel,
      rerankWeight,

      datasetSearchUsingExtensionQuery,
      datasetSearchExtensionModel,
      datasetSearchExtensionBg,
      generateSqlModel,
      datasetDeepSearch,
      datasetDeepSearchModel,
      datasetDeepSearchMaxTimes,
      datasetDeepSearchBg
    }
  } = props as DatasetSearchProps;

  if (!Array.isArray(datasets)) {
    return Promise.reject(i18nT('chat:dataset_quote_type error'));
  }

  if (datasets.length === 0) {
    return getNodeErrResponse({ error: i18nT('common:core.chat.error.Select dataset empty') });
  }

  const emptyResult: DatasetSearchResponse = {
    data: {
      quoteQA: []
    },
    [DispatchNodeResponseKeyEnum.nodeResponse]: {
      totalPoints: 0,
      query: '',
      limit,
      searchMode
    },
    nodeDispatchUsages: [],
    [DispatchNodeResponseKeyEnum.toolResponses]: []
  };

  if (!userChatInput) {
    return emptyResult;
  }

  try {
    const datasetIds = authTmbId
      ? await filterDatasetsByTmbId({
          datasetIds: datasets.map((item) => item.datasetId),
          tmbId
        })
      : await Promise.resolve(datasets.map((item) => item.datasetId));

    if (datasetIds.length === 0) {
      return emptyResult;
    }

    // get vector
    const vectorModel = getEmbeddingModel(
      (await MongoDataset.findById(datasets[0].datasetId, 'vectorModel').lean())?.vectorModel
    );
    // Get Rerank Model
    const rerankModelData = getRerankModel(rerankModel);

    // Check dataset types and separate them
    const datasetDetails = await Promise.all(
      datasetIds.map(id => MongoDataset.findById(id, 'type databaseConfig').lean())
    );

    const databaseDatasetIds = datasetIds.filter((_, index) =>
      datasetDetails[index]?.type === DatasetTypeEnum.database
    );
    const commonDatasetIds = datasetIds.filter((_, index) =>
      datasetDetails[index]?.type !== DatasetTypeEnum.database
    );

    addLog.info('Dataset Search - Dataset Type Separation', {
      totalDatasets: datasetIds.length,
      databaseDatasets: databaseDatasetIds.length,
      commonDatasets: commonDatasetIds.length,
      databaseDatasetIds,
      commonDatasetIds
    });

    // Results from different search types
    let commonSearchResult = null;
    let totalEmbeddingTokens = 0;
    // Handle different response types and merge results
    let searchRes: SearchDataResponseItemType[] = [];
    let embeddingTokens = 0;
    let reRankInputTokens = 0;
    let usingSimilarityFilter = false;
    let searchUsingReRank = false;
    let queryExtensionResult = undefined;
    let deepSearchResult = undefined;
    let sqlResult: SqlResultWithDatasetId[] = [];

    const convertSqlResultsToChunks = (
      sqlResults: SqlGenerationResponse,
      userChatInput: string,
      datasetId: string
    ): SearchDataResponseItemType => {
        return {
          id: `sql_result_${datasetId}`,
          updateTime: new Date(),
          q: userChatInput, // Use the original query as question
          a: sqlResults.answer, // Use the generated answer as content
          chunkIndex: 0,
          datasetId: datasetId,
          collectionId: `sql_collection_${datasetId}`,
          sourceName: 'SQL Query Result',
          sourceId: `sql_${datasetId}`,
          score: [] // Empty score array as requested
        };
    }
    // Database search for database datasets - search each dataset individually and generate SQL
    if (databaseDatasetIds.length > 0) {
      // if ((!generateSqlModel)) return getNodeErrResponse({error: new Error('no Generate-Sql Model Select')});
      // Process each database dataset sequentially
      await Promise.all(datasetIds.map(async (datasetId) => {

        const singleResult = await SearchDatabaseData({
          histories,
          teamId,
          queries: [userChatInput],
          model: vectorModel.model,
          limit,
          datasetIds: [datasetId]
        });
        if (singleResult) {
          addLog.info('Dataset Search - Database Search Result', {
            datasetId,
            tokens: singleResult.tokens,
            schemaTables: Object.keys(singleResult.schema).length
          });
          totalEmbeddingTokens += singleResult.tokens;
          if (Object.keys(singleResult.schema).length > 0) {
            addLog.info('Dataset Search - Generating SQL', {
              datasetId,
              schemaTables: Object.keys(singleResult.schema),
              query: userChatInput
            });

            const singleSqlResult = await generateAndExecuteSQL({
              datasetId,
              query: userChatInput,
              schema: singleResult.schema, 
              teamId,
              limit,
              generate_sql_llm: {model:(generateSqlModel ?? getDefaultLLMModel().name)},
              evaluate_sql_llm: {model:(generateSqlModel ?? getDefaultLLMModel().name)},
            });

            if (singleSqlResult) {
              addLog.info('Dataset Search - SQL Generation Success', {
                datasetId,
                sql: singleSqlResult.sql.substring(0, 100) + '...',
                dataCount: singleSqlResult.sql_res.data.length,
                inputTokens: singleSqlResult.input_tokens,
                outputTokens: singleSqlResult.output_tokens
              });

              // Add to search results as chunks
              searchRes.push(convertSqlResultsToChunks(singleSqlResult, userChatInput, datasetId));

              // Collect for billing and response data
              sqlResult.push({
                ...singleSqlResult,
                datasetId
              } as SqlResultWithDatasetId);
            } else {
              addLog.warn('Dataset Search - SQL Generation Failed', { datasetId });
            }
          } else {
            addLog.warn('Dataset Search - No schema found', { datasetId });
          }
        } else {
          addLog.warn('Dataset Search - Database search failed', { datasetId });
        }
      }));
    }
    if (commonDatasetIds.length > 0) {
      addLog.info('Dataset Search - Starting Common Dataset Search', {
        commonDatasets: commonDatasetIds.length,
        searchMode,
        datasetDeepSearch,
        usingReRank
      });

      const searchData = {
        histories,
        teamId,
        reRankQuery: userChatInput,
        queries: [userChatInput],
        model: vectorModel.model,
        similarity,
        limit,
        datasetIds: commonDatasetIds,
        searchMode,
        embeddingWeight,
        usingReRank,
        rerankModel: rerankModelData,
        rerankWeight,
        collectionFilterMatch
      };

      commonSearchResult = datasetDeepSearch
        ? await deepRagSearch({
            ...searchData,
            datasetDeepSearchModel,
            datasetDeepSearchMaxTimes,
            datasetDeepSearchBg
          })
        : await defaultSearchDatasetData({
            ...searchData,
            datasetSearchUsingExtensionQuery,
            datasetSearchExtensionModel,
            datasetSearchExtensionBg
          });

      addLog.info('Dataset Search - Common Search Completed', {
        searchType: datasetDeepSearch ? 'deep' : 'default',
        hasResults: !!commonSearchResult
      });
    } else {
      addLog.info('Dataset Search - No common datasets to search');
    }

    embeddingTokens += totalEmbeddingTokens;

    addLog.info('Dataset Search - Merging Results', {
      databaseResults: sqlResult.length,
      embeddingTokens,
      totalEmbeddingTokens
    });

    // Handle traditional search results
    if (commonSearchResult) {
      const commonResult = commonSearchResult as SearchDatasetDataResponse;
      // Merge traditional search results with database chunks
      searchRes = [...searchRes, ...commonResult.searchRes];
      embeddingTokens += commonResult.embeddingTokens; // Accumulate embedding tokens
      reRankInputTokens = commonResult.reRankInputTokens;
      usingSimilarityFilter = commonResult.usingSimilarityFilter;
      searchUsingReRank = commonResult.usingReRank;
      queryExtensionResult = commonResult.queryExtensionResult;
      deepSearchResult = commonResult.deepSearchResult;

      addLog.info('Dataset Search - Common Results Merged', {
        commonResultsCount: commonResult.searchRes.length,
        totalSearchResults: searchRes.length,
        embeddingTokens: commonResult.embeddingTokens,
        usingSimilarityFilter: commonResult.usingSimilarityFilter,
        searchUsingReRank: commonResult.usingReRank
      });
    }

    // count bill results
    const nodeDispatchUsages: ChatNodeUsageType[] = [];
    // vector
    const { totalPoints: embeddingTotalPoints, modelName: embeddingModelName } =
      formatModelChars2Points({
        model: vectorModel.model,
        inputTokens: embeddingTokens,
        modelType: ModelTypeEnum.embedding
      });
    nodeDispatchUsages.push({
      totalPoints: embeddingTotalPoints,
      moduleName: node.name,
      model: embeddingModelName,
      inputTokens: embeddingTokens
    });
    // Rerank
    const { totalPoints: reRankTotalPoints, modelName: reRankModelName } = formatModelChars2Points({
      model: rerankModelData?.model,
      inputTokens: reRankInputTokens,
      modelType: ModelTypeEnum.rerank
    });
    if (usingReRank) {
      nodeDispatchUsages.push({
        totalPoints: reRankTotalPoints,
        moduleName: node.name,
        model: reRankModelName,
        inputTokens: reRankInputTokens
      });
    }
    // Query extension
    (() => {
      if (queryExtensionResult) {
        const { totalPoints, modelName } = formatModelChars2Points({
          model: queryExtensionResult.model,
          inputTokens: queryExtensionResult.inputTokens,
          outputTokens: queryExtensionResult.outputTokens,
          modelType: ModelTypeEnum.llm
        });
        nodeDispatchUsages.push({
          totalPoints,
          moduleName: i18nT('common:core.module.template.Query extension'),
          model: modelName,
          inputTokens: queryExtensionResult.inputTokens,
          outputTokens: queryExtensionResult.outputTokens
        });
        return {
          totalPoints
        };
      }
      return {
        totalPoints: 0
      };
    })();
    // Deep search
    (() => {
      if (deepSearchResult) {
        const { totalPoints, modelName } = formatModelChars2Points({
          model: deepSearchResult.model,
          inputTokens: deepSearchResult.inputTokens,
          outputTokens: deepSearchResult.outputTokens,
          modelType: ModelTypeEnum.llm
        });
        nodeDispatchUsages.push({
          totalPoints,
          moduleName: i18nT('common:deep_rag_search'),
          model: modelName,
          inputTokens: deepSearchResult.inputTokens,
          outputTokens: deepSearchResult.outputTokens
        });
        return {
          totalPoints
        };
      }
      return {
        totalPoints: 0
      };
    })();

    // SQL Generation (for database datasets)
    (() => {
      if (sqlResult.length > 0) {
        let totalSqlPoints = 0;
        sqlResult.forEach((result, index) => {
          const { totalPoints, modelName } = formatModelChars2Points({
            model: vectorModel.model, // Use the same model as vector search
            inputTokens: result.input_tokens,
            outputTokens: result.output_tokens,
            modelType: ModelTypeEnum.llm
          });
          nodeDispatchUsages.push({
            totalPoints,
            moduleName: i18nT('common:database_search'),
            model: modelName,
            inputTokens: result.input_tokens,
            outputTokens: result.output_tokens
          });
          totalSqlPoints += totalPoints;
        });
        return {
          totalPoints: totalSqlPoints
        };
      }
      return {
        totalPoints: 0
      };
    })();
    const totalPoints = nodeDispatchUsages.reduce((acc, item) => acc + item.totalPoints, 0);
    
    addLog.debug('Dataset Search - Final Statistics', {
      totalSearchResults: searchRes.length,
      totalPoints,
      totalEmbeddingTokens: embeddingTokens,
      totalSqlResults: sqlResult.length,
      nodeDispatchUsagesCount: nodeDispatchUsages.length
    });

    const responseData: DispatchNodeResponseType & { totalPoints: number } = {
      totalPoints,
      query: userChatInput,
      embeddingModel: vectorModel.name,
      embeddingTokens,
      similarity: usingSimilarityFilter ? similarity : undefined,
      limit,
      searchMode,
      embeddingWeight:
        searchMode === DatasetSearchModeEnum.mixedRecall ? embeddingWeight : undefined,
      // Rerank
      ...(searchUsingReRank && {
        rerankModel: rerankModelData?.name,
        rerankWeight: rerankWeight,
        reRankInputTokens
      }),
      // SQL Result (for database datasets) - use first result or create summary
      ...(sqlResult.length > 0 && {
        sqlResult: sqlResult.length === 1 ? {
          sql: sqlResult[0].sql,
          data: sqlResult[0].sql_res.data,
          columns: sqlResult[0].sql_res.columns,
          answer: sqlResult[0].answer
        } : {
          sql: sqlResult.map(r => r.sql).join('; '),
          data: sqlResult.flatMap(r => r.sql_res.data),
          columns: sqlResult[0].sql_res.columns,
          answer: sqlResult.map(r => r.answer).join('\n\n')
        }
      }),
      searchUsingReRank,
      // Results
      quoteList: searchRes,
      queryExtensionResult,
      deepSearchResult
    };

    return {
      data: {
        quoteQA: searchRes
      },
      [DispatchNodeResponseKeyEnum.nodeResponse]: responseData,
      nodeDispatchUsages,
      [DispatchNodeResponseKeyEnum.toolResponses]: {
        prompt: getDatasetSearchToolResponsePrompt(),
        cites: searchRes.map((item: SearchDataResponseItemType) => ({
          id: item.id,
          sourceName: item.sourceName,
          updateTime: item.updateTime,
          content: `${item.q}\n${item.a}`.trim()
        }))
      }
    };
  } catch (error) {
    return getNodeErrResponse({ error });
  }
}

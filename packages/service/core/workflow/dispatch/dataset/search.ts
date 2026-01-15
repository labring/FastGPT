import {
  type DispatchNodeResponseType,
  type DispatchNodeResultType
} from '@fastgpt/global/core/workflow/runtime/type.d';
import { formatModelChars2Points } from '../../../../support/wallet/usage/utils';
import type { SelectedDatasetType } from '@fastgpt/global/core/workflow/type/io';
import type { SearchDataResponseItemType } from '@fastgpt/global/core/dataset/type';
import type {
  SearchCorrectionDataProps,
  SearchCorrectionDataResult
} from '@fastgpt/global/core/chat/correction/type';
import { SearchScoreTypeEnum } from '@fastgpt/global/core/dataset/constants';
import { Types } from '../../../../common/mongo';
import { MongoChatCorrection } from '../../../chat/correction/schema';
import { getVectorsByText } from '../../../ai/embedding';
import { recallFromVectorStore } from '../../../../common/vectorDB/controller';
import type { SearchDatasetDataResponse } from '../../../dataset/search/controller';
import type {
  SqlGenerationResponse,
  SqlResultWithDatasetId
} from '@fastgpt/global/core/dataset/database/api';
import type { ModuleDispatchProps } from '@fastgpt/global/core/workflow/runtime/type';
import { getEmbeddingModel, getLLMModel, getRerankModel } from '../../../ai/model';
import {
  deepRagSearch,
  defaultSearchDatasetData,
  SearchDatabaseData,
  generateAndExecuteSQL
} from '../../../dataset/search/controller';
import {
  getMetadataWithValueExamples,
  queryByNL
} from '../../../dataset/database/dative/client/dativeApiServer';
import { calculateDynamicLimit } from '../../../dataset/search/utils';
import type { NodeInputKeyEnum, NodeOutputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { DispatchNodeResponseKeyEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import {
  DatasetSearchModeEnum,
  DatasetTypeEnum,
  RerankMethodEnum
} from '@fastgpt/global/core/dataset/constants';
import { type ChatNodeUsageType } from '@fastgpt/global/support/wallet/bill/type';
import { MongoDataset } from '../../../dataset/schema';
import { i18nT } from '../../../../../web/i18n/utils';
import { addLog } from '../../../../common/system/log';
import { filterDatasetsByTmbId } from '../../../dataset/utils';
import { ModelTypeEnum } from '@fastgpt/global/core/ai/model';
import { getDatasetSearchToolResponsePrompt } from '../../../../../global/core/ai/prompt/dataset';
import { getNodeErrResponse } from '../utils';
import { getDuckDBStoreConfig } from '../../../dataset/database/dative/utils';
import { MongoApp } from '../../../app/schema';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import type { VariableItemType } from '@fastgpt/global/core/app/type';

/**
 * 从全局变量中获取 faqAnswerMode 配置
 * faqAnswerMode 定义在 chatConfig.variables 中，需要通过 label 找到对应的 key，再从 variables 中获取值
 */
function getFaqAnswerMode(
  variableDefinitions: VariableItemType[] | undefined,
  variableValues: Record<string, any> | undefined
): 'quote' | 'llm-summary' | undefined {
  if (!variableDefinitions || !variableValues) return undefined;

  const faqAnswerModeVar = variableDefinitions.find((v) => v.label === 'faqAnswerMode');
  if (!faqAnswerModeVar) return undefined;

  const value = variableValues[faqAnswerModeVar.key];
  if (value === 'quote' || value === 'llm-summary') {
    return value;
  }
  return undefined;
}

type DatasetSearchProps = ModuleDispatchProps<{
  [NodeInputKeyEnum.datasetSelectList]: SelectedDatasetType;
  [NodeInputKeyEnum.datasetSimilarity]: number;
  [NodeInputKeyEnum.datasetMaxTokens]: number;
  [NodeInputKeyEnum.userChatInput]?: string;
  [NodeInputKeyEnum.datasetSearchMode]: `${DatasetSearchModeEnum}`;
  [NodeInputKeyEnum.datasetSearchEmbeddingWeight]?: number;

  [NodeInputKeyEnum.datasetSearchUsingReRank]: boolean;
  [NodeInputKeyEnum.datasetSearchRerankModel]?: string;
  [NodeInputKeyEnum.datasetSearchRerankMethod]: RerankMethodEnum;
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
    runningAppInfo,
    runningUserInfo: { tmbId },
    histories,
    chatConfig,
    variables,
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
      rerankMethod = RerankMethodEnum.content,
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

  const { teamId, id: appId } = runningAppInfo;

  // 获取应用类型，判断是否为智能客服
  const app = await MongoApp.findById(appId).select('type').lean();
  const isAssistant = app?.type === AppTypeEnum.assistant;

  // 获取 faqAnswerMode 配置
  // const faqAnswerMode = chatConfig?.faqAnswerMode; 这样是undefined
  const faqAnswerMode = getFaqAnswerMode(chatConfig?.variables, variables);
  // 获取所有知识库ID（用于同义词检索）
  const datasetIds = datasets.map((d) => d.datasetId);

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
    const useVectorModelDataset = datasets.find(
      (d) => d.datasetType !== DatasetTypeEnum.structureDocument
    );
    // get vector
    const vectorModel = useVectorModelDataset
      ? getEmbeddingModel(
          (await MongoDataset.findById(useVectorModelDataset?.datasetId, 'vectorModel').lean())
            ?.vectorModel
        )
      : undefined;
    // Get Rerank Model
    const rerankModelData = getRerankModel(rerankModel);

    // Check dataset types and separate them
    const datasetDetails = await Promise.all(
      datasetIds.map((id) => MongoDataset.findById(id, 'type databaseConfig').lean())
    );

    const databaseDatasetIds = datasetIds.filter(
      (_, index) =>
        datasetDetails[index]?.type === DatasetTypeEnum.database ||
        datasetDetails[index]?.type === DatasetTypeEnum.structureDocument
    );
    const commonDatasetIds = datasetIds.filter(
      (_, index) =>
        datasetDetails[index]?.type !== DatasetTypeEnum.database &&
        datasetDetails[index]?.type !== DatasetTypeEnum.structureDocument
    );

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
    let correctionData:
      | { correctionId: string; correctedAnswer: string; question: string; similarity: number }
      | undefined = undefined;
    let faqAnswer: string | undefined = undefined; // FAQ 匹配成功时的答案
    let rerankTime: number | undefined = undefined; // 新增：重排耗时（仅assistant场景）
    let retrievalTime: number | undefined = undefined; // 新增：检索总耗时（仅assistant场景）
    let sqlRetrievalTime: number | undefined = undefined; // 新增：SQL数据库检索耗时（仅assistant场景）
    let retrievalResults: SearchDataResponseItemType[] | undefined = undefined; // 新增：检索结果（仅assistant场景）
    let retrievalType: 'correction' | 'faq' | undefined = undefined; // 新增：检索类型（仅correction/faq命中时有值）
    let sqlChunks: SearchDataResponseItemType[] = []; // 新增：SQL检索结果转换的chunks（仅assistant场景）

    const convertSqlResultsToChunks = async (
      singleSQLResult: SqlGenerationResponse,
      datasetId: string
    ): Promise<SearchDataResponseItemType> => {
      const sourceName =
        (await MongoDataset.findById(datasetId, 'name')
          .lean()
          ?.then((doc) => doc?.name)) || 'Unknown Dataset';
      const uuid = `sql_quote_${datasetId}`;
      return {
        id: uuid,
        updateTime: new Date(),
        q: singleSQLResult.answer, // Use the original query as question
        a: singleSQLResult.sql, // Use the generated answer as content
        chunkIndex: 0,
        datasetId: datasetId,
        collectionId: '',
        sourceName: sourceName,
        sourceId: uuid,
        score: [] // Empty score array as requested
      };
    };
    // Database search for database datasets - search each dataset individually and generate SQL
    if (databaseDatasetIds.length > 0) {
      // 新增：SQL数据库检索开始计时（仅assistant场景）
      const sqlRetrievalStartTime = isAssistant ? Date.now() : undefined;

      const sqlLLM = getLLMModel(generateSqlModel);
      // Calculate dynamic limit based on generateSqlModel's maxContext
      const dynamicLimit = calculateDynamicLimit({
        generateSqlModel: sqlLLM.name,
        safetyFactor: 0.6,
        estimatedTokensPerItem: 1024 // Assume each item may consume around 1000 tokens after formatting
      });

      addLog.debug('Dataset Search - Using dynamic limit for database search', {
        generateSqlModel: sqlLLM.name,
        calculatedLimit: dynamicLimit
      });

      // Process each database/structure dataset sequentially
      await Promise.all(
        databaseDatasetIds.map(async (datasetId) => {
          const datasetDetail = datasetDetails.find((d) => String(d?._id) === datasetId);
          const datasetType = datasetDetail?.type;

          // Common SQL generation config
          const key = sqlLLM.requestAuth || undefined;
          const url = sqlLLM.requestUrl?.replace(/(chat\/completions.*)$/, '') || undefined;

          let singleSqlResult: SqlGenerationResponse | null = null;

          // Handle different dataset types
          if (datasetType === DatasetTypeEnum.database) {
            // Database type: vector search + SQL generation
            const singleResult = await SearchDatabaseData({
              histories,
              teamId,
              queries: [userChatInput],
              model: vectorModel!.model,
              limit: dynamicLimit,
              datasetIds: [datasetId]
            });

            if (singleResult) {
              totalEmbeddingTokens += singleResult.tokens;
              if (Object.keys(singleResult.schema).length > 0) {
                singleSqlResult = await generateAndExecuteSQL({
                  datasetId,
                  query: userChatInput,
                  schema: singleResult.schema,
                  teamId,
                  limit,
                  generate_sql_llm: {
                    model: sqlLLM.model,
                    api_key: key,
                    base_url: url
                  },
                  evaluate_sql_llm: {
                    model: sqlLLM.model,
                    api_key: key,
                    base_url: url
                  }
                });
              } else {
                addLog.warn('Dataset Search - No schema found', { datasetId });
              }
            } else {
              addLog.warn('Dataset Search - Database search failed', { datasetId });
            }
          } else if (datasetType === DatasetTypeEnum.structureDocument) {
            // Structure document type: get metadata + SQL generation
            try {
              const metadata = await getMetadataWithValueExamples(getDuckDBStoreConfig(datasetId));

              if (metadata.tables && metadata.tables.length > 0) {
                singleSqlResult = await queryByNL({
                  source_config: getDuckDBStoreConfig(datasetId),
                  generate_sql_llm: {
                    model: sqlLLM.model,
                    api_key: key,
                    base_url: url
                  },
                  evaluate_sql_llm: {
                    model: sqlLLM.model,
                    api_key: key,
                    base_url: url
                  },
                  query: userChatInput,
                  result_num_limit: 50,
                  retrieved_metadata: metadata
                });
              } else {
                addLog.warn('Dataset Search - No table metadata found', { datasetId });
              }
            } catch (error) {
              addLog.error('Dataset Search - Structure document search failed', {
                datasetId,
                error: error instanceof Error ? error.message : String(error)
              });
            }
          }

          // Collect SQL result
          if (singleSqlResult) {
            // Collect for billing and response data
            sqlResult.push({
              ...singleSqlResult,
              datasetId
            } as SqlResultWithDatasetId);
            // convertSqlResultsToChunks
            const sqlChunk = await convertSqlResultsToChunks(singleSqlResult, datasetId);
            searchRes.push(sqlChunk);
            // 仅assistant场景保存SQL检索结果到sqlChunks
            if (isAssistant) {
              sqlChunks.push(sqlChunk);
            }
          } else {
            addLog.warn('Dataset Search - SQL Generation Failed', { datasetId, datasetType });
          }
        })
      );

      // 新增：SQL数据库检索结束计时（仅assistant场景）
      if (isAssistant && sqlRetrievalStartTime !== undefined) {
        sqlRetrievalTime = +((Date.now() - sqlRetrievalStartTime) / 1000).toFixed(2);
        addLog.debug('Dataset Search - SQL Retrieval Time', { sqlRetrievalTime });
      }
    }
    if (commonDatasetIds.length > 0) {
      const searchData = {
        histories,
        teamId,
        reRankQuery: userChatInput,
        queries: [userChatInput],
        model: vectorModel!.model,
        similarity,
        limit,
        datasetIds: commonDatasetIds,
        searchMode,
        embeddingWeight,
        usingReRank,
        rerankModel: rerankModelData,
        rerankMethod,
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
            datasetSearchExtensionBg,
            isAssistant,
            datasetIds: datasetIds,
            appId, // 传递 appId 用于校正数据检索
            faqAnswerMode // 传递 faqAnswerMode 用于 FAQ 检索判断
          });
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
      // 提取校正数据信息
      correctionData = commonResult.correctionData;
      // 新增：提取重排耗时
      rerankTime = commonResult.rerankTime;
      // 新增：提取检索总耗时
      retrievalTime = commonResult.retrievalTime;
      // 新增：提取检索结果（仅assistant场景）
      retrievalResults = commonResult.retrievalResults;
      // 新增：提取检索类型（仅correction/faq命中时有值）
      retrievalType = commonResult.retrievalType;
      // 提取 FAQ 数据信息
      if (commonResult.isFaqResult && commonResult.searchRes.length > 0) {
        faqAnswer = commonResult.searchRes[0].a;
      }
    }

    // 合并SQL检索结果到retrievalResults（仅assistant场景）
    if (isAssistant && sqlChunks.length > 0) {
      retrievalResults = [...sqlChunks, ...(retrievalResults || [])];
      addLog.debug('Dataset Search - SQL chunks merged to retrievalResults', {
        sqlChunksCount: sqlChunks.length,
        totalRetrievalResults: retrievalResults.length
      });
    }

    // count bill results
    const nodeDispatchUsages: ChatNodeUsageType[] = [];
    // vector
    if (vectorModel) {
      const { totalPoints: embeddingTotalPoints, modelName: embeddingModelName } =
        formatModelChars2Points({
          model: vectorModel!.name,
          inputTokens: embeddingTokens,
          modelType: ModelTypeEnum.embedding
        });
      nodeDispatchUsages.push({
        totalPoints: embeddingTotalPoints,
        moduleName: node.name,
        model: embeddingModelName,
        inputTokens: embeddingTokens
      });
    }
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
        sqlResult.forEach((result) => {
          const { totalPoints, modelName } = formatModelChars2Points({
            model: generateSqlModel!,
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
    // 校正数据处理已移到 defaultSearchDatasetData 中，在问题优化之后执行

    const totalPoints = nodeDispatchUsages.reduce((acc, item) => acc + item.totalPoints, 0);

    addLog.debug('Dataset Search - Final Statistics', {
      totalSearchResults: searchRes.length,
      totalPoints,
      totalEmbeddingTokens: embeddingTokens,
      totalSqlResults: sqlResult.length,
      nodeDispatchUsagesCount: nodeDispatchUsages.length
    });

    // Debug日志：输出检索结果完整内容
    addLog.debug('Dataset Search - Retrieved Results Detail', {
      totalResults: searchRes.length,
      sqlResultsCount: sqlResult.length,
      commonResultsCount: commonSearchResult
        ? (commonSearchResult as SearchDatasetDataResponse).searchRes.length
        : 0,
      retrievalResultsCount: retrievalResults?.length,
      results: searchRes.map((item, index) => ({
        index,
        id: item.id,
        datasetId: item.datasetId,
        sourceName: item.sourceName,
        q: item.q,
        a: item.a,
        score:
          item.score?.map((s) => ({
            type: s.type,
            value: s.value,
            index: s.index
          })) || []
      }))
    });

    const responseData: DispatchNodeResponseType & { totalPoints: number } = {
      totalPoints,
      query: userChatInput,
      embeddingModel: vectorModel?.name,
      embeddingTokens,
      similarity: usingSimilarityFilter ? similarity : undefined,
      limit,
      searchMode,
      embeddingWeight:
        searchMode === DatasetSearchModeEnum.mixedRecall ? embeddingWeight : undefined,
      // Rerank
      ...(searchUsingReRank && {
        rerankModel: rerankModelData?.name,
        rerankMethod: rerankMethod,
        rerankWeight: rerankWeight,
        reRankInputTokens
      }),
      // SQL Result (for database datasets) - use first result or create summary
      sqlResult: sqlResult,
      searchUsingReRank,
      // Results
      quoteList: searchRes,
      queryExtensionResult,
      deepSearchResult,
      // 新增：重排耗时（仅assistant场景）
      ...(rerankTime !== undefined && { rerankTime }),
      // 新增：检索总耗时（仅assistant场景）
      ...(retrievalTime !== undefined && { retrievalTime }),
      // 新增：SQL数据库检索耗时（仅assistant场景）
      ...(sqlRetrievalTime !== undefined && { sqlRetrievalTime }),
      // 新增：检索结果（仅assistant场景）
      ...(isAssistant && retrievalResults && { retrievalResults }),
      // 新增：检索类型（仅correction/faq命中时有值）
      ...(retrievalType && { retrievalType }),
      // 校正数据搜索结果
      ...(correctionData && {
        correctSearchResult: [
          {
            correctionId: correctionData.correctionId,
            question: correctionData.question,
            correctedAnswer: correctionData.correctedAnswer,
            similarity: correctionData.similarity
          }
        ]
      })
    };

    return {
      data: {
        quoteQA: searchRes
      },
      [DispatchNodeResponseKeyEnum.nodeResponse]: responseData,
      ...((correctionData || faqAnswer) && {
        [DispatchNodeResponseKeyEnum.newVariables]: {
          // 设置全局变量 correct_mapping_answer
          ...(correctionData && { hTRJXdb1: correctionData.correctedAnswer }),
          // 设置全局变量 faqAnswer
          ...(faqAnswer && { udQRlgfO: faqAnswer })
        }
      }),
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

/**
 * 搜索校正数据
 * 从 chat_corrections 表中查找与用户输入相似度高的历史校正数据
 */
export async function searchCorrectionData({
  appId,
  userChatInput,
  teamId,
  vectorModel
}: SearchCorrectionDataProps): Promise<SearchCorrectionDataResult> {
  try {
    addLog.debug('Correction Search - Starting', {
      appId,
      userChatInput
    });

    // 步骤1&2：查询该应用下所有包含问题向量的校正数据，并在数据库层面过滤数组
    type CorrectionAggregateResult = {
      _id: string;
      chatId: string;
      dataId: string;
      updateTime: Date;
      correctionData: {
        question: string;
        correctedAnswer?: string;
        indexs: Array<{ type: 'q'; dataId: string }>;
      };
    };

    const corrections = await MongoChatCorrection.aggregate<CorrectionAggregateResult>([
      {
        $match: {
          appId: new Types.ObjectId(appId),
          'correctionData.indexs': {
            $elemMatch: { type: 'q' }
          }
        }
      },
      {
        $project: {
          _id: 1,
          chatId: 1,
          dataId: 1,
          updateTime: 1,
          'correctionData.question': 1,
          'correctionData.correctedAnswer': 1,
          'correctionData.indexs': {
            $filter: {
              input: '$correctionData.indexs',
              as: 'idx',
              cond: { $eq: ['$$idx.type', 'q'] }
            }
          }
        }
      }
    ]);

    if (!corrections.length) {
      addLog.debug('Correction Search - No corrections found', { appId });
      return null;
    }

    // 提取问题向量ID（已在数据库层面过滤好，只包含 type='q' 的数据）
    const questionVectorIds = corrections.flatMap((correction) => {
      const indexs = correction.correctionData?.indexs || [];
      return indexs.map((idx) => ({
        vectorId: idx.dataId,
        correctionId: String(correction._id),
        question: correction.correctionData.question,
        correctedAnswer: correction.correctionData.correctedAnswer,
        chatId: correction.chatId,
        dataId: correction.dataId,
        updateTime: correction.updateTime
      }));
    });

    if (!questionVectorIds.length) {
      addLog.debug('Correction Search - No question vectors found', { appId });
      return null;
    }

    // 步骤3：向量相似度计算
    // 生成用户查询向量（复用现有的 getVectorsByText 函数）
    const {
      vectors: [userQueryVector],
      tokens: embeddingTokens
    } = await getVectorsByText({
      model: vectorModel,
      input: userChatInput
    });

    // 步骤4：使用现有的向量相似度计算
    // 从向量存储中检索与用户查询最相似的问题向量
    // 校正数据的dataset_id存储的是app_id
    // 扩大搜索范围以处理多个相似度相同的情况
    const correctionSearchLimit = 10;
    const { results: vectorSearchResults } = await recallFromVectorStore({
      teamId,
      datasetIds: [appId], // 使用appId查询校正数据
      vector: userQueryVector,
      limit: correctionSearchLimit,
      forbidCollectionIdList: []
    });

    // 检查是否有搜索结果
    if (vectorSearchResults.length === 0) {
      addLog.debug('Correction Search - No similarity match found', {
        appId,
        threshold: global.systemEnv?.correctionSimilarityThreshold ?? 0.95,
        totalVectors: questionVectorIds.length
      });
      return null;
    }

    // 获取最高相似度分数
    const topScore = vectorSearchResults[0].score;

    // 找出所有相似度等于最高分的结果
    const topScoreResults = vectorSearchResults.filter((r) => r.score === topScore);

    // 将向量结果与校正数据信息关联，并按更新时间排序
    const matchedCorrections = topScoreResults
      .map((vectorResult) => {
        const correctionInfo = questionVectorIds.find((item) => item.vectorId === vectorResult.id);
        return correctionInfo ? { ...correctionInfo, similarity: vectorResult.score } : null;
      })
      .filter((item): item is NonNullable<typeof item> => item !== null)
      // 按更新时间降序排序，取最新的
      .sort((a, b) => new Date(b.updateTime).getTime() - new Date(a.updateTime).getTime());

    if (matchedCorrections.length === 0) {
      addLog.debug('Correction Search - No correction data found for vectors', {
        appId,
        topScore,
        matchCount: topScoreResults.length,
        threshold: global.systemEnv?.correctionSimilarityThreshold ?? 0.95,
        totalVectors: questionVectorIds.length
      });
      return null;
    }

    // 取更新时间最新的校正数据
    const correctionInfo = matchedCorrections[0];

    const result = {
      correctionId: correctionInfo.correctionId,
      correctedAnswer: correctionInfo.correctedAnswer,
      question: correctionInfo.question,
      similarity: correctionInfo.similarity,
      chatId: correctionInfo.chatId,
      dataId: correctionInfo.dataId,
      embeddingTokens: embeddingTokens || 0 // 使用实际的向量生成token数量
    };

    addLog.debug('Correction Search - Result found', {
      appId,
      similarity: result.similarity,
      correctionId: result.correctionId,
      updateTime: correctionInfo.updateTime,
      matchedCount: matchedCorrections.length,
      matched: true
    });

    return result;
  } catch (error) {
    addLog.error('Correction Search - Error', {
      appId,
      error: error instanceof Error ? error.message : String(error)
    });
    return null;
  }
}

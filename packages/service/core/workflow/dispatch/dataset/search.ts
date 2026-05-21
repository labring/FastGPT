import { type DispatchNodeResultType } from '@fastgpt/global/core/workflow/runtime/type';
import { formatModelChars2Points } from '../../../../support/wallet/usage/utils';
import type { SelectedDatasetType } from '@fastgpt/global/core/workflow/type/io';
import type { SearchDataResponseItemType } from '@fastgpt/global/core/dataset/type';
import type {
  SearchCorrectionDataProps,
  SearchCorrectionDataResult
} from '@fastgpt/global/core/chat/correction/type';
import {
  SearchScoreTypeEnum,
  DatasetRetrievalModeEnum
} from '@fastgpt/global/core/dataset/constants';
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
  generateAndExecuteSQL,
  searchFAQData
} from '../../../dataset/search/controller';
import { agenticSearchDispatch } from '../../../dataset/search/agenticSearch';
import {
  getMetadataWithValueExamples,
  queryByNL
} from '../../../dataset/database/dative/client/dativeApiServer';
import {
  calculateDynamicLimit,
  datasetSearchQueryExtension,
  getDatasetSqlResultLimit,
  getSynonymMappings,
  standardizeQuery
} from '../../../dataset/search/utils';
import type { NodeInputKeyEnum, NodeOutputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { DispatchNodeResponseKeyEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import {
  DatasetSearchModeEnum,
  DatasetTypeEnum,
  RerankMethodEnum
} from '@fastgpt/global/core/dataset/constants';
import { type ChatNodeUsageType } from '@fastgpt/global/support/wallet/bill/type';
import { MongoDataset } from '../../../dataset/schema';
import { MongoDatasetCollection } from '../../../dataset/collection/schema';
import { i18nT } from '../../../../../global/common/i18n/utils';
import { addLog } from '../../../../common/system/log';
import { filterDatasetsByTmbId } from '../../../dataset/utils';
import { getDatasetSearchToolResponsePrompt } from '@fastgpt/global/core/ai/prompt/dataset.const';
import { getNodeErrResponse } from '../utils';
import { getDuckDBStoreConfig } from '../../../dataset/database/dative/utils';
import { MongoApp } from '../../../app/schema';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { detectLang } from 'diting-rag-ts';
import type { VariableItemType } from '@fastgpt/global/core/app/type';
import { ChatItemValueTypeEnum } from '@fastgpt/global/core/chat/constants';

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
  [NodeInputKeyEnum.datasetSelectList]: SelectedDatasetType[];
  [NodeInputKeyEnum.datasetSimilarity]: number;
  [NodeInputKeyEnum.datasetMaxTokens]: number;
  [NodeInputKeyEnum.userChatInput]?: string;
  [NodeInputKeyEnum.datasetSearchMode]: DatasetSearchModeEnum;
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

  // 检索模式（单轮/多轮）
  [NodeInputKeyEnum.datasetRetrievalMode]?: `${DatasetRetrievalModeEnum}`;
  // 多轮智能检索配置
  [NodeInputKeyEnum.datasetAgenticSearchLLMModel]?: string;
  [NodeInputKeyEnum.datasetAgenticSearchRerankModel]?: string;
  [NodeInputKeyEnum.datasetAgenticSearchReasoning]?: boolean;
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
    workflowStreamResponse,
    lang,
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

      // 检索模式（单轮/多轮）
      retrievalMode = DatasetRetrievalModeEnum.standard,
      // 多轮智能检索配置
      agenticSearchLLMModel,
      agenticSearchRerankModel,
      agenticSearchReasoning = true,

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

  // API 请求时 lang 可能未设置，通过 detectLang 检测 queryLanguage 兜底
  const queryLanguage = detectLang(userChatInput);

  if (!Array.isArray(datasets)) {
    return Promise.reject(i18nT('chat:dataset_quote_type error'));
  }

  if (datasets.length === 0) {
    return getNodeErrResponse({ error: i18nT('common:core.chat.error.Select dataset empty') });
  }

  const { teamId, id: appId } = runningAppInfo;

  // 获取应用类型，判断是否为智能问答(assistant)
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
    // Get vector model for database type search (SearchDatabaseData uses this)
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
    let rerankError:
      | {
          errorMessage: Record<string, any>;
          i18nErrorMessage: string;
          i18nErrorMessageData: { modelName: string };
        }
      | undefined = undefined; // 新增：Reranker 错误信息（仅 reranker 报错时有值）
    let agenticSearchResult: SearchDatasetDataResponse['agenticSearchResult'] = undefined; // 新增：agentic 检索的过程信息（仅 agentic 路径有值）

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

          // Check if dataset has any collections (tables/files) before proceeding
          const collectionCount = await MongoDatasetCollection.countDocuments({
            teamId,
            datasetId,
            forbid: { $ne: true }
          });

          if (collectionCount === 0) {
            addLog.warn('Dataset Search - No collections found, skipping', {
              datasetId,
              datasetType
            });
            return; // Skip this dataset
          }

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
                  limit: getDatasetSqlResultLimit(),
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
                addLog.warn('Dataset Search - No schema found, skipping SQL generation', {
                  datasetId
                });
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
                  result_num_limit: getDatasetSqlResultLimit(),
                  retrieved_metadata: metadata
                });
              } else {
                addLog.warn('Dataset Search - No table metadata found, skipping SQL generation', {
                  datasetId
                });
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
            // Filter out empty answer or sql
            if (singleSqlResult.answer) {
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
              addLog.warn('Dataset Search - SQL result has empty answer or sql', {
                datasetId,
                datasetType,
                hasAnswer: !!singleSqlResult.answer,
                hasSql: !!singleSqlResult.sql
              });
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
      // ===== 提前执行指代消解（仅 isAssistant + extensionQuery 场景）=====
      // 目的：
      //   1. 为 FAQ/Correction 提供经过指代消解 + 同义词标准化的 query，提升命中率
      //   2. 将结果下传给 defaultSearchDatasetData（standard 路径），避免重复 LLM 调用
      // 触发条件：isAssistant && 开启问题改写 && 有 LLM 模型 && 有向量模型
      let preComputedQueryExtension:
        | Awaited<ReturnType<typeof datasetSearchQueryExtension>>
        | undefined = undefined;
      if (
        isAssistant &&
        datasetSearchUsingExtensionQuery &&
        datasetSearchExtensionModel &&
        vectorModel
      ) {
        preComputedQueryExtension = await datasetSearchQueryExtension({
          query: userChatInput,
          llmModel: getLLMModel(datasetSearchExtensionModel).model,
          embeddingModel: vectorModel.model,
          extensionBg: datasetSearchExtensionBg,
          histories,
          isAssistant: true,
          teamId,
          datasetIds: commonDatasetIds,
          lang: lang ?? queryLanguage
        });
      }

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
        collectionFilterMatch,
        lang: lang ?? queryLanguage
      };

      // ===== App 级别：校正数据 & FAQ 优先检索 =====
      // 在路由到 agentic/standard 之前检查，确保两条路径都受到保护
      if (isAssistant && vectorModel) {
        const corrFaqStartTime = Date.now();

        // 优先使用预计算的指代消解结果（含同义词标准化）；
        // 降级到本地同义词标准化（extensionQuery=false 或 LLM 不可用时）
        let embedInputs: string[];
        let corrFaqQueryExtensionResult: typeof preComputedQueryExtension | undefined =
          preComputedQueryExtension;
        if (preComputedQueryExtension?.aiExtensionResult?.synonymRewriteResult?.standardizedQuery) {
          const resolved =
            preComputedQueryExtension.aiExtensionResult.synonymRewriteResult.standardizedQuery;
          embedInputs = resolved !== userChatInput ? [userChatInput, resolved] : [userChatInput];
        } else {
          // 降级：仅做同义词标准化
          const { synonymDict } = await getSynonymMappings({
            teamId,
            datasetIds: commonDatasetIds,
            query: userChatInput
          });
          const corrFaqQuery = standardizeQuery(userChatInput, synonymDict);
          embedInputs =
            corrFaqQuery !== userChatInput ? [userChatInput, corrFaqQuery] : [userChatInput];
          corrFaqQueryExtensionResult = undefined; // 降级场景无预计算结果
        }

        // 同时生成原始 query 和消解/标准化 query 的向量，两个都用于检索
        // 避免改写覆盖掉原始语义，取相似度最高的命中结果
        const { vectors: queryVectors, tokens: corrFaqTokens } = await getVectorsByText({
          model: vectorModel,
          input: embedInputs,
          type: 'query',
          useInstruction: false
        });

        // === 校正数据优先检索 ===
        if (appId) {
          // 对每个向量分别检索，取相似度最高的命中结果
          const correctionResults = await Promise.all(
            queryVectors.map((vec) =>
              searchCorrectionData({
                appId,
                queryVector: vec,
                embeddingTokens: corrFaqTokens,
                teamId
              })
            )
          );
          const correctionResult = correctionResults
            .filter(Boolean)
            .sort((a, b) => (b?.similarity ?? 0) - (a?.similarity ?? 0))[0];

          const correctionThreshold = global.systemEnv?.correctionSimilarityThreshold ?? 0.95;
          addLog.debug('Assistant Config - correctionSimilarityThreshold', {
            correctionThreshold
          });

          if (
            correctionResult &&
            correctionResult.similarity > correctionThreshold &&
            correctionResult.correctedAnswer
          ) {
            const retrievalTimeVal = +((Date.now() - corrFaqStartTime) / 1000).toFixed(2);
            const correctionChunk: SearchDataResponseItemType = {
              id: `correction_quote_${correctionResult.correctionId}`,
              updateTime: new Date(),
              q: correctionResult.question,
              a: correctionResult.correctedAnswer,
              chunkIndex: 0,
              datasetId: appId,
              collectionId: `correction_quote_${correctionResult.correctionId}`,
              sourceName: 'Correction Data',
              sourceId: correctionResult.correctionId,
              score: [
                {
                  type: SearchScoreTypeEnum.embedding,
                  value: correctionResult.similarity,
                  index: 0
                }
              ]
            };
            commonSearchResult = {
              searchRes: [correctionChunk],
              embeddingTokens: corrFaqTokens,
              reRankInputTokens: 0,
              searchMode: DatasetSearchModeEnum.embedding,
              limit,
              similarity: correctionResult.similarity,
              usingReRank: false,
              usingSimilarityFilter: true,
              retrievalTime: retrievalTimeVal,
              retrievalType: 'correction' as const,
              correctionData: {
                correctionId: correctionResult.correctionId,
                correctedAnswer: correctionResult.correctedAnswer,
                question: correctionResult.question,
                similarity: correctionResult.similarity
              },
              queryExtensionResult: corrFaqQueryExtensionResult?.aiExtensionResult
                ? {
                    llmModel: corrFaqQueryExtensionResult.aiExtensionResult.llmModel,
                    embeddingModel: corrFaqQueryExtensionResult.aiExtensionResult.embeddingModel,
                    inputTokens: corrFaqQueryExtensionResult.aiExtensionResult.inputTokens,
                    outputTokens: corrFaqQueryExtensionResult.aiExtensionResult.outputTokens,
                    embeddingTokens: corrFaqQueryExtensionResult.aiExtensionResult.embeddingTokens,
                    query: corrFaqQueryExtensionResult.queriesForStorage || undefined,
                    synonymRewriteResult:
                      corrFaqQueryExtensionResult.aiExtensionResult.synonymRewriteResult,
                    rewriteTime: corrFaqQueryExtensionResult.rewriteTime
                  }
                : undefined
            };
          }
        }

        // === FAQ 优先检索（仅当 correction 未命中且 faqAnswerMode === 'quote' 时）===
        if (!commonSearchResult && faqAnswerMode === 'quote') {
          // 对每个向量分别检索，取得分最高的命中结果
          const faqResults = await Promise.all(
            queryVectors.map((vec) =>
              searchFAQData({
                teamId,
                datasetIds: commonDatasetIds,
                queryVector: vec,
                embeddingTokens: corrFaqTokens
              })
            )
          );
          const faqResult = faqResults
            .filter(Boolean)
            .sort((a, b) => (b?.score?.[0]?.value ?? 0) - (a?.score?.[0]?.value ?? 0))[0];

          if (faqResult) {
            const retrievalTimeVal = +((Date.now() - corrFaqStartTime) / 1000).toFixed(2);
            addLog.debug('FAQ Search - Match found and returning', {
              teamId,
              dataId: faqResult.id,
              similarity: faqResult.score?.[0]?.value
            });
            commonSearchResult = {
              searchRes: [faqResult],
              embeddingTokens: corrFaqTokens,
              reRankInputTokens: 0,
              searchMode: DatasetSearchModeEnum.embedding,
              limit,
              similarity: faqResult.score?.[0]?.value || 0.95,
              usingReRank: false,
              usingSimilarityFilter: true,
              isFaqResult: true,
              retrievalTime: retrievalTimeVal,
              retrievalType: 'faq' as const,
              queryExtensionResult: corrFaqQueryExtensionResult?.aiExtensionResult
                ? {
                    llmModel: corrFaqQueryExtensionResult.aiExtensionResult.llmModel,
                    embeddingModel: corrFaqQueryExtensionResult.aiExtensionResult.embeddingModel,
                    inputTokens: corrFaqQueryExtensionResult.aiExtensionResult.inputTokens,
                    outputTokens: corrFaqQueryExtensionResult.aiExtensionResult.outputTokens,
                    embeddingTokens: corrFaqQueryExtensionResult.aiExtensionResult.embeddingTokens,
                    query: corrFaqQueryExtensionResult.queriesForStorage || undefined,
                    synonymRewriteResult:
                      corrFaqQueryExtensionResult.aiExtensionResult.synonymRewriteResult,
                    rewriteTime: corrFaqQueryExtensionResult.rewriteTime
                  }
                : undefined
            };
          }
        }
      }

      // 检索模式路由（correction/FAQ 未命中时才执行）
      if (!commonSearchResult) {
        if (retrievalMode === DatasetRetrievalModeEnum.agentic) {
          // 多轮智能检索路径
          // 将 FastGPT 预计算的指代消解结果和查询变体传给 agenticSearchDispatch
          // agenticSearchDispatch 内部再以通用接口透传给 diting-rag-ts，保持库的独立性
          //
          // 选 coreferenceResolved 而非 standardizedQuery 作为 preResolvedQuery：
          //   - coreferenceResolved 已完成"代词/省略 → 实体"的展开（如"它" → "产品名称"），
          //     语义最完整，适合作为 Agent 检索的主查询；
          //   - standardizedQuery 仅做同义词归一化，未解决指代歧义。
          const preResolvedQuery =
            preComputedQueryExtension?.aiExtensionResult?.synonymRewriteResult?.coreferenceResolved;
          const preComputedQueries = preComputedQueryExtension?.aiExtensionResult?.extensionQueries;

          commonSearchResult = await agenticSearchDispatch({
            ...searchData,
            agenticSearchLLMModel,
            agenticSearchRerankModel,
            agenticSearchReasoning,
            workflowStreamResponse,
            queryLanguage,
            // 预计算结果：只在有值时传入，避免空值覆盖 diting-rag-ts 内部逻辑
            ...(preResolvedQuery ? { preResolvedQuery } : {}),
            ...(preComputedQueries?.length ? { preComputedQueries } : {}),
            // 将 SQL 检索结果作为前置上下文传给 agent，使其能参考结构化数据后决定是否补充检索
            ...(searchRes.length > 0 ? { preSearchRes: searchRes } : {})
          });
        } else if (datasetDeepSearch) {
          commonSearchResult = await deepRagSearch({
            ...searchData,
            datasetDeepSearchModel,
            datasetDeepSearchMaxTimes,
            datasetDeepSearchBg
          });
        } else {
          if (commonDatasetIds.length > 0) {
            // Group common datasets by their vectorModel (user-selected per dataset in node)
            type ModelGroup = { vectorModelId: string; datasetIds: string[] };
            const modelGroupMap = new Map<string, ModelGroup>();
            const needsDbLookupIds: string[] = [];

            for (const d of datasets) {
              if (!commonDatasetIds.includes(d.datasetId)) continue;
              const modelId = d.vectorModel?.model;
              if (modelId) {
                if (!modelGroupMap.has(modelId)) {
                  modelGroupMap.set(modelId, { vectorModelId: modelId, datasetIds: [] });
                }
                modelGroupMap.get(modelId)!.datasetIds.push(d.datasetId);
              } else {
                needsDbLookupIds.push(d.datasetId);
              }
            }

            // Fall back to DB lookup for datasets without vectorModel in SelectedDatasetType (backward compat)
            if (needsDbLookupIds.length > 0) {
              const dbModels = await Promise.all(
                needsDbLookupIds.map((id) => MongoDataset.findById(id, 'vectorModel').lean())
              );
              for (let i = 0; i < needsDbLookupIds.length; i++) {
                const dsId = needsDbLookupIds[i];
                const modelId = getEmbeddingModel(dbModels[i]?.vectorModel).model;
                if (!modelGroupMap.has(modelId)) {
                  modelGroupMap.set(modelId, { vectorModelId: modelId, datasetIds: [] });
                }
                modelGroupMap.get(modelId)!.datasetIds.push(dsId);
              }
            }

            addLog.debug('Dataset Search - Model grouping completed', {
              totalDatasetIds: commonDatasetIds.length,
              groupCount: modelGroupMap.size,
              groups: [...modelGroupMap.entries()].map(([modelId, group]) => ({
                vectorModelId: modelId,
                datasetCount: group.datasetIds.length,
                datasetIds: group.datasetIds
              }))
            });

            // Parallel search per model group, collect results with model info for billing
            const groupSearchResults = await Promise.all(
              [...modelGroupMap.values()].map(async (group) => {
                const groupSearchData = {
                  histories,
                  teamId,
                  reRankQuery: userChatInput,
                  queries: [userChatInput],
                  model: group.vectorModelId,
                  similarity,
                  limit,
                  datasetIds: group.datasetIds,
                  searchMode,
                  embeddingWeight,
                  usingReRank,
                  rerankModel: rerankModelData,
                  rerankMethod,
                  rerankWeight,
                  collectionFilterMatch,
                  lang: lang ?? queryLanguage
                };

                const result = await defaultSearchDatasetData({
                  ...groupSearchData,
                  datasetSearchUsingExtensionQuery,
                  datasetSearchExtensionModel,
                  datasetSearchExtensionBg,
                  isAssistant,
                  synonymDatasetIds: datasetIds, // 所有知识库 ID，用于同义词检索；向量检索使用 groupSearchData.datasetIds（分组 ID）
                  appId,
                  faqAnswerMode,
                  lang: lang ?? queryLanguage,
                  // 传入预计算结果，defaultSearchDatasetData 内部将跳过重复的 LLM 调用
                  preComputedQueryExtension
                });

                addLog.debug('Dataset Search - Model group search completed', {
                  vectorModelId: group.vectorModelId,
                  datasetIds: group.datasetIds,
                  resultCount: result.searchRes.length,
                  embeddingTokens: result.embeddingTokens,
                  reRankInputTokens: result.reRankInputTokens,
                  usingReRank: result.usingReRank
                });

                return { result, vectorModelId: group.vectorModelId };
              })
            );

            if (groupSearchResults.length > 0) {
              // Merge searchRes from all groups, sorted by RRF score descending
              const mergedSearchRes = groupSearchResults
                .flatMap((g) => g.result.searchRes)
                .sort((a, b) => {
                  const aRrf = a.score.find((s) => s.type === SearchScoreTypeEnum.rrf)?.value ?? 0;
                  const bRrf = b.score.find((s) => s.type === SearchScoreTypeEnum.rrf)?.value ?? 0;
                  return bRrf - aRrf;
                });

              // Use first group's result as base for metadata fields
              const baseResult = groupSearchResults[0].result as SearchDatasetDataResponse;
              commonSearchResult = {
                ...baseResult,
                searchRes: mergedSearchRes,
                embeddingTokens: groupSearchResults.reduce(
                  (s, g) => s + g.result.embeddingTokens,
                  0
                ),
                reRankInputTokens: groupSearchResults.reduce(
                  (s, g) => s + g.result.reRankInputTokens,
                  0
                )
              };

              addLog.debug('Dataset Search - Results merged from multiple models', {
                groupCount: groupSearchResults.length,
                totalSearchResults: mergedSearchRes.length,
                totalEmbeddingTokens: commonSearchResult.embeddingTokens,
                totalReRankTokens: commonSearchResult.reRankInputTokens,
                groups: groupSearchResults.map((g) => ({
                  vectorModelId: g.vectorModelId,
                  resultCount: g.result.searchRes.length,
                  embeddingTokens: g.result.embeddingTokens,
                  reRankTokens: g.result.reRankInputTokens
                }))
              });

              // Store per-model token counts for billing
              const modelTokenMap = new Map<string, { modelName: string; tokens: number }>();
              for (const { result, vectorModelId } of groupSearchResults) {
                if (result.embeddingTokens > 0) {
                  const modelData = getEmbeddingModel(vectorModelId);
                  const key = vectorModelId;
                  const existing = modelTokenMap.get(key);
                  if (existing) {
                    existing.tokens += result.embeddingTokens;
                  } else {
                    modelTokenMap.set(key, {
                      modelName: modelData?.name || vectorModelId,
                      tokens: result.embeddingTokens
                    });
                  }
                }
              }
              // Attach modelTokenMap to be used in billing below
              (commonSearchResult as any).__modelTokenMap = modelTokenMap;
            }
          }
        }
      }
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
      // 新增：提取 reranker 错误信息（仅 reranker 报错时有值）
      rerankError = commonResult.rerankError;
      // 新增：提取 agentic 检索过程信息（仅 agentic 路径有值）
      agenticSearchResult = commonResult.agenticSearchResult;
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
    const nodeUsages: ChatNodeUsageType[] = [];
    // 1. Search vector — bill per embedding model used across all groups
    const modelTokenMap: Map<string, { modelName: string; tokens: number }> | undefined =
      commonSearchResult ? (commonSearchResult as any).__modelTokenMap : undefined;
    if (modelTokenMap && modelTokenMap.size > 0) {
      for (const { modelName, tokens } of modelTokenMap.values()) {
        const { totalPoints, modelName: billingModelName } = formatModelChars2Points({
          model: modelName,
          inputTokens: tokens
        });
        nodeUsages.push({
          totalPoints,
          moduleName: node.name,
          model: billingModelName,
          inputTokens: tokens
        });
      }
    } else if (vectorModel && embeddingTokens > 0) {
      // Fallback: bill using the primary vectorModel (database search tokens)
      const { totalPoints: embeddingTotalPoints, modelName: embeddingModelName } =
        formatModelChars2Points({
          model: vectorModel.name,
          inputTokens: embeddingTokens
        });
      nodeUsages.push({
        totalPoints: embeddingTotalPoints,
        moduleName: node.name,
        model: embeddingModelName,
        inputTokens: embeddingTokens
      });
    }
    // 2. Rerank
    if (searchUsingReRank) {
      const { totalPoints: reRankTotalPoints, modelName: reRankModelName } =
        formatModelChars2Points({
          model: rerankModelData?.model,
          inputTokens: reRankInputTokens
        });
      nodeUsages.push({
        totalPoints: reRankTotalPoints,
        moduleName: i18nT('account_usage:rerank'),
        model: reRankModelName,
        inputTokens: reRankInputTokens
      });
    }
    // 3. Query extension
    if (queryExtensionResult) {
      const { totalPoints: llmPoints, modelName: llmModelName } = formatModelChars2Points({
        model: queryExtensionResult.llmModel,
        inputTokens: queryExtensionResult.inputTokens,
        outputTokens: queryExtensionResult.outputTokens
      });
      nodeUsages.push({
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
      nodeUsages.push({
        totalPoints: embeddingPoints,
        moduleName: `${i18nT('account_usage:ai.query_extension_embedding')}`,
        model: embeddingModelName,
        inputTokens: queryExtensionResult.embeddingTokens,
        outputTokens: 0
      });
    }
    // 4. Deep search
    if (deepSearchResult) {
      const { totalPoints, modelName } = formatModelChars2Points({
        model: deepSearchResult.model,
        inputTokens: deepSearchResult.inputTokens,
        outputTokens: deepSearchResult.outputTokens
      });
      nodeUsages.push({
        totalPoints,
        moduleName: i18nT('common:deep_rag_search'),
        model: modelName,
        inputTokens: deepSearchResult.inputTokens,
        outputTokens: deepSearchResult.outputTokens
      });
    }
    // 5. Agentic search LLM
    if (
      agenticSearchResult &&
      (agenticSearchResult.llmInputTokens || agenticSearchResult.llmOutputTokens)
    ) {
      const { totalPoints, modelName } = formatModelChars2Points({
        model: agenticSearchResult.llmModel || agenticSearchLLMModel || '',
        inputTokens: agenticSearchResult.llmInputTokens,
        outputTokens: agenticSearchResult.llmOutputTokens
      });
      nodeUsages.push({
        totalPoints,
        moduleName: i18nT('common:agentic_search'),
        model: modelName,
        inputTokens: agenticSearchResult.llmInputTokens,
        outputTokens: agenticSearchResult.llmOutputTokens
      });
    }
    // 6. SQL Generation (for database datasets)
    if (sqlResult.length > 0) {
      sqlResult.forEach((result) => {
        const { totalPoints, modelName } = formatModelChars2Points({
          model: generateSqlModel!,
          inputTokens: result.input_tokens,
          outputTokens: result.output_tokens
        });
        nodeUsages.push({
          totalPoints,
          moduleName: i18nT('common:database_search'),
          model: modelName,
          inputTokens: result.input_tokens,
          outputTokens: result.output_tokens
        });
      });
    }
    const totalPoints = nodeUsages.reduce((acc, item) => acc + item.totalPoints, 0);
    props.usagePush(nodeUsages);

    addLog.debug('Dataset Search - Final Statistics', {
      totalSearchResults: searchRes.length,
      totalPoints,
      totalEmbeddingTokens: embeddingTokens,
      totalSqlResults: sqlResult.length,
      nodeUsagesCount: nodeUsages.length
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

    return {
      data: {
        quoteQA: searchRes
      },
      [DispatchNodeResponseKeyEnum.nodeResponse]: {
        totalPoints,
        query: userChatInput,
        retrievalMode: retrievalMode as DatasetRetrievalModeEnum,
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
        queryExtensionResult: queryExtensionResult
          ? {
              model: queryExtensionResult.llmModel,
              inputTokens: queryExtensionResult.inputTokens,
              outputTokens: queryExtensionResult.outputTokens,
              query: queryExtensionResult.query || '',
              synonymRewriteResult: queryExtensionResult.synonymRewriteResult,
              rewriteTime: queryExtensionResult.rewriteTime
            }
          : undefined,
        deepSearchResult,
        // Results
        quoteList: searchRes,
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
        }),
        // 新增：Reranker 错误信息（仅当 reranker 报错时存在）
        ...(rerankError && { rerankError }),
        // 新增：agentic 检索过程信息（仅 agentic 路径有值）
        ...(agenticSearchResult && { agenticSearchResult }),
        // 查询语言检测结果（所有检索路径均可用）
        queryLanguage
      },
      // 将 agentic 思考过程写入 assistantResponses，使其存入 AI 消息的 value，
      // 刷新页面后前端能从 value 中渲染"思考过程"块，与实时流式体验一致
      // 需要判断 agenticSearchReasoning
      ...(agenticSearchReasoning && agenticSearchResult?.reasoningText
        ? {
            [DispatchNodeResponseKeyEnum.assistantResponses]: [
              {
                type: ChatItemValueTypeEnum.reasoning,
                reasoning: { content: agenticSearchResult.reasoningText }
              }
            ]
          }
        : {}),
      ...((correctionData || faqAnswer) && {
        [DispatchNodeResponseKeyEnum.newVariables]: {
          // 设置全局变量 correct_mapping_answer
          ...(correctionData && { hTRJXdb1: correctionData.correctedAnswer }),
          // 设置全局变量 faqAnswer
          ...(faqAnswer && { udQRlgfO: faqAnswer })
        }
      }),
      [DispatchNodeResponseKeyEnum.toolResponses]:
        searchRes.length > 0
          ? {
              prompt: getDatasetSearchToolResponsePrompt(),
              cites: searchRes.map((item: SearchDataResponseItemType) => ({
                id: item.id,
                sourceName: item.sourceName,
                updateTime: item.updateTime,
                content: `${item.q}\n${item.a}`.trim()
              }))
            }
          : 'No results'
    };
  } catch (error) {
    addLog.error('Dataset search dispatch failed', { error });
    return getNodeErrResponse({ error });
  }
}

/**
 * 搜索校正数据
 * 从 chat_corrections 表中查找与用户输入相似度高的历史校正数据
 */
export async function searchCorrectionData({
  appId,
  queryVector,
  embeddingTokens,
  teamId
}: {
  appId: string;
  queryVector: number[];
  embeddingTokens: number;
  teamId: string;
}): Promise<SearchCorrectionDataResult> {
  try {
    addLog.debug('Correction Search - Starting', {
      appId,
      embeddingTokens
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

    // 步骤3：使用传入的向量进行相似度计算
    // 从向量存储中检索与用户查询最相似的问题向量
    // 校正数据的dataset_id存储的是app_id
    // 扩大搜索范围以处理多个相似度相同的情况
    const correctionSearchLimit = 10;
    const { results: vectorSearchResults } = await recallFromVectorStore({
      teamId,
      datasetIds: [appId], // 使用appId查询校正数据
      vector: queryVector,
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

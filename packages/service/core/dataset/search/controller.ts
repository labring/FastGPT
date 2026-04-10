import {
  DatasetSearchModeEnum,
  DatasetSearchModeMap,
  SearchScoreTypeEnum,
  RerankMethodEnum,
  DatasetCollectionDataProcessModeEnum,
  DatabaseTypeEnum
} from '@fastgpt/global/core/dataset/constants';
import {
  recallFromVectorStore,
  databaseEmbeddingRecall
} from '../../../common/vectorDB/controller';
import { getVectorsByText } from '../../ai/embedding';
import { getEmbeddingModel, getDefaultRerankModel, getLLMModel } from '../../ai/model';
import { MongoDatasetData } from '../data/schema';
import type {
  DatabaseConfig,
  DatasetCollectionSchemaType,
  DatasetDataSchemaType
} from '@fastgpt/global/core/dataset/type';
import {
  type DatasetDataTextSchemaType,
  type SearchDataResponseItemType
} from '@fastgpt/global/core/dataset/type';
import { MongoDatasetCollection } from '../collection/schema';
import { reRankRecall } from '../../../core/ai/rerank';
import { countPromptTokens } from '../../../common/string/tiktoken/index';
import { datasetSearchResultConcat } from '@fastgpt/global/core/dataset/search/utils';
import { getCollectionSourceData } from '@fastgpt/global/core/dataset/collection/utils';
import { Types } from '../../../common/mongo';
import json5 from 'json5';
import { MongoDatasetCollectionTags } from '../tag/schema';
import { readFromSecondary } from '../../../common/mongo/utils';
import { type ChatItemType } from '@fastgpt/global/core/chat/type';
import type { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { datasetSearchQueryExtension, getDatasetSqlResultLimit } from './utils';
import type { RerankModelItemType } from '@fastgpt/global/core/ai/model.d';
import { formatDatasetDataValue } from '../data/controller';
import {
  DBDatasetValueVectorTableName,
  DBDatasetVectorTableName,
  MILVUS_ADDRESS,
  PG_ADDRESS,
  OCEANBASE_ADDRESS
} from '../../../common/vectorDB/constants';
import { MongoDataset } from '../schema';
import { addLog } from '../../../common/system/log';
import { i18nT } from '../../../../web/i18n/utils';
import { DatabaseErrEnum } from '@fastgpt/global/common/error/code/database';
import type {
  DativeForeignKey,
  DativeSourceConfigType,
  DativeTable,
  DativeTableColumns,
  SqlGenerationRequest,
  SqlGenerationResponse
} from '@fastgpt/global/core/dataset/database/api';
import type { DatabaseEmbeddingRecallItemType } from '../../../common/vectorDB/type';
import { queryByNL } from '../database/dative/client/dativeApiServer';
import { searchDatasetDataForAssistant } from './customController';
import { pushTrack } from '../../../common/middle/tracks/utils';
import { replaceS3KeyToPreviewUrl } from '../../../core/dataset/utils';
import { addDays, addHours } from 'date-fns';
import { milvusVersionManager } from '../../../common/vectorDB/milvus/version';
// capabilities.ts 公共检索能力
import {
  getAllDatasetsSynonymWords,
  embeddingRecallPerQuery,
  fullTextRecallPerQuery,
  milvusHybridRecall,
  dedupeByContent
} from './capabilities';

export type SearchDatasetDataProps = {
  histories: ChatItemType[];
  teamId: string;
  uid?: string;
  tmbId?: string;
  model: string;
  datasetIds: string[];
  reRankQuery: string;
  queries: string[];

  [NodeInputKeyEnum.datasetSimilarity]?: number; // min distance
  [NodeInputKeyEnum.datasetMaxTokens]: number; // max Token limit
  [NodeInputKeyEnum.datasetSearchMode]?: `${DatasetSearchModeEnum}`;
  [NodeInputKeyEnum.datasetSearchEmbeddingWeight]?: number;

  [NodeInputKeyEnum.datasetSearchUsingReRank]?: boolean;
  [NodeInputKeyEnum.datasetSearchRerankModel]?: RerankModelItemType;
  [NodeInputKeyEnum.datasetSearchRerankMethod]?: RerankMethodEnum;
  [NodeInputKeyEnum.datasetSearchRerankWeight]?: number;

  /*
    {
      tags: {
        $and: ["str1","str2"],
        $or: ["str1","str2",null] null means no tags
      },
      createTime: {
        $gte: 'xx',
        $lte: 'xxx'
      }
    }
  */
  collectionFilterMatch?: string;
};

export type SearchDatabaseDataProps = {
  histories?: ChatItemType[];
  teamId: string;
  model: string;
  datasetIds: string[];
  queries: string[];
  [NodeInputKeyEnum.datasetMaxTokens]: number; // max Token limit
  [NodeInputKeyEnum.searchColumnslLimitRatio]?: number; // default 0.3
};

export type SearchDatasetDataResponse = {
  searchRes: SearchDataResponseItemType[];
  embeddingTokens: number;
  reRankInputTokens: number;
  searchMode: `${DatasetSearchModeEnum}`;
  limit: number;
  similarity: number;
  usingReRank: boolean;
  usingSimilarityFilter: boolean;
  isFaqResult?: boolean; // 标记是否为 FAQ 检索结果

  retrievalTime?: number; // 新增：检索耗时(s)，统计到进入reranker之前，保留2位小数（仅assistant场景）
  rerankTime?: number; // 新增：重排耗时(s)，仅当 usingReRank=true 时有值，保留2位小数（仅assistant场景）
  retrievalResults?: SearchDataResponseItemType[]; // 新增：检索结果（仅assistant场景）
  retrievalType?: 'correction' | 'faq'; // 新增：检索类型标记，仅当 correction 或 faq 命中时存在
  rerankError?: {
    // 新增：Reranker 错误信息（仅当 reranker 报错时存在，仅assistant场景）
    errorMessage: Record<string, any>; // 错误详细信息（结构化对象）
    i18nErrorMessage: string; // 错误信息的 i18n key（用于前端根据语言动态翻译）
    i18nErrorMessageData: { modelName: string }; // i18n 占位符数据（用于前端渲染 i18n 消息）
  };

  queryExtensionResult?: {
    llmModel: string;
    embeddingModel: string;
    inputTokens: number;
    outputTokens: number;
    embeddingTokens: number;
    query?: string; // 改为可选，当没有问题改写时为 undefined
    synonymRewriteResult?: {
      standardizedQuery: string; // 指代消除后标准化的查询（用于检索）
      coreferenceResolved: string; // 指代消除后的查询（同义词标准化前）
    };
    rewriteTime?: number; // 新增：问题改写耗时(s)，保留2位小数（仅assistant场景）
  };
  deepSearchResult?: { model: string; inputTokens: number; outputTokens: number };

  // 校正数据结果
  correctionData?: {
    correctionId: string;
    correctedAnswer: string;
    question: string;
    similarity: number;
  };

  // 新增：仅 agentic 模式填充
  agenticSearchResult?: {
    reasoningText: string; // 思考过程文本
    searchCount: number; // 实际检索轮次
    toolCallCount: number; // Tool 调用总次数
    llmModel?: string; // 实际使用的 LLM 模型名
    llmInputTokens: number; // LLM 输入 token 总量
    llmOutputTokens: number; // LLM 输出 token 总量
    playbook?: string; // 使用的 playbook
    executionPath?: string[]; // 执行路径
    confidence?: number; // 置信度 0~1
  };
};

export type SearchDatabaseDataResponse = {
  schema: Record<
    string,
    {
      collectionId: string;
      datasetId: string;
      score: number;
      retrieval_columns: string[];
    }
  >;
  tokens: number;
};

export const datasetDataReRank = async ({
  rerankModel,
  data,
  query,
  rerankMethod = RerankMethodEnum.content // Default
}: {
  rerankModel?: RerankModelItemType;
  data: SearchDataResponseItemType[];
  query: string;
  rerankMethod: RerankMethodEnum;
}): Promise<{
  results: SearchDataResponseItemType[];
  inputTokens: number;
}> => {
  // Debug日志：打印reranker使用的query
  addLog.debug('Dataset Rerank - Query Info', {
    query,
    rerankMethod,
    rerankModel: rerankModel?.name,
    dataCount: data.length
  });

  const { results, inputTokens } = await reRankRecall({
    model: rerankModel,
    query,
    documents: data.map((item) => {
      let text = '';
      switch (rerankMethod) {
        case RerankMethodEnum.question:
          text = item.q;
          break;
        case RerankMethodEnum.content:
        default:
          text = `${item.q}\n${item.a}`;
      }
      addLog.debug(`RerankMethod ${rerankMethod} Item ${item.id} text: ${text}`);
      return { id: item.id, text };
    })
  });

  if (results.length === 0) {
    return Promise.reject('Rerank error');
  }

  // add new score to data
  const mergeResult = results
    .map((item, index) => {
      const target = data.find((dataItem) => dataItem.id === item.id);
      if (!target) return null;
      const score = item.score || 0;

      return {
        ...target,
        score: [{ type: SearchScoreTypeEnum.reRank, value: score, index }]
      };
    })
    .filter(Boolean) as SearchDataResponseItemType[];

  return {
    results: mergeResult,
    inputTokens
  };
};

export const filterDatasetDataByMaxTokens = async (
  data: SearchDataResponseItemType[],
  maxTokens: number
) => {
  const filterMaxTokensResult = await (async () => {
    // Count tokens
    const tokensScoreFilter = await Promise.all(
      data.map(async (item) => ({
        ...item,
        tokens: await countPromptTokens(item.q + item.a)
      }))
    );

    const results: SearchDataResponseItemType[] = [];
    let totalTokens = 0;

    for await (const item of tokensScoreFilter) {
      results.push(item);

      totalTokens += item.tokens;

      if (totalTokens > maxTokens) {
        break;
      }
    }

    return results.length === 0 ? data.slice(0, 1) : results;
  })();

  return filterMaxTokensResult;
};

export async function searchDatasetData(
  props: SearchDatasetDataProps
): Promise<SearchDatasetDataResponse> {
  let {
    teamId,
    reRankQuery,
    queries,
    model,
    similarity = 0,
    limit: maxTokens,
    searchMode = DatasetSearchModeEnum.embedding,
    embeddingWeight = 0.5,
    usingReRank = false,
    rerankModel,
    rerankMethod,
    rerankWeight = 0.5,
    datasetIds = [],
    collectionFilterMatch
  } = props;

  /* init params */
  searchMode = DatasetSearchModeMap[searchMode] ? searchMode : DatasetSearchModeEnum.embedding;
  usingReRank = usingReRank && !!getDefaultRerankModel();

  // Compatible with topk limit
  let set = new Set<string>();
  let usingSimilarityFilter = false;

  /* function */
  const countRecallLimit = () => {
    if (searchMode === DatasetSearchModeEnum.embedding) {
      return {
        embeddingLimit: 100,
        fullTextLimit: 0
      };
    }
    if (searchMode === DatasetSearchModeEnum.fullTextRecall) {
      return {
        embeddingLimit: 0,
        fullTextLimit: 100
      };
    }
    return {
      embeddingLimit: 80,
      fullTextLimit: 60
    };
  };
  const getForbidData = async () => {
    const collections = await MongoDatasetCollection.find(
      {
        teamId,
        datasetId: { $in: datasetIds },
        forbid: true
      },
      '_id'
    );

    return {
      forbidCollectionIdList: collections.map((item) => String(item._id))
    };
  };

  /*
    Collection metadata filter
    标签过滤：
    1. and 先生效
    2. and 标签和 null 不能共存，否则返回空数组
  */
  const filterCollectionByMetadata = async (): Promise<string[] | undefined> => {
    const getAllCollectionIds = async ({
      parentCollectionIds
    }: {
      parentCollectionIds?: string[];
    }): Promise<string[] | undefined> => {
      if (!parentCollectionIds) return;
      if (parentCollectionIds.length === 0) {
        return [];
      }

      const collections = await MongoDatasetCollection.find(
        {
          teamId,
          datasetId: { $in: datasetIds },
          _id: { $in: parentCollectionIds }
        },
        '_id type',
        {
          ...readFromSecondary
        }
      ).lean();

      const resultIds = new Set<string>();
      collections.forEach((item) => {
        if (item.type !== 'folder') {
          resultIds.add(String(item._id));
        }
      });

      const folderIds = collections
        .filter((item) => item.type === 'folder')
        .map((item) => String(item._id));

      // Get all child collection ids
      if (folderIds.length) {
        const childCollections = await MongoDatasetCollection.find(
          {
            teamId,
            datasetId: { $in: datasetIds },
            parentId: { $in: folderIds }
          },
          '_id type',
          {
            ...readFromSecondary
          }
        ).lean();

        const childIds = await getAllCollectionIds({
          parentCollectionIds: childCollections.map((item) => String(item._id))
        });

        childIds?.forEach((id) => resultIds.add(id));
      }

      return Array.from(resultIds);
    };

    if (!collectionFilterMatch || !global.feConfigs.isPlus) return;

    let tagCollectionIdList: string[] | undefined = undefined;
    let createTimeCollectionIdList: string[] | undefined = undefined;

    try {
      const jsonMatch =
        typeof collectionFilterMatch === 'object'
          ? collectionFilterMatch
          : json5.parse(collectionFilterMatch);

      const andTags = jsonMatch?.tags?.$and as (string | null)[] | undefined;
      const orTags = jsonMatch?.tags?.$or as (string | null)[] | undefined;

      if (andTags && andTags.length > 0) {
        const uniqueAndTags = Array.from(new Set(andTags));
        if (uniqueAndTags.includes(null) && uniqueAndTags.some((tag) => typeof tag === 'string')) {
          return [];
        }
        if (uniqueAndTags.every((tag) => typeof tag === 'string')) {
          const matchedTags = await MongoDatasetCollectionTags.find(
            {
              teamId,
              datasetId: { $in: datasetIds },
              tag: { $in: uniqueAndTags as string[] }
            },
            '_id datasetId tag',
            { ...readFromSecondary }
          ).lean();

          // Group tags by dataset
          const datasetTagMap = new Map<string, { tagIds: string[]; tagNames: Set<string> }>();

          matchedTags.forEach((tag) => {
            const datasetId = String(tag.datasetId);
            if (!datasetTagMap.has(datasetId)) {
              datasetTagMap.set(datasetId, {
                tagIds: [],
                tagNames: new Set()
              });
            }

            const datasetData = datasetTagMap.get(datasetId)!;
            datasetData.tagIds.push(String(tag._id));
            datasetData.tagNames.add(tag.tag);
          });

          const validDatasetIds = Array.from(datasetTagMap.entries())
            .filter(([_, data]) => uniqueAndTags.every((tag) => data.tagNames.has(tag as string)))
            .map(([datasetId]) => datasetId);

          if (validDatasetIds.length === 0) return [];

          const collectionsPromises = validDatasetIds.map((datasetId) => {
            const { tagIds } = datasetTagMap.get(datasetId)!;
            return MongoDatasetCollection.find(
              {
                teamId,
                datasetId,
                tags: { $all: tagIds }
              },
              '_id',
              { ...readFromSecondary }
            ).lean();
          });

          const collectionsResults = await Promise.all(collectionsPromises);
          tagCollectionIdList = collectionsResults.flat().map((item) => String(item._id));
        } else if (uniqueAndTags.every((tag) => tag === null)) {
          const collections = await MongoDatasetCollection.find(
            {
              teamId,
              datasetId: { $in: datasetIds },
              $or: [{ tags: { $size: 0 } }, { tags: { $exists: false } }]
            },
            '_id',
            { ...readFromSecondary }
          ).lean();
          tagCollectionIdList = collections.map((item) => String(item._id));
        }
      } else if (orTags && orTags.length > 0) {
        // Get tagId by tag string
        const orTagArray = await MongoDatasetCollectionTags.find(
          {
            teamId,
            datasetId: { $in: datasetIds },
            tag: { $in: orTags.filter((tag) => tag !== null) }
          },
          '_id',
          { ...readFromSecondary }
        ).lean();
        const orTagIds = orTagArray.map((item) => String(item._id));

        // Get collections by tagId
        const collections = await MongoDatasetCollection.find(
          {
            teamId,
            datasetId: { $in: datasetIds },
            $or: [
              { tags: { $in: orTagIds } },
              ...(orTags.includes(null) ? [{ tags: { $size: 0 } }] : [])
            ]
          },
          '_id',
          { ...readFromSecondary }
        ).lean();

        tagCollectionIdList = collections.map((item) => String(item._id));
      }

      // time
      const getCreateTime = jsonMatch?.createTime?.$gte as string | undefined;
      const lteCreateTime = jsonMatch?.createTime?.$lte as string | undefined;
      if (getCreateTime || lteCreateTime) {
        const collections = await MongoDatasetCollection.find(
          {
            teamId,
            datasetId: { $in: datasetIds },
            createTime: {
              ...(getCreateTime && { $gte: new Date(getCreateTime) }),
              ...(lteCreateTime && {
                $lte: new Date(lteCreateTime)
              })
            }
          },
          '_id'
        );
        createTimeCollectionIdList = collections.map((item) => String(item._id));
      }

      // Concat tag and time
      const collectionIds = (() => {
        if (tagCollectionIdList && createTimeCollectionIdList) {
          return tagCollectionIdList.filter((id) =>
            (createTimeCollectionIdList as string[]).includes(id)
          );
        }

        return tagCollectionIdList || createTimeCollectionIdList;
      })();

      return await getAllCollectionIds({
        parentCollectionIds: collectionIds
      });
    } catch (error) {}
  };
  const embeddingRecallLocal = async ({
    queries,
    limit,
    forbidCollectionIdList,
    filterCollectionIdList
  }: {
    queries: string[];
    limit: number;
    forbidCollectionIdList: string[];
    filterCollectionIdList?: string[];
  }): Promise<{
    embeddingRecallResults: SearchDataResponseItemType[][];
    tokens: number;
  }> => {
    if (limit === 0) {
      return { embeddingRecallResults: [], tokens: 0 };
    }
    const { results, tokens } = await embeddingRecallPerQuery({
      teamId,
      datasetIds,
      queries,
      model,
      limit,
      forbidCollectionIdList,
      filterCollectionIdList
    });
    return { embeddingRecallResults: results, tokens };
  };

  const fullTextRecallLocal = async ({
    queries,
    limit,
    filterCollectionIdList,
    forbidCollectionIdList,
    customWords = []
  }: {
    queries: string[];
    limit: number;
    filterCollectionIdList?: string[];
    forbidCollectionIdList: string[];
    customWords?: string[];
  }): Promise<{
    fullTextRecallResults: SearchDataResponseItemType[][];
  }> => {
    if (limit === 0) {
      return { fullTextRecallResults: [] };
    }
    const { results } = await fullTextRecallPerQuery({
      teamId,
      datasetIds,
      queries,
      model,
      limit,
      forbidCollectionIdList,
      filterCollectionIdList,
      customWords
    });
    return { fullTextRecallResults: results };
  };

  const multiQueryRecall = async ({
    embeddingLimit,
    fullTextLimit
  }: {
    embeddingLimit: number;
    fullTextLimit: number;
  }) => {
    const [{ forbidCollectionIdList }, filterCollectionIdList] = await Promise.all([
      getForbidData(),
      filterCollectionByMetadata()
    ]);

    const useMilvusHybrid = (() => {
      if (!MILVUS_ADDRESS) return false;
      if (PG_ADDRESS || OCEANBASE_ADDRESS) return false;
      if (!milvusVersionManager.supportsFullText()) return false;
      if (process.env.MILVUS_HYBRID_SEARCH_ENABLED === 'true') return true;
      return false;
    })();

    if (useMilvusHybrid && searchMode === DatasetSearchModeEnum.mixedRecall) {
      const { results: hybridResults, tokens } = await milvusHybridRecall({
        teamId,
        datasetIds,
        queries,
        model,
        limit: Math.max(embeddingLimit, fullTextLimit),
        forbidCollectionIdList,
        filterCollectionIdList
      });

      const rrfHybridRecall = datasetSearchResultConcat(
        hybridResults.map((list) => ({ weight: 1, list }))
      ).slice(0, Math.max(embeddingLimit, fullTextLimit));

      return {
        tokens,
        embeddingRecallResults: rrfHybridRecall,
        fullTextRecallResults: []
      };
    }

    const [{ tokens, embeddingRecallResults }, { fullTextRecallResults }] = await Promise.all([
      embeddingRecallLocal({
        queries,
        limit: embeddingLimit,
        forbidCollectionIdList,
        filterCollectionIdList
      }),
      (async () => {
        // 获取知识库的全部同义词作为自定义词表
        const synonymWords = await getAllDatasetsSynonymWords(teamId, datasetIds);
        return await fullTextRecallLocal({
          queries,
          limit: fullTextLimit,
          filterCollectionIdList,
          forbidCollectionIdList,
          customWords: synonymWords
        });
      })()
    ]);

    // 第一层 RRF：按 query 维度融合
    const rrfEmbRecall = datasetSearchResultConcat(
      embeddingRecallResults.map((list) => ({ weight: 1, list }))
    ).slice(0, embeddingLimit);
    const rrfFTRecall = datasetSearchResultConcat(
      fullTextRecallResults.map((list) => ({ weight: 1, list }))
    ).slice(0, fullTextLimit);

    return {
      tokens,
      embeddingRecallResults: rrfEmbRecall,
      fullTextRecallResults: rrfFTRecall
    };
  };

  /* main step */
  // count limit
  const { embeddingLimit, fullTextLimit } = countRecallLimit();

  // 添加检索开始日志
  addLog.info('Non-Assistant Retrieval Start', {
    queries,
    searchMode,
    datasetCount: datasetIds.length,
    maxTokens,
    usingReRank,
    rerankModel,
    rerankMethod
  });

  // recall
  const {
    embeddingRecallResults,
    fullTextRecallResults,
    tokens: embeddingTokens
  } = await multiQueryRecall({
    embeddingLimit,
    fullTextLimit
  });

  // ReRank results
  const { results: reRankResults, inputTokens: reRankInputTokens } = await (async () => {
    if (!usingReRank) {
      return {
        results: [],
        inputTokens: 0
      };
    }

    set = new Set<string>(embeddingRecallResults.map((item) => item.id));
    const concatRecallResults = embeddingRecallResults.concat(
      fullTextRecallResults.filter((item) => !set.has(item.id))
    );

    // remove same q and a data（使用 capabilities 的 dedupeByContent）
    const filterSameDataResults = dedupeByContent(concatRecallResults);

    try {
      return await datasetDataReRank({
        rerankModel,
        query: reRankQuery,
        data: filterSameDataResults,
        rerankMethod: rerankMethod ?? RerankMethodEnum.content
      });
    } catch (error) {
      addLog.error('Reranker error', {
        model: rerankModel?.model,
        error: error instanceof Error ? error.message : String(error)
      });
      usingReRank = false;
      return {
        results: [],
        inputTokens: 0
      };
    }
  })();

  const rrfSearchResult = datasetSearchResultConcat([
    { weight: embeddingWeight, list: embeddingRecallResults },
    { weight: 1 - embeddingWeight, list: fullTextRecallResults }
  ]);

  const rrfConcatResults = (() => {
    if (reRankResults.length === 0) return rrfSearchResult;
    if (rerankWeight === 1) return reRankResults;

    return datasetSearchResultConcat([
      { weight: 1 - rerankWeight, list: rrfSearchResult },
      { weight: rerankWeight, list: reRankResults }
    ]);
  })();

  // remove same q and a data（使用 capabilities 的 dedupeByContent）
  const filterSameDataResults = dedupeByContent(rrfConcatResults);

  // score filter
  const scoreFilter = (() => {
    if (usingReRank) {
      usingSimilarityFilter = true;

      return filterSameDataResults.filter((item) => {
        const reRankScore = item.score.find((item) => item.type === SearchScoreTypeEnum.reRank);
        if (reRankScore && reRankScore.value < similarity) return false;
        return true;
      });
    }
    if (searchMode === DatasetSearchModeEnum.embedding) {
      usingSimilarityFilter = true;
      return filterSameDataResults.filter((item) => {
        const embeddingScore = item.score.find(
          (item) => item.type === SearchScoreTypeEnum.embedding
        );
        if (embeddingScore && embeddingScore.value < similarity) return false;
        return true;
      });
    }
    return filterSameDataResults;
  })();

  // token filter
  const filterMaxTokensResult = await filterDatasetDataByMaxTokens(scoreFilter, maxTokens);

  const finalResult = filterMaxTokensResult.map((item) => {
    item.q = replaceS3KeyToPreviewUrl(item.q, addDays(new Date(), 90));
    return item;
  });

  pushTrack.datasetSearch({ datasetIds, teamId });

  return {
    searchRes: finalResult,
    embeddingTokens,
    reRankInputTokens,
    searchMode,
    limit: maxTokens,
    similarity,
    usingReRank,
    usingSimilarityFilter
  };
}

export type DefaultSearchDatasetDataProps = SearchDatasetDataProps & {
  [NodeInputKeyEnum.datasetSearchUsingExtensionQuery]?: boolean;
  [NodeInputKeyEnum.datasetSearchExtensionModel]?: string;
  [NodeInputKeyEnum.datasetSearchExtensionBg]?: string;
  isAssistant?: boolean;
  datasetIds?: string[];
  /** dispatch 层预计算的 queryExtension 结果，存在时跳过内部 LLM 调用，避免重复执行 */
  preComputedQueryExtension?: Awaited<ReturnType<typeof datasetSearchQueryExtension>>;
};
export const defaultSearchDatasetData = async ({
  datasetSearchUsingExtensionQuery,
  datasetSearchExtensionModel,
  datasetSearchExtensionBg,
  isAssistant,
  datasetIds,
  preComputedQueryExtension,
  ...props
}: DefaultSearchDatasetDataProps): Promise<SearchDatasetDataResponse> => {
  const query = props.queries[0];
  const histories = props.histories;

  const { searchQueries, reRankQuery, aiExtensionResult, rewriteTime, queriesForStorage } =
    preComputedQueryExtension ??
    (await datasetSearchQueryExtension({
      query,
      llmModel: datasetSearchUsingExtensionQuery
        ? getLLMModel(datasetSearchExtensionModel).model
        : undefined,
      embeddingModel: props.model,
      extensionBg: datasetSearchExtensionBg,
      histories,
      isAssistant,
      teamId: props.teamId,
      datasetIds
    }));

  // 新增：检索开始计时（问题改写之后）
  const retrievalStartTime = Date.now();

  // 根据 isAssistant 选择调用哪个函数
  const result = isAssistant
    ? await searchDatasetDataForAssistant({
        ...props,
        reRankQuery: reRankQuery,
        queries: searchQueries,
        datasetIds,
        retrievalStartTime
      })
    : await searchDatasetData({
        ...props,
        reRankQuery: reRankQuery,
        queries: searchQueries,
        datasetIds
      });

  return {
    ...result,
    queryExtensionResult: aiExtensionResult
      ? {
          llmModel: aiExtensionResult.llmModel,
          embeddingModel: aiExtensionResult.embeddingModel,
          inputTokens: aiExtensionResult.inputTokens,
          outputTokens: aiExtensionResult.outputTokens,
          embeddingTokens: aiExtensionResult.embeddingTokens,
          query: queriesForStorage || searchQueries.join('\n'),
          synonymRewriteResult: aiExtensionResult.synonymRewriteResult,
          rewriteTime
        }
      : undefined
  };
};

export type DeepRagSearchProps = SearchDatasetDataProps & {
  [NodeInputKeyEnum.datasetDeepSearchModel]?: string;
  [NodeInputKeyEnum.datasetDeepSearchMaxTimes]?: number;
  [NodeInputKeyEnum.datasetDeepSearchBg]?: string;
};
export const deepRagSearch = (data: DeepRagSearchProps) => global.deepRagHandler(data);

export const SearchDatabaseData = async (
  props: SearchDatabaseDataProps
): Promise<SearchDatabaseDataResponse> => {
  let { histories, teamId, model, datasetIds, queries, limit = 50, searchRatio = 0.3 } = props;
  const desLimit = Math.floor(limit * (1 - searchRatio));
  try {
    const forbidCollections = await MongoDatasetCollection.find(
      {
        teamId,
        datasetId: { $in: datasetIds },
        forbid: true
      },
      '_id'
    );
    const vectorModel = getEmbeddingModel(model);
    let totalTokens = 0;
    const columnDescriptionRecallResList: DatabaseEmbeddingRecallItemType[] = [];
    const columnValueRecallResultList: DatabaseEmbeddingRecallItemType[] = [];

    const forbidCollectionIdList = forbidCollections.map((item: any) => String(item._id));
    await Promise.all(
      queries.map(async (query: string) => {
        const { tokens, vectors } = await getVectorsByText({
          model: vectorModel,
          input: query,
          type: 'query'
        });

        totalTokens += tokens;
        const q_vector = vectors[0];

        const columnDescriptionResults = await columnDescriptionRecall({
          teamId,
          datasetIds,
          vector: q_vector,
          limit: desLimit,
          forbidCollectionIdList
        });

        const columnValueResults = await columnValueRecall({
          teamId,
          datasetIds,
          vector: q_vector,
          limit: limit - desLimit,
          forbidCollectionIdList
        });

        columnDescriptionRecallResList.push(...columnDescriptionResults);
        columnValueRecallResultList.push(...columnValueResults);
      })
    );

    const schema = await mergeAndGetSchema({
      columnDescriptionRecallResList,
      columnValueRecallResultList,
      teamId
    });

    addLog.debug(`Database embed recall completed. Found ${Object.keys(schema).length} tables.`);

    return {
      schema,
      tokens: totalTokens
    };
  } catch (error) {
    return Promise.reject(i18nT('chat:embedding_model_error'));
  }
};

const columnDescriptionRecall = async ({
  teamId,
  datasetIds,
  vector,
  limit,
  forbidCollectionIdList
}: {
  teamId: string;
  datasetIds: string[];
  vector: number[];
  limit: number;
  forbidCollectionIdList: string[];
}): Promise<DatabaseEmbeddingRecallItemType[]> => {
  try {
    // Use universal database embedding recall interface
    const { results } = await databaseEmbeddingRecall({
      teamId,
      datasetIds,
      vector,
      limit,
      tableName: DBDatasetVectorTableName,
      forbidCollectionIdList
    });
    addLog.debug(
      'Column description recall results:',
      results.map((r) => r.columnDesIndex)
    );
    return results;
  } catch (error) {
    addLog.error('Column description recall error', error);
    return [];
  }
};

const columnValueRecall = async ({
  teamId,
  datasetIds,
  vector,
  limit,
  forbidCollectionIdList
}: {
  teamId: string;
  datasetIds: string[];
  vector: number[];
  limit: number;
  forbidCollectionIdList: string[];
}): Promise<DatabaseEmbeddingRecallItemType[]> => {
  try {
    // Use universal database embedding recall interface
    const { results } = await databaseEmbeddingRecall({
      teamId,
      datasetIds,
      vector,
      limit,
      tableName: DBDatasetValueVectorTableName,
      forbidCollectionIdList
    });

    addLog.debug(
      'Column value recall results:',
      results.map((r) => r.columnValIndex)
    );
    return results;
  } catch (error) {
    addLog.error('Column value recall error', error);
    return [];
  }
};

// merge results and get schema
const mergeAndGetSchema = async ({
  columnDescriptionRecallResList,
  columnValueRecallResultList,
  teamId
}: {
  columnDescriptionRecallResList: DatabaseEmbeddingRecallItemType[];
  columnValueRecallResultList: DatabaseEmbeddingRecallItemType[];
  teamId: string;
}) => {
  const schema: Record<
    string,
    { collectionId: string; datasetId: string; score: number; retrieval_columns: string[] }
  > = {};
  // Group results by collectionId directly (avoid creating intermediate array)
  const resultsByCollection = new Map<
    string,
    Array<DatabaseEmbeddingRecallItemType & { type: string }>
  >();

  // Process column description results
  for (const result of columnDescriptionRecallResList) {
    if (result.collectionId) {
      if (!resultsByCollection.has(result.collectionId))
        resultsByCollection.set(result.collectionId, []);
      resultsByCollection.get(result.collectionId)!.push({ ...result, type: 'description' });
    }
  }

  // Process column value results
  for (const result of columnValueRecallResultList) {
    if (result.collectionId) {
      if (!resultsByCollection.has(result.collectionId))
        resultsByCollection.set(result.collectionId, []);
      resultsByCollection.get(result.collectionId)!.push({ ...result, type: 'value' });
    }
  }

  // Batch fetch all collections with table schema
  const collections = await MongoDatasetCollection.find({
    _id: { $in: Array.from(resultsByCollection.keys()) },
    teamId
  })
    .select('_id datasetId name tableSchema')
    .lean();
  const collectionMap = new Map(collections.map((coll) => [String(coll._id), coll]));
  // Process each collection once with all its results
  for (const [collectionId, results] of resultsByCollection) {
    const collection = collectionMap.get(collectionId);
    if (!collection || !collection.name || !results) continue;

    const tableName = collection.name;
    const primaryKeys = collection.tableSchema?.primaryKeys || [];
    const foreignKyes = collection.tableSchema?.foreignKeys.map((fk) => fk.column) || [];

    // Collect all unique columns from all results for this collection
    const allRetrievedColumns = new Set<string>([...primaryKeys, ...foreignKyes]);

    // Find the best score among all results for this collection (optimized)
    let bestResult = results[0];
    for (let i = 1; i < results.length; i++) {
      if (results[i].score > bestResult.score) {
        bestResult = results[i];
      }
    }

    schema[tableName] = {
      collectionId: String(collectionId),
      datasetId: String(collection.datasetId),
      score: bestResult.score,
      retrieval_columns: []
    };

    // Add retrieved columns from all results in one pass
    for (const result of results) {
      const retrievedColumn =
        result.type === 'description' ? result.columnDesIndex : result.columnValIndex;
      if (retrievedColumn) {
        allRetrievedColumns.add(retrievedColumn.split('<sep>')[1]);
      }
    }

    // Update retrieval_columns with all unique columns
    schema[tableName].retrieval_columns = Array.from(allRetrievedColumns);
  }
  return schema;
};

// Generate SQL and execute query (Schema Embedding + SQL Generation mode)
export const generateAndExecuteSQL = async ({
  datasetId,
  query,
  schema,
  teamId,
  limit,
  generate_sql_llm,
  evaluate_sql_llm
}: {
  datasetId: string;
  query: string;
  schema: Record<
    string,
    { collectionId: string; datasetId: string; score: number; retrieval_columns: string[] }
  >;
  teamId: string;
  limit?: number;
  generate_sql_llm: { model: string; api_key?: string; base_url?: string };
  evaluate_sql_llm: { model: string; api_key?: string; base_url?: string };
  externalProvider?: {
    openaiAccount?: {
      key: string;
      baseUrl: string;
    };
  };
}): Promise<SqlGenerationResponse | null> => {
  // Handle default limit value
  const resultLimit = limit ?? getDatasetSqlResultLimit();

  // Get dataset and database config
  const dataset = await MongoDataset.findById(datasetId).lean();
  if (!dataset?.databaseConfig) {
    addLog.warn('No database config found for dataset', { datasetId });
    return Promise.reject(DatabaseErrEnum.dbConfigNotFound);
  }

  const dbConfig: DatabaseConfig = dataset.databaseConfig;

  // Get table schema from collections
  const tableNames = Object.keys(schema);
  if (tableNames.length === 0) {
    addLog.warn('No tables found in schema');
    return null;
  }

  // Get all table schemas from MongoDB collections
  const collections = await MongoDatasetCollection.find({
    datasetId,
    name: { $in: tableNames },
    teamId
  }).lean();

  // Collections Changes during Sql Generation
  if (!collections || collections.length === 0) {
    addLog.warn('No collections found for tables', { tableNames });
    return Promise.reject(`${tableNames} not found or has been deleted`);
  }

  // Build table schemas for Dative
  const retrievedMetadata = collections.map((collection) => {
    const columns: Record<string, DativeTableColumns> = {};
    if (collection.tableSchema?.columns) {
      Object.values(collection.tableSchema.columns).forEach((col) => {
        if (schema[collection.name]?.retrieval_columns.includes(col.columnName)) {
          columns[col.columnName] = {
            name: col.columnName,
            type: col.columnType,
            comment: col.description,
            auto_increment: col.isAutoIncrement || false,
            nullable: col.isNullable || false,
            default: col.defaultValue || null,
            examples: col.examples || [],
            enabled: !col.forbid,
            value_index: col.valueIndex || false
          };
        }
      });
    }

    const foreign_keys: DativeForeignKey[] =
      collection.tableSchema?.foreignKeys?.map((fk) => ({
        name: fk.name,
        column: fk.column,
        referenced_schema: fk.referredSchema,
        referenced_table: fk.referredTable,
        referenced_column: fk.referredColumns
      })) || [];
    const table: DativeTable = {
      name: collection.name,
      ns_name: '',
      comment: collection.tableSchema?.description || '',
      columns,
      primary_keys: collection.tableSchema?.primaryKeys || [],
      foreign_keys: foreign_keys,
      enable: !collection.forbid,
      score: schema[collection.name]?.score || 0
    };
    return table;
  });
  addLog.debug(
    `[generateAndExecuteSQL] retrieved_metadata: ${JSON.stringify(retrievedMetadata).length}`
  );
  if (retrievedMetadata.length === 0) {
    addLog.warn('No valid table schemas found');
    return null;
  }

  // Sort by score (highest first) for better SQL generation
  retrievedMetadata.sort((a, b) => b.score - a.score);

  // Update request payload to include all table schemas
  const requestPayload: SqlGenerationRequest = {
    source_config: {
      type: dbConfig.clientType,
      host: dbConfig.host,
      port: dbConfig.port || 3306,
      username: dbConfig.user,
      password: dbConfig.password,
      db_name: dbConfig.database,
      ns_name: dbConfig?.schema,
      encrypt: dbConfig?.encrypt,
      // Oracle specific - 使用 database 字段作为 serviceName
      ...(dbConfig.clientType === DatabaseTypeEnum.oracle && {
        serviceName: dbConfig.database
      })
    } as DativeSourceConfigType,
    generate_sql_llm,
    evaluate_sql_llm,
    query,
    result_num_limit: resultLimit,
    retrieved_metadata: {
      name: dbConfig.database, // DatabaseName
      comments: '',
      tables: retrievedMetadata
    }
  };

  try {
    const result = await queryByNL(requestPayload);
    return result;
  } catch (error: any) {
    addLog.error('Error calling Dative queryByNL', error);
    return Promise.reject(DatabaseErrEnum.dativeServiceError);
  }
};

/**
 * 搜索 FAQ 数据
 * 仅检索 trainingType='template' 的 collection 数据
 * @returns 返回相似度最高且 a 不为空的 FAQ 数据（如果满足阈值要求）
 */
export async function searchFAQData({
  teamId,
  datasetIds,
  queryVector,
  embeddingTokens
}: {
  teamId: string;
  datasetIds: string[];
  queryVector: number[];
  embeddingTokens: number;
}): Promise<(SearchDataResponseItemType & { embeddingTokens: number }) | null> {
  const startTime = Date.now();
  const faqThreshold = global.systemEnv?.faqSimilarityThreshold ?? 0.95;
  addLog.debug('Assistant Config - faqSimilarityThreshold', { faqThreshold });

  addLog.debug('FAQ Search - Starting', {
    teamId,
    datasetIds,
    embeddingTokens
  });

  try {
    // 1. 获取所有 FAQ collection (trainingType='template')
    const faqCollections = await MongoDatasetCollection.find(
      {
        teamId,
        datasetId: { $in: datasetIds },
        trainingType: DatasetCollectionDataProcessModeEnum.template,
        forbid: { $ne: true }
      },
      '_id'
    ).lean();

    if (faqCollections.length === 0) {
      addLog.debug('FAQ Search - No FAQ collections found', {
        teamId,
        duration: `${Date.now() - startTime}ms`
      });
      return null;
    }

    const faqCollectionIds = faqCollections.map((c) => String(c._id));

    // 2. 全局向量检索（不传 filterCollectionIdList），取 top 100
    // 方案A：全局搜索 + MongoDB 后过滤
    // 原因：FAQ 阈值极高（0.95），真正命中的 FAQ 向量在全局排名中几乎必然位居前列；
    // 不使用 filterCollectionIdList 可避免 HNSW 稀疏预过滤导致的 60s 超时问题，
    // 无论 FAQ 向量在总量中占多大比例，全局搜索的耗时都是稳定可控的。
    const recallResult = await recallFromVectorStore({
      teamId,
      datasetIds,
      vector: queryVector,
      limit: 100,
      forbidCollectionIdList: [],
      filterCollectionIdList: [] // 全局搜索，不限制 collection
    });

    if (!recallResult.results || recallResult.results.length === 0) {
      addLog.debug('FAQ Search - No recall results', {
        teamId,
        duration: `${Date.now() - startTime}ms`
      });
      return null;
    }

    // 3. 先过滤相似度 >= 阈值的结果
    const filteredByThreshold = recallResult.results.filter((r) => (r.score || 0) >= faqThreshold);

    if (filteredByThreshold.length === 0) {
      addLog.debug('FAQ Search - No results above threshold', {
        teamId,
        threshold: faqThreshold,
        topScore: recallResult.results[0]?.score || 0,
        duration: `${Date.now() - startTime}ms`
      });
      return null;
    }

    // 4. 查询 MongoDB 获取完整数据
    const thresholdDataIds = new Set(filteredByThreshold.map((r) => r.id));
    const dataDocs = await MongoDatasetData.find(
      {
        teamId,
        'indexes.dataId': { $in: Array.from(thresholdDataIds) },
        collectionId: { $in: Array.from(faqCollectionIds) }, // 后过滤：只保留 FAQ collection 的数据
        a: { $exists: true, $ne: '' }
      },
      '_id datasetId collectionId updateTime q a chunkIndex indexes'
    )
      .lean()
      .exec();

    if (dataDocs.length === 0) {
      addLog.debug('FAQ Search - No data documents found', {
        teamId,
        thresholdResultsCount: filteredByThreshold.length,
        duration: `${Date.now() - startTime}ms`
      });
      return null;
    }

    // 6. 构建 dataId -> dataDoc 的映射
    const dataIdToDocMap = new Map<string, (typeof dataDocs)[0]>();
    for (const doc of dataDocs) {
      for (const index of doc.indexes) {
        if (thresholdDataIds.has(index.dataId)) {
          dataIdToDocMap.set(index.dataId, doc);
        }
      }
    }

    // 7. 获取最高相似度分数，处理多个相同分数的情况
    const topScore = filteredByThreshold[0].score || 0;

    // 找出所有相似度等于最高分的结果
    const topScoreResults = filteredByThreshold.filter((r) => r.score === topScore);

    // 将结果与数据文档关联，并按更新时间排序
    const matchedDocs = topScoreResults
      .map((result) => {
        const dataDoc = dataIdToDocMap.get(result.id);
        return dataDoc ? { result, dataDoc } : null;
      })
      .filter((item): item is NonNullable<typeof item> => item !== null)
      // 按更新时间降序排序，取最新的
      .sort(
        (a, b) =>
          new Date(b.dataDoc.updateTime).getTime() - new Date(a.dataDoc.updateTime).getTime()
      );

    if (matchedDocs.length === 0) {
      return null;
    }

    // 取更新时间最新的 FAQ 数据
    const { result: topResult, dataDoc } = matchedDocs[0];
    const similarity = topResult.score || 0;

    // 单独查询 collection（只查一次）
    const collection = await MongoDatasetCollection.findById(dataDoc.collectionId, 'name').lean();

    const faqData: SearchDataResponseItemType & { embeddingTokens: number } = {
      id: String(dataDoc._id),
      updateTime: dataDoc.updateTime,
      q: dataDoc.q,
      a: dataDoc.a || '',
      chunkIndex: dataDoc.chunkIndex,
      datasetId: String(dataDoc.datasetId),
      collectionId: String(dataDoc.collectionId),
      sourceName: collection?.name || 'FAQ',
      sourceId: String(dataDoc._id),
      score: [
        {
          type: SearchScoreTypeEnum.embedding,
          value: similarity,
          index: 0
        }
      ],
      embeddingTokens: embeddingTokens
    };

    addLog.debug('FAQ Search - Match found', {
      teamId,
      dataId: faqData.id,
      similarity,
      question: dataDoc.q,
      updateTime: dataDoc.updateTime,
      matchedCount: matchedDocs.length,
      duration: `${Date.now() - startTime}ms`
    });

    return faqData;
  } catch (error) {
    addLog.error('FAQ Search - Error occurred', {
      error,
      duration: `${Date.now() - startTime}ms`
    });
    return null;
  }
}

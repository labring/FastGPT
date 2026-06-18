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
import { getDefaultRerankModel, getEmbeddingModelById, getRerankModelById } from '../../ai/model';
import { MongoDatasetData } from '../data/schema';
import type {
  DatabaseConfig,
  DatasetCollectionSchemaType,
  DatasetDataSchemaType,
  ColumnSchemaType,
  ForeignKeySchemaType
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
import { computeFilterIntersection } from './utils';
import { readFromSecondary } from '../../../common/mongo/utils';
import { MongoDatasetDataText } from '../data/dataTextSchema';
import { type ChatItemMiniType, type ChatItemType } from '@fastgpt/global/core/chat/type';
import type { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { datasetSearchQueryExtension, getDatasetSqlResultLimit } from './utils';
import type { RerankModelItemType } from '@fastgpt/global/core/ai/model.schema';
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
import { i18nT } from '../../../../global/common/i18n/utils';
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
import { addDays } from 'date-fns';
import { milvusVersionManager } from '../../../common/vectorDB/milvus/version';
import { MilvusCtrl } from '../../../common/vectorDB/milvus/index';
import { datasetDataSelectField, datasetCollectionSelectField } from './base';
import { extractChunkSynonyms } from './synonym';
import { jiebaSplitWithCustomDict } from '../../../common/string/jieba/index';
// capabilities.ts 公共检索能力
import {
  getAllDatasetsSynonymWords,
  embeddingRecallPerQuery,
  fullTextRecallPerQuery,
  milvusHybridRecall,
  dedupeByContent
} from './capabilities';

export type SearchDatasetDataProps = {
  histories: ChatItemMiniType[];
  teamId: string;
  uid?: string;
  tmbId?: string;
  modelId: string;
  datasetIds: string[];
  reRankQuery: string;
  queries: string[];
  lang: string;

  [NodeInputKeyEnum.datasetSimilarity]?: number; // min distance
  [NodeInputKeyEnum.datasetMaxTokens]: number; // max Token limit
  [NodeInputKeyEnum.datasetSearchMode]?: `${DatasetSearchModeEnum}`;
  [NodeInputKeyEnum.datasetSearchEmbeddingWeight]?: number;

  [NodeInputKeyEnum.datasetSearchUsingReRank]?: boolean;
  [NodeInputKeyEnum.datasetSearchRerankModelId]?: string;
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
  /** 权限过滤：用户无读权限的 collection ID，将合并到 forbidCollectionIdList */
  authForbidCollectionIds?: string[];
};

export type SearchDatabaseDataProps = {
  histories?: ChatItemType[];
  teamId: string;
  modelId: string;
  datasetIds: string[];
  queries: string[];
  [NodeInputKeyEnum.datasetMaxTokens]: number; // max Token limit
  [NodeInputKeyEnum.searchColumnslLimitRatio]?: number; // default 0.3
  authForbidCollectionIds?: string[]; // 权限过滤：用户无权限的 collection ID
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

  retrievalTime?: number; // 检索耗时(s)，统计到进入reranker之前，保留2位小数
  rerankTime?: number; // 重排耗时(s)，仅当 usingReRank=true 时有值，保留2位小数
  retrievalResults?: SearchDataResponseItemType[]; // 检索结果（RRF融合后的中间结果，用于落库）
  retrievalType?: 'correction' | 'faq'; // 检索类型标记，仅当 correction 或 faq 命中时存在
  rerankError?: {
    // Reranker 错误信息（仅当 reranker 报错时存在）
    errorMessage: Record<string, any>; // 错误详细信息（结构化对象）
    i18nErrorMessage: string; // 错误信息的 i18n key（用于前端根据语言动态翻译）
    i18nErrorMessageData: { modelName: string }; // i18n 占位符数据（用于前端渲染 i18n 消息）
  };

  queryExtensionResult?: {
    llmModelId: string;
    embeddingModelId: string;
    inputTokens: number;
    outputTokens: number;
    embeddingTokens: number;
    query?: string; // 改为可选，当没有问题改写时为 undefined
    synonymRewriteResult?: {
      standardizedQuery: string; // 指代消除后标准化的查询（用于检索）
      coreferenceResolved: string; // 指代消除后的查询（同义词标准化前）
    };
    rewriteTime?: number; // 问题改写耗时(s)，保留2位小数
  };
  deepSearchResult?: { modelId: string; inputTokens: number; outputTokens: number };

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
    llmModelId?: string; // 实际使用的 LLM 模型名
    llmInputTokens: number; // LLM 输入 token 总量
    llmOutputTokens: number; // LLM 输出 token 总量
    playbook?: string; // 使用的 playbook
    executionPath?: string[]; // 执行路径
    confidence?: number; // 置信度 0~1
    queryLanguage?: string; // 用户查询语言（ISO 639-1 代码）
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

export async function filterCollectionByNewTagFormat({
  teamId,
  datasetIds,
  andConditions,
  orConditions
}: {
  teamId: string;
  datasetIds: string[];
  andConditions?: Record<string, Record<string, any>>[];
  orConditions?: Record<string, Record<string, any>>[];
}): Promise<string[]> {
  if (!andConditions?.length && !orConditions?.length) return [];

  // 收集所有条件中的 tag 名称
  const allTagNames = [
    ...(andConditions || []).map((cond) => Object.keys(cond)[0]),
    ...(orConditions || []).map((cond) => Object.keys(cond)[0])
  ].filter(Boolean);

  // 按 dataset 批量查询 tag 名称 → tagId + tagType
  const tagDocs = await MongoDatasetCollectionTags.find(
    {
      teamId,
      datasetId: { $in: datasetIds },
      tag: { $in: allTagNames }
    },
    '_id datasetId tag tagType',
    { ...readFromSecondary }
  ).lean();

  // 按 datasetId 分组：{ datasetId → Map<tagName, { id, type }> }
  const datasetTagMap = new Map<string, Map<string, { id: string; type: string }>>();
  tagDocs.forEach((doc) => {
    const dsId = String(doc.datasetId);
    if (!datasetTagMap.has(dsId)) {
      datasetTagMap.set(dsId, new Map());
    }
    datasetTagMap.get(dsId)!.set(doc.tag, {
      id: String(doc._id),
      type: (doc as any).tagType || 'string'
    });
  });

  // 应用层 value 比较
  const checkValue = (
    opObj: Record<string, any>,
    storedVal: string | number,
    tagType: string
  ): boolean => {
    const op = Object.keys(opObj)[0];
    const target = opObj[op];

    if (op === '$empty') return storedVal === '' || storedVal === null || storedVal === undefined;
    if (op === '$notEmpty')
      return storedVal !== '' && storedVal !== null && storedVal !== undefined;
    if (target === null) return false;

    if (tagType === 'number') {
      const sv = Number(storedVal);
      const tv = Number(target);
      if (isNaN(sv) || isNaN(tv)) return false;
      switch (op) {
        case '$eq':
          return sv === tv;
        case '$ne':
          return sv !== tv;
        case '$gt':
          return sv > tv;
        case '$lt':
          return sv < tv;
        case '$gte':
          return sv >= tv;
        case '$lte':
          return sv <= tv;
      }
    } else if (tagType === 'datetime') {
      const sv = typeof storedVal === 'number' ? storedVal : new Date(storedVal).getTime();
      const tv = new Date(target).getTime();
      if (isNaN(sv) || isNaN(tv)) return false;
      switch (op) {
        case '$eq':
          return sv === tv;
        case '$ne':
          return sv !== tv;
        case '$gt':
          return sv > tv;
        case '$lt':
          return sv < tv;
        case '$gte':
          return sv >= tv;
        case '$lte':
          return sv <= tv;
      }
    } else {
      const sv = String(storedVal);
      const tv = String(target);
      switch (op) {
        case '$eq':
          return sv === tv;
        case '$ne':
          return sv !== tv;
        case '$contains':
          return sv.toLowerCase().includes(tv.toLowerCase());
        case '$notContains':
          return !sv.toLowerCase().includes(tv.toLowerCase());
        case '$startsWith':
          return sv.toLowerCase().startsWith(tv.toLowerCase());
        case '$endsWith':
          return sv.toLowerCase().endsWith(tv.toLowerCase());
        case '$regex':
          try {
            return new RegExp(tv, 'i').test(sv);
          } catch {
            return false;
          }
      }
    }
    return false;
  };

  // 针对每个 dataset 分别构建查询（同名 tag 在不同 dataset 中 id 不同）
  const collectionIds: string[] = [];

  for (const [datasetId, tagMap] of datasetTagMap) {
    const andTagIds = (andConditions || [])
      .map((cond) => tagMap.get(Object.keys(cond)[0])?.id)
      .filter(Boolean) as string[];

    const orTagIds = (orConditions || [])
      .map((cond) => tagMap.get(Object.keys(cond)[0])?.id)
      .filter(Boolean) as string[];

    if (andTagIds.length === 0 && orTagIds.length === 0) continue;

    // Step1: MongoDB 按 tagId 过滤（走 tags.tagId 索引）
    // AND：所有 tagId 必须存在；纯 OR：任一 tagId 存在即可
    const tagIdQuery: any =
      andTagIds.length > 0
        ? { 'tags.tagId': { $all: andTagIds } }
        : { 'tags.tagId': { $in: orTagIds } };

    const candidates = await MongoDatasetCollection.find(
      { teamId, datasetId, deleteTime: null, ...tagIdQuery },
      '_id tags',
      { ...readFromSecondary }
    ).lean();

    // Step2: 应用层按 value 条件筛选
    for (const col of candidates) {
      const tagsArr = ((col.tags || []) as any[]).filter(
        (t) => typeof t === 'object' && t !== null && t.tagId
      );

      // AND 条件：每个条件都要满足
      const andOk = (andConditions || []).every((cond) => {
        const tagName = Object.keys(cond)[0];
        const tagInfo = tagMap.get(tagName);
        if (!tagInfo) return false;
        const tv = tagsArr.find((t) => t.tagId === tagInfo.id);
        if (!tv) return false;
        return checkValue(cond[tagName], tv.value, tagInfo.type);
      });

      if (!andOk) continue;

      // OR 条件：至少一个满足（若无 OR 条件直接通过）
      if (orConditions?.length) {
        const orOk = orConditions.some((cond) => {
          const tagName = Object.keys(cond)[0];
          const tagInfo = tagMap.get(tagName);
          if (!tagInfo) return false;
          const tv = tagsArr.find((t) => t.tagId === tagInfo.id);
          if (!tv) return false;
          return checkValue(cond[tagName], tv.value, tagInfo.type);
        });
        if (!orOk) continue;
      }

      collectionIds.push(String(col._id));
    }
  }

  return collectionIds;
}

/**
 * 解析 collectionFilterMatch 为白名单 collection ID 列表。
 * 整合 tag 过滤、createTime 过滤、collectionIds 过滤，取交集后展开文件夹。
 *
 * @returns whitelist collection IDs，undefined 表示无过滤条件，[] 表示过滤结果为空
 */
export async function resolveCollectionFilter({
  teamId,
  datasetIds,
  collectionFilterMatch
}: {
  teamId: string;
  datasetIds: string[];
  collectionFilterMatch?: string;
}): Promise<string[] | undefined> {
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
        _id: { $in: parentCollectionIds },
        deleteTime: null
      },
      '_id type',
      { ...readFromSecondary }
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

    if (folderIds.length) {
      const childCollections = await MongoDatasetCollection.find(
        {
          teamId,
          datasetId: { $in: datasetIds },
          parentId: { $in: folderIds },
          deleteTime: null
        },
        '_id type',
        { ...readFromSecondary }
      ).lean();

      const childIds = await getAllCollectionIds({
        parentCollectionIds: childCollections.map((item) => String(item._id))
      });

      childIds?.forEach((id) => resultIds.add(id));
    }

    return Array.from(resultIds);
  };

  if (!collectionFilterMatch || !(global as any).feConfigs?.isPlus) return;

  let tagCollectionIdList: string[] | undefined = undefined;
  let createTimeCollectionIdList: string[] | undefined = undefined;
  let inputCollectionIdList: string[] | undefined = undefined;

  try {
    const jsonMatch =
      typeof collectionFilterMatch === 'object'
        ? collectionFilterMatch
        : json5.parse(collectionFilterMatch);

    const andTags = jsonMatch?.tags?.$and as (string | null | Record<string, any>)[] | undefined;
    const orTags = jsonMatch?.tags?.$or as (string | null | Record<string, any>)[] | undefined;

    const isNewTagFormat =
      (Array.isArray(andTags) &&
        andTags.length > 0 &&
        typeof andTags[0] === 'object' &&
        andTags[0] !== null) ||
      (Array.isArray(orTags) &&
        orTags.length > 0 &&
        typeof orTags[0] === 'object' &&
        orTags[0] !== null);

    if (isNewTagFormat) {
      const andConditions = (andTags || []).filter(
        (item): item is Record<string, Record<string, any>> =>
          typeof item === 'object' && item !== null
      );
      const orConditions = (orTags || []).filter(
        (item): item is Record<string, Record<string, any>> =>
          typeof item === 'object' && item !== null
      );

      tagCollectionIdList = await filterCollectionByNewTagFormat({
        teamId,
        datasetIds,
        andConditions: andConditions.length > 0 ? andConditions : undefined,
        orConditions: orConditions.length > 0 ? orConditions : undefined
      });
    } else if (andTags && andTags.length > 0) {
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

        const datasetTagMap = new Map<string, { tagIds: string[]; tagNames: Set<string> }>();

        matchedTags.forEach((tag) => {
          const dsId = String(tag.datasetId);
          if (!datasetTagMap.has(dsId)) {
            datasetTagMap.set(dsId, { tagIds: [], tagNames: new Set() });
          }
          const datasetData = datasetTagMap.get(dsId)!;
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
              tags: { $all: tagIds },
              deleteTime: null
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
            $or: [{ tags: { $size: 0 } }, { tags: { $exists: false } }],
            deleteTime: null
          },
          '_id',
          { ...readFromSecondary }
        ).lean();
        tagCollectionIdList = collections.map((item) => String(item._id));
      }
    } else if (orTags && orTags.length > 0) {
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

      const collections = await MongoDatasetCollection.find(
        {
          teamId,
          datasetId: { $in: datasetIds },
          $or: [
            { tags: { $in: orTagIds } },
            ...(orTags.includes(null) ? [{ tags: { $size: 0 } }] : [])
          ],
          deleteTime: null
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
          deleteTime: null,
          createTime: {
            ...(getCreateTime && { $gte: new Date(getCreateTime) }),
            ...(lteCreateTime && { $lte: new Date(lteCreateTime) })
          }
        },
        '_id'
      );
      createTimeCollectionIdList = collections.map((item) => String(item._id));
    }

    // collectionIds
    const inputCollectionIds = jsonMatch?.collectionIds as string[] | undefined;
    if (Array.isArray(inputCollectionIds) && inputCollectionIds.length > 0) {
      inputCollectionIdList = await getAllCollectionIds({
        parentCollectionIds: inputCollectionIds
      });
      if (inputCollectionIdList && inputCollectionIdList.length === 0) {
        return [];
      }
    }

    const collectionIds = computeFilterIntersection([
      tagCollectionIdList,
      createTimeCollectionIdList,
      inputCollectionIdList
    ]);

    return await getAllCollectionIds({
      parentCollectionIds: collectionIds
    });
  } catch (error) {
    console.error('resolveCollectionFilter error:', error);
  }
}

/**
 * 生成 i18n 错误 key（用于前端展示）
 */
function generateI18nErrorKey(errorMessage: string): string {
  const lowerError = errorMessage.toLowerCase();

  if (lowerError.includes('timeout') || lowerError.includes('超时')) {
    return 'common:core.dataset.error.Rerank timeout';
  }
  if (lowerError.includes('network') || lowerError.includes('网络')) {
    return 'common:core.dataset.error.Rerank network error';
  }
  if (lowerError.includes('404') || lowerError.includes('not found')) {
    return 'common:core.dataset.error.Rerank service not found';
  }
  if (lowerError.includes('401') || lowerError.includes('unauthorized')) {
    return 'common:core.dataset.error.Rerank unauthorized';
  }
  if (lowerError.includes('403') || lowerError.includes('forbidden')) {
    return 'common:core.dataset.error.Rerank forbidden';
  }
  if (lowerError.includes('500') || lowerError.includes('internal server error')) {
    return 'common:core.dataset.error.Rerank internal error';
  }
  if (lowerError.includes('502') || lowerError.includes('bad gateway')) {
    return 'common:core.dataset.error.Rerank bad gateway';
  }
  if (lowerError.includes('503') || lowerError.includes('service unavailable')) {
    return 'common:core.dataset.error.Rerank service unavailable';
  }

  return 'common:core.dataset.error.Rerank error';
}

export async function searchDatasetData(
  props: SearchDatasetDataProps
): Promise<SearchDatasetDataResponse> {
  let {
    teamId,
    reRankQuery,
    queries,
    modelId,
    similarity = 0,
    limit: maxTokens,
    searchMode = DatasetSearchModeEnum.embedding,
    embeddingWeight = 0.5,
    usingReRank = false,
    rerankModelId,
    rerankMethod,
    rerankWeight = 0.5,
    datasetIds = [],
    collectionFilterMatch,
    authForbidCollectionIds
  } = props;

  /* init params */
  searchMode = DatasetSearchModeMap[searchMode] ? searchMode : DatasetSearchModeEnum.embedding;
  usingReRank = usingReRank && !!getDefaultRerankModel();

  // 检索耗时计时
  const retrievalStartTime = Date.now();

  // 重排错误信息
  let rerankError:
    | {
        errorMessage: Record<string, any>;
        i18nErrorMessage: string;
        i18nErrorMessageData: { modelName: string };
      }
    | undefined = undefined;

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

  const filterCollectionByMetadata = () =>
    resolveCollectionFilter({ teamId, datasetIds, collectionFilterMatch });
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

    const { vectors, tokens } = await getVectorsByText({
      model: getEmbeddingModelById(modelId),
      input: queries,
      type: 'query'
    });

    const recallResults = await Promise.all(
      vectors.map(async (vector) => {
        return await recallFromVectorStore({
          teamId,
          datasetIds,
          vector,
          limit,
          forbidCollectionIdList,
          filterCollectionIdList
        });
      })
    );

    // Get data and collections
    const collectionIdList = Array.from(
      new Set(recallResults.map((item) => item.results.map((item) => item.collectionId)).flat())
    );
    const indexDataIds = Array.from(
      new Set(recallResults.map((item) => item.results.map((item) => item.id?.trim())).flat())
    );

    const [dataMaps, collectionMaps] = await Promise.all([
      MongoDatasetData.find(
        {
          teamId,
          datasetId: { $in: datasetIds },
          collectionId: { $in: collectionIdList },
          'indexes.dataId': { $in: indexDataIds }
        },
        datasetDataSelectField,
        { ...readFromSecondary }
      )
        .lean()
        .then((res) => {
          const map = new Map<string, DatasetDataSchemaType>();

          res.forEach((item) => {
            item.indexes.forEach((index) => {
              if (indexDataIds.includes(index.dataId)) {
                map.set(String(index.dataId), item);
              }
            });
          });

          return map;
        }),
      MongoDatasetCollection.find(
        {
          _id: { $in: collectionIdList },
          deleteTime: null
        },
        datasetCollectionSelectField,
        { ...readFromSecondary }
      )
        .lean()
        .then((res) => {
          const map = new Map<string, DatasetCollectionSchemaType>();

          res.forEach((item) => {
            map.set(String(item._id), item);
          });

          return map;
        })
    ]);

    const embeddingRecallResults = recallResults.map((item) => {
      const set = new Set<string>();
      return (
        item.results
          .map((item, index) => {
            const collection = collectionMaps.get(String(item.collectionId));
            if (!collection) {
              addLog.warn('Dataset collection not found during recall', {
                collectionId: item.collectionId,
                dataId: item.id
              });
              return;
            }

            const data = dataMaps.get(String(item.id));
            if (!data) {
              addLog.warn('Dataset data not found during recall', {
                dataId: item.id,
                collectionId: item.collectionId
              });
              return;
            }

            // 提取该 chunk 的同义词映射
            const synonymMappings = extractChunkSynonyms(data, String(item.id));

            const result: SearchDataResponseItemType = {
              id: String(data._id),
              updateTime: data.updateTime,
              ...formatDatasetDataValue({
                q: data.q,
                a: data.a,
                imageId: data.imageId,
                imageDescMap: data.imageDescMap
              }),
              chunkIndex: data.chunkIndex,
              datasetId: String(data.datasetId),
              collectionId: String(data.collectionId),
              ...getCollectionSourceData(collection),
              score: [{ type: SearchScoreTypeEnum.embedding, value: item?.score || 0, index }],
              metadata: data.metadata,
              synonymMappings: synonymMappings.length > 0 ? synonymMappings : undefined
            };

            return result;
          })
          // 多个向量对应一个数据，每一路召回，保障数据只有一份，并且取最高排名
          .filter((item) => {
            if (!item) return false;
            if (set.has(item.id)) return false;
            set.add(item.id);
            return true;
          })
          .map((item, index) => {
            return {
              ...item!,
              score: item!.score.map((item) => ({ ...item, index }))
            };
          }) as SearchDataResponseItemType[]
      );
    });
    return { embeddingRecallResults, tokens };
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

    // 决策：使用 Milvus BM25 还是 MongoDB？
    const useMilvusFullText = (() => {
      // 条件 1: 必须是 Milvus 环境（非 PG/OceanBase）
      if (!MILVUS_ADDRESS) return false;
      if (PG_ADDRESS || OCEANBASE_ADDRESS) return false;

      // 条件 2: Milvus 版本必须 >= 2.6
      if (!milvusVersionManager.supportsFullText()) return false;

      // 条件 3: 特性开关（可选，用于灰度），默认打开
      if (process.env.MILVUS_FULL_TEXT_ENABLED === 'false') return false;

      return true;
    })();

    if (useMilvusFullText) {
      return await fullTextRecallFromMilvus({
        queries,
        limit,
        filterCollectionIdList,
        forbidCollectionIdList,
        teamId,
        datasetIds
      });
    } else {
      return await fullTextRecallFromMongo({
        queries,
        limit,
        filterCollectionIdList,
        forbidCollectionIdList,
        customWords
      });
    }
  };

  // Milvus 2.6 BM25 全文检索
  const fullTextRecallFromMilvus = async ({
    queries,
    limit,
    filterCollectionIdList,
    forbidCollectionIdList,
    teamId,
    datasetIds
  }: {
    queries: string[];
    limit: number;
    filterCollectionIdList?: string[];
    forbidCollectionIdList: string[];
    teamId: string;
    datasetIds: string[];
  }): Promise<{
    fullTextRecallResults: SearchDataResponseItemType[][];
  }> => {
    const milvusCtrl = new MilvusCtrl();

    // 并行执行多个查询的 BM25 检索
    const recallResults = await Promise.all(
      queries.map(async (query) => {
        return await milvusCtrl.fullTextSearch({
          teamId,
          datasetIds,
          query,
          limit,
          forbidCollectionIdList,
          filterCollectionIdList
        });
      })
    );

    // 获取所有 id 和 collectionId
    const vectorIds = Array.from(
      new Set(recallResults.map((item) => item.map((item) => item.id)).flat())
    );
    const collectionIds = Array.from(
      new Set(recallResults.map((item) => item.map((item) => item.collectionId)).flat())
    );

    // 通过向量 ID 查询 MongoDB 获取完整数据
    const [dataMap, collectionMaps] = await Promise.all([
      // 注意：Milvus 返回的 id 是向量 ID，需要通过它查询 MongoDatasetData
      // 这里假设向量 ID 和 dataId 的对应关系存在（需要根据实际情况调整）
      MongoDatasetData.find(
        {
          'indexes.dataId': { $in: vectorIds }
        },
        datasetDataSelectField,
        { ...readFromSecondary }
      )
        .lean()
        .then((res) => {
          const map = new Map<string, DatasetDataSchemaType>();
          res.forEach((item) => {
            // 建立索引 dataId -> 完整数据的映射
            item.indexes?.forEach((idx: any) => {
              if (idx.dataId) {
                map.set(String(idx.dataId), item);
              }
            });
          });
          return map;
        }),
      MongoDatasetCollection.find(
        {
          _id: { $in: collectionIds.map((id) => new Types.ObjectId(id)) },
          deleteTime: null
        },
        datasetCollectionSelectField,
        { ...readFromSecondary }
      )
        .lean()
        .then((res) => {
          const map = new Map<string, DatasetCollectionSchemaType>();
          res.forEach((item) => {
            map.set(String(item._id), item);
          });
          return map;
        })
    ]);

    // 格式化结果
    const fullTextRecallResults = recallResults.map((queryResults) => {
      return queryResults
        .map((item, index) => {
          const collection = collectionMaps.get(String(item.collectionId));
          if (!collection) {
            console.log('Collection is not found', item);
            return;
          }

          const data = dataMap.get(String(item.id));
          if (!data) {
            console.log('Data is not found', item);
            return;
          }

          // 提取该 chunk 的同义词映射
          const synonymMappings = extractChunkSynonyms(data, String(item.id));

          return {
            id: String(data._id),
            datasetId: String(data.datasetId),
            collectionId: String(data.collectionId),
            updateTime: data.updateTime,
            ...formatDatasetDataValue({
              q: data.q,
              a: data.a,
              imageId: data.imageId,
              imageDescMap: data.imageDescMap
            }),
            chunkIndex: data.chunkIndex,
            metadata: data.metadata,
            ...getCollectionSourceData(collection),
            score: [
              {
                type: SearchScoreTypeEnum.fullText,
                value: item.score || 0,
                index
              }
            ],
            synonymMappings: synonymMappings.length > 0 ? synonymMappings : undefined
          };
        })
        .filter((item) => {
          if (!item) return false;
          return true;
        })
        .map((item, index) => {
          return {
            ...item,
            score: item!.score.map((scoreItem) => ({ ...scoreItem, index }))
          };
        }) as SearchDataResponseItemType[];
    });

    return {
      fullTextRecallResults
    };
  };

  // MongoDB 全文检索
  const fullTextRecallFromMongo = async ({
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
    const recallResults = await Promise.all(
      queries.map(async (query) => {
        const jiebaSplitResult = await jiebaSplitWithCustomDict({ text: query, customWords });
        return (await MongoDatasetDataText.aggregate(
          [
            {
              $match: {
                teamId: new Types.ObjectId(teamId),
                $text: { $search: jiebaSplitResult },
                datasetId: { $in: datasetIds.map((id) => new Types.ObjectId(id)) },
                ...(filterCollectionIdList
                  ? {
                      collectionId: {
                        $in: filterCollectionIdList
                          .filter((id) => !forbidCollectionIdList.includes(id))
                          .map((id) => new Types.ObjectId(id))
                      }
                    }
                  : forbidCollectionIdList?.length
                    ? {
                        collectionId: {
                          $nin: forbidCollectionIdList.map((id) => new Types.ObjectId(id))
                        }
                      }
                    : {})
              }
            },
            {
              $sort: {
                score: { $meta: 'textScore' }
              }
            },
            {
              $limit: limit
            },
            {
              $project: {
                _id: 1,
                collectionId: 1,
                dataId: 1,
                score: { $meta: 'textScore' }
              }
            }
          ],
          {
            ...readFromSecondary
          }
        )) as (DatasetDataTextSchemaType & { score: number })[];
      })
    );

    const dataIds = Array.from(
      new Set(recallResults.map((item) => item.map((item) => item.dataId)).flat())
    );
    const collectionIds = Array.from(
      new Set(recallResults.map((item) => item.map((item) => item.collectionId)).flat())
    );

    // Get data and collections
    const [dataMaps, collectionMaps] = await Promise.all([
      MongoDatasetData.find(
        {
          _id: { $in: dataIds }
        },
        datasetDataSelectField,
        { ...readFromSecondary }
      )
        .lean()
        .then((res) => {
          const map = new Map<string, DatasetDataSchemaType>();

          res.forEach((item) => {
            map.set(String(item._id), item);
          });

          return map;
        }),
      MongoDatasetCollection.find(
        {
          _id: { $in: collectionIds },
          deleteTime: null
        },
        datasetCollectionSelectField,
        { ...readFromSecondary }
      )
        .lean()
        .then((res) => {
          const map = new Map<string, DatasetCollectionSchemaType>();

          res.forEach((item) => {
            map.set(String(item._id), item);
          });

          return map;
        })
    ]);

    const fullTextRecallResults = recallResults.map((item) => {
      return item
        .map((item, index) => {
          const collection = collectionMaps.get(String(item.collectionId));
          if (!collection) {
            addLog.warn('Dataset collection not found during full-text recall', {
              collectionId: item.collectionId,
              dataId: item.dataId
            });
            return;
          }

          const data = dataMaps.get(String(item.dataId));
          if (!data) {
            addLog.warn('Dataset data not found during full-text recall', {
              dataId: item.dataId,
              collectionId: item.collectionId
            });
            return;
          }

          return {
            id: String(data._id),
            datasetId: String(data.datasetId),
            collectionId: String(data.collectionId),
            updateTime: data.updateTime,
            ...formatDatasetDataValue({
              q: data.q,
              a: data.a,
              imageId: data.imageId,
              imageDescMap: data.imageDescMap
            }),
            chunkIndex: data.chunkIndex,
            metadata: data.metadata,
            ...getCollectionSourceData(collection),
            score: [
              {
                type: SearchScoreTypeEnum.fullText,
                value: item.score || 0,
                index
              }
            ]
          };
        })
        .filter((item) => {
          if (!item) return false;
          return true;
        })
        .map((item, index) => {
          return {
            ...item,
            score: item!.score.map((item) => ({ ...item, index }))
          };
        }) as SearchDataResponseItemType[];
    });
    return { fullTextRecallResults };
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

    // Merge permission-based forbidden collections
    const mergedForbidList = authForbidCollectionIds?.length
      ? [...new Set([...forbidCollectionIdList, ...authForbidCollectionIds])]
      : forbidCollectionIdList;

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
        modelId,
        limit: Math.max(embeddingLimit, fullTextLimit),
        forbidCollectionIdList: mergedForbidList,
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
        forbidCollectionIdList: mergedForbidList,
        filterCollectionIdList
      }),
      (async () => {
        // 获取知识库的全部同义词作为自定义词表
        const synonymWords = await getAllDatasetsSynonymWords(teamId, datasetIds);
        return await fullTextRecallLocal({
          queries,
          limit: fullTextLimit,
          filterCollectionIdList,
          forbidCollectionIdList: mergedForbidList,
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
    rerankModelId,
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

  // 重排计时
  const rerankStartTime = usingReRank ? Date.now() : undefined;

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

    const rerankModel = getRerankModelById(rerankModelId);
    try {
      return await datasetDataReRank({
        rerankModel,
        query: reRankQuery,
        data: filterSameDataResults,
        rerankMethod: rerankMethod ?? RerankMethodEnum.content
      });
    } catch (error) {
      addLog.error('Reranker raw error caught', { error, model: rerankModel?.model });

      let errorMessage: Record<string, any> = {};
      let errorTextForI18n = '';

      if (error instanceof Error) {
        errorMessage = { type: 'Error', name: error.name, message: error.message };
        errorTextForI18n = error.message;
      } else if (typeof error === 'string') {
        errorMessage = { type: 'string', message: error };
        errorTextForI18n = error;
      } else if (error && typeof error === 'object') {
        const errorObj = error as any;
        errorMessage = {
          type: 'object',
          ...(errorObj.message && { message: errorObj.message }),
          ...(errorObj.error && { error: errorObj.error }),
          ...(errorObj.status && { status: errorObj.status }),
          ...(errorObj.statusText && { statusText: errorObj.statusText }),
          ...(errorObj.code && { code: errorObj.code }),
          ...(errorObj.response && { response: errorObj.response })
        };
        if (errorObj.message) {
          errorTextForI18n = errorObj.message;
        } else if (errorObj.statusText) {
          errorTextForI18n = `${errorObj.statusText}${errorObj.status ? ` (${errorObj.status})` : ''}`;
        } else if (typeof errorObj.error === 'string') {
          errorTextForI18n = errorObj.error;
        } else {
          errorTextForI18n = JSON.stringify(errorObj);
        }
      } else {
        errorMessage = { type: 'unknown', value: String(error) };
        errorTextForI18n = String(error);
      }

      const i18nErrorMessage = generateI18nErrorKey(errorTextForI18n);

      addLog.error('Reranker error', {
        modelId: rerankModel?.id,
        errorMessage,
        i18nErrorKey: i18nErrorMessage
      });

      rerankError = {
        errorMessage,
        i18nErrorMessage,
        i18nErrorMessageData: { modelName: rerankModel?.name || rerankModel?.model || 'Unknown' }
      };
      usingReRank = false;
      return {
        results: [],
        inputTokens: 0
      };
    }
  })();

  // 计算重排耗时
  const rerankTime =
    rerankStartTime !== undefined
      ? +((Date.now() - rerankStartTime) / 1000).toFixed(2)
      : undefined;

  const rrfSearchResult = datasetSearchResultConcat([
    { weight: embeddingWeight, list: embeddingRecallResults },
    { weight: 1 - embeddingWeight, list: fullTextRecallResults }
  ]);

  // 计算检索耗时（召回阶段结束，进入 reranker 前）
  const retrievalTime = +((Date.now() - retrievalStartTime) / 1000).toFixed(2);

  // 构建 retrievalResults（RRF 融合后的中间结果，用于落库）
  const retrievalLimit = global.systemEnv?.assistantRetrievalLimit ?? 20;
  const retrievalResults = dedupeByContent(rrfSearchResult).slice(0, retrievalLimit);

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
    usingSimilarityFilter,
    retrievalTime,
    retrievalResults,
    rerankTime,
    rerankError
  };
}

export type DefaultSearchDatasetDataProps = SearchDatasetDataProps & {
  [NodeInputKeyEnum.datasetSearchUsingExtensionQuery]?: boolean;
  [NodeInputKeyEnum.datasetSearchExtensionModelId]?: string;
  [NodeInputKeyEnum.datasetSearchExtensionBg]?: string;
  isAssistant?: boolean;
  /**
   * 用于同义词检索和问题改写的知识库 ID 列表（通常为节点内所有知识库 ID）。
   * 与 SearchDatasetDataProps.datasetIds（用于向量检索的分组 ID）分开，避免名称冲突。
   * 若不传，则降级为使用 datasetIds（分组 ID）进行同义词检索。
   */
  synonymDatasetIds?: string[];
  appId?: string; // 用于校正数据检索
  faqAnswerMode?: 'quote' | 'llm-summary'; // FAQ 回答模式
  /** dispatch 层预计算的 queryExtension 结果，存在时跳过内部 LLM 调用，避免重复执行 */
  preComputedQueryExtension?: Awaited<ReturnType<typeof datasetSearchQueryExtension>>;
  lang: string;
};
export const defaultSearchDatasetData = async ({
  datasetSearchUsingExtensionQuery,
  datasetSearchExtensionModelId,
  datasetSearchExtensionBg,
  isAssistant,
  synonymDatasetIds,
  appId,
  faqAnswerMode,
  preComputedQueryExtension,
  lang,
  ...props
}: DefaultSearchDatasetDataProps): Promise<SearchDatasetDataResponse> => {
  // 同义词检索使用全部知识库 ID（synonymDatasetIds），若未传则降级为分组 ID（props.datasetIds）
  const datasetIds = synonymDatasetIds ?? props.datasetIds;
  const query = props.queries[0];
  const histories = props.histories;

  const { searchQueries, reRankQuery, aiExtensionResult, rewriteTime, queriesForStorage } =
    preComputedQueryExtension ??
    (await datasetSearchQueryExtension({
      query,
      llmModelId: datasetSearchUsingExtensionQuery
        ? datasetSearchExtensionModelId
        : undefined,
      embeddingModelId: props.modelId,
      extensionBg: datasetSearchExtensionBg,
      histories,
      isAssistant,
      teamId: props.teamId,
      datasetIds,
      lang
    }));

  // 新增：检索开始计时（问题改写之后）
  const retrievalStartTime = Date.now();

  // 根据 isAssistant 选择调用哪个函数
  // 向量检索使用分组内的知识库 ID（props.datasetIds），同义词检索已在上方使用 datasetIds（全量 ID）
  const result = isAssistant
    ? await searchDatasetDataForAssistant({
        ...props,
        reRankQuery: reRankQuery,
        queries: searchQueries,
        datasetIds: props.datasetIds,
        retrievalStartTime, // 传递检索开始时间，确保 correction 和 FAQ 检索时间被计入
        lang
      })
    : await searchDatasetData({
        ...props,
        reRankQuery: reRankQuery,
        queries: searchQueries,
        datasetIds: props.datasetIds,
        lang
      });

  return {
    ...result,
    queryExtensionResult: aiExtensionResult
      ? {
          llmModelId: aiExtensionResult.llmModelId,
          embeddingModelId: aiExtensionResult.embeddingModelId,
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
  [NodeInputKeyEnum.datasetDeepSearchModelId]?: string;
  [NodeInputKeyEnum.datasetDeepSearchMaxTimes]?: number;
  [NodeInputKeyEnum.datasetDeepSearchBg]?: string;
};
export const deepRagSearch = (data: DeepRagSearchProps) => global.deepRagHandler(data);

export const SearchDatabaseData = async (
  props: SearchDatabaseDataProps
): Promise<SearchDatabaseDataResponse> => {
  let {
    histories,
    teamId,
    modelId,
    datasetIds,
    queries,
    limit = 50,
    searchRatio = 0.3,
    authForbidCollectionIds
  } = props;
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
    const vectorModel = getEmbeddingModelById(modelId);
    let totalTokens = 0;
    const columnDescriptionRecallResList: DatabaseEmbeddingRecallItemType[] = [];
    const columnValueRecallResultList: DatabaseEmbeddingRecallItemType[] = [];

    const forbidCollectionIdList = forbidCollections.map((item: any) => String(item._id));
    // Merge permission-based forbidden collections
    const mergedForbidList = authForbidCollectionIds?.length
      ? [...new Set([...forbidCollectionIdList, ...authForbidCollectionIds])]
      : forbidCollectionIdList;
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
          forbidCollectionIdList: mergedForbidList
        });

        const columnValueResults = await columnValueRecall({
          teamId,
          datasetIds,
          vector: q_vector,
          limit: limit - desLimit,
          forbidCollectionIdList: mergedForbidList
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
    teamId,
    deleteTime: null
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
    const foreignKyes =
      collection.tableSchema?.foreignKeys.map((fk: ForeignKeySchemaType) => fk.column) || [];

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
    teamId,
    deleteTime: null
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
      (Object.values(collection.tableSchema.columns) as ColumnSchemaType[]).forEach((col) => {
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
      collection.tableSchema?.foreignKeys?.map((fk: ForeignKeySchemaType) => ({
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
  embeddingTokens,
  authForbidCollectionIds,
  collectionFilterMatch
}: {
  teamId: string;
  datasetIds: string[];
  queryVector: number[];
  embeddingTokens: number;
  authForbidCollectionIds?: string[];
  collectionFilterMatch?: string;
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
        forbid: { $ne: true },
        deleteTime: null
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

    // 排除权限禁止的 collection
    const authForbiddenSet = new Set(authForbidCollectionIds ?? []);
    const allowedFaqCollectionIds = faqCollectionIds.filter((id) => !authForbiddenSet.has(id));

    if (allowedFaqCollectionIds.length === 0) {
      addLog.debug('FAQ Search - All FAQ collections forbidden by auth', {
        teamId,
        duration: `${Date.now() - startTime}ms`
      });
      return null;
    }

    // 标签过滤：resolveCollectionFilter 整合 tag/createTime/collectionIds 三维过滤
    const filterWhitelist = await resolveCollectionFilter({
      teamId,
      datasetIds,
      collectionFilterMatch
    });

    // FAQ collections ∩ tag-filtered collections
    const effectiveFaqCollectionIds = filterWhitelist
      ? allowedFaqCollectionIds.filter((id) => filterWhitelist.includes(id))
      : allowedFaqCollectionIds;

    if (effectiveFaqCollectionIds.length === 0) {
      addLog.debug('FAQ Search - No FAQ collections after tag filter', {
        teamId,
        tagFilteredCount: filterWhitelist?.length ?? 0,
        duration: `${Date.now() - startTime}ms`
      });
      return null;
    }

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
      forbidCollectionIdList: authForbidCollectionIds ?? [],
      ...(filterWhitelist ? { filterCollectionIdList: effectiveFaqCollectionIds } : {})
      // 不传 filterCollectionIdList，即不限制 collection（传 [] 会被向量存储当作"过滤到空集"，直接返回空结果）
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
        collectionId: { $in: Array.from(effectiveFaqCollectionIds) }, // 后过滤：只保留 FAQ collection 的数据（排除权限禁止的 & 标签过滤的）
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

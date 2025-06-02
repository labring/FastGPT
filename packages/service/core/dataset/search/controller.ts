import {
  DatasetSearchModeEnum,
  DatasetSearchModeMap,
  SearchScoreTypeEnum
} from '@fastgpt/global/core/dataset/constants';
import { recallFromVectorStore } from '../../../common/vectorDB/controller';
import { getVectorsByText } from '../../ai/embedding';
import { getEmbeddingModel, getDefaultRerankModel, getLLMModel } from '../../ai/model';
import { MongoDatasetData } from '../data/schema';
import {
  type DatasetDataTextSchemaType,
  type SearchDataResponseItemType
} from '@fastgpt/global/core/dataset/type';
import { MongoDatasetCollection } from '../collection/schema';
import { reRankRecall } from '../../../core/ai/rerank';
import { countPromptTokens } from '../../../common/string/tiktoken/index';
import { datasetSearchResultConcat } from '@fastgpt/global/core/dataset/search/utils';
import { hashStr } from '@fastgpt/global/common/string/tools';
import { jiebaSplit } from '../../../common/string/jieba/index';
import { getCollectionSourceData } from '@fastgpt/global/core/dataset/collection/utils';
import { Types } from '../../../common/mongo';
import json5 from 'json5';
import { MongoDatasetCollectionTags } from '../tag/schema';
import { readFromSecondary } from '../../../common/mongo/utils';
import { MongoDatasetDataText } from '../data/dataTextSchema';
import { type ChatItemType } from '@fastgpt/global/core/chat/type';
import type { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { datasetSearchQueryExtension } from './utils';
import type { RerankModelItemType } from '@fastgpt/global/core/ai/model.d';
import { addLog } from '../../../common/system/log';
import { formatDatasetDataValue } from '../data/controller';

export type SearchDatasetDataProps = {
  histories: ChatItemType[];
  teamId: string;
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

export type SearchDatasetDataResponse = {
  searchRes: SearchDataResponseItemType[];
  embeddingTokens: number;
  reRankInputTokens: number;
  searchMode: `${DatasetSearchModeEnum}`;
  limit: number;
  similarity: number;
  usingReRank: boolean;
  usingSimilarityFilter: boolean;

  queryExtensionResult?: {
    model: string;
    inputTokens: number;
    outputTokens: number;
    query: string;
  };
  deepSearchResult?: { model: string; inputTokens: number; outputTokens: number };
};

export const datasetDataReRank = async ({
  rerankModel,
  data,
  query
}: {
  rerankModel?: RerankModelItemType;
  data: SearchDataResponseItemType[];
  query: string;
}): Promise<{
  results: SearchDataResponseItemType[];
  inputTokens: number;
}> => {
  const { results, inputTokens } = await reRankRecall({
    model: rerankModel,
    query,
    documents: data.map((item) => ({
      id: item.id,
      text: `${item.q}\n${item.a}`
    }))
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
    rerankWeight = 0.5,
    datasetIds = [],
    collectionFilterMatch
  } = props;

  // Constants data
  const datasetDataSelectField =
    '_id datasetId collectionId updateTime q a imageId chunkIndex indexes';
  const datsaetCollectionSelectField =
    '_id name fileId rawLink apiFileId externalFileId externalFileUrl';

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
  const embeddingRecall = async ({
    query,
    limit,
    forbidCollectionIdList,
    filterCollectionIdList
  }: {
    query: string;
    limit: number;
    forbidCollectionIdList: string[];
    filterCollectionIdList?: string[];
  }) => {
    const { vectors, tokens } = await getVectorsByText({
      model: getEmbeddingModel(model),
      input: query,
      type: 'query'
    });

    const { results } = await recallFromVectorStore({
      teamId,
      datasetIds,
      vector: vectors[0],
      limit,
      forbidCollectionIdList,
      filterCollectionIdList
    });

    // Get data and collections
    const collectionIdList = Array.from(new Set(results.map((item) => item.collectionId)));
    const [dataList, collections] = await Promise.all([
      MongoDatasetData.find(
        {
          teamId,
          datasetId: { $in: datasetIds },
          collectionId: { $in: collectionIdList },
          'indexes.dataId': { $in: results.map((item) => item.id?.trim()) }
        },
        datasetDataSelectField,
        { ...readFromSecondary }
      ).lean(),
      MongoDatasetCollection.find(
        {
          _id: { $in: collectionIdList }
        },
        datsaetCollectionSelectField,
        { ...readFromSecondary }
      ).lean()
    ]);

    const set = new Set<string>();
    const formatResult = results
      .map((item, index) => {
        const collection = collections.find((col) => String(col._id) === String(item.collectionId));
        if (!collection) {
          console.log('Collection is not found', item);
          return;
        }
        const data = dataList.find((data) =>
          data.indexes.some((index) => index.dataId === item.id)
        );
        if (!data) {
          console.log('Data is not found', item);
          return;
        }

        const result: SearchDataResponseItemType = {
          id: String(data._id),
          updateTime: data.updateTime,
          ...formatDatasetDataValue({
            teamId,
            datasetId: data.datasetId,
            q: data.q,
            a: data.a,
            imageId: data.imageId
          }),
          chunkIndex: data.chunkIndex,
          datasetId: String(data.datasetId),
          collectionId: String(data.collectionId),
          ...getCollectionSourceData(collection),
          score: [{ type: SearchScoreTypeEnum.embedding, value: item?.score || 0, index }]
        };

        return result;
      })
      .filter((item) => {
        if (!item) return false;
        if (set.has(item.id)) return false;
        set.add(item.id);
        return true;
      })
      .map((item, index) => {
        if (!item) return;
        return {
          ...item,
          score: item.score.map((item) => ({ ...item, index }))
        };
      }) as SearchDataResponseItemType[];

    return {
      embeddingRecallResults: formatResult,
      tokens
    };
  };
  const fullTextRecall = async ({
    query,
    limit,
    filterCollectionIdList,
    forbidCollectionIdList
  }: {
    query: string;
    limit: number;
    filterCollectionIdList?: string[];
    forbidCollectionIdList: string[];
  }): Promise<{
    fullTextRecallResults: SearchDataResponseItemType[];
    tokenLen: number;
  }> => {
    if (limit === 0) {
      return {
        fullTextRecallResults: [],
        tokenLen: 0
      };
    }

    try {
      const searchResults = (await MongoDatasetDataText.aggregate(
        [
          {
            $match: {
              teamId: new Types.ObjectId(teamId),
              $text: { $search: await jiebaSplit({ text: query }) },
              datasetId: { $in: datasetIds.map((id) => new Types.ObjectId(id)) },
              ...(filterCollectionIdList
                ? {
                    collectionId: {
                      $in: filterCollectionIdList.map((id) => new Types.ObjectId(id))
                    }
                  }
                : {}),
              ...(forbidCollectionIdList && forbidCollectionIdList.length > 0
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

      // Get data and collections
      const [dataList, collections] = await Promise.all([
        MongoDatasetData.find(
          {
            _id: { $in: searchResults.map((item) => item.dataId) }
          },
          datasetDataSelectField,
          { ...readFromSecondary }
        ).lean(),
        MongoDatasetCollection.find(
          {
            _id: { $in: searchResults.map((item) => item.collectionId) }
          },
          datsaetCollectionSelectField,
          { ...readFromSecondary }
        ).lean()
      ]);

      return {
        fullTextRecallResults: searchResults
          .map((item, index) => {
            const collection = collections.find(
              (col) => String(col._id) === String(item.collectionId)
            );
            if (!collection) {
              console.log('Collection is not found', item);
              return;
            }
            const data = dataList.find((data) => String(data._id) === String(item.dataId));
            if (!data) {
              console.log('Data is not found', item);
              return;
            }

            return {
              id: String(data._id),
              datasetId: String(data.datasetId),
              collectionId: String(data.collectionId),
              updateTime: data.updateTime,
              ...formatDatasetDataValue({
                teamId,
                datasetId: data.datasetId,
                q: data.q,
                a: data.a,
                imageId: data.imageId
              }),
              chunkIndex: data.chunkIndex,
              indexes: data.indexes,
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
            if (!item) return;
            return {
              ...item,
              score: item.score.map((item) => ({ ...item, index }))
            };
          }) as SearchDataResponseItemType[],
        tokenLen: 0
      };
    } catch (error) {
      addLog.error('Full text search error', error);
      return {
        fullTextRecallResults: [],
        tokenLen: 0
      };
    }
  };
  const multiQueryRecall = async ({
    embeddingLimit,
    fullTextLimit
  }: {
    embeddingLimit: number;
    fullTextLimit: number;
  }) => {
    // multi query recall
    const embeddingRecallResList: SearchDataResponseItemType[][] = [];
    const fullTextRecallResList: SearchDataResponseItemType[][] = [];
    let totalTokens = 0;

    const [{ forbidCollectionIdList }, filterCollectionIdList] = await Promise.all([
      getForbidData(),
      filterCollectionByMetadata()
    ]);

    await Promise.all(
      queries.map(async (query) => {
        const [{ tokens, embeddingRecallResults }, { fullTextRecallResults }] = await Promise.all([
          embeddingRecall({
            query,
            limit: embeddingLimit,
            forbidCollectionIdList,
            filterCollectionIdList
          }),
          // FullText tmp
          fullTextRecall({
            query,
            limit: fullTextLimit,
            filterCollectionIdList,
            forbidCollectionIdList
          })
        ]);
        totalTokens += tokens;

        embeddingRecallResList.push(embeddingRecallResults);
        fullTextRecallResList.push(fullTextRecallResults);
      })
    );

    // rrf concat
    const rrfEmbRecall = datasetSearchResultConcat(
      embeddingRecallResList.map((list) => ({ k: 60, list }))
    ).slice(0, embeddingLimit);
    const rrfFTRecall = datasetSearchResultConcat(
      fullTextRecallResList.map((list) => ({ k: 60, list }))
    ).slice(0, fullTextLimit);

    return {
      tokens: totalTokens,
      embeddingRecallResults: rrfEmbRecall,
      fullTextRecallResults: rrfFTRecall
    };
  };

  /* main step */
  // count limit
  const { embeddingLimit, fullTextLimit } = countRecallLimit();

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

    // remove same q and a data
    set = new Set<string>();
    const filterSameDataResults = concatRecallResults.filter((item) => {
      // 删除所有的标点符号与空格等，只对文本进行比较
      const str = hashStr(`${item.q}${item.a}`.replace(/[^\p{L}\p{N}]/gu, ''));
      if (set.has(str)) return false;
      set.add(str);
      return true;
    });
    try {
      return await datasetDataReRank({
        rerankModel,
        query: reRankQuery,
        data: filterSameDataResults
      });
    } catch (error) {
      usingReRank = false;
      return {
        results: [],
        inputTokens: 0
      };
    }
  })();

  // embedding recall and fullText recall rrf concat
  const baseK = 120;
  const embK = Math.round(baseK * (1 - embeddingWeight)); // 搜索结果的 k 值
  const fullTextK = Math.round(baseK * embeddingWeight); // rerank 结果的 k 值

  const rrfSearchResult = datasetSearchResultConcat([
    { k: embK, list: embeddingRecallResults },
    { k: fullTextK, list: fullTextRecallResults }
  ]);
  const rrfConcatResults = (() => {
    if (reRankResults.length === 0) return rrfSearchResult;
    if (rerankWeight === 1) return reRankResults;

    const searchK = Math.round(baseK * rerankWeight); // 搜索结果的 k 值
    const rerankK = Math.round(baseK * (1 - rerankWeight)); // rerank 结果的 k 值

    return datasetSearchResultConcat([
      { k: searchK, list: rrfSearchResult },
      { k: rerankK, list: reRankResults }
    ]);
  })();

  // remove same q and a data
  set = new Set<string>();
  const filterSameDataResults = rrfConcatResults.filter((item) => {
    // 删除所有的标点符号与空格等，只对文本进行比较
    const str = hashStr(`${item.q}${item.a}`.replace(/[^\p{L}\p{N}]/gu, ''));
    if (set.has(str)) return false;
    set.add(str);
    return true;
  });

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

  return {
    searchRes: filterMaxTokensResult,
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
};
export const defaultSearchDatasetData = async ({
  datasetSearchUsingExtensionQuery,
  datasetSearchExtensionModel,
  datasetSearchExtensionBg,
  ...props
}: DefaultSearchDatasetDataProps): Promise<SearchDatasetDataResponse> => {
  const query = props.queries[0];
  const histories = props.histories;

  const extensionModel = datasetSearchUsingExtensionQuery
    ? getLLMModel(datasetSearchExtensionModel)
    : undefined;

  const { concatQueries, extensionQueries, rewriteQuery, aiExtensionResult } =
    await datasetSearchQueryExtension({
      query,
      extensionModel,
      extensionBg: datasetSearchExtensionBg,
      histories
    });

  const result = await searchDatasetData({
    ...props,
    reRankQuery: rewriteQuery,
    queries: concatQueries
  });

  return {
    ...result,
    queryExtensionResult: aiExtensionResult
      ? {
          model: aiExtensionResult.model,
          inputTokens: aiExtensionResult.inputTokens,
          outputTokens: aiExtensionResult.outputTokens,
          query: extensionQueries.join('\n')
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

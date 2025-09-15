import {
  DatasetSearchModeEnum,
  DatasetSearchModeMap,
  SearchScoreTypeEnum
} from '@fastgpt/global/core/dataset/constants';
import { recallFromVectorStore,databaseEmbeddingRecall } from '../../../common/vectorDB/controller';
import { getVectorsByText } from '../../ai/embedding';
import { getEmbeddingModel, getDefaultRerankModel, getLLMModel } from '../../ai/model';
import { MongoDatasetData } from '../data/schema';
import type {
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
import { formatDatasetDataValue } from '../data/controller';
import { DBDatasetValueVectorTableName, DBDatasetVectorTableName } from '../../../common/vectorDB/constants';
import { MongoDataset } from '../schema';
import { addLog } from '../../../common/system/log';

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

export type SearchDatabaseDataProps = {
  histories?: ChatItemType[];
  teamId: string;
  model: string;
  datasetIds: string[];
  queries: string[];
  [NodeInputKeyEnum.datasetMaxTokens]: number; // max Token limit
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

export type SearchDatabaseDataResponse = {
  schema: Record<string, {
    collectionId: string;
    datasetId: string;
    score: number;
  }>;
  tokens: number;
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
    '_id datasetId collectionId updateTime q a imageId imageDescMap chunkIndex indexes';
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
      return {
        embeddingRecallResults: [],
        tokens: 0
      };
    }

    const { vectors, tokens } = await getVectorsByText({
      model: getEmbeddingModel(model),
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
              map.set(String(index.dataId), item);
            });
          });

          return map;
        }),
      MongoDatasetCollection.find(
        {
          _id: { $in: collectionIdList }
        },
        datsaetCollectionSelectField,
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
              console.log('Collection is not found', item);
              return;
            }

            const data = dataMaps.get(String(item.id));
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
                imageId: data.imageId,
                imageDescMap: data.imageDescMap
              }),
              chunkIndex: data.chunkIndex,
              datasetId: String(data.datasetId),
              collectionId: String(data.collectionId),
              ...getCollectionSourceData(collection),
              score: [{ type: SearchScoreTypeEnum.embedding, value: item?.score || 0, index }]
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

    return {
      embeddingRecallResults,
      tokens
    };
  };
  const fullTextRecall = async ({
    queries,
    limit,
    filterCollectionIdList,
    forbidCollectionIdList
  }: {
    queries: string[];
    limit: number;
    filterCollectionIdList?: string[];
    forbidCollectionIdList: string[];
  }): Promise<{
    fullTextRecallResults: SearchDataResponseItemType[][];
  }> => {
    if (limit === 0) {
      return {
        fullTextRecallResults: []
      };
    }

    const recallResults = await Promise.all(
      queries.map(async (query) => {
        return (await MongoDatasetDataText.aggregate(
          [
            {
              $match: {
                teamId: new Types.ObjectId(teamId),
                $text: { $search: await jiebaSplit({ text: query }) },
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
          _id: { $in: collectionIds }
        },
        datsaetCollectionSelectField,
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
            console.log('Collection is not found', item);
            return;
          }

          const data = dataMaps.get(String(item.dataId));
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
              imageId: data.imageId,
              imageDescMap: data.imageDescMap
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
          return {
            ...item,
            score: item!.score.map((item) => ({ ...item, index }))
          };
        }) as SearchDataResponseItemType[];
    });

    return {
      fullTextRecallResults
    };
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

    const [{ tokens, embeddingRecallResults }, { fullTextRecallResults }] = await Promise.all([
      embeddingRecall({
        queries,
        limit: embeddingLimit,
        forbidCollectionIdList,
        filterCollectionIdList
      }),
      fullTextRecall({
        queries,
        limit: fullTextLimit,
        filterCollectionIdList,
        forbidCollectionIdList
      })
    ]);

    // rrf concat
    const rrfEmbRecall = datasetSearchResultConcat(
      embeddingRecallResults.map((list) => ({ k: 60, list }))
    ).slice(0, embeddingLimit);
    const rrfFTRecall = datasetSearchResultConcat(
      fullTextRecallResults.map((list) => ({ k: 60, list }))
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

/**
 * Database Embedding Recall Function
 *
 * Supports multiple vector databases (PG, Milvus, OceanBase) for database schema retrieval.
 * Automatically detects the vector database type based on environment configuration.
 *
 * @param teamId - Team identifier
 * @param datasetIds - Array of dataset identifiers
 * @param query - Search query for finding relevant database tables
 * @param limit - Maximum number of results to return (default: 10)
 * @returns DatabaseEmbedRecallResult containing schema mapping and token usage
 */
export const SearchDatabaseData = async (
  props:SearchDatabaseDataProps
): Promise<SearchDatabaseDataResponse> => {
  let {
    histories,
    teamId,
    model,
    datasetIds,
    queries,
    limit: maxTokens
  } = props;
  try {

    // Get forbid collection list for database search
    const forbidCollections = await MongoDatasetCollection.find(
      {
        teamId,
        datasetId: { $in: datasetIds },
        forbid: true
      },
      '_id'
    );
    // Step 1: Get embedding model from dataset configuration
    const vectorModel = getEmbeddingModel(model);
    let totalTokens = 0;
    // Step 2: Generate embedding vector for the query
    const columnDescriptionRecallResList: any[] = [];
    const columnValueRecallResultList: any[] = [];

    const forbidCollectionIdList = forbidCollections.map((item: any) => String(item._id));
    await Promise.all(
      queries.map(async (query:string) => {
        const {tokens, vectors}  = await getVectorsByText({
          model: vectorModel,
          input: query,
          type: 'query'
        });

        totalTokens += tokens;
        const q_vector = vectors[0];

        // Step 3: Column description search using unified interface
        const columnDescriptionResults = await columnDescriptionRecall({
          teamId,
          datasetIds,
          vector: q_vector,
          limit: maxTokens,
          forbidCollectionIdList
        });

        // Step 4: Column value search using unified interface
        const columnValueResults = await columnValueRecall({
          teamId,
          datasetIds,
          vector: q_vector,
          limit: maxTokens,
          forbidCollectionIdList
        });

        columnDescriptionRecallResList.push(...columnDescriptionResults)
        columnValueRecallResultList.push(...columnValueResults)
      })
    )

    // Step 5: Merge and integrate results
    const schema = await mergeAndGetSchema({
      columnDescriptionRecallResList,
      columnValueRecallResultList,
      teamId
    });

    addLog.info(`Database embed recall completed. Found ${Object.keys(schema).length} tables.`);
    addLog.debug('Schema results:', schema);

    return {
      schema,
      tokens: totalTokens
    };
  } catch (error) {
    addLog.error('Database embed recall error', error);
    return {
      schema: {},
      tokens: 0
    };
  }
};

// Helper function for column description recall
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
}) => {
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

    return results.map((result: any) => ({
      id: result.id,
      collectionId: result.collectionId,
      score: result.score,
      columnDesIndex: result.columnDesIndex
    }));
  } catch (error) {
    addLog.error('Column description recall error', error);
    return [];
  }
};

// Helper function for column value recall
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
}) => {
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

    return results.map((result: any) => ({
      id: result.id,
      collectionId: result.collectionId,
      score: result.score,
      columnValIndex: result.columnValIndex
    }));
  } catch (error) {
    addLog.error('Column value recall error', error);
    return [];
  }
};

// Helper function to merge results and get schema
const mergeAndGetSchema = async ({
  columnDescriptionRecallResList,
  columnValueRecallResultList,
  teamId
}: {
  columnDescriptionRecallResList: any[];
  columnValueRecallResultList: any[];
  teamId: string;
}) => {
  const schema: Record<string, { collectionId: string; datasetId: string; score: number }> = {};
  const collectionIds = new Set<string>();

  // Collect all collection IDs from both results
  [...columnDescriptionRecallResList, ...columnValueRecallResultList].forEach(result => {
    if (result.collectionId) {
      collectionIds.add(result.collectionId);
    }
  });

  // Batch fetch all collections
  const collections = await MongoDatasetCollection.find({
    _id: { $in: Array.from(collectionIds) },
    teamId
  })
    .select('_id datasetId name')
    .lean();

  const collectionMap = new Map(collections.map(col => [String(col._id), col]));

  // Process column description results
  for (const result of columnDescriptionRecallResList) {
    try {
      const collection = collectionMap.get(result.collectionId);
      if (collection && collection.name) {
        const tableName = collection.name;
        if (!schema[tableName] || result.score > schema[tableName].score) {
          schema[tableName] = {
            collectionId: String(result.collectionId),
            datasetId: String(collection.datasetId),
            score: result.score
          };
        }
      }
    } catch (error) {
      addLog.error('Error processing column description result', error);
    }
  }

  // Process column value results
  for (const result of columnValueRecallResultList) {
    try {
      const collection = collectionMap.get(result.collectionId);
      if (collection && collection.name) {
        const tableName = collection.name;
        if (!schema[tableName] || result.score > schema[tableName].score) {
          schema[tableName] = {
            collectionId: String(result.collectionId),
            datasetId: String(collection.datasetId),
            score: result.score
          };
        }
      }
    } catch (error) {
      addLog.error('Error processing column value result', error);
    }
  }

  return schema;
};


// SQL Generation types
export type SqlGenerationRequest = {
  source_config: {
    type : string,
    host: string,  
    port: number,
    username: string,
    password: string,
    db_name: string
  }
  generate_sql_llm: {
    model: string,
    api_key?: string,
    base_url?: string
  };
  evaluate_sql_llm: {
    model: string,
    api_key?: string,
    base_url?: string
  };
  query: string;
  result_num_limit: number;
  retrieved_metadata: {
    name: string;
    columns: Record<string, {
      name: string;
      type: string;
      description: string;
    }>;
  };
  evidence?: string;
};

export type SqlGenerationResponse = {
  answer: string;
  sql: string;
  sql_res: {
    data: any[];
    columns: string[];
  };
  input_tokens: number;
  output_tokens: number;
};


/**
 * Generate SQL and execute query using Python service
 */
export const generateAndExecuteSQL = async ({
  datasetId,
  query,
  schema,
  teamId,
  limit = 50,
  generate_sql_llm,
  evaluate_sql_llm
}: {
  datasetId: string;
  query: string;
  schema: Record<string, { collectionId: string; datasetId: string; score: number }>;
  teamId: string;
  limit?: number;
  generate_sql_llm: {model: string,api_key?: string,base_url?: string};
  evaluate_sql_llm: {model: string,api_key?: string,base_url?: string};
  externalProvider?: {
    openaiAccount?: {
      key: string;
      baseUrl: string;
    };
  };
}): Promise<SqlGenerationResponse | null> => {
  try {
    // Get dataset and database config
    const dataset = await MongoDataset.findById(datasetId).lean();
    if (!dataset?.databaseConfig) {
      addLog.warn('No database config found for dataset', { datasetId });
      return null;
    }

    const dbConfig: any = dataset.databaseConfig;

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

    if (!collections || collections.length === 0) {
      addLog.warn('No collections found for tables', { tableNames });
      return null;
    }

    // Build table schemas for Python service
    const retrievedMetadata = collections
      .filter(collection => collection.tableSchema?.columns)
      .map(collection => {
        const columns: Record<string, { name: string; type: string; description: string }> = {};
        if (collection.tableSchema?.columns) {
          Object.entries(collection.tableSchema.columns).forEach((col: any) => {
            columns[col.tableName] = {
              name: col.colName,
              type: col.type || 'varchar',
              description: col.description || ''
            };
          });
        }

        return {
          name: collection.name,
          columns,
          score: schema[collection.name]?.score || 0
        };
      });

    if (retrievedMetadata.length === 0) {
      addLog.warn('No valid table schemas found');
      return null;
    }

    // Sort by score (highest first) for better SQL generation
    retrievedMetadata.sort((a, b) => b.score - a.score);

    // Get Python service URL from environment
    const dativeUrl = process.env.DATIVE_BASE_URL;

    // Get LLM config from model
    const llmModelData = getLLMModel(generate_sql_llm.model);
    if (!llmModelData) {
      addLog.error(`Invalid LLM model specified for SQL generation ${generate_sql_llm.model}`);
      return null;
    }
    // Update request payload to include all table schemas
    const requestPayload: SqlGenerationRequest = {
      source_config: {
        type: dbConfig.client,
        host: dbConfig.host,
        port: dbConfig.port || 3306,
        username: dbConfig.user,
        password: dbConfig.password,
        db_name: dbConfig.database
      },
      generate_sql_llm,
      evaluate_sql_llm,
      query,
      result_num_limit: limit,
      retrieved_metadata: {
        name: retrievedMetadata[0].name, // Primary table name
        columns: retrievedMetadata.reduce((acc, table) => {
          // Merge all table columns with table prefix to avoid conflicts
          Object.entries(table.columns).forEach(([colName, colInfo]) => {
            acc[`${table.name}.${colName}`] = {
              name: colName,
              type: colInfo.type,
              description: `${table.name}表 - ${colInfo.description}`
            };
          });
          return acc;
        }, {} as Record<string, { name: string; type: string; description: string }>)
      }
    };

    addLog.info('Calling Python SQL generation service', {
      url: `${dativeUrl}/api/v1/data_source/query_by_nl`,
      tables: retrievedMetadata.map(t => t.name),
      primaryTable: retrievedMetadata[0].name,
      query
    });

    // Call Python service
    const response = await fetch(`${dativeUrl}/api/v1/data_source/query_by_nl`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestPayload)
    });

    if (!response.ok) {
      const errorText = await response.text();
      addLog.error('Python SQL service error', {
        status: response.status,
        statusText: response.statusText,
        error: errorText
      });
      return null;
    }

    const result: SqlGenerationResponse = await response.json();
    return result;

  } catch (error) {
    addLog.error('SQL generation failed', error);
    return null;
  }
};
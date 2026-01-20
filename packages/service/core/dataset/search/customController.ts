/**
 * Assistant 专属检索逻辑
 *
 * 此文件包含针对 Assistant 场景优化的检索函数
 * 主要改进:
 * 1. 修正检索结果与 Reranker 输入数据的一致性问题
 * 2. 解决 Reranker 分数丢失问题
 * 3. 优化的时间统计和结果限制逻辑
 */

import {
  DatasetSearchModeEnum,
  DatasetSearchModeMap,
  SearchScoreTypeEnum,
  RerankMethodEnum
} from '@fastgpt/global/core/dataset/constants';
import { recallFromVectorStore } from '../../../common/vectorDB/controller';
import { getVectorsByText } from '../../ai/embedding';
import { getEmbeddingModel, getDefaultRerankModel } from '../../ai/model';
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
import { datasetSearchResultConcat } from '@fastgpt/global/core/dataset/search/utils';
import { hashStr } from '@fastgpt/global/common/string/tools';
import { jiebaSplit } from '../../../common/string/jieba/index';
import { getCollectionSourceData } from '@fastgpt/global/core/dataset/collection/utils';
import { Types } from '../../../common/mongo';
import json5 from 'json5';
import { MongoDatasetCollectionTags } from '../tag/schema';
import { readFromSecondary } from '../../../common/mongo/utils';
import { MongoDatasetDataText } from '../data/dataTextSchema';
import { formatDatasetDataValue } from '../data/controller';
import { addLog } from '../../../common/system/log';
import type { SearchDatasetDataProps, SearchDatasetDataResponse } from './controller';

// Import exported functions from controller
import {
  datasetDataReRank as reRankFunction,
  filterDatasetDataByMaxTokens as filterFunction
} from './controller';

/**
 * Assistant 专属知识库搜索函数
 *
 * 与通用 searchDatasetData 的主要区别：
 * 1. 统计时间：retrievalTime（召回阶段）、rerankTime（重排阶段）
 * 2. 保存中间结果：retrievalResults（RRF 融合后的 top N）
 * 3. 限制结果数量：进入 reranker 前限制、最终结果限制
 * 4. 修正检索流程：先 RRF 融合排序 → 记录 retrievalResults → 去重后送 reranker
 *
 * @param props 检索参数（与 searchDatasetData 相同）
 * @returns 检索结果（包含 retrievalTime、rerankTime、retrievalResults）
 */
export async function searchDatasetDataForAssistant(
  props: SearchDatasetDataProps
): Promise<SearchDatasetDataResponse> {
  // 【步骤 1】检索开始计时
  const retrievalStartTime = Date.now();

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

  // Constants data
  const datasetDataSelectField =
    '_id datasetId collectionId updateTime q a imageId imageDescMap chunkIndex indexes metadata';
  const datasetCollectionSelectField =
    '_id name fileId rawLink apiFileId externalFileId externalFileUrl';

  /* init params */
  searchMode = DatasetSearchModeMap[searchMode] ? searchMode : DatasetSearchModeEnum.embedding;
  usingReRank = usingReRank && !!getDefaultRerankModel();

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
            ]
          },
          '_id',
          { ...readFromSecondary }
        ).lean();

        tagCollectionIdList = collections.map((item) => String(item._id));
      }

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
          _id: { $in: collectionIdList }
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
      return item.results
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
            score: [{ type: SearchScoreTypeEnum.embedding, value: item?.score || 0, index }],
            metadata: data.metadata
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
          return {
            ...item!,
            score: item!.score.map((item) => ({ ...item, index }))
          };
        }) as SearchDataResponseItemType[];
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

    // rrf concat (multi-query fusion)
    const rrfEmbRecall = datasetSearchResultConcat(
      embeddingRecallResults.map((list) => ({ k: 60, list }))
    ).slice(0, embeddingLimit);
    const rrfFTRecall = datasetSearchResultConcat(
      fullTextRecallResults.map((list) => ({ k: 60, list }))
    ).slice(0, fullTextLimit);

    // 打印召回统计日志
    addLog.debug('Assistant Recall Statistics', {
      embeddingIndexLimit: embeddingLimit,
      fullTextIndexLimit: fullTextLimit,
      embeddingChunkCount: rrfEmbRecall.length,
      fullTextChunkCount: rrfFTRecall.length
    });

    return {
      tokens,
      embeddingRecallResults: rrfEmbRecall,
      fullTextRecallResults: rrfFTRecall
    };
  };

  /* 【步骤 2】主流程：召回 */
  const { embeddingLimit, fullTextLimit } = countRecallLimit();

  const {
    embeddingRecallResults,
    fullTextRecallResults,
    tokens: embeddingTokens
  } = await multiQueryRecall({
    embeddingLimit,
    fullTextLimit
  });

  // 【步骤 3】计算检索耗时（召回阶段结束）
  const retrievalTime = +((Date.now() - retrievalStartTime) / 1000).toFixed(2);

  // 【步骤 4】Embedding + FullText RRF 融合（修正：先RRF，再送reranker）
  const baseK = 120;
  const embK = Math.round(baseK * (1 - embeddingWeight));
  const fullTextK = Math.round(baseK * embeddingWeight);

  const rrfSearchResult = datasetSearchResultConcat([
    { k: embK, list: embeddingRecallResults },
    { k: fullTextK, list: fullTextRecallResults }
  ]);

  // 【步骤 5】先去重，再取 top N
  // 去重（基于文本内容）- 这是进入 reranker 前的去重
  set = new Set<string>();
  const dedupedRrfResults = rrfSearchResult.filter((item) => {
    const str = hashStr(`${item.q}${item.a}`.replace(/[^\p{L}\p{N}]/gu, ''));
    if (set.has(str)) return false;
    set.add(str);
    return true;
  });

  // 取 top N（去重后的前 N 条）
  const retrievalLimit = global.systemEnv?.assistantRetrievalLimit ?? 20;
  addLog.debug('Assistant Config - assistantRetrievalLimit', { retrievalLimit });
  const dedupedResults = dedupedRrfResults.slice(0, retrievalLimit);

  // 【步骤 6】构建 retrievalResults（去重后、进入 reranker 前的结果）
  // 包含 embedding、fullText、rrf 三种分数
  const embeddingScoreMap = new Map<string, number>();
  embeddingRecallResults.forEach((item) => {
    const embScore = item.score.find((s) => s.type === SearchScoreTypeEnum.embedding);
    if (embScore) {
      embeddingScoreMap.set(item.id, embScore.value);
    }
  });

  const fullTextScoreMap = new Map<string, number>();
  fullTextRecallResults.forEach((item) => {
    const ftScore = item.score.find((s) => s.type === SearchScoreTypeEnum.fullText);
    if (ftScore) {
      fullTextScoreMap.set(item.id, ftScore.value);
    }
  });

  const retrievalResults = dedupedResults.map((item, index) => {
    const scores: { type: `${SearchScoreTypeEnum}`; value: number; index: number }[] = [];

    // 添加 embedding 分数（如果存在）
    const embScore = embeddingScoreMap.get(item.id);
    if (embScore !== undefined) {
      scores.push({
        type: SearchScoreTypeEnum.embedding,
        value: embScore,
        index
      });
    }

    // 添加 fullText 分数（如果存在）
    const ftScore = fullTextScoreMap.get(item.id);
    if (ftScore !== undefined) {
      scores.push({
        type: SearchScoreTypeEnum.fullText,
        value: ftScore,
        index
      });
    }

    // 添加 RRF 分数（从 item.score 中获取）
    const rrfScore = item.score.find((s) => s.type === SearchScoreTypeEnum.rrf);
    if (rrfScore) {
      scores.push({
        type: SearchScoreTypeEnum.rrf,
        value: rrfScore.value,
        index
      });
    }

    // 返回完整的结果，只替换 score 数组
    return {
      ...item,
      score: scores
    };
  });

  // 【步骤 7】重排开始计时
  const rerankStartTime = usingReRank ? Date.now() : undefined;

  // 【步骤 8】将去重后的结果送进 Reranker（重要：retrievalResults 就是送进 reranker 的数据）
  const { results: reRankResults, inputTokens: reRankInputTokens } = await (async () => {
    if (!usingReRank) {
      return {
        results: [],
        inputTokens: 0
      };
    }

    addLog.debug('Assistant Config - Data sent to reranker', {
      count: dedupedResults.length,
      dataIds: dedupedResults.slice(0, 5).map((item) => item.id)
    });

    try {
      return await reRankFunction({
        rerankModel,
        query: reRankQuery,
        data: dedupedResults,
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

  // 【Debug】打印 reranker 原始得分
  if (reRankResults.length > 0) {
    addLog.debug('Reranker original scores', {
      count: reRankResults.length,
      scores: reRankResults.map((item) => ({
        id: item.id,
        rerankScore: item.score.find((s) => s.type === SearchScoreTypeEnum.reRank)?.value,
        rerankIndex: item.score.find((s) => s.type === SearchScoreTypeEnum.reRank)?.index
      }))
    });
  }

  // 【步骤 9】RRF 融合：rrfSearchResult + reRankResults
  const rrfConcatResults = (() => {
    if (reRankResults.length === 0) return rrfSearchResult;
    if (rerankWeight === 1) return reRankResults;

    const searchK = Math.round(baseK * rerankWeight);
    const rerankK = Math.round(baseK * (1 - rerankWeight));

    return datasetSearchResultConcat([
      { k: searchK, list: rrfSearchResult },
      { k: rerankK, list: reRankResults }
    ]);
  })();

  // 【Debug】打印 RRF 融合后的得分情况
  if (reRankResults.length > 0) {
    addLog.debug('After RRF fusion - Top 10 results with all scores', {
      count: rrfConcatResults.length,
      topResults: rrfConcatResults.slice(0, 10).map((item, idx) => ({
        rank: idx + 1,
        id: item.id,
        scores: item.score.map((s) => ({
          type: s.type,
          value: s.value,
          index: s.index
        }))
      }))
    });
  }

  // 【步骤 10】去重
  set = new Set<string>();
  const filterSameDataResults = rrfConcatResults.filter((item) => {
    const str = hashStr(`${item.q}${item.a}`.replace(/[^\p{L}\p{N}]/gu, ''));
    if (set.has(str)) return false;
    set.add(str);
    return true;
  });

  // 【步骤 11】相似度过滤
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

  // 【步骤 12】Token 过滤
  const filterMaxTokensResult = await filterFunction(scoreFilter, maxTokens);

  // 【步骤 13】限制最终结果数量
  const finalResultLimit = global.systemEnv?.assistantFinalResultLimit ?? 10;
  addLog.debug('Assistant Config - assistantFinalResultLimit', { finalResultLimit });
  const finalResults =
    filterMaxTokensResult.length > finalResultLimit
      ? filterMaxTokensResult.slice(0, finalResultLimit)
      : filterMaxTokensResult;

  // 【步骤 14】重排结束计时
  const rerankTime =
    rerankStartTime !== undefined ? +((Date.now() - rerankStartTime) / 1000).toFixed(2) : undefined;

  return {
    searchRes: finalResults,
    embeddingTokens,
    reRankInputTokens,
    searchMode,
    limit: maxTokens,
    similarity,
    usingReRank,
    usingSimilarityFilter,
    retrievalTime, // 检索耗时（召回阶段）
    rerankTime, // 重排耗时（重排阶段）
    retrievalResults // 检索结果（RRF 融合后的 top N）
  };
}

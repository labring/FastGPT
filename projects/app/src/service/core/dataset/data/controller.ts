import { MongoDatasetData } from '@fastgpt/service/core/dataset/data/schema';
import {
  CreateDatasetDataProps,
  PatchIndexesProps,
  UpdateDatasetDataProps
} from '@fastgpt/global/core/dataset/controller';
import {
  insertDatasetDataVector,
  recallFromVectorStore,
  updateDatasetDataVector
} from '@fastgpt/service/common/vectorStore/controller';
import {
  DatasetDataIndexTypeEnum,
  DatasetSearchModeEnum,
  DatasetSearchModeMap,
  SearchScoreTypeEnum
} from '@fastgpt/global/core/dataset/constants';
import { datasetSearchResultConcat } from '@fastgpt/global/core/dataset/search/utils';
import { getDefaultIndex } from '@fastgpt/global/core/dataset/utils';
import { jiebaSplit } from '@/service/common/string/jieba';
import { deleteDatasetDataVector } from '@fastgpt/service/common/vectorStore/controller';
import { getVectorsByText } from '@fastgpt/service/core/ai/embedding';
import { MongoDatasetCollection } from '@fastgpt/service/core/dataset/collection/schema';
import {
  DatasetDataSchemaType,
  DatasetDataWithCollectionType,
  SearchDataResponseItemType
} from '@fastgpt/global/core/dataset/type';
import { reRankRecall } from '../../ai/rerank';
import { countPromptTokens } from '@fastgpt/global/common/string/tiktoken';
import { hashStr } from '@fastgpt/global/common/string/tools';
import type {
  PushDatasetDataProps,
  PushDatasetDataResponse
} from '@fastgpt/global/core/dataset/api.d';
import { pushDataListToTrainingQueue } from '@fastgpt/service/core/dataset/training/controller';
import { getVectorModel } from '../../ai/model';

export async function pushDataToTrainingQueue(
  props: {
    teamId: string;
    tmbId: string;
  } & PushDatasetDataProps
): Promise<PushDatasetDataResponse> {
  const result = await pushDataListToTrainingQueue({
    ...props,
    vectorModelList: global.vectorModels,
    datasetModelList: global.llmModels
  });

  return result;
}

/* insert data.
 * 1. create data id
 * 2. insert pg
 * 3. create mongo data
 */
export async function insertData2Dataset({
  teamId,
  tmbId,
  datasetId,
  collectionId,
  q,
  a = '',
  chunkIndex = 0,
  indexes,
  model
}: CreateDatasetDataProps & {
  model: string;
}) {
  if (!q || !datasetId || !collectionId || !model) {
    console.log(q, a, datasetId, collectionId, model);
    return Promise.reject('q, datasetId, collectionId, model is required');
  }
  if (String(teamId) === String(tmbId)) {
    return Promise.reject("teamId and tmbId can't be the same");
  }

  const qaStr = `${q}\n${a}`.trim();

  // empty indexes check, if empty, create default index
  indexes =
    Array.isArray(indexes) && indexes.length > 0
      ? indexes.map((index) => ({
          ...index,
          dataId: undefined,
          defaultIndex: indexes?.length === 1 && index.text === qaStr ? true : index.defaultIndex
        }))
      : [getDefaultIndex({ q, a })];

  // insert to vector store
  const result = await Promise.all(
    indexes.map((item) =>
      insertDatasetDataVector({
        query: item.text,
        model: getVectorModel(model),
        teamId,
        datasetId,
        collectionId
      })
    )
  );

  // create mongo data
  const { _id } = await MongoDatasetData.create({
    teamId,
    tmbId,
    datasetId,
    collectionId,
    q,
    a,
    fullTextToken: jiebaSplit({ text: qaStr }),
    chunkIndex,
    indexes: indexes.map((item, i) => ({
      ...item,
      dataId: result[i].insertId
    }))
  });

  return {
    insertId: _id,
    charsLength: result.reduce((acc, cur) => acc + cur.charsLength, 0)
  };
}

/**
 * update data
 * 1. compare indexes
 * 2. update pg data
 * 3. update mongo data
 */
export async function updateData2Dataset({
  dataId,
  q,
  a,
  indexes,
  model
}: UpdateDatasetDataProps & { model: string }) {
  if (!Array.isArray(indexes)) {
    return Promise.reject('indexes is required');
  }
  const qaStr = `${q}\n${a}`.trim();

  // patch index and update pg
  const mongoData = await MongoDatasetData.findById(dataId);
  if (!mongoData) return Promise.reject('core.dataset.error.Data not found');

  // make sure have one index
  if (indexes.length === 0) {
    const databaseDefaultIndex = mongoData.indexes.find((index) => index.defaultIndex);

    indexes = [
      getDefaultIndex({
        q,
        a,
        dataId: databaseDefaultIndex ? String(databaseDefaultIndex.dataId) : undefined
      })
    ];
  }

  // patch indexes, create, update, delete
  const patchResult: PatchIndexesProps[] = [];

  // find database indexes in new Indexes, if have not,  delete it
  for (const item of mongoData.indexes) {
    const index = indexes.find((index) => index.dataId === item.dataId);
    if (!index) {
      patchResult.push({
        type: 'delete',
        index: item
      });
    }
  }
  for (const item of indexes) {
    const index = mongoData.indexes.find((index) => index.dataId === item.dataId);
    // in database, update
    if (index) {
      // manual update index
      if (index.text !== item.text) {
        patchResult.push({
          type: 'update',
          index: item
        });
      } else if (index.defaultIndex && index.text !== qaStr) {
        // update default index
        patchResult.push({
          type: 'update',
          index: {
            ...item,
            type:
              item.type === DatasetDataIndexTypeEnum.qa && !a
                ? DatasetDataIndexTypeEnum.chunk
                : item.type,
            text: qaStr
          }
        });
      } else {
        patchResult.push({
          type: 'unChange',
          index: item
        });
      }
    } else {
      // not in database, create
      patchResult.push({
        type: 'create',
        index: item
      });
    }
  }

  // update mongo updateTime
  mongoData.updateTime = new Date();
  await mongoData.save();

  // update vector
  const result = await Promise.all(
    patchResult.map(async (item) => {
      if (item.type === 'create') {
        const result = await insertDatasetDataVector({
          query: item.index.text,
          model: getVectorModel(model),
          teamId: mongoData.teamId,
          datasetId: mongoData.datasetId,
          collectionId: mongoData.collectionId
        });
        item.index.dataId = result.insertId;
        return result;
      }
      if (item.type === 'update' && item.index.dataId) {
        const result = await updateDatasetDataVector({
          teamId: mongoData.teamId,
          datasetId: mongoData.datasetId,
          collectionId: mongoData.collectionId,
          id: item.index.dataId,
          query: item.index.text,
          model: getVectorModel(model)
        });
        item.index.dataId = result.insertId;

        return result;
      }
      if (item.type === 'delete' && item.index.dataId) {
        await deleteDatasetDataVector({
          teamId: mongoData.teamId,
          id: item.index.dataId
        });
        return {
          charsLength: 0
        };
      }
      return {
        charsLength: 0
      };
    })
  );

  const charsLength = result.reduce((acc, cur) => acc + cur.charsLength, 0);
  const newIndexes = patchResult.filter((item) => item.type !== 'delete').map((item) => item.index);

  // update mongo other data
  mongoData.q = q || mongoData.q;
  mongoData.a = a ?? mongoData.a;
  mongoData.fullTextToken = jiebaSplit({ text: mongoData.q + mongoData.a });
  // @ts-ignore
  mongoData.indexes = newIndexes;
  await mongoData.save();

  return {
    charsLength
  };
}

export async function searchDatasetData(props: {
  teamId: string;
  model: string;
  similarity?: number; // min distance
  limit: number; // max Token limit
  datasetIds: string[];
  searchMode?: `${DatasetSearchModeEnum}`;
  usingReRank?: boolean;
  rawQuery: string;
  queries: string[];
}) {
  let {
    teamId,
    rawQuery,
    queries,
    model,
    similarity = 0,
    limit: maxTokens,
    searchMode = DatasetSearchModeEnum.embedding,
    usingReRank = false,
    datasetIds = []
  } = props;

  /* init params */
  searchMode = DatasetSearchModeMap[searchMode] ? searchMode : DatasetSearchModeEnum.embedding;
  usingReRank = usingReRank && global.reRankModels.length > 0;

  // Compatible with topk limit
  if (maxTokens < 50) {
    maxTokens = 1500;
  }
  let set = new Set<string>();
  let usingSimilarityFilter = false;

  /* function */
  const countRecallLimit = () => {
    const oneChunkToken = 50;
    const estimatedLen = Math.max(20, Math.ceil(maxTokens / oneChunkToken));

    if (searchMode === DatasetSearchModeEnum.embedding) {
      return {
        embeddingLimit: Math.min(estimatedLen, 80),
        fullTextLimit: 0
      };
    }
    if (searchMode === DatasetSearchModeEnum.fullTextRecall) {
      return {
        embeddingLimit: 0,
        fullTextLimit: Math.min(estimatedLen, 50)
      };
    }
    return {
      embeddingLimit: Math.min(estimatedLen, 60),
      fullTextLimit: Math.min(estimatedLen, 40)
    };
  };
  const embeddingRecall = async ({ query, limit }: { query: string; limit: number }) => {
    const { vectors, charsLength } = await getVectorsByText({
      model: getVectorModel(model),
      input: query
    });

    const { results } = await recallFromVectorStore({
      vectors,
      limit,
      datasetIds,
      efSearch: global.systemEnv?.pgHNSWEfSearch
    });

    // get q and a
    const dataList = (await MongoDatasetData.find(
      {
        teamId,
        datasetId: { $in: datasetIds },
        'indexes.dataId': { $in: results.map((item) => item.id?.trim()) }
      },
      'datasetId collectionId q a chunkIndex indexes'
    )
      .populate('collectionId', 'name fileId rawLink')
      .lean()) as DatasetDataWithCollectionType[];

    // add score to data(It's already sorted. The first one is the one with the most points)
    const concatResults = dataList.map((data) => {
      const dataIdList = data.indexes.map((item) => item.dataId);

      const maxScoreResult = results.find((item) => {
        return dataIdList.includes(item.id);
      });

      return {
        ...data,
        score: maxScoreResult?.score || 0
      };
    });

    concatResults.sort((a, b) => b.score - a.score);

    const formatResult = concatResults
      .map((data, index) => {
        const result: SearchDataResponseItemType = {
          id: String(data._id),
          q: data.q,
          a: data.a,
          chunkIndex: data.chunkIndex,
          datasetId: String(data.datasetId),
          collectionId: String(data.collectionId._id),
          sourceName: data.collectionId.name || '',
          sourceId: data.collectionId?.fileId || data.collectionId?.rawLink,
          score: [{ type: SearchScoreTypeEnum.embedding, value: data.score, index }]
        };

        return result;
      })
      .filter((item) => item !== null) as SearchDataResponseItemType[];

    return {
      embeddingRecallResults: formatResult,
      charsLength
    };
  };
  const fullTextRecall = async ({
    query,
    limit
  }: {
    query: string;
    limit: number;
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

    let searchResults = (
      await Promise.all(
        datasetIds.map((id) =>
          MongoDatasetData.find(
            {
              teamId,
              datasetId: id,
              $text: { $search: jiebaSplit({ text: query }) }
            },
            {
              score: { $meta: 'textScore' },
              _id: 1,
              datasetId: 1,
              collectionId: 1,
              q: 1,
              a: 1,
              chunkIndex: 1
            }
          )
            .sort({ score: { $meta: 'textScore' } })
            .limit(limit)
            .lean()
        )
      )
    ).flat() as (DatasetDataSchemaType & { score: number })[];

    // resort
    searchResults.sort((a, b) => b.score - a.score);
    searchResults.slice(0, limit);

    const collections = await MongoDatasetCollection.find(
      {
        _id: { $in: searchResults.map((item) => item.collectionId) }
      },
      '_id name fileId rawLink'
    );

    return {
      fullTextRecallResults: searchResults.map((item, index) => {
        const collection = collections.find((col) => String(col._id) === String(item.collectionId));
        return {
          id: String(item._id),
          datasetId: String(item.datasetId),
          collectionId: String(item.collectionId),
          sourceName: collection?.name || '',
          sourceId: collection?.fileId || collection?.rawLink,
          q: item.q,
          a: item.a,
          chunkIndex: item.chunkIndex,
          indexes: item.indexes,
          score: [{ type: SearchScoreTypeEnum.fullText, value: item.score, index }]
        };
      }),
      tokenLen: 0
    };
  };
  const reRankSearchResult = async ({
    data,
    query
  }: {
    data: SearchDataResponseItemType[];
    query: string;
  }): Promise<SearchDataResponseItemType[]> => {
    try {
      const results = await reRankRecall({
        query,
        inputs: data.map((item) => ({
          id: item.id,
          text: `${item.q}\n${item.a}`
        }))
      });

      if (!Array.isArray(results)) {
        usingReRank = false;
        return [];
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

      return mergeResult;
    } catch (error) {
      usingReRank = false;
      return [];
    }
  };
  const filterResultsByMaxTokens = (list: SearchDataResponseItemType[], maxTokens: number) => {
    const results: SearchDataResponseItemType[] = [];
    let totalTokens = 0;

    for (let i = 0; i < list.length; i++) {
      const item = list[i];
      totalTokens += countPromptTokens(item.q + item.a);
      if (totalTokens > maxTokens + 500) {
        break;
      }
      results.push(item);
      if (totalTokens > maxTokens) {
        break;
      }
    }

    return results.length === 0 ? list.slice(0, 1) : results;
  };
  const multiQueryRecall = async ({
    embeddingLimit,
    fullTextLimit
  }: {
    embeddingLimit: number;
    fullTextLimit: number;
  }) => {
    // In a group n recall, as long as one of the data appears minAmount of times, it is retained
    const getIntersection = (resultList: SearchDataResponseItemType[][], minAmount = 1) => {
      minAmount = Math.min(resultList.length, minAmount);

      const map: Record<
        string,
        {
          amount: number;
          data: SearchDataResponseItemType;
        }
      > = {};

      for (const list of resultList) {
        for (const item of list) {
          map[item.id] = map[item.id]
            ? {
                amount: map[item.id].amount + 1,
                data: item
              }
            : {
                amount: 1,
                data: item
              };
        }
      }

      return Object.values(map)
        .filter((item) => item.amount >= minAmount)
        .map((item) => item.data);
    };

    // multi query recall
    const embeddingRecallResList: SearchDataResponseItemType[][] = [];
    const fullTextRecallResList: SearchDataResponseItemType[][] = [];
    let totalCharsLength = 0;
    for await (const query of queries) {
      const [{ charsLength, embeddingRecallResults }, { fullTextRecallResults }] =
        await Promise.all([
          embeddingRecall({
            query,
            limit: embeddingLimit
          }),
          fullTextRecall({
            query,
            limit: fullTextLimit
          })
        ]);
      totalCharsLength += charsLength;

      embeddingRecallResList.push(embeddingRecallResults);
      fullTextRecallResList.push(fullTextRecallResults);
    }

    return {
      charsLength: totalCharsLength,
      embeddingRecallResults: embeddingRecallResList[0],
      fullTextRecallResults: fullTextRecallResList[0]
    };
  };

  /* main step */
  // count limit
  const { embeddingLimit, fullTextLimit } = countRecallLimit();

  // recall
  const { embeddingRecallResults, fullTextRecallResults, charsLength } = await multiQueryRecall({
    embeddingLimit,
    fullTextLimit
  });

  // ReRank results
  const reRankResults = await (async () => {
    if (!usingReRank) return [];

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
    return reRankSearchResult({
      query: rawQuery,
      data: filterSameDataResults
    });
  })();

  // embedding recall and fullText recall rrf concat
  const rrfConcatResults = datasetSearchResultConcat([
    { k: 60, list: embeddingRecallResults },
    { k: 64, list: fullTextRecallResults },
    { k: 60, list: reRankResults }
  ]);

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

  return {
    searchRes: filterResultsByMaxTokens(scoreFilter, maxTokens),
    charsLength,
    searchMode,
    limit: maxTokens,
    similarity,
    usingReRank,
    usingSimilarityFilter
  };
}

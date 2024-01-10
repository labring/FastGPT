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
import { Types } from 'mongoose';
import {
  DatasetDataIndexTypeEnum,
  DatasetSearchModeEnum,
  DatasetSearchModeMap,
  SearchScoreTypeEnum,
  TrainingModeEnum
} from '@fastgpt/global/core/dataset/constant';
import { getDefaultIndex } from '@fastgpt/global/core/dataset/utils';
import { jiebaSplit } from '@/service/common/string/jieba';
import { deleteDatasetDataVector } from '@fastgpt/service/common/vectorStore/controller';
import { getVectorsByText } from '@fastgpt/service/core/ai/embedding';
import { MongoDatasetCollection } from '@fastgpt/service/core/dataset/collection/schema';
import {
  DatasetDataSchemaType,
  SearchDataResponseItemType
} from '@fastgpt/global/core/dataset/type';
import { reRankRecall } from '../../ai/rerank';
import { countPromptTokens } from '@fastgpt/global/common/string/tiktoken';
import { hashStr, simpleText } from '@fastgpt/global/common/string/tools';
import type { PushDatasetDataProps } from '@/global/core/dataset/api.d';
import type { PushDataResponse } from '@/global/core/api/datasetRes';
import { PushDatasetDataChunkProps } from '@fastgpt/global/core/dataset/api';
import { MongoDatasetTraining } from '@fastgpt/service/core/dataset/training/schema';
import { startQueue } from '@/service/utils/tools';
import { getCollectionWithDataset } from '@fastgpt/service/core/dataset/controller';
import { getQAModel, getVectorModel } from '../../ai/model';
import { delay } from '@fastgpt/global/common/system/utils';

export async function pushDataToDatasetCollection({
  teamId,
  tmbId,
  collectionId,
  data,
  prompt,
  billId,
  trainingMode
}: {
  teamId: string;
  tmbId: string;
} & PushDatasetDataProps): Promise<PushDataResponse> {
  const checkModelValid = async ({ collectionId }: { collectionId: string }) => {
    const {
      datasetId: { _id: datasetId, vectorModel, agentModel }
    } = await getCollectionWithDataset(collectionId);

    if (trainingMode === TrainingModeEnum.chunk) {
      if (!collectionId) return Promise.reject(`CollectionId is empty`);
      const vectorModelData = getVectorModel(vectorModel);
      if (!vectorModelData) {
        return Promise.reject(`Model ${vectorModel} is inValid`);
      }

      return {
        datasetId,
        maxToken: vectorModelData.maxToken * 1.5,
        model: vectorModelData.model,
        weight: vectorModelData.weight
      };
    }

    if (trainingMode === TrainingModeEnum.qa) {
      const qaModelData = getQAModel(agentModel);
      if (!qaModelData) {
        return Promise.reject(`Model ${agentModel} is inValid`);
      }
      return {
        datasetId,
        maxToken: qaModelData.maxContext * 0.8,
        model: qaModelData.model,
        weight: 0
      };
    }
    return Promise.reject(`Mode ${trainingMode} is inValid`);
  };

  const { datasetId, model, maxToken, weight } = await checkModelValid({
    collectionId
  });

  // format q and a, remove empty char
  data.forEach((item) => {
    item.q = simpleText(item.q);
    item.a = simpleText(item.a);

    item.indexes = item.indexes
      ?.map((index) => {
        return {
          ...index,
          text: simpleText(index.text)
        };
      })
      .filter(Boolean);
  });

  // filter repeat or equal content
  const set = new Set();
  const filterResult: Record<string, PushDatasetDataChunkProps[]> = {
    success: [],
    overToken: [],
    repeat: [],
    error: []
  };

  data.forEach((item) => {
    if (!item.q) {
      filterResult.error.push(item);
      return;
    }

    const text = item.q + item.a;

    // count q token
    const token = countPromptTokens(item.q);

    if (token > maxToken) {
      filterResult.overToken.push(item);
      return;
    }

    if (set.has(text)) {
      console.log('repeat', item);
      filterResult.repeat.push(item);
    } else {
      filterResult.success.push(item);
      set.add(text);
    }
  });

  // 插入记录
  const insertData = async (dataList: PushDatasetDataChunkProps[], retry = 3): Promise<number> => {
    try {
      const results = await MongoDatasetTraining.insertMany(
        dataList.map((item, i) => ({
          teamId,
          tmbId,
          datasetId,
          collectionId,
          billId,
          mode: trainingMode,
          prompt,
          model,
          q: item.q,
          a: item.a,
          chunkIndex: item.chunkIndex ?? i,
          weight: weight ?? 0,
          indexes: item.indexes
        }))
      );
      await delay(500);
      return results.length;
    } catch (error) {
      if (retry > 0) {
        await delay(1000);
        return insertData(dataList, retry - 1);
      }
      return Promise.reject(error);
    }
  };

  let insertLen = 0;
  const chunkSize = 50;
  const chunkList = filterResult.success.reduce(
    (acc, cur) => {
      const lastChunk = acc[acc.length - 1];
      if (lastChunk.length < chunkSize) {
        lastChunk.push(cur);
      } else {
        acc.push([cur]);
      }
      return acc;
    },
    [[]] as PushDatasetDataChunkProps[][]
  );
  for await (const chunks of chunkList) {
    insertLen += await insertData(chunks);
  }

  startQueue();
  delete filterResult.success;

  return {
    insertLen,
    ...filterResult
  };
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

  const id = new Types.ObjectId();
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
        model,
        teamId,
        tmbId,
        datasetId,
        collectionId,
        dataId: String(id)
      })
    )
  );

  // create mongo
  const { _id } = await MongoDatasetData.create({
    _id: id,
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
    tokens: result.reduce((acc, cur) => acc + cur.tokens, 0)
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
  if (!mongoData) return Promise.reject('Data not found');

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
      }
    } else {
      // not in database, create
      patchResult.push({
        type: 'create',
        index: item
      });
    }
  }

  const result = await Promise.all(
    patchResult.map(async (item) => {
      if (item.type === 'create') {
        const result = await insertDatasetDataVector({
          query: item.index.text,
          model,
          teamId: mongoData.teamId,
          tmbId: mongoData.tmbId,
          datasetId: mongoData.datasetId,
          collectionId: mongoData.collectionId,
          dataId
        });
        item.index.dataId = result.insertId;
        return result;
      }
      if (item.type === 'update' && item.index.dataId) {
        return updateDatasetDataVector({
          id: item.index.dataId,
          query: item.index.text,
          model
        });
      }
      if (item.type === 'delete' && item.index.dataId) {
        await deleteDatasetDataVector({
          id: item.index.dataId
        });
        return {
          tokens: 0
        };
      }
      return {
        tokens: 0
      };
    })
  );

  const tokens = result.reduce((acc, cur) => acc + cur.tokens, 0);

  // update mongo
  mongoData.q = q || mongoData.q;
  mongoData.a = a ?? mongoData.a;
  mongoData.fullTextToken = jiebaSplit({ text: mongoData.q + mongoData.a });
  // @ts-ignore
  mongoData.indexes = indexes;
  await mongoData.save();

  return {
    tokens
  };
}

export async function searchDatasetData(props: {
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
    const { vectors, tokens } = await getVectorsByText({
      model,
      input: query
    });

    const { results } = await recallFromVectorStore({
      vectors,
      limit,
      datasetIds
    });

    // get q and a
    const [collections, dataList] = await Promise.all([
      MongoDatasetCollection.find(
        {
          _id: { $in: results.map((item) => item.collectionId) }
        },
        'name fileId rawLink'
      ).lean(),
      MongoDatasetData.find(
        {
          _id: { $in: results.map((item) => item.dataId?.trim()) }
        },
        'datasetId collectionId q a chunkIndex indexes'
      ).lean()
    ]);

    const formatResult = results
      .map((item, index) => {
        const collection = collections.find(
          (collection) => String(collection._id) === item.collectionId
        );
        const data = dataList.find((data) => String(data._id) === item.dataId);

        // if collection or data UnExist, the relational mongo data already deleted
        if (!collection || !data) return null;

        const result: SearchDataResponseItemType = {
          id: String(data._id),
          q: data.q,
          a: data.a,
          chunkIndex: data.chunkIndex,
          datasetId: String(data.datasetId),
          collectionId: String(data.collectionId),
          sourceName: collection.name || '',
          sourceId: collection?.fileId || collection?.rawLink,
          score: [{ type: SearchScoreTypeEnum.embedding, value: item.score, index }]
        };

        return result;
      })
      .filter((item) => item !== null) as SearchDataResponseItemType[];

    return {
      embeddingRecallResults: formatResult,
      tokens
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
    let embTokens = 0;
    for await (const query of queries) {
      const [{ tokens, embeddingRecallResults }, { fullTextRecallResults }] = await Promise.all([
        embeddingRecall({
          query,
          limit: embeddingLimit
        }),
        fullTextRecall({
          query,
          limit: fullTextLimit
        })
      ]);
      embTokens += tokens;

      embeddingRecallResList.push(embeddingRecallResults);
      fullTextRecallResList.push(fullTextRecallResults);
    }

    return {
      tokens: embTokens,
      embeddingRecallResults: embeddingRecallResList[0],
      fullTextRecallResults: fullTextRecallResList[0]
    };
  };
  const rrfConcat = (
    arr: { k: number; list: SearchDataResponseItemType[] }[]
  ): SearchDataResponseItemType[] => {
    arr = arr.filter((item) => item.list.length > 0);

    if (arr.length === 0) return [];
    if (arr.length === 1) return arr[0].list;

    const map = new Map<string, SearchDataResponseItemType & { rrfScore: number }>();

    // rrf
    arr.forEach((item) => {
      const k = item.k;

      item.list.forEach((data, index) => {
        const rank = index + 1;
        const score = 1 / (k + rank);

        const record = map.get(data.id);
        if (record) {
          // 合并两个score,有相同type的score,取最大值
          const concatScore = [...record.score];
          for (const dataItem of data.score) {
            const sameScore = concatScore.find((item) => item.type === dataItem.type);
            if (sameScore) {
              sameScore.value = Math.max(sameScore.value, dataItem.value);
            } else {
              concatScore.push(dataItem);
            }
          }

          map.set(data.id, {
            ...record,
            score: concatScore,
            rrfScore: record.rrfScore + score
          });
        } else {
          map.set(data.id, {
            ...data,
            rrfScore: score
          });
        }
      });
    });

    // sort
    const mapArray = Array.from(map.values());
    const results = mapArray.sort((a, b) => b.rrfScore - a.rrfScore);

    return results.map((item, index) => {
      item.score.push({
        type: SearchScoreTypeEnum.rrf,
        value: item.rrfScore,
        index
      });
      // @ts-ignore
      delete item.rrfScore;
      return item;
    });
  };

  /* main step */
  // count limit
  const { embeddingLimit, fullTextLimit } = countRecallLimit();

  // recall
  const { embeddingRecallResults, fullTextRecallResults, tokens } = await multiQueryRecall({
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
  const rrfConcatResults = rrfConcat([
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
      return filterSameDataResults.filter((item) => {
        usingSimilarityFilter = true;

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
    tokens,
    searchMode,
    limit: maxTokens,
    similarity,
    usingReRank,
    usingSimilarityFilter
  };
}

import { MongoDatasetData } from '@fastgpt/service/core/dataset/data/schema';
import {
  CreateDatasetDataProps,
  PatchIndexesProps,
  UpdateDatasetDataProps
} from '@fastgpt/global/core/dataset/controller';
import {
  insertDatasetDataVector,
  recallFromVectorStore
} from '@fastgpt/service/common/vectorStore/controller';
import {
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
  DatasetDataItemType,
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
import { getVectorModel } from '@fastgpt/service/core/ai/model';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';

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

  const qaStr = getDefaultIndex({ q, a }).text;

  // empty indexes check, if empty, create default index
  indexes =
    Array.isArray(indexes) && indexes.length > 0
      ? indexes.map((index) => ({
          ...index,
          dataId: undefined,
          defaultIndex: index.text.trim() === qaStr
        }))
      : [getDefaultIndex({ q, a })];

  if (!indexes.find((index) => index.defaultIndex)) {
    indexes.unshift(getDefaultIndex({ q, a }));
  }

  indexes = indexes.slice(0, 6);

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
    indexes: indexes?.map((item, i) => ({
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
 * 2. insert new pg data
 * session run:
 *  3. update mongo data(session run)
 *  4. delete old pg data
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
  const qaStr = getDefaultIndex({ q, a }).text;

  // patch index and update pg
  const mongoData = await MongoDatasetData.findById(dataId);
  if (!mongoData) return Promise.reject('core.dataset.error.Data not found');

  // remove defaultIndex
  let formatIndexes = indexes.map((index) => ({
    ...index,
    text: index.text.trim(),
    defaultIndex: index.text.trim() === qaStr
  }));
  if (!formatIndexes.find((index) => index.defaultIndex)) {
    const defaultIndex = mongoData.indexes.find((index) => index.defaultIndex);
    formatIndexes.unshift(defaultIndex ? defaultIndex : getDefaultIndex({ q, a }));
  }
  formatIndexes = formatIndexes.slice(0, 6);

  // patch indexes, create, update, delete
  const patchResult: PatchIndexesProps[] = [];

  // find database indexes in new Indexes, if have not,  delete it
  for (const item of mongoData.indexes) {
    const index = formatIndexes.find((index) => index.dataId === item.dataId);
    if (!index) {
      patchResult.push({
        type: 'delete',
        index: item
      });
    }
  }
  for (const item of formatIndexes) {
    const index = mongoData.indexes.find((index) => index.dataId === item.dataId);
    // in database, update
    if (index) {
      // default index update
      if (index.defaultIndex && index.text !== qaStr) {
        patchResult.push({
          type: 'update',
          index: {
            //@ts-ignore
            ...index.toObject(),
            text: qaStr
          }
        });
        continue;
      }
      // custom index update
      if (index.text !== item.text) {
        patchResult.push({
          type: 'update',
          index: item
        });
        continue;
      }
      patchResult.push({
        type: 'unChange',
        index: item
      });
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

  // insert vector
  const clonePatchResult2Insert: PatchIndexesProps[] = JSON.parse(JSON.stringify(patchResult));
  const insertResult = await Promise.all(
    clonePatchResult2Insert.map(async (item) => {
      // insert new vector and update dateId
      if (item.type === 'create' || item.type === 'update') {
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
      return {
        tokens: 0
      };
    })
  );
  const tokens = insertResult.reduce((acc, cur) => acc + cur.tokens, 0);
  // console.log(clonePatchResult2Insert);
  await mongoSessionRun(async (session) => {
    // update mongo
    const newIndexes = clonePatchResult2Insert
      .filter((item) => item.type !== 'delete')
      .map((item) => item.index);
    // update mongo other data
    mongoData.q = q || mongoData.q;
    mongoData.a = a ?? mongoData.a;
    mongoData.fullTextToken = jiebaSplit({ text: mongoData.q + mongoData.a });
    // @ts-ignore
    mongoData.indexes = newIndexes;
    await mongoData.save({ session });

    // delete vector
    const deleteIdList = patchResult
      .filter((item) => item.type === 'delete' || item.type === 'update')
      .map((item) => item.index.dataId)
      .filter(Boolean);
    if (deleteIdList.length > 0) {
      await deleteDatasetDataVector({
        teamId: mongoData.teamId,
        idList: deleteIdList as string[]
      });
    }
  });

  return {
    tokens
  };
}

export const deleteDatasetData = async (data: DatasetDataItemType) => {
  await mongoSessionRun(async (session) => {
    await MongoDatasetData.findByIdAndDelete(data.id, { session });
    await deleteDatasetDataVector({
      teamId: data.teamId,
      idList: data.indexes.map((item) => item.dataId)
    });
  });
};

type SearchDatasetDataProps = {
  teamId: string;
  model: string;
  similarity?: number; // min distance
  limit: number; // max Token limit
  datasetIds: string[];
  searchMode?: `${DatasetSearchModeEnum}`;
  usingReRank?: boolean;
  reRankQuery: string;
  queries: string[];
};

export async function searchDatasetData(props: SearchDatasetDataProps) {
  let {
    teamId,
    reRankQuery,
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
      embeddingLimit: 60,
      fullTextLimit: 40
    };
  };
  const embeddingRecall = async ({ query, limit }: { query: string; limit: number }) => {
    const { vectors, tokens } = await getVectorsByText({
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
        if (!data.collectionId) {
          console.log('Collection is not found', data);
        }

        const result: SearchDataResponseItemType = {
          id: String(data._id),
          q: data.q,
          a: data.a,
          chunkIndex: data.chunkIndex,
          datasetId: String(data.datasetId),
          collectionId: String(data.collectionId?._id),
          sourceName: data.collectionId?.name || '',
          sourceId: data.collectionId?.fileId || data.collectionId?.rawLink,
          score: [{ type: SearchScoreTypeEnum.embedding, value: data.score, index }]
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

      if (results.length === 0) {
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
    // multi query recall
    const embeddingRecallResList: SearchDataResponseItemType[][] = [];
    const fullTextRecallResList: SearchDataResponseItemType[][] = [];
    let totalTokens = 0;

    await Promise.all(
      queries.map(async (query) => {
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
      query: reRankQuery,
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
    tokens,
    searchMode,
    limit: maxTokens,
    similarity,
    usingReRank,
    usingSimilarityFilter
  };
}

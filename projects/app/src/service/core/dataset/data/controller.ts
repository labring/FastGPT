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
  DatasetSearchModeEnum
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
import { hashStr } from '@fastgpt/global/common/string/tools';

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
    datasetIds = []
  } = props;

  /* init params */
  searchMode = global.systemEnv?.pluginBaseUrl ? searchMode : DatasetSearchModeEnum.embedding;
  // Compatible with topk limit
  if (maxTokens < 50) {
    maxTokens = 1500;
  }
  const rerank =
    global.reRankModels?.[0] &&
    (searchMode === DatasetSearchModeEnum.embeddingReRank ||
      searchMode === DatasetSearchModeEnum.embFullTextReRank);
  let set = new Set<string>();

  /* function */
  const countRecallLimit = () => {
    const oneChunkToken = 50;
    const estimatedLen = Math.max(20, Math.ceil(maxTokens / oneChunkToken));

    // Increase search range, reduce hnsw loss. 20 ~ 100
    if (searchMode === DatasetSearchModeEnum.embedding) {
      return {
        embeddingLimit: Math.min(estimatedLen, 100),
        fullTextLimit: 0
      };
    }
    // 50 < 2*limit < value < 100
    if (searchMode === DatasetSearchModeEnum.embeddingReRank) {
      return {
        embeddingLimit: Math.min(100, Math.max(50, estimatedLen * 2)),
        fullTextLimit: 0
      };
    }
    // 50 < 2*limit < embedding < 80
    // 20 < limit < fullTextLimit < 40
    return {
      embeddingLimit: Math.min(80, Math.max(50, estimatedLen * 2)),
      fullTextLimit: Math.min(40, Math.max(20, estimatedLen))
    };
  };
  const embeddingRecall = async ({ query, limit }: { query: string; limit: number }) => {
    const { vectors, tokens } = await getVectorsByText({
      model,
      input: [query]
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
      .map((item) => {
        const collection = collections.find(
          (collection) => String(collection._id) === item.collectionId
        );
        const data = dataList.find((data) => String(data._id) === item.dataId);

        // if collection or data UnExist, the relational mongo data already deleted
        if (!collection || !data) return null;

        return {
          id: String(data._id),
          q: data.q,
          a: data.a,
          chunkIndex: data.chunkIndex,
          indexes: data.indexes,
          datasetId: String(data.datasetId),
          collectionId: String(data.collectionId),
          sourceName: collection.name || '',
          sourceId: collection?.fileId || collection?.rawLink,
          score: item.score
        };
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
              indexes: 1,
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
      fullTextRecallResults: searchResults.map((item) => {
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
          // @ts-ignore
          score: item.score
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

      if (!Array.isArray(results)) return data;

      // add new score to data
      const mergeResult = results
        .map((item) => {
          const target = data.find((dataItem) => dataItem.id === item.id);
          if (!target) return null;
          return {
            ...target,
            score: item.score || target.score
          };
        })
        .filter(Boolean) as SearchDataResponseItemType[];

      return mergeResult;
    } catch (error) {
      return data;
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
      embeddingRecallResults: getIntersection(embeddingRecallResList, 2),
      fullTextRecallResults: getIntersection(fullTextRecallResList, 2)
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

  // concat recall results
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

  if (!rerank) {
    return {
      searchRes: filterResultsByMaxTokens(
        filterSameDataResults.filter((item) => item.score >= similarity),
        maxTokens
      ),
      tokens
    };
  }

  // ReRank results
  const reRankResults = (
    await reRankSearchResult({
      query: rawQuery,
      data: filterSameDataResults
    })
  ).filter((item) => item.score > similarity);

  return {
    searchRes: filterResultsByMaxTokens(
      reRankResults.filter((item) => item.score >= similarity),
      maxTokens
    ),
    tokens
  };
}

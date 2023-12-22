import { DatasetSearchModeEnum, PgDatasetTableName } from '@fastgpt/global/core/dataset/constant';
import type {
  DatasetDataSchemaType,
  SearchDataResponseItemType
} from '@fastgpt/global/core/dataset/type.d';
import { PgClient } from '@fastgpt/service/common/pg';
import { getVectorsByText } from '@/service/core/ai/vector';
import { delay } from '@fastgpt/global/common/system/utils';
import { PgSearchRawType } from '@fastgpt/global/core/dataset/api';
import { MongoDatasetCollection } from '@fastgpt/service/core/dataset/collection/schema';
import { MongoDatasetData } from '@fastgpt/service/core/dataset/data/schema';
import { jiebaSplit } from '../utils';
import { reRankRecall } from '../../ai/rerank';
import { countPromptTokens } from '@fastgpt/global/common/string/tiktoken';
import { hashStr } from '@fastgpt/global/common/string/tools';

export async function insertData2Pg(props: {
  mongoDataId: string;
  input: string;
  model: string;
  teamId: string;
  tmbId: string;
  datasetId: string;
  collectionId: string;
  retry?: number;
}): Promise<{ insertId: string; vectors: number[][]; tokenLen: number }> {
  const { mongoDataId, input, model, teamId, tmbId, datasetId, collectionId, retry = 3 } = props;
  try {
    // get vector
    const { vectors, tokenLen } = await getVectorsByText({
      model,
      input: [input]
    });
    const { rows } = await PgClient.insert(PgDatasetTableName, {
      values: [
        [
          { key: 'vector', value: `[${vectors[0]}]` },
          { key: 'team_id', value: String(teamId) },
          { key: 'tmb_id', value: String(tmbId) },
          { key: 'dataset_id', value: datasetId },
          { key: 'collection_id', value: collectionId },
          { key: 'data_id', value: String(mongoDataId) }
        ]
      ]
    });
    return {
      insertId: rows[0].id,
      vectors,
      tokenLen
    };
  } catch (error) {
    if (retry <= 0) {
      return Promise.reject(error);
    }
    await delay(500);
    return insertData2Pg({
      ...props,
      retry: retry - 1
    });
  }
}

export async function updatePgDataById({
  id,
  input,
  model
}: {
  id: string;
  input: string;
  model: string;
}) {
  let retry = 2;
  async function updatePg(): Promise<{ vectors: number[][]; tokenLen: number }> {
    try {
      // get vector
      const { vectors, tokenLen } = await getVectorsByText({
        model,
        input: [input]
      });
      // update pg
      await PgClient.update(PgDatasetTableName, {
        where: [['id', id]],
        values: [{ key: 'vector', value: `[${vectors[0]}]` }]
      });
      return {
        vectors,
        tokenLen
      };
    } catch (error) {
      if (--retry < 0) {
        return Promise.reject(error);
      }
      await delay(500);
      return updatePg();
    }
  }
  return updatePg();
}

// ------------------ search start ------------------
type SearchProps = {
  model: string;
  similarity?: number; // min distance
  limit: number; // max Token limit
  datasetIds: string[];
  searchMode?: `${DatasetSearchModeEnum}`;
};
export async function searchDatasetData(
  props: SearchProps & { rawQuery: string; queries: string[] }
) {
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
    const { vectors, tokenLen } = await getVectorsByText({
      model,
      input: [query]
    });

    const results: any = await PgClient.query(
      `BEGIN;
      SET LOCAL hnsw.ef_search = ${global.systemEnv.pgHNSWEfSearch || 100};
      select id, collection_id, data_id, (vector <#> '[${vectors[0]}]') * -1 AS score 
        from ${PgDatasetTableName} 
        where dataset_id IN (${datasetIds.map((id) => `'${String(id)}'`).join(',')})
            ${rerank ? '' : `AND vector <#> '[${vectors[0]}]' < -${similarity}`}
        order by score desc limit ${limit};
      COMMIT;`
    );

    const rows = results?.[2]?.rows as PgSearchRawType[];

    // concat same data_id
    const filterRows: PgSearchRawType[] = [];
    let set = new Set<string>();
    for (const row of rows) {
      if (!set.has(row.data_id)) {
        filterRows.push(row);
        set.add(row.data_id);
      }
    }

    // get q and a
    const [collections, dataList] = await Promise.all([
      MongoDatasetCollection.find(
        {
          _id: { $in: filterRows.map((item) => item.collection_id) }
        },
        'name fileId rawLink'
      ).lean(),
      MongoDatasetData.find(
        {
          _id: { $in: filterRows.map((item) => item.data_id?.trim()) }
        },
        'datasetId collectionId q a chunkIndex indexes'
      ).lean()
    ]);
    const formatResult = filterRows
      .map((item) => {
        const collection = collections.find(
          (collection) => String(collection._id) === item.collection_id
        );
        const data = dataList.find((data) => String(data._id) === item.data_id);

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
      tokenLen
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
      const [{ tokenLen, embeddingRecallResults }, { fullTextRecallResults }] = await Promise.all([
        embeddingRecall({
          query,
          limit: embeddingLimit
        }),
        fullTextRecall({
          query,
          limit: fullTextLimit
        })
      ]);
      embTokens += tokenLen;

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
      tokenLen: tokens
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
    tokenLen: tokens
  };
}
// ------------------ search end ------------------

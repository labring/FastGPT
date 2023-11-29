import { DatasetSearchModeEnum, PgDatasetTableName } from '@fastgpt/global/core/dataset/constant';
import type {
  DatasetDataSchemaType,
  SearchDataResponseItemType
} from '@fastgpt/global/core/dataset/type.d';
import { PgClient } from '@fastgpt/service/common/pg';
import { getVectorsByText } from '@/service/core/ai/vector';
import { delay } from '@/utils/tools';
import { PgSearchRawType } from '@fastgpt/global/core/dataset/api';
import { MongoDatasetCollection } from '@fastgpt/service/core/dataset/collection/schema';
import { MongoDatasetData } from '@fastgpt/service/core/dataset/data/schema';
import { jiebaSplit } from '../utils';
import { reRankRecall } from '../../ai/rerank';

export async function insertData2Pg({
  mongoDataId,
  input,
  model,
  teamId,
  tmbId,
  datasetId,
  collectionId
}: {
  mongoDataId: string;
  input: string;
  model: string;
  teamId: string;
  tmbId: string;
  datasetId: string;
  collectionId: string;
}) {
  let retry = 2;
  async function insertPg(): Promise<{ insertId: string; vectors: number[][]; tokenLen: number }> {
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
      if (--retry < 0) {
        return Promise.reject(error);
      }
      await delay(500);
      return insertPg();
    }
  }

  return insertPg();
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

export async function deletePgDataById(
  where: ['id' | 'dataset_id' | 'collection_id' | 'data_id', string] | string
) {
  let retry = 2;
  async function deleteData(): Promise<any> {
    try {
      await PgClient.delete(PgDatasetTableName, {
        where: [where]
      });
    } catch (error) {
      if (--retry < 0) {
        return Promise.reject(error);
      }
      await delay(500);
      return deleteData();
    }
  }

  await deleteData();

  return {
    tokenLen: 0
  };
}

// ------------------ search start ------------------
type SearchProps = {
  text: string;
  model: string;
  similarity?: number; // min distance
  limit: number;
  datasetIds: string[];
  searchMode?: `${DatasetSearchModeEnum}`;
};
export async function searchDatasetData(props: SearchProps) {
  let { text, similarity = 0, limit, searchMode = DatasetSearchModeEnum.embedding } = props;
  searchMode = global.systemEnv.pluginBaseUrl ? searchMode : DatasetSearchModeEnum.embedding;

  const rerank =
    searchMode === DatasetSearchModeEnum.embeddingReRank ||
    searchMode === DatasetSearchModeEnum.embFullTextReRank;

  const { embeddingLimit, fullTextLimit } = (() => {
    // Increase search range, reduce hnsw loss
    if (searchMode === DatasetSearchModeEnum.embedding) {
      return {
        embeddingLimit: limit * 2,
        fullTextLimit: 0
      };
    }
    // 50 < 2*limit < value < 100
    if (searchMode === DatasetSearchModeEnum.embeddingReRank) {
      return {
        embeddingLimit: Math.min(100, Math.max(50, limit * 2)),
        fullTextLimit: 0
      };
    }
    // 50 < 3*limit < embedding < 80
    // 20 < limit < fullTextLimit < 40
    return {
      embeddingLimit: Math.min(80, Math.max(50, limit * 2)),
      fullTextLimit: Math.min(40, Math.max(20, limit))
    };
  })();

  const [{ tokenLen, embeddingRecallResults }, { fullTextRecallResults }] = await Promise.all([
    embeddingRecall({
      ...props,
      rerank,
      limit: embeddingLimit
    }),
    fullTextRecall({
      ...props,
      limit: fullTextLimit
    })
  ]);

  // concat embedding and fullText recall result
  let set = new Set<string>(embeddingRecallResults.map((item) => item.id));
  const concatRecallResults = embeddingRecallResults;
  fullTextRecallResults.forEach((item) => {
    if (!set.has(item.id) && item.score >= similarity) {
      concatRecallResults.push(item);
      set.add(item.id);
    }
  });

  // remove same q and a data
  set = new Set<string>();
  const filterSameDataResults = concatRecallResults.filter((item) => {
    const str = `${item.q}${item.a}`.trim();
    if (set.has(str)) return false;
    set.add(str);
    return true;
  });

  if (!rerank) {
    return {
      searchRes: filterSameDataResults.filter((item) => item.score >= similarity).slice(0, limit),
      tokenLen
    };
  }

  // ReRank result
  const reRankResults = (
    await reRankSearchResult({
      query: text,
      data: filterSameDataResults
    })
  ).filter((item) => item.score > similarity);

  // (It's possible that rerank failed) concat rerank results and search results
  set = new Set<string>(reRankResults.map((item) => item.id));
  embeddingRecallResults.forEach((item) => {
    if (!set.has(item.id) && item.score >= similarity) {
      reRankResults.push(item);
      set.add(item.id);
    }
  });

  return {
    searchRes: reRankResults.slice(0, limit),
    tokenLen
  };
}
export async function embeddingRecall({
  text,
  model,
  similarity = 0,
  limit,
  datasetIds = [],
  rerank = false
}: SearchProps & { rerank: boolean }) {
  const { vectors, tokenLen } = await getVectorsByText({
    model,
    input: [text]
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
      'datasetId collectionId q a indexes'
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
}
export async function fullTextRecall({ text, limit, datasetIds = [] }: SearchProps): Promise<{
  fullTextRecallResults: SearchDataResponseItemType[];
  tokenLen: number;
}> {
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
            $text: { $search: jiebaSplit({ text }) }
          },
          {
            score: { $meta: 'textScore' },
            _id: 1,
            datasetId: 1,
            collectionId: 1,
            q: 1,
            a: 1,
            indexes: 1
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
        indexes: item.indexes,
        // @ts-ignore
        score: item.score
      };
    }),
    tokenLen: 0
  };
}
// plus reRank search result
export async function reRankSearchResult({
  data,
  query
}: {
  data: SearchDataResponseItemType[];
  query: string;
}): Promise<SearchDataResponseItemType[]> {
  try {
    const results = await reRankRecall({
      query,
      inputs: data.map((item) => ({
        id: item.id,
        text: `${item.q}\n${item.a}`
      }))
    });

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
    console.log(error);

    return [];
  }
}
// ------------------ search end ------------------

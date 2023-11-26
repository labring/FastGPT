import { PgDatasetTableName } from '@fastgpt/global/core/dataset/constant';
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
import { POST } from '@fastgpt/service/common/api/plusRequest';
import { PostReRankResponse } from '@fastgpt/global/core/ai/api';
import { jiebaSplit } from '../utils';

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
  rerank?: boolean;
};
export async function searchDatasetData(props: SearchProps) {
  const { text, similarity = 0, limit, rerank = false } = props;

  const [{ tokenLen, embeddingRecallResults }, { fullTextRecallResults }] = await Promise.all([
    embeddingRecall({
      ...props,
      limit: rerank ? Math.max(50, limit * 3) : limit * 2
    }),
    fullTextRecall({
      ...props,
      limit: 40
    })
  ]);

  // concat recall result
  let set = new Set<string>();
  const concatRecallResults = embeddingRecallResults;
  for (const item of fullTextRecallResults) {
    if (!set.has(item.id)) {
      concatRecallResults.push(item);
      set.add(item.id);
    }
  }

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
      searchRes: filterSameDataResults.slice(0, limit),
      tokenLen
    };
  }

  // ReRank result
  const reRankResults = await reRankSearchResult({
    query: text,
    data: filterSameDataResults
  });

  // similarity filter
  const filterReRankResults = reRankResults.filter((item) => item.score > similarity);

  // concat rerank and embedding data
  set = new Set<string>(filterReRankResults.map((item) => item.id));
  const concatResult = filterReRankResults.concat(
    filterSameDataResults.filter((item) => {
      if (set.has(item.id)) return false;
      set.add(item.id);
      return true;
    })
  );

  return {
    searchRes: concatResult.slice(0, limit),
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
}: SearchProps) {
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
      'name metadata'
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
        sourceId: collection.metadata?.fileId || collection.metadata?.rawLink,
        score: item.score
      };
    })
    .filter((item) => item !== null) as SearchDataResponseItemType[];

  return {
    embeddingRecallResults: formatResult,
    tokenLen
  };
}
export async function fullTextRecall({
  text,
  limit,
  datasetIds = [],
  rerank = false
}: SearchProps): Promise<{
  fullTextRecallResults: SearchDataResponseItemType[];
  tokenLen: number;
}> {
  if (!rerank) {
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
    '_id name metadata'
  );

  return {
    fullTextRecallResults: searchResults.map((item) => {
      const collection = collections.find((col) => String(col._id) === String(item.collectionId));
      return {
        id: String(item._id),
        datasetId: String(item.datasetId),
        collectionId: String(item.collectionId),
        sourceName: collection?.name || '',
        sourceId: collection?.metadata?.fileId || collection?.metadata?.rawLink,
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
  if (!global.systemEnv.pluginBaseUrl) return data;
  try {
    const result = await POST<PostReRankResponse>('/core/ai/retrival/rerank', {
      query,
      inputs: data.map((item) => ({
        id: item.id,
        text: `${item.q}\n${item.a}`.trim()
      }))
    });
    const mergeResult = result
      .map((item) => {
        const target = data.find((dataItem) => dataItem.id === item.id);
        if (!target) return null;
        return {
          ...target,
          score: item.score ?? target.score
        };
      })
      .filter(Boolean) as SearchDataResponseItemType[];

    return mergeResult;
  } catch (error) {
    console.log(error);

    return data;
  }
}
// ------------------ search end ------------------

import { PgDatasetTableName } from '@fastgpt/global/core/dataset/constant';
import {
  SearchDataResponseItemType,
  SearchDataResultItemType
} from '@fastgpt/global/core/dataset/type';
import { PgClient } from '@fastgpt/service/common/pg';
import { getVectorsByText } from '../../ai/vector';
import { getPgDataWithCollection } from './controller';

/**
 * Same value judgment
 */
export async function hasSameValue({
  collectionId,
  q,
  a = ''
}: {
  collectionId: string;
  q: string;
  a?: string;
}) {
  const { rows: existsRows } = await PgClient.query(`
  SELECT COUNT(*) > 0 AS exists
  FROM  ${PgDatasetTableName} 
  WHERE md5(q)=md5('${q}') AND md5(a)=md5('${a}') AND collection_id='${collectionId}'
`);
  const exists = existsRows[0]?.exists || false;

  if (exists) {
    return Promise.reject('已经存在完全一致的数据');
  }
}

/**
 * count one collection amount of total data
 */
export async function countCollectionData({
  collectionIds,
  datasetId
}: {
  collectionIds: string[];
  datasetId?: string;
}) {
  collectionIds = collectionIds.map((item) => String(item));
  if (collectionIds.length === 0) return [];

  const { rows } = await PgClient.query(`
  SELECT 
    ${collectionIds
      .map((id) => `SUM(CASE WHEN collection_id = '${id}' THEN 1 ELSE 0 END) AS count${id}`)
      .join(',')}
  FROM ${PgDatasetTableName}
  WHERE collection_id IN (${collectionIds.map((id) => `'${id}'`).join(',')}) 
    ${datasetId ? `AND dataset_id='${String(datasetId)}` : ''}';
  `);

  const values = Object.values(rows[0]).map((item) => Number(item));

  return values;
}

export async function searchDatasetData({
  text,
  model,
  similarity = 0,
  limit,
  datasetIds = []
}: {
  text: string;
  model: string;
  similarity?: number;
  limit: number;
  datasetIds: string[];
}) {
  const { vectors, tokenLen } = await getVectorsByText({
    model,
    input: [text]
  });

  const results: any = await PgClient.query(
    `BEGIN;
    SET LOCAL hnsw.ef_search = ${global.systemEnv.pgHNSWEfSearch || 100};
    select id, q, a, collection_id, (vector <#> '[${
      vectors[0]
    }]') * -1 AS score from ${PgDatasetTableName} where dataset_id IN (${datasetIds
      .map((id) => `'${String(id)}'`)
      .join(',')}) AND vector <#> '[${vectors[0]}]' < -${similarity} order by vector <#> '[${
      vectors[0]
    }]' limit ${limit};
    COMMIT;`
  );

  const rows = results?.[2]?.rows as SearchDataResultItemType[];
  const collectionsData = await getPgDataWithCollection({ pgDataList: rows });
  const searchRes: SearchDataResponseItemType[] = collectionsData.map((item, index) => ({
    ...item,
    score: rows[index].score
  }));

  return {
    searchRes,
    tokenLen
  };
}

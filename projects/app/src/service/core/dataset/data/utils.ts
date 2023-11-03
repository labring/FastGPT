import { PgDatasetTableName } from '@/constants/plugin';
import { PgClient } from '@/service/pg';

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

import { PgDatasetTableName } from '@/constants/plugin';
import { getVector } from '@/pages/api/openapi/plugin/vector';
import { PgClient } from '@/service/pg';
import { delay } from '@/utils/tools';

/**
 * Same value judgment
 */
export async function hasSameValue({
  collectionId,
  userId,
  q,
  a = ''
}: {
  collectionId: string;
  userId: string;
  q: string;
  a?: string;
}) {
  const { rows: existsRows } = await PgClient.query(`
  SELECT COUNT(*) > 0 AS exists
  FROM  ${PgDatasetTableName} 
  WHERE md5(q)=md5('${q}') AND md5(a)=md5('${a}') AND user_id='${userId}' AND collection_id='${collectionId}'
`);
  const exists = existsRows[0]?.exists || false;

  if (exists) {
    return Promise.reject('已经存在完全一致的数据');
  }
}

type Props = {
  userId: string;
  q: string;
  a?: string;
  model: string;
};

export async function insertData2Dataset({
  userId,
  datasetId,
  collectionId,
  q,
  a = '',
  model,
  billId
}: Props & {
  datasetId: string;
  collectionId: string;
  billId?: string;
}) {
  if (!q || !datasetId || !collectionId || !model) {
    return Promise.reject('q, datasetId, collectionId, model is required');
  }
  const { vectors } = await getVector({
    model,
    input: [q],
    userId,
    billId
  });

  let retry = 2;
  async function insertPg() {
    try {
      const { rows } = await PgClient.insert(PgDatasetTableName, {
        values: [
          [
            { key: 'vector', value: `[${vectors[0]}]` },
            { key: 'user_id', value: userId },
            { key: 'q', value: q },
            { key: 'a', value: a },
            { key: 'dataset_id', value: datasetId },
            { key: 'collection_id', value: collectionId }
          ]
        ]
      });
      return rows[0].id;
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

/**
 * update a or a
 */
export async function updateData2Dataset({
  dataId,
  userId,
  q,
  a = '',
  model
}: Props & { dataId: string }) {
  const { vectors = [] } = await (async () => {
    if (q) {
      return getVector({
        userId,
        input: [q],
        model
      });
    }
    return { vectors: [[]] };
  })();

  await PgClient.update(PgDatasetTableName, {
    where: [['id', dataId], 'AND', ['user_id', userId]],
    values: [
      { key: 'a', value: a.replace(/'/g, '"') },
      ...(q
        ? [
            { key: 'q', value: q.replace(/'/g, '"') },
            { key: 'vector', value: `[${vectors[0]}]` }
          ]
        : [])
    ]
  });
}

/**
 * count one collection amount of total data
 */
export async function countCollectionData({
  collectionId,
  userId
}: {
  collectionId: string;
  userId: string;
}) {
  return PgClient.count(PgDatasetTableName, {
    where: [['collection_id', collectionId], 'AND', ['user_id', userId]]
  });
}

/**
 * delete data by collectionIds
 */
export async function delDataByCollectionId({
  userId,
  collectionIds
}: {
  userId: string;
  collectionIds: string[];
}) {
  const ids = collectionIds.map((item) => String(item));
  return PgClient.delete(PgDatasetTableName, {
    where: [['user_id', userId], 'AND', `collection_id IN ('${ids.join("','")}')`]
  });
}

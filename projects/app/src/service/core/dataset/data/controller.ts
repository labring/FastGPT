import { PgDatasetTableName } from '@fastgpt/global/core/dataset/constant';
import { getVectorsByText } from '@/service/core/ai/vector';
import { PgClient } from '@fastgpt/service/common/pg';
import { delay } from '@/utils/tools';
import {
  DatasetDataItemType,
  PgDataItemType,
  PgRawDataItemType
} from '@fastgpt/global/core/dataset/type';
import { MongoDatasetCollection } from '@fastgpt/service/core/dataset/collection/schema';

export async function formatPgRawData(data: PgRawDataItemType) {
  return {
    id: data.id,
    q: data.q,
    a: data.a,
    teamId: data.team_id,
    tmbId: data.tmb_id,
    datasetId: data.dataset_id,
    collectionId: data.collection_id
  };
}

/* get */
export async function getDatasetPgData({ id }: { id: string }): Promise<PgDataItemType> {
  const { rows } = await PgClient.select<PgRawDataItemType>(PgDatasetTableName, {
    fields: ['id', 'q', 'a', 'team_id', 'tmb_id', 'dataset_id', 'collection_id'],
    where: [['id', id]],
    limit: 1
  });
  const row = rows[0];
  if (!row) return Promise.reject('Data not found');
  return formatPgRawData(row);
}

export async function getPgDataWithCollection({
  pgDataList
}: {
  pgDataList: PgRawDataItemType[];
}): Promise<DatasetDataItemType[]> {
  const collections = await MongoDatasetCollection.find(
    {
      _id: { $in: pgDataList.map((item) => item.collection_id) }
    },
    '_id name datasetId metadata'
  ).lean();

  return pgDataList.map((item) => {
    const collection = collections.find(
      (collection) => String(collection._id) === item.collection_id
    );
    return {
      id: item.id,
      q: item.q,
      a: item.a,
      datasetId: collection?.datasetId || '',
      collectionId: item.collection_id,
      sourceName: collection?.name || '',
      sourceId: collection?.metadata?.fileId || collection?.metadata?.rawLink
    };
  });
}

type Props = {
  q: string;
  a?: string;
  model: string;
};

/**
 * update a or a
 */
export async function updateData2Dataset({ dataId, q, a = '', model }: Props & { dataId: string }) {
  const { vectors = [], tokenLen = 0 } = await (async () => {
    if (q) {
      return getVectorsByText({
        input: [q],
        model
      });
    }
    return { vectors: [[]], tokenLen: 0 };
  })();

  await PgClient.update(PgDatasetTableName, {
    where: [['id', dataId]],
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

  return {
    vectors,
    tokenLen
  };
}

/* insert data to pg */
export async function insertData2Dataset({
  teamId,
  tmbId,
  datasetId,
  collectionId,
  q,
  a = '',
  model
}: Props & {
  teamId: string;
  tmbId: string;
  datasetId: string;
  collectionId: string;
}) {
  if (!q || !datasetId || !collectionId || !model) {
    return Promise.reject('q, datasetId, collectionId, model is required');
  }
  const { vectors, tokenLen } = await getVectorsByText({
    model,
    input: [q]
  });

  let retry = 2;
  async function insertPg(): Promise<string> {
    try {
      const { rows } = await PgClient.insert(PgDatasetTableName, {
        values: [
          [
            { key: 'vector', value: `[${vectors[0]}]` },
            { key: 'team_id', value: String(teamId) },
            { key: 'tmb_id', value: String(tmbId) },
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
  const insertId = await insertPg();

  return {
    insertId,
    tokenLen,
    vectors
  };
}

/**
 * delete data by collectionIds
 */
export async function delDataByCollectionId({ collectionIds }: { collectionIds: string[] }) {
  const ids = collectionIds.map((item) => String(item));
  return PgClient.delete(PgDatasetTableName, {
    where: [`collection_id IN ('${ids.join("','")}')`]
  });
}

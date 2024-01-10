/* pg vector crud */
import { PgDatasetTableName } from '@fastgpt/global/common/vectorStore/constants';
import { delay } from '@fastgpt/global/common/system/utils';
import { PgClient, connectPg } from './index';
import { PgSearchRawType } from '@fastgpt/global/core/dataset/api';
import { EmbeddingRecallItemType } from '../type';
import { DeleteDatasetVectorProps, EmbeddingRecallProps } from '../controller.d';
import dayjs from 'dayjs';

export async function initPg() {
  try {
    await connectPg();
    await PgClient.query(`
      CREATE EXTENSION IF NOT EXISTS vector;
      CREATE TABLE IF NOT EXISTS ${PgDatasetTableName} (
          id BIGSERIAL PRIMARY KEY,
          vector VECTOR(1536) NOT NULL,
          team_id VARCHAR(50) NOT NULL,
          tmb_id VARCHAR(50) NOT NULL,
          dataset_id VARCHAR(50) NOT NULL,
          collection_id VARCHAR(50) NOT NULL,
          data_id VARCHAR(50) NOT NULL,
          createTime TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await PgClient.query(
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS vector_index ON ${PgDatasetTableName} USING hnsw (vector vector_ip_ops) WITH (m = 32, ef_construction = 64);`
    );

    console.log('init pg successful');
  } catch (error) {
    console.log('init pg error', error);
  }
}

export const insertDatasetDataVector = async (props: {
  teamId: string;
  tmbId: string;
  datasetId: string;
  collectionId: string;
  dataId: string;
  vectors: number[][];
  retry?: number;
}): Promise<{ insertId: string }> => {
  const { dataId, teamId, tmbId, datasetId, collectionId, vectors, retry = 3 } = props;
  try {
    const { rows } = await PgClient.insert(PgDatasetTableName, {
      values: [
        [
          { key: 'vector', value: `[${vectors[0]}]` },
          { key: 'team_id', value: String(teamId) },
          { key: 'tmb_id', value: String(tmbId) },
          { key: 'dataset_id', value: datasetId },
          { key: 'collection_id', value: collectionId },
          { key: 'data_id', value: String(dataId) }
        ]
      ]
    });
    return {
      insertId: rows[0].id
    };
  } catch (error) {
    if (retry <= 0) {
      return Promise.reject(error);
    }
    await delay(500);
    return insertDatasetDataVector({
      ...props,
      retry: retry - 1
    });
  }
};

export const updateDatasetDataVector = async (props: {
  id: string;
  vectors: number[][];
  retry?: number;
}): Promise<void> => {
  const { id, vectors, retry = 2 } = props;
  try {
    // update pg
    await PgClient.update(PgDatasetTableName, {
      where: [['id', id]],
      values: [{ key: 'vector', value: `[${vectors[0]}]` }]
    });
  } catch (error) {
    if (retry <= 0) {
      return Promise.reject(error);
    }
    await delay(500);
    return updateDatasetDataVector({
      ...props,
      retry: retry - 1
    });
  }
};

export const deleteDatasetDataVector = async (
  props: DeleteDatasetVectorProps & {
    retry?: number;
  }
): Promise<any> => {
  const { id, datasetIds, collectionIds, collectionId, dataIds, retry = 2 } = props;

  const where = await (() => {
    if (id) return `id=${id}`;
    if (datasetIds) return `dataset_id IN (${datasetIds.map((id) => `'${String(id)}'`).join(',')})`;
    if (collectionIds) {
      return `collection_id IN (${collectionIds.map((id) => `'${String(id)}'`).join(',')})`;
    }
    if (collectionId && dataIds) {
      return `collection_id='${String(collectionId)}' and data_id IN (${dataIds
        .map((id) => `'${String(id)}'`)
        .join(',')})`;
    }
    return Promise.reject('deleteDatasetData: no where');
  })();

  try {
    await PgClient.delete(PgDatasetTableName, {
      where: [where]
    });
  } catch (error) {
    if (retry <= 0) {
      return Promise.reject(error);
    }
    await delay(500);
    return deleteDatasetDataVector({
      ...props,
      retry: retry - 1
    });
  }
};

export const embeddingRecall = async (
  props: EmbeddingRecallProps & {
    vectors: number[][];
    limit: number;
    retry?: number;
  }
): Promise<{
  results: EmbeddingRecallItemType[];
}> => {
  const { vectors, limit, similarity = 0, datasetIds, retry = 2 } = props;

  try {
    const results: any = await PgClient.query(
      `BEGIN;
        SET LOCAL hnsw.ef_search = ${global.systemEnv.pgHNSWEfSearch || 100};
        select id, collection_id, data_id, (vector <#> '[${vectors[0]}]') * -1 AS score 
          from ${PgDatasetTableName} 
          where dataset_id IN (${datasetIds.map((id) => `'${String(id)}'`).join(',')})
              AND vector <#> '[${vectors[0]}]' < -${similarity}
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

    return {
      results: filterRows.map((item) => ({
        id: item.id,
        collectionId: item.collection_id,
        dataId: item.data_id,
        score: item.score
      }))
    };
  } catch (error) {
    if (retry <= 0) {
      return Promise.reject(error);
    }
    return embeddingRecall(props);
  }
};

// bill
export const getVectorCountByTeamId = async (teamId: string) => {
  const total = await PgClient.count(PgDatasetTableName, {
    where: [['team_id', String(teamId)]]
  });

  return total;
};
export const getVectorDataByTime = async (start: Date, end: Date) => {
  const { rows } = await PgClient.query<{ id: string; data_id: string }>(`SELECT id, data_id
  FROM ${PgDatasetTableName}
  WHERE createTime BETWEEN '${dayjs(start).format('YYYY-MM-DD')}' AND '${dayjs(end).format(
    'YYYY-MM-DD 23:59:59'
  )}';
  `);

  return rows.map((item) => ({
    id: item.id,
    dataId: item.data_id
  }));
};

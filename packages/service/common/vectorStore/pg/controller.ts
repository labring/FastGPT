/* pg vector crud */
import { PgDatasetTableName } from '@fastgpt/global/common/vectorStore/constants';
import { delay } from '@fastgpt/global/common/system/utils';
import { PgClient, connectPg } from './index';
import { PgSearchRawType } from '@fastgpt/global/core/dataset/api';
import { EmbeddingRecallItemType } from '../type';
import { DeleteDatasetVectorProps, EmbeddingRecallProps, InsertVectorProps } from '../controller.d';
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
          dataset_id VARCHAR(50) NOT NULL,
          collection_id VARCHAR(50) NOT NULL,
          createtime TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await PgClient.query(
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS vector_index ON ${PgDatasetTableName} USING hnsw (vector vector_ip_ops) WITH (m = 32, ef_construction = 64);`
    );
    await PgClient.query(
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS team_dataset_collection_index ON ${PgDatasetTableName} USING btree(team_id, dataset_id, collection_id);`
    );
    await PgClient.query(
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS create_time_index ON ${PgDatasetTableName} USING btree(createtime);`
    );

    console.log('init pg successful');
  } catch (error) {
    console.log('init pg error', error);
  }
}

export const insertDatasetDataVector = async (
  props: InsertVectorProps & {
    vectors: number[][];
    retry?: number;
  }
): Promise<{ insertId: string }> => {
  const { teamId, datasetId, collectionId, vectors, retry = 3 } = props;

  try {
    const { rows } = await PgClient.insert(PgDatasetTableName, {
      values: [
        [
          { key: 'vector', value: `[${vectors[0]}]` },
          { key: 'team_id', value: String(teamId) },
          { key: 'dataset_id', value: String(datasetId) },
          { key: 'collection_id', value: String(collectionId) }
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

export const deleteDatasetDataVector = async (
  props: DeleteDatasetVectorProps & {
    retry?: number;
  }
): Promise<any> => {
  const { teamId, retry = 2 } = props;

  const teamIdWhere = `team_id='${String(teamId)}' AND`;

  const where = await (() => {
    if ('id' in props && props.id) return `${teamIdWhere} id=${props.id}`;

    if ('datasetIds' in props && props.datasetIds) {
      const datasetIdWhere = `dataset_id IN (${props.datasetIds
        .map((id) => `'${String(id)}'`)
        .join(',')})`;

      if ('collectionIds' in props && props.collectionIds) {
        return `${teamIdWhere} ${datasetIdWhere} AND collection_id IN (${props.collectionIds
          .map((id) => `'${String(id)}'`)
          .join(',')})`;
      }

      return `${teamIdWhere} ${datasetIdWhere}`;
    }

    if ('idList' in props && props.idList) {
      return `${teamIdWhere} id IN (${props.idList.map((id) => `'${String(id)}'`).join(',')})`;
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
  const { datasetIds, vectors, limit, similarity = 0, retry = 2, efSearch = 100 } = props;

  try {
    const results: any = await PgClient.query(
      `BEGIN;
        SET LOCAL hnsw.ef_search = ${efSearch};
        select id, collection_id, vector <#> '[${vectors[0]}]' AS score 
          from ${PgDatasetTableName} 
          where dataset_id IN (${datasetIds.map((id) => `'${String(id)}'`).join(',')})
              AND vector <#> '[${vectors[0]}]' < -${similarity}
          order by score limit ${limit};
        COMMIT;`
    );

    const rows = results?.[2]?.rows as PgSearchRawType[];

    return {
      results: rows.map((item) => ({
        id: item.id,
        collectionId: item.collection_id,
        score: item.score * -1
      }))
    };
  } catch (error) {
    if (retry <= 0) {
      return Promise.reject(error);
    }
    return embeddingRecall(props);
  }
};

export const getVectorCountByTeamId = async (teamId: string) => {
  const total = await PgClient.count(PgDatasetTableName, {
    where: [['team_id', String(teamId)]]
  });

  return total;
};
export const getVectorDataByTime = async (start: Date, end: Date) => {
  const { rows } = await PgClient.query<{
    id: string;
    team_id: string;
    dataset_id: string;
  }>(`SELECT id, team_id, dataset_id
  FROM ${PgDatasetTableName}
  WHERE createtime BETWEEN '${dayjs(start).format('YYYY-MM-DD HH:mm:ss')}' AND '${dayjs(end).format(
    'YYYY-MM-DD HH:mm:ss'
  )}';
  `);

  return rows.map((item) => ({
    id: String(item.id),
    teamId: item.team_id,
    datasetId: item.dataset_id
  }));
};

/* pg vector crud */
import { DatasetVectorTableName } from '../constants';
import { delay, retryFn } from '@fastgpt/global/common/system/utils';
import { PgClient, connectPg } from './controller';
import { type PgSearchRawType } from '@fastgpt/global/core/dataset/api';
import type {
  DelDatasetVectorCtrlProps,
  EmbeddingRecallCtrlProps,
  EmbeddingRecallResponse,
  InsertVectorControllerProps
} from '../controller.d';
import dayjs from 'dayjs';
import { addLog } from '../../system/log';

export class PgVectorCtrl {
  constructor() {}
  init = async () => {
    try {
      await connectPg();
      await PgClient.query(`
        CREATE EXTENSION IF NOT EXISTS vector;
        CREATE TABLE IF NOT EXISTS ${DatasetVectorTableName} (
            id BIGSERIAL PRIMARY KEY,
            vector VECTOR(1536) NOT NULL,
            team_id VARCHAR(50) NOT NULL,
            dataset_id VARCHAR(50) NOT NULL,
            collection_id VARCHAR(50) NOT NULL,
            createtime TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
      `);

      await PgClient.query(
        `CREATE INDEX CONCURRENTLY IF NOT EXISTS vector_index ON ${DatasetVectorTableName} USING hnsw (vector vector_ip_ops) WITH (m = 32, ef_construction = 128);`
      );
      await PgClient.query(
        `CREATE INDEX CONCURRENTLY IF NOT EXISTS team_dataset_collection_index ON ${DatasetVectorTableName} USING btree(team_id, dataset_id, collection_id);`
      );
      await PgClient.query(
        `CREATE INDEX CONCURRENTLY IF NOT EXISTS create_time_index ON ${DatasetVectorTableName} USING btree(createtime);`
      );
      // 10w rows
      // await PgClient.query(`
      //   ALTER TABLE modeldata SET (
      //     autovacuum_vacuum_scale_factor = 0.1,
      //     autovacuum_analyze_scale_factor = 0.05,
      //     autovacuum_vacuum_threshold = 50,
      //     autovacuum_analyze_threshold = 50,
      //     autovacuum_vacuum_cost_delay = 20,
      //     autovacuum_vacuum_cost_limit = 200
      //   );`);

      // 100w rows
      // await PgClient.query(`
      //   ALTER TABLE modeldata SET (
      //   autovacuum_vacuum_scale_factor = 0.01,
      //   autovacuum_analyze_scale_factor = 0.02,
      //   autovacuum_vacuum_threshold = 1000,
      //   autovacuum_analyze_threshold = 1000,
      //   autovacuum_vacuum_cost_delay = 10,
      //   autovacuum_vacuum_cost_limit = 2000
      // );`)

      addLog.info('init pg successful');
    } catch (error) {
      addLog.error('init pg error', error);
    }
  };
  insert = async (props: InsertVectorControllerProps): Promise<{ insertIds: string[] }> => {
    const { teamId, datasetId, collectionId, vectors } = props;

    const values = vectors.map((vector) => [
      { key: 'vector', value: `[${vector}]` },
      { key: 'team_id', value: String(teamId) },
      { key: 'dataset_id', value: String(datasetId) },
      { key: 'collection_id', value: String(collectionId) }
    ]);

    const { rowCount, rows } = await PgClient.insert(DatasetVectorTableName, {
      values
    });

    if (rowCount === 0) {
      return Promise.reject('insertDatasetData: no insert');
    }

    return {
      insertIds: rows.map((row) => row.id)
    };
  };
  delete = async (props: DelDatasetVectorCtrlProps): Promise<any> => {
    const { teamId } = props;

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

      if ('idList' in props && Array.isArray(props.idList)) {
        if (props.idList.length === 0) return;
        return `${teamIdWhere} id IN (${props.idList.map((id) => String(id)).join(',')})`;
      }
      return Promise.reject('deleteDatasetData: no where');
    })();

    if (!where) return;

    await PgClient.delete(DatasetVectorTableName, {
      where: [where]
    });
  };
  embRecall = async (props: EmbeddingRecallCtrlProps): Promise<EmbeddingRecallResponse> => {
    const { teamId, datasetIds, vector, limit, forbidCollectionIdList, filterCollectionIdList } =
      props;

    // Get forbid collection
    const formatForbidCollectionIdList = (() => {
      if (!filterCollectionIdList) return forbidCollectionIdList;
      const list = forbidCollectionIdList
        .map((id) => String(id))
        .filter((id) => !filterCollectionIdList.includes(id));
      return list;
    })();
    const forbidCollectionSql =
      formatForbidCollectionIdList.length > 0
        ? `AND collection_id NOT IN (${formatForbidCollectionIdList.map((id) => `'${id}'`).join(',')})`
        : '';

    // Filter by collectionId
    const formatFilterCollectionId = (() => {
      if (!filterCollectionIdList) return;

      return filterCollectionIdList
        .map((id) => String(id))
        .filter((id) => !forbidCollectionIdList.includes(id));
    })();
    const filterCollectionIdSql = formatFilterCollectionId
      ? `AND collection_id IN (${formatFilterCollectionId.map((id) => `'${id}'`).join(',')})`
      : '';
    // Empty data
    if (formatFilterCollectionId && formatFilterCollectionId.length === 0) {
      return { results: [] };
    }

    const results: any = await PgClient.query(
      `BEGIN;
          SET LOCAL hnsw.ef_search = ${global.systemEnv?.hnswEfSearch || 100};
          SET LOCAL hnsw.max_scan_tuples = ${global.systemEnv?.hnswMaxScanTuples || 100000};
          SET LOCAL hnsw.iterative_scan = relaxed_order;
          WITH relaxed_results AS MATERIALIZED (
            select id, collection_id, vector <#> '[${vector}]' AS score
              from ${DatasetVectorTableName}
              where dataset_id IN (${datasetIds.map((id) => `'${String(id)}'`).join(',')})
                ${filterCollectionIdSql}
                ${forbidCollectionSql}
              order by score limit ${limit}
          ) SELECT id, collection_id, score FROM relaxed_results ORDER BY score;
        COMMIT;`
    );
    const rows = results?.[results.length - 2]?.rows as PgSearchRawType[];

    if (!Array.isArray(rows)) {
      return {
        results: []
      };
    }

    return {
      results: rows.map((item) => ({
        id: String(item.id),
        collectionId: item.collection_id,
        score: item.score * -1
      }))
    };
  };
  getVectorDataByTime = async (start: Date, end: Date) => {
    const { rows } = await PgClient.query<{
      id: string;
      team_id: string;
      dataset_id: string;
    }>(`SELECT id, team_id, dataset_id
    FROM ${DatasetVectorTableName}
    WHERE createtime BETWEEN '${dayjs(start).format('YYYY-MM-DD HH:mm:ss')}' AND '${dayjs(
      end
    ).format('YYYY-MM-DD HH:mm:ss')}';
    `);

    return rows.map((item) => ({
      id: String(item.id),
      teamId: item.team_id,
      datasetId: item.dataset_id
    }));
  };

  getVectorCount = async (props: {
    teamId?: string;
    datasetId?: string;
    collectionId?: string;
  }) => {
    const { teamId, datasetId, collectionId } = props;

    // Build where conditions dynamically
    const whereConditions: any[] = [];

    if (teamId) {
      whereConditions.push(['team_id', String(teamId)]);
    }

    if (datasetId) {
      if (whereConditions.length > 0) whereConditions.push('and');
      whereConditions.push(['dataset_id', String(datasetId)]);
    }

    if (collectionId) {
      if (whereConditions.length > 0) whereConditions.push('and');
      whereConditions.push(['collection_id', String(collectionId)]);
    }

    // If no conditions provided, count all
    const total = await PgClient.count(DatasetVectorTableName, {
      where: whereConditions.length > 0 ? whereConditions : undefined
    });

    return total;
  };
}

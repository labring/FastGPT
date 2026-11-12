/* pg vector crud */
import { DatasetVectorTableName, VectorVQ } from '../constants';
import { PgClient, connectPg } from './controller';
import type { VectorControllerType } from '../type';
import dayjs from 'dayjs';
import { getLogger, LogCategories } from '../../logger';
import { buildPgVectorRecallQuery } from './utils';
import { SQL_FULL_TEXT_COLUMN, SQL_FULL_TEXT_INDEX } from '../fullText/utils';
import { insertPostgresVectorFullTextRows } from '../fullText/postgres';

const logger = getLogger(LogCategories.INFRA.POSTGRES);

// 客户端等待必须长于服务端 statement_timeout（90 秒），避免 SQL 仍执行时释放并发额度。
const RECALL_QUERY_TIMEOUT_MS = 120_000;

export class PgVectorCtrl implements VectorControllerType {
  constructor() {}
  init = async () => {
    const isHalfVec = VectorVQ === 16;

    try {
      await connectPg();
      // 先创建基础向量表与标准 TEXT 词串列，避免未预装 pg_search 的镜像阻断表结构与向量写入。
      await PgClient.query(`
        CREATE EXTENSION IF NOT EXISTS vector;
        CREATE TABLE IF NOT EXISTS ${DatasetVectorTableName} (
            id BIGSERIAL PRIMARY KEY,
            vector ${isHalfVec ? 'HALFVEC(1536)' : 'VECTOR(1536)'} NOT NULL,
            team_id VARCHAR(50) NOT NULL,
            dataset_id VARCHAR(50) NOT NULL,
            collection_id VARCHAR(50) NOT NULL,
            ${SQL_FULL_TEXT_COLUMN} TEXT,
            createtime TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        ALTER TABLE ${DatasetVectorTableName} ADD COLUMN IF NOT EXISTS ${SQL_FULL_TEXT_COLUMN} TEXT;
      `);

      await PgClient.query(
        `CREATE INDEX CONCURRENTLY IF NOT EXISTS team_dataset_collection_index ON ${DatasetVectorTableName} USING btree(team_id, dataset_id, collection_id);`
      );
      await PgClient.query(
        `CREATE INDEX CONCURRENTLY IF NOT EXISTS create_time_index ON ${DatasetVectorTableName} USING btree(createtime);`
      );
      try {
        await PgClient.query(`
          CREATE EXTENSION IF NOT EXISTS pg_search;
          CREATE INDEX IF NOT EXISTS ${SQL_FULL_TEXT_INDEX} ON ${DatasetVectorTableName} USING paradedb (id, (${SQL_FULL_TEXT_COLUMN}::pdb.whitespace), (team_id::pdb.literal), (dataset_id::pdb.literal), (collection_id::pdb.literal));
        `);
      } catch (error) {
        logger.warn(
          'Postgres full-text index initialization skipped; native full-text requires pg_search and migration readiness',
          { error }
        );
      }
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

      logger.info('Postgres vector initialization completed');
    } catch (error) {
      logger.error('Postgres vector initialization failed', { error });
    }
  };
  insert: VectorControllerType['insert'] = (props) =>
    insertPostgresVectorFullTextRows({
      props,
      query: PgClient.query.bind(PgClient),
      connect: async () => (await connectPg()).connect(),
      missingTextsErrorMessage: 'PG full-text inputs must match vector inputs'
    });
  /** 仅刷新当前团队指定的旧向量，保留内容；缺失 ID 视为已经清理。 */
  refreshCreateTime: VectorControllerType['refreshCreateTime'] = async ({ teamId, idList }) => {
    if (idList.length === 0) return;
    await PgClient.query(
      `UPDATE ${DatasetVectorTableName} SET createtime = CURRENT_TIMESTAMP WHERE team_id = $1 AND id = ANY($2::bigint[])`,
      [String(teamId), idList]
    );
  };
  delete: VectorControllerType['delete'] = async (props) => {
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
  /** 按知识库分组召回并统一 FP32 排序；索引参数只作用于本次事务，失败时归还干净连接。 */
  embRecall: VectorControllerType['embRecall'] = async (props) => {
    const query = buildPgVectorRecallQuery(props);
    if (!query) return { results: [] };
    // 精确分组与 HNSW 分组都等待服务端先终止超时 SQL，再归还外层并发额度。
    const recallQuery = { text: query.text, query_timeout: RECALL_QUERY_TIMEOUT_MS };

    const result = await (async () => {
      if (!query.usesHnsw) return PgClient.query(recallQuery, query.values);

      const client = await (await connectPg()).connect();
      let destroyClient = false;
      try {
        await client.query('BEGIN');
        await client.query(
          `SELECT set_config('hnsw.ef_search', $1, true),
                  set_config('hnsw.max_scan_tuples', $2, true),
                  set_config('hnsw.iterative_scan', 'relaxed_order', true)`,
          [
            String(Math.min(1000, Math.max(props.limit, global.systemEnv?.hnswEfSearch || 200))),
            String(query.maxScanTuples)
          ]
        );
        const result = await client.query<{ id: string; collection_id: string; score: number }>(
          recallQuery,
          query.values
        );
        await client.query('COMMIT');
        return result;
      } catch (error) {
        // 事务失败后必须回滚；回滚也失败的连接直接销毁，不能放回池中污染后续请求。
        try {
          await client.query('ROLLBACK');
        } catch {
          destroyClient = true;
        }
        throw error;
      } finally {
        client.release(destroyClient);
      }
    })();

    return {
      results: result.rows.map((item) => ({
        id: String(item.id),
        collectionId: item.collection_id,
        score: Number(item.score) * -1
      }))
    };
  };

  getVectorDataByTime: VectorControllerType['getVectorDataByTime'] = async (start, end) => {
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
  getVectorCount: VectorControllerType['getVectorCount'] = async (props) => {
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

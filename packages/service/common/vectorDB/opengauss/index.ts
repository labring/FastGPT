/* openGauss DataVec vector crud */
import { DatasetVectorTableName } from '../constants';
import { OgClient, connectOg } from './controller';
import type { VectorControllerType } from '../type';
import dayjs from 'dayjs';
import { getLogger, LogCategories } from '../../logger';
import { SQL_FULL_TEXT_COLUMN, SQL_FULL_TEXT_INDEX } from '../fullText/utils';
import { toSqlFullTextTokens } from '../fullText/analyzer';

const logger = getLogger(LogCategories.INFRA.VECTOR);
// 单条 INSERT 最多绑定 500 行（2500 个参数），避免大批量写入触及协议参数数量上限。
const FULL_TEXT_INSERT_BATCH_SIZE = 500;

export class OpenGaussVectorCtrl implements VectorControllerType {
  constructor() {}
  init = async () => {
    try {
      await connectOg();
      await OgClient.query(`
        CREATE TABLE IF NOT EXISTS ${DatasetVectorTableName} (
            id BIGSERIAL PRIMARY KEY,
            vector VECTOR(1536) NOT NULL,
            team_id VARCHAR(50) NOT NULL,
            dataset_id VARCHAR(50) NOT NULL,
            collection_id VARCHAR(50) NOT NULL,
            ${SQL_FULL_TEXT_COLUMN} TEXT,
            createtime TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ) WITH (storage_type=ASTORE);
      `);
      // openGauss 7.0.0-RC2 尚未支持 ADD COLUMN IF NOT EXISTS，通过系统表判存保证旧表幂等升级。
      const columnInfo = await OgClient.query(
        'SELECT 1 FROM information_schema.columns WHERE table_schema=current_schema() AND table_name=$1 AND column_name=$2',
        [DatasetVectorTableName, SQL_FULL_TEXT_COLUMN]
      );
      if (!columnInfo.rows.length) {
        await OgClient.query(
          `ALTER TABLE ${DatasetVectorTableName} ADD COLUMN ${SQL_FULL_TEXT_COLUMN} TEXT;`
        );
      }

      await OgClient.query(
        `CREATE INDEX CONCURRENTLY IF NOT EXISTS vector_index ON ${DatasetVectorTableName} USING hnsw (vector vector_ip_ops) WITH (m = 32, ef_construction = 256);`
      );
      await OgClient.query(
        `CREATE INDEX CONCURRENTLY IF NOT EXISTS team_dataset_collection_index ON ${DatasetVectorTableName} USING btree(team_id, dataset_id, collection_id);`
      );
      await OgClient.query(
        `CREATE INDEX CONCURRENTLY IF NOT EXISTS create_time_index ON ${DatasetVectorTableName} USING btree(createtime);`
      );
      const fullTextIndex = await OgClient.query(
        `SELECT 1 FROM pg_class c WHERE c.relname=$1 AND c.relnamespace=(SELECT relnamespace FROM pg_class WHERE oid='${DatasetVectorTableName}'::regclass)`,
        [SQL_FULL_TEXT_INDEX]
      );
      if (!fullTextIndex.rows.length) {
        await OgClient.query(
          `CREATE INDEX ${SQL_FULL_TEXT_INDEX} ON ${DatasetVectorTableName} USING bm25(${SQL_FULL_TEXT_COLUMN});`
        );
      }

      logger.info('openGauss DataVec vector initialization completed');
    } catch (error) {
      logger.error('openGauss DataVec vector initialization failed', { error });
    }
  };
  insert: VectorControllerType['insert'] = async (props) => {
    const { teamId, datasetId, collectionId, vectors } = props;

    // 原文先经外置分析器转成词串，与向量同一条/同一事务 INSERT 写入，数据库不保存原文。
    if (props.texts?.length !== vectors.length) {
      throw new Error('Full-text inputs must match vector inputs');
    }
    if (!vectors.length) return { insertIds: [] };
    const tokens = await Promise.all(props.texts.map(toSqlFullTextTokens));

    const buildBatchInsert = (start: number, end: number) => {
      const slice = vectors.slice(start, end);
      const values = slice.flatMap((vector, offset) => [
        `[${vector.join(',')}]`,
        String(teamId),
        String(datasetId),
        String(collectionId),
        tokens[start + offset]
      ]);
      const tuples = slice
        .map((_, offset) => {
          const n = offset * 5;
          return `($${n + 1},$${n + 2},$${n + 3},$${n + 4},$${n + 5})`;
        })
        .join(',');
      return {
        sql: `INSERT INTO ${DatasetVectorTableName}(vector,team_id,dataset_id,collection_id,${SQL_FULL_TEXT_COLUMN})
         VALUES ${tuples} RETURNING id::text`,
        values
      };
    };

    if (vectors.length <= FULL_TEXT_INSERT_BATCH_SIZE) {
      const { sql, values } = buildBatchInsert(0, vectors.length);
      const { rows } = await OgClient.query<{ id: string }>(sql, values);
      return { insertIds: rows.map((row) => row.id) };
    }

    const client = await (await connectOg()).connect();
    try {
      await client.query('BEGIN');
      const insertIds: string[] = [];
      for (let start = 0; start < vectors.length; start += FULL_TEXT_INSERT_BATCH_SIZE) {
        const { sql, values } = buildBatchInsert(start, start + FULL_TEXT_INSERT_BATCH_SIZE);
        const { rows } = await client.query<{ id: string }>(sql, values);
        insertIds.push(...rows.map((row) => row.id));
      }
      await client.query('COMMIT');
      return { insertIds };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  };
  /** 仅刷新当前团队指定的旧向量，保留内容；缺失 ID 视为已经清理。 */
  refreshCreateTime: VectorControllerType['refreshCreateTime'] = async ({ teamId, idList }) => {
    if (idList.length === 0) return;
    await OgClient.query(
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

    await OgClient.delete(DatasetVectorTableName, {
      where: [where]
    });
  };
  embRecall: VectorControllerType['embRecall'] = async (props) => {
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

    const results: any = await OgClient.query({
      // 客户端等待长于服务端的 90 秒超时，避免顶层提前释放并发额度。
      query_timeout: 120_000,
      text: `BEGIN;
          SET LOCAL hnsw.ef_search = ${global.systemEnv?.hnswEfSearch || 200};
          SELECT id, collection_id, vector <#> '[${vector}]' AS score
            FROM ${DatasetVectorTableName}
            WHERE team_id = '${String(teamId)}'
              AND dataset_id IN (${datasetIds.map((id) => `'${String(id)}'`).join(',')})
              ${filterCollectionIdSql}
              ${forbidCollectionSql}
            ORDER BY score LIMIT ${limit};
        COMMIT;`
    });
    const rows = results?.[results.length - 2]?.rows as {
      id: string;
      collection_id: string;
      score: number;
    }[];

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

  getVectorDataByTime: VectorControllerType['getVectorDataByTime'] = async (start, end) => {
    const { rows } = await OgClient.query<{
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
    const total = await OgClient.count(DatasetVectorTableName, {
      where: whereConditions.length > 0 ? whereConditions : undefined
    });

    return total;
  };
}

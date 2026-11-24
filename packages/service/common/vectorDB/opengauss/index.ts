/* openGauss DataVec vector crud */
import { HNSW_EF_SEARCH_MAX } from '@fastgpt/global/core/dataset/vectorData/constants';
import { DatasetVectorTableName } from '../constants';
import { OgClient, connectOg } from './controller';
import type { VectorControllerType } from '../type';
import dayjs from 'dayjs';
import { getLogger, LogCategories } from '../../logger';
import { SQL_FULL_TEXT_COLUMN } from '../fullText/utils';
import { insertPostgresVectorFullTextRows } from '../fullText/postgres';
import { startSqlFullTextIndexBuild } from '../fullText/controller';
import { buildOpenGaussVectorRecallQuery } from './recall';

const logger = getLogger(LogCategories.INFRA.VECTOR);

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
        `CREATE INDEX CONCURRENTLY IF NOT EXISTS team_dataset_collection_index ON ${DatasetVectorTableName} USING btree(team_id, dataset_id, collection_id);`
      );
      await OgClient.query(
        `CREATE INDEX CONCURRENTLY IF NOT EXISTS create_time_index ON ${DatasetVectorTableName} USING btree(createtime);`
      );
      startSqlFullTextIndexBuild('opengauss');

      logger.info('openGauss DataVec vector initialization completed');
    } catch (error) {
      logger.error('openGauss DataVec vector initialization failed', { error });
    }
  };
  insert: VectorControllerType['insert'] = (props) =>
    insertPostgresVectorFullTextRows({
      props,
      query: OgClient.query.bind(OgClient),
      connect: async () => (await connectOg()).connect(),
      missingTextsErrorMessage: 'Full-text inputs must match vector inputs'
    });
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
  /** 局部索引查询在事务内设置 openGauss 的搜索宽度，精确路径不占用事务。 */
  embRecall: VectorControllerType['embRecall'] = async (props) => {
    const query = buildOpenGaussVectorRecallQuery(props);
    if (!query) return { results: [] };
    type Row = { id: string; collection_id: string; score: number };
    // 客户端等待长于服务端 statement_timeout，避免顶层提前归还并发额度。
    const recallQuery = { text: query.text, query_timeout: 120_000 };
    const result = await (async () => {
      if (!query.usesHnsw) return OgClient.query<Row>(recallQuery, query.values);
      const client = await (await connectOg()).connect();
      let destroyClient = false;
      try {
        await client.query('BEGIN');
        await client.query("SELECT set_config('hnsw_ef_search', $1, true)", [
          String(Math.min(HNSW_EF_SEARCH_MAX, Math.max(props.hnswEfSearch, props.limit)))
        ]);
        const result = await client.query<Row>(recallQuery, query.values);
        await client.query('COMMIT');
        return result;
      } catch (error) {
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
      results: result.rows.map(({ id, collection_id, score }) => ({
        id: String(id),
        collectionId: collection_id,
        score: -Number(score)
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

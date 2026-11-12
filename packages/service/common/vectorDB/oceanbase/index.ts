/* oceanbase vector crud */
import { DatasetVectorTableName, OceanBaseIndexConfig } from '../constants';
import { ObClass } from './controller';
import { type RowDataPacket } from 'mysql2/promise';
import type { VectorControllerType } from '../type';
import dayjs from 'dayjs';
import { getLogger, LogCategories } from '../../logger';
import { SQL_FULL_TEXT_COLUMN, SQL_FULL_TEXT_INDEX } from '../fullText/utils';
import { toSqlFullTextTokens } from '../fullText/analyzer';

const logger = getLogger(LogCategories.INFRA.VECTOR);

export class ObVectorCtrl implements VectorControllerType {
  private obClient: ObClass;
  private controllerType: 'oceanbase' | 'seekdb';
  constructor({ type }: { type: 'oceanbase' | 'seekdb' }) {
    this.obClient = new ObClass({ type });
    this.controllerType = type;
  }
  init: VectorControllerType['init'] = async () => {
    try {
      await this.obClient.query(`
        CREATE TABLE IF NOT EXISTS ${DatasetVectorTableName} (
            id BIGINT AUTO_INCREMENT PRIMARY KEY,
            vector VECTOR(1536) NOT NULL,
            team_id VARCHAR(50) NOT NULL,
            dataset_id VARCHAR(50) NOT NULL,
            collection_id VARCHAR(50) NOT NULL,
            ${SQL_FULL_TEXT_COLUMN} LONGTEXT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NULL,
            createtime TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
      `);
      // MySQL 兼容协议不保证支持 ADD COLUMN / CREATE FULLTEXT INDEX 的 IF NOT EXISTS，先按元数据判存。
      const [columns] = await this.obClient.query<RowDataPacket[]>(
        'SELECT 1 FROM information_schema.columns WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? AND COLUMN_NAME=?',
        [DatasetVectorTableName, SQL_FULL_TEXT_COLUMN]
      );
      if (!Array.isArray(columns) || columns.length === 0) {
        await this.obClient.query(
          `ALTER TABLE ${DatasetVectorTableName} ADD COLUMN ${SQL_FULL_TEXT_COLUMN} LONGTEXT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NULL;`
        );
      }
      await this.obClient.query(
        `CREATE VECTOR INDEX IF NOT EXISTS vector_index ON ${DatasetVectorTableName}(vector) WITH (distance=${OceanBaseIndexConfig.distance}, type=${OceanBaseIndexConfig.type}, m=32, ef_construction=256);`
      );
      await this.obClient.query(
        `CREATE INDEX IF NOT EXISTS team_dataset_collection_index ON ${DatasetVectorTableName}(team_id, dataset_id, collection_id);`
      );
      await this.obClient.query(
        `CREATE INDEX IF NOT EXISTS create_time_index ON ${DatasetVectorTableName}(createtime);`
      );
      try {
        const [indexes] = await this.obClient.query<RowDataPacket[]>(
          `SHOW INDEX FROM ${DatasetVectorTableName}`
        );
        if (
          !Array.isArray(indexes) ||
          !indexes.some(
            (row) => row.Key_name === SQL_FULL_TEXT_INDEX || row.key_name === SQL_FULL_TEXT_INDEX
          )
        ) {
          await this.obClient.query(
            `CREATE FULLTEXT INDEX ${SQL_FULL_TEXT_INDEX} ON ${DatasetVectorTableName}(${SQL_FULL_TEXT_COLUMN}) WITH PARSER SPACE PARSER_PROPERTIES=(min_token_size=1);`
          );
        }
      } catch (error) {
        logger.warn(
          'Full-text index initialization skipped; native full-text requires supported parser capability and migration readiness',
          {
            provider: this.controllerType,
            error
          }
        );
      }

      logger.info('Vector DB initialization completed', {
        provider: this.controllerType
      });
    } catch (error) {
      logger.error('Vector DB initialization failed', {
        provider: this.controllerType,
        error
      });
    }
  };

  insert: VectorControllerType['insert'] = async (props) => {
    const { teamId, datasetId, collectionId, vectors } = props;

    // 原文先经外置分析器转成词串，与向量同一事务写入，数据库不保存原文。
    if (props.texts?.length !== vectors.length) {
      throw new Error('Full-text inputs must match vector inputs');
    }
    const tokens = await Promise.all(props.texts.map(toSqlFullTextTokens));
    const result = await this.obClient.insertBoundRows(DatasetVectorTableName, {
      values: vectors.map((vector, index) => [
        { key: 'vector', value: `[${vector.join(',')}]` },
        { key: 'team_id', value: String(teamId) },
        { key: 'dataset_id', value: String(datasetId) },
        { key: 'collection_id', value: String(collectionId) },
        { key: SQL_FULL_TEXT_COLUMN, value: tokens[index] }
      ])
    });
    return { insertIds: result.insertIds };
  };
  /** OceanBase/SeekDB 共用：只更新当前团队旧向量的时间，不修改向量和归属字段。 */
  refreshCreateTime: VectorControllerType['refreshCreateTime'] = async ({ teamId, idList }) => {
    if (idList.length === 0) return;
    await this.obClient.query(
      `UPDATE ${DatasetVectorTableName} SET createtime = CURRENT_TIMESTAMP WHERE team_id = ? AND id IN (${idList.map(() => '?').join(',')})`,
      [String(teamId), ...idList]
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

    await this.obClient.delete(DatasetVectorTableName, {
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

    const rows = await this.obClient
      .query<
        ({
          id: string;
          collection_id: string;
          score: number;
        } & RowDataPacket)[][]
      >(
        `BEGIN;
          SET ob_hnsw_ef_search = ${global.systemEnv?.hnswEfSearch || 200};
          SELECT id, collection_id, ${OceanBaseIndexConfig.distanceFunc}(vector, [${vector}]) AS score
            FROM ${DatasetVectorTableName}
            WHERE team_id='${teamId}'
              AND dataset_id IN (${datasetIds.map((id) => `'${String(id)}'`).join(',')})
              ${filterCollectionIdSql}
              ${forbidCollectionSql}
            ORDER BY score ${OceanBaseIndexConfig.orderDirection} APPROXIMATE LIMIT ${limit};
        COMMIT;`
      )
      .then(([rows]) => rows[2]);

    return {
      results: rows.map((item) => ({
        id: String(item.id),
        collectionId: item.collection_id,
        score: OceanBaseIndexConfig.scoreTransform(item.score)
      }))
    };
  };
  getVectorDataByTime: VectorControllerType['getVectorDataByTime'] = async (start, end) => {
    const rows = await this.obClient
      .query<
        ({
          id: string;
          team_id: string;
          dataset_id: string;
        } & RowDataPacket)[]
      >(
        `SELECT id, team_id, dataset_id
    FROM ${DatasetVectorTableName}
    WHERE createtime BETWEEN '${dayjs(start).format('YYYY-MM-DD HH:mm:ss')}' AND '${dayjs(
      end
    ).format('YYYY-MM-DD HH:mm:ss')}';
    `
      )
      .then(([rows]) => rows);

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
    const total = await this.obClient.count(DatasetVectorTableName, {
      where: whereConditions.length > 0 ? whereConditions : undefined
    });

    return total;
  };
}

/* oceanbase vector crud */
import { DatasetVectorTableName, OceanBaseIndexConfig } from '../constants';
import { ObClass } from './controller';
import { type RowDataPacket } from 'mysql2/promise';
import type { VectorControllerType } from '../type';
import dayjs from 'dayjs';
import { getLogger, LogCategories } from '../../logger';
import { SQL_FULL_TEXT_COLUMN } from '../fullText/utils';
import { toSqlFullTextTokens } from '../fullText/analyzer';
import { startSqlFullTextIndexBuild } from '../fullText/controller';

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
      // 这两个引擎会在 IF NOT EXISTS 判定前拒绝同一列重复建向量索引。
      const hasVectorIndex = async () => {
        const [indexes] = await this.obClient.query<
          ({ Column_name: string; Index_type: string } & RowDataPacket)[]
        >(`SHOW INDEX FROM ${DatasetVectorTableName} WHERE Key_name = ?`, ['vector_index']);
        return indexes.some(
          (index) => index.Column_name === 'vector' && index.Index_type === 'VECTOR'
        );
      };
      if (!(await hasVectorIndex())) {
        try {
          await this.obClient.query(
            `CREATE VECTOR INDEX IF NOT EXISTS vector_index ON ${DatasetVectorTableName}(vector) WITH (distance=${OceanBaseIndexConfig.distance}, type=${OceanBaseIndexConfig.type}, m=32, ef_construction=256);`
          );
        } catch (error) {
          // 多节点同时初始化时，以实际目录为准，其他失败继续上抛。
          if (!(await hasVectorIndex())) throw error;
        }
      }
      await this.obClient.query(
        `CREATE INDEX IF NOT EXISTS team_dataset_collection_index ON ${DatasetVectorTableName}(team_id, dataset_id, collection_id);`
      );
      await this.obClient.query(
        `CREATE INDEX IF NOT EXISTS create_time_index ON ${DatasetVectorTableName}(createtime);`
      );
      startSqlFullTextIndexBuild(this.controllerType);

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
  /** 调整跨库搜索宽度，按租户和知识库取候选后再应用集合过滤。 */
  embRecall: VectorControllerType['embRecall'] = async ({
    teamId,
    datasetIds,
    vector,
    limit,
    hnswEfSearch,
    forbidCollectionIdList,
    filterCollectionIdList
  }) => {
    const datasets = [...new Set(datasetIds.map(String))];
    const forbidden = new Set(forbidCollectionIdList.map(String));
    const allowed = filterCollectionIdList?.map(String).filter((id) => !forbidden.has(id));
    if (!datasets.length || limit <= 0 || allowed?.length === 0) return { results: [] };
    if (!Number.isSafeInteger(limit) || !vector.length || !vector.every(Number.isFinite)) {
      throw new Error('Invalid vector recall input');
    }

    const scope = 'team_id = ? AND dataset_id IN (?)';
    const scopeValues = [String(teamId), datasets];
    const collectionFilter = allowed
      ? 'collection_id IN (?)'
      : forbidden.size > 0
        ? 'collection_id NOT IN (?)'
        : undefined;
    const collectionValues = collectionFilter ? [allowed ?? [...forbidden]] : [];
    const distance = `${OceanBaseIndexConfig.distanceFunc}(vector, ?) AS score`;
    const embedding = `[${vector.join(',')}]`;
    const filteredScope = collectionFilter ? `${scope} AND ${collectionFilter}` : scope;
    const filteredValues = [embedding, ...scopeValues, ...collectionValues, limit];
    const width = this.controllerType === 'seekdb' ? 2500 : datasets.length > 5 ? 1000 : 512;
    const ef = Math.max(hnswEfSearch, limit, collectionFilter || datasets.length > 1 ? width : 0);
    const candidateLimit = Math.max(limit, Math.min(1600, limit * 16));

    // 内层始终保留团队和知识库条件。集合白名单和黑名单都在最终 LIMIT 前生效。
    const approximate = allowed
      ? {
          text: `SELECT id, collection_id, score FROM (
            SELECT id, collection_id, ${distance} FROM ${DatasetVectorTableName}
            WHERE ${scope} ORDER BY score ASC APPROXIMATE LIMIT ?
          ) candidates WHERE ${collectionFilter} ORDER BY score ASC, id ASC LIMIT ?`,
          values: [embedding, ...scopeValues, candidateLimit, ...collectionValues, limit]
        }
      : {
          text: `SELECT id, collection_id, ${distance} FROM ${DatasetVectorTableName}
            WHERE ${filteredScope} ORDER BY score ASC APPROXIMATE LIMIT ?`,
          values: filteredValues
        };

    type RecallRow = { id: string; collection_id: string; score: number } & RowDataPacket;
    const [results] = await this.obClient.query<RecallRow[][]>(
      `SET ob_hnsw_ef_search = ?; ${approximate.text};`,
      [ef, ...approximate.values]
    );
    let rows = results[1];

    // 选择性很高的集合过滤可能耗尽候选；精确检索确保仍可返回范围内的 Top-K。
    if (collectionFilter && rows.length < limit) {
      [rows] = await this.obClient.query<RecallRow[]>(
        `SELECT id, collection_id, ${distance} FROM ${DatasetVectorTableName}
          WHERE ${filteredScope} ORDER BY score + 0 ASC, id ASC LIMIT ?`,
        filteredValues
      );
    }

    return {
      results: rows.map((item) => ({
        id: String(item.id),
        collectionId: item.collection_id,
        score: OceanBaseIndexConfig.scoreTransform(Number(item.score))
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

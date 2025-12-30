/* oceanbase vector crud */
import { DatasetVectorTableName } from '../constants';
import { ObClient } from './controller';
import { type RowDataPacket } from 'mysql2/promise';
import type { VectorControllerType } from '../type';
import dayjs from 'dayjs';
import { addLog } from '../../system/log';

export class ObVectorCtrl implements VectorControllerType {
  constructor() {}
  init: VectorControllerType['init'] = async () => {
    try {
      await ObClient.query(`
        CREATE TABLE IF NOT EXISTS ${DatasetVectorTableName} (
            id BIGINT AUTO_INCREMENT PRIMARY KEY,
            vector VECTOR(1536) NOT NULL,
            team_id VARCHAR(50) NOT NULL,
            dataset_id VARCHAR(50) NOT NULL,
            collection_id VARCHAR(50) NOT NULL,
            createtime TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
      `);
      await ObClient.query(
        `CREATE VECTOR INDEX IF NOT EXISTS vector_index ON ${DatasetVectorTableName}(vector) WITH (distance=inner_product, type=hnsw, m=32, ef_construction=128);`
      );
      await ObClient.query(
        `CREATE INDEX IF NOT EXISTS team_dataset_collection_index ON ${DatasetVectorTableName}(team_id, dataset_id, collection_id);`
      );
      await ObClient.query(
        `CREATE INDEX IF NOT EXISTS create_time_index ON ${DatasetVectorTableName}(createtime);`
      );

      addLog.info('init oceanbase successful');
    } catch (error) {
      addLog.error('init oceanbase error', error);
    }
  };

  insert: VectorControllerType['insert'] = async (props) => {
    const { teamId, datasetId, collectionId, vectors } = props;

    const values = vectors.map((vector) => [
      { key: 'vector', value: `[${vector}]` },
      { key: 'team_id', value: String(teamId) },
      { key: 'dataset_id', value: String(datasetId) },
      { key: 'collection_id', value: String(collectionId) }
    ]);

    const { rowCount, insertIds } = await ObClient.insert(DatasetVectorTableName, {
      values
    });

    if (rowCount === 0) {
      return Promise.reject('insertDatasetData: no insert');
    }

    return {
      insertIds
    };
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

    await ObClient.delete(DatasetVectorTableName, {
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

    const rows = await ObClient.query<
      ({
        id: string;
        collection_id: string;
        score: number;
      } & RowDataPacket)[][]
    >(
      `BEGIN;
          SET ob_hnsw_ef_search = ${global.systemEnv?.hnswEfSearch || 100};
          SELECT id, collection_id, inner_product(vector, [${vector}]) AS score
            FROM ${DatasetVectorTableName}
            WHERE team_id='${teamId}'
              AND dataset_id IN (${datasetIds.map((id) => `'${String(id)}'`).join(',')})
              ${filterCollectionIdSql}
              ${forbidCollectionSql}
            ORDER BY score desc APPROXIMATE LIMIT ${limit};
        COMMIT;`
    ).then(([rows]) => rows[2]);

    return {
      results: rows.map((item) => ({
        id: String(item.id),
        collectionId: item.collection_id,
        score: item.score
      }))
    };
  };
  getVectorDataByTime: VectorControllerType['getVectorDataByTime'] = async (start, end) => {
    const rows = await ObClient.query<
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
    ).then(([rows]) => rows);

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
    const total = await ObClient.count(DatasetVectorTableName, {
      where: whereConditions.length > 0 ? whereConditions : undefined
    });

    return total;
  };
}

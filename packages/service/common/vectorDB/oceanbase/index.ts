/* oceanbase vector crud */
import { DatasetVectorTableName, OceanBaseIndexConfig, DBDatasetVectorTableName, DBDatasetValueVectorTableName } from '../constants';
import { ObClass } from './controller';
import { type RowDataPacket } from 'mysql2/promise';
import type {
  VectorControllerType,
  DatabaseEmbeddingRecallCtrlProps,
  DatabaseEmbeddingRecallResponse
} from '../type';
import dayjs from 'dayjs';
import { addLog } from '../../system/log';

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
            createtime TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
      `);
      /********************** Database Vector Store **********************/
      await this.obClient.query(`
        CREATE TABLE IF NOT EXISTS ${DBDatasetVectorTableName} (
              id BIGINT AUTO_INCREMENT PRIMARY KEY,
              vector VECTOR(1536) NOT NULL,
              team_id VARCHAR(50) NOT NULL,
              dataset_id VARCHAR(50) NOT NULL,
              collection_id VARCHAR(50) NOT NULL,
              column_des_index VARCHAR(1024) NOT NULL,
              createtime TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          );
        `);

      await this.obClient.query(`
        CREATE TABLE IF NOT EXISTS ${DBDatasetValueVectorTableName} (
            id BIGINT AUTO_INCREMENT PRIMARY KEY,
            vector VECTOR(1536) NOT NULL,
            team_id VARCHAR(50) NOT NULL,
            dataset_id VARCHAR(50) NOT NULL,
            collection_id VARCHAR(50) NOT NULL,
            column_val_index VARCHAR(1024) NOT NULL,
            createtime TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
      `);
      // modeldata
      await this.obClient.query(
        `CREATE VECTOR INDEX IF NOT EXISTS vector_index ON ${DatasetVectorTableName}(vector) WITH (distance=inner_product, type=hnsw, m=32, ef_construction=128);`
      );
      await this.obClient.query(
        `CREATE INDEX IF NOT EXISTS team_dataset_collection_index ON ${DatasetVectorTableName}(team_id, dataset_id, collection_id);`
      );
      await this.obClient.query(
        `CREATE INDEX IF NOT EXISTS create_time_index ON ${DatasetVectorTableName}(createtime);`
      );

      // coulumndescriptionindex
      await this.obClient.query(
        `CREATE VECTOR INDEX IF NOT EXISTS table_des_vector_index ON ${DBDatasetVectorTableName}(vector) WITH (distance=cosine, type=hnsw, m=32, ef_construction=128);`
      );
      await this.obClient.query(
        `CREATE INDEX IF NOT EXISTS table_des_team_dataset_collection_index ON ${DBDatasetVectorTableName}(team_id, dataset_id, collection_id);`
      );
      await this.obClient.query(
        `CREATE INDEX IF NOT EXISTS table_des_create_time_index ON ${DBDatasetVectorTableName}(createtime);`
      );

      // coulumnvalueindex
      await this.obClient.query(
        `CREATE VECTOR INDEX IF NOT EXISTS table_val_vector_index ON ${DBDatasetValueVectorTableName}(vector) WITH (distance=cosine, type=hnsw, m=32, ef_construction=128);`
      );
      await this.obClient.query(
        `CREATE INDEX IF NOT EXISTS table_val_team_dataset_collection_index ON ${DBDatasetValueVectorTableName}(team_id, dataset_id, collection_id);`
      );
      await this.obClient.query(
        `CREATE INDEX IF NOT EXISTS table_val_create_time_index ON ${DBDatasetValueVectorTableName}(createtime);`
      );
      addLog.info(`[${this.controllerType}] init successful`);
    } catch (error) {
      addLog.error(`[${this.controllerType}] init error`, error);
    }
  };


  insert: VectorControllerType['insert'] = async (props) => {
    const {
      teamId,
      datasetId,
      collectionId,
      vectors,
      tableName = DatasetVectorTableName,
      column_des_index,
      column_val_index
    } = props;
    const values = vectors.map((vector) => [
      { key: 'vector', value: `[${vector}]` },
      { key: 'team_id', value: String(teamId) },
      { key: 'dataset_id', value: String(datasetId) },
      { key: 'collection_id', value: String(collectionId) }
    ]);

    // Add db schema special fields
    if (column_des_index) {
      values.map((item) => item.push({ key: 'column_des_index', value: column_des_index }));
    }

    if (column_val_index) {
      values.map((item) => item.push({ key: 'column_val_index', value: column_val_index }));
    }

    const { rowCount, insertIds } = await this.obClient.insert(tableName, {
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
    const { teamId, tableName = DatasetVectorTableName } = props;

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

    await this.obClient.delete(tableName, {
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
          SET ob_hnsw_ef_search = ${global.systemEnv?.hnswEfSearch || 100};
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

  databaseEmbRecall: VectorControllerType['databaseEmbRecall'] = async (
    props: DatabaseEmbeddingRecallCtrlProps
  ): Promise<DatabaseEmbeddingRecallResponse> => {
    const {
      teamId,
      datasetIds,
      vector,
      limit,
      tableName,
      retry = 2,
      forbidCollectionIdList
    } = props;

    let index: string = '';
    if (tableName == DBDatasetVectorTableName) index = 'column_des_index';
    if (tableName == DBDatasetValueVectorTableName) index = 'column_val_index';


    try {
      const forbidCollectionSql =
        forbidCollectionIdList.length > 0
          ? `AND collection_id NOT IN (${forbidCollectionIdList
              .map((id) => `'${String(id)}'`)
              .join(',')})`
          : '';
      // cosine_distance(a,b)= 1 − cosine_similarity(a,b) , range [0,2]
      const rows = await this.obClient.query<
        ({
          id: string;
          collection_id: string;
          index_field?: string;
          distance: number;
        } & RowDataPacket)[][]
      >(
        `BEGIN;
            SET ob_hnsw_ef_search = ${global.systemEnv?.hnswEfSearch || 100};
            SELECT id,
                   collection_id,
                   ${index ? `${index} AS index_field,` : ''}
                   cosine_distance(vector, [${vector}]) AS distance
              FROM ${tableName}
              WHERE team_id='${teamId}'
                AND dataset_id IN (${datasetIds.map((id) => `'${String(id)}'`).join(',')})
                ${forbidCollectionSql}
              ORDER BY distance ASC APPROXIMATE LIMIT ${limit};
          COMMIT;`
      ).then(([rows]) => rows[2] || []);

      return {
        results: rows.map((item) => ({
          id: String(item.id),
          collectionId: item.collection_id,
          score: 1 - item.distance,
          ...(tableName === DBDatasetVectorTableName
            ? { columnDesIndex: item.index_field }
            : { columnValIndex: item.index_field })
        }))
      };
    } catch (error) {
      if (retry <= 0) {
        return Promise.reject(error);
      }
      return this.databaseEmbRecall({
        ...props,
        retry: retry - 1
      });
    }
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

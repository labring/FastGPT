/* pg vector crud */
import { DatasetVectorTableName } from '../constants';
import { delay } from '@fastgpt/global/common/system/utils';
import { GsClient, connectGs } from './controller';
import { GsSearchRawType } from '@fastgpt/global/core/dataset/api';
import type {
    DelDatasetVectorCtrlProps,
    EmbeddingRecallCtrlProps,
    EmbeddingRecallResponse,
    InsertVectorControllerProps
  } from '../controller.d';
  import dayjs from 'dayjs';
  import { addLog } from '../../system/log';

export class GsVectorCtrl {
  constructor() {}
  init = async () => {
    try {
      await connectGs();
      await GsClient.query(`
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

      await GsClient.query(
        `CREATE INDEX CONCURRENTLY IF NOT EXISTS vector_index ON ${DatasetVectorTableName} USING hnsw (vector vector_ip_ops) WITH (m = 32, ef_construction = 128);`
      );
      await GsClient.query(
        `CREATE INDEX CONCURRENTLY IF NOT EXISTS team_dataset_collection_index ON ${DatasetVectorTableName} USING btree(team_id, dataset_id, collection_id);`
      );
      await GsClient.query(
        `CREATE INDEX CONCURRENTLY IF NOT EXISTS create_time_index ON ${DatasetVectorTableName} USING btree(createtime);`
      );

      addLog.info('init pg successful');
    } catch (error) {
      addLog.error('init pg error', error);
    }
  };
  insert = async (props: InsertVectorControllerProps): Promise<{ insertId: string }> => {
    const { teamId, datasetId, collectionId, vector, retry = 3 } = props;

    try {
      const { rowCount, rows } = await GsClient.insert(DatasetVectorTableName, {
        values: [
          [
            { key: 'vector', value: `[${vector}]` },
            { key: 'team_id', value: String(teamId) },
            { key: 'dataset_id', value: String(datasetId) },
            { key: 'collection_id', value: String(collectionId) }
          ]
        ]
      });

      if (rowCount === 0) {
        return Promise.reject('insertDatasetData: no insert');
      }

      return {
        insertId: rows[0].id
      };
    } catch (error) {
      if (retry <= 0) {
        return Promise.reject(error);
      }
      await delay(500);
      return this.insert({
        ...props,
        retry: retry - 1
      });
    }
  };
  delete = async (props: DelDatasetVectorCtrlProps): Promise<any> => {
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

      if ('idList' in props && Array.isArray(props.idList)) {
        if (props.idList.length === 0) return;
        return `${teamIdWhere} id IN (${props.idList.map((id) => String(id)).join(',')})`;
      }
      return Promise.reject('deleteDatasetData: no where');
    })();

    if (!where) return;

    try {
      await GsClient.delete(DatasetVectorTableName, {
        where: [where]
      });
    } catch (error) {
      if (retry <= 0) {
        return Promise.reject(error);
      }
      await delay(500);
      return this.delete({
        ...props,
        retry: retry - 1
      });
    }
  };
  embRecall = async (props: EmbeddingRecallCtrlProps): Promise<EmbeddingRecallResponse> => {
    const {
      teamId,
      datasetIds,
      vector,
      limit,
      forbidCollectionIdList,
      filterCollectionIdList,
      retry = 2
    } = props;

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

    try {
      const results: any = await GsClient.query(
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
      );
      const rows = results?.[3]?.rows as GsSearchRawType[];

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
    } catch (error) {
      if (retry <= 0) {
        return Promise.reject(error);
      }
      return this.embRecall({
        ...props,
        retry: retry - 1
      });
    }
  };
  getVectorDataByTime = async (start: Date, end: Date) => {
    const { rows } = await GsClient.query<{
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
  getVectorCountByTeamId = async (teamId: string) => {
    const total = await GsClient.count(DatasetVectorTableName, {
      where: [['team_id', String(teamId)]]
    });

    return total;
  };
  getVectorCountByDatasetId = async (teamId: string, datasetId: string) => {
    const total = await GsClient.count(DatasetVectorTableName, {
      where: [['team_id', String(teamId)], 'and', ['dataset_id', String(datasetId)]]
    });

    return total;
  };
  getVectorCountByCollectionId = async (
    teamId: string,
    datasetId: string,
    collectionId: string
  ) => {
    const total = await GsClient.count(DatasetVectorTableName, {
      where: [
        ['team_id', String(teamId)],
        'and',
        ['dataset_id', String(datasetId)],
        'and',
        ['collection_id', String(collectionId)]
      ]
    });

    return total;
  };
}

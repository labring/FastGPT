import { DataType, LoadState, MilvusClient } from '@zilliz/milvus2-sdk-node';
import {
  DatasetVectorDbName,
  DatasetVectorTableName,
  MILVUS_ADDRESS,
  MILVUS_TOKEN
} from '../constants';
import type {
  DelDatasetVectorCtrlProps,
  EmbeddingRecallCtrlProps,
  EmbeddingRecallResponse,
  InsertVectorControllerProps
} from '../controller.d';
import { delay } from '@fastgpt/global/common/system/utils';
import { addLog } from '../../../common/system/log';
import { customNanoid } from '@fastgpt/global/common/string/tools';

export class MilvusCtrl {
  constructor() {}
  getClient = async () => {
    if (!MILVUS_ADDRESS) {
      return Promise.reject('MILVUS_ADDRESS is not set');
    }
    if (global.milvusClient) return global.milvusClient;

    global.milvusClient = new MilvusClient({
      address: MILVUS_ADDRESS,
      token: MILVUS_TOKEN
    });

    addLog.info(`Milvus connected`);

    return global.milvusClient;
  };
  init = async () => {
    const client = await this.getClient();

    // init db(zilliz cloud will error)
    try {
      const { db_names } = await client.listDatabases();

      if (!db_names.includes(DatasetVectorDbName)) {
        await client.createDatabase({
          db_name: DatasetVectorDbName
        });
      }

      await client.useDatabase({
        db_name: DatasetVectorDbName
      });
    } catch (error) {}

    // init collection and index
    const { value: hasCollection } = await client.hasCollection({
      collection_name: DatasetVectorTableName
    });
    if (!hasCollection) {
      const result = await client.createCollection({
        collection_name: DatasetVectorTableName,
        description: 'Store dataset vector',
        enableDynamicField: true,
        fields: [
          {
            name: 'id',
            data_type: DataType.Int64,
            is_primary_key: true,
            autoID: false // disable auto id, and we need to set id in insert
          },
          {
            name: 'vector',
            data_type: DataType.FloatVector,
            dim: 1536
          },
          { name: 'teamId', data_type: DataType.VarChar, max_length: 64 },
          { name: 'datasetId', data_type: DataType.VarChar, max_length: 64 },
          { name: 'collectionId', data_type: DataType.VarChar, max_length: 64 },
          {
            name: 'createTime',
            data_type: DataType.Int64
          }
        ],
        index_params: [
          {
            field_name: 'vector',
            index_name: 'vector_HNSW',
            index_type: 'HNSW',
            metric_type: 'IP',
            params: { efConstruction: 32, M: 64 }
          },
          {
            field_name: 'teamId',
            index_type: 'Trie'
          },
          {
            field_name: 'datasetId',
            index_type: 'Trie'
          },
          {
            field_name: 'collectionId',
            index_type: 'Trie'
          },
          {
            field_name: 'createTime',
            index_type: 'STL_SORT'
          }
        ]
      });

      addLog.info(`Create milvus collection: `, result);
    }

    const { state: colLoadState } = await client.getLoadState({
      collection_name: DatasetVectorTableName
    });

    if (
      colLoadState === LoadState.LoadStateNotExist ||
      colLoadState === LoadState.LoadStateNotLoad
    ) {
      await client.loadCollectionSync({
        collection_name: DatasetVectorTableName
      });
      addLog.info(`Milvus collection load success`);
    }
  };

  insert = async (props: InsertVectorControllerProps): Promise<{ insertId: string }> => {
    const client = await this.getClient();
    const { teamId, datasetId, collectionId, vector, retry = 3 } = props;

    const generateId = () => {
      // in js, the max safe integer is 2^53 - 1: 9007199254740991
      // so we can generate a random number between 1-8 as the first digit
      // and the rest 15 digits can be random
      const firstDigit = customNanoid('12345678', 1);
      const restDigits = customNanoid('1234567890', 15);
      return Number(`${firstDigit}${restDigits}`);
    };
    const id = generateId();
    try {
      const result = await client.insert({
        collection_name: DatasetVectorTableName,
        data: [
          {
            id,
            vector,
            teamId: String(teamId),
            datasetId: String(datasetId),
            collectionId: String(collectionId),
            createTime: Date.now()
          }
        ]
      });

      const insertId = (() => {
        if ('int_id' in result.IDs) {
          return `${result.IDs.int_id.data?.[0]}`;
        }
        return `${result.IDs.str_id.data?.[0]}`;
      })();

      return {
        insertId: insertId
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
    const client = await this.getClient();

    const teamIdWhere = `(teamId=="${String(teamId)}")`;
    const where = await (() => {
      if ('id' in props && props.id) return `(id==${props.id})`;

      if ('datasetIds' in props && props.datasetIds) {
        const datasetIdWhere = `(datasetId in [${props.datasetIds
          .map((id) => `"${String(id)}"`)
          .join(',')}])`;

        if ('collectionIds' in props && props.collectionIds) {
          return `${datasetIdWhere} and (collectionId in [${props.collectionIds
            .map((id) => `"${String(id)}"`)
            .join(',')}])`;
        }

        return `${datasetIdWhere}`;
      }

      if ('idList' in props && Array.isArray(props.idList)) {
        if (props.idList.length === 0) return;
        return `(id in [${props.idList.map((id) => String(id)).join(',')}])`;
      }
      return Promise.reject('deleteDatasetData: no where');
    })();

    if (!where) return;

    const concatWhere = `${teamIdWhere} and ${where}`;

    try {
      await client.delete({
        collection_name: DatasetVectorTableName,
        filter: concatWhere
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
    const client = await this.getClient();
    const {
      teamId,
      datasetIds,
      vector,
      limit,
      forbidCollectionIdList,
      filterCollectionIdList,
      retry = 2
    } = props;

    // Forbid collection
    const formatForbidCollectionIdList = (() => {
      if (!filterCollectionIdList) return forbidCollectionIdList;
      const list = forbidCollectionIdList
        .map((id) => String(id))
        .filter((id) => !filterCollectionIdList.includes(id));
      return list;
    })();
    const forbidColQuery =
      formatForbidCollectionIdList.length > 0
        ? `and (collectionId not in [${formatForbidCollectionIdList.map((id) => `"${id}"`).join(',')}])`
        : '';

    // filter collection id
    const formatFilterCollectionId = (() => {
      if (!filterCollectionIdList) return;
      return filterCollectionIdList
        .map((id) => String(id))
        .filter((id) => !forbidCollectionIdList.includes(id));
    })();
    const collectionIdQuery = formatFilterCollectionId
      ? `and (collectionId in [${formatFilterCollectionId.map((id) => `"${id}"`)}])`
      : ``;
    // Empty data
    if (formatFilterCollectionId && formatFilterCollectionId.length === 0) {
      return { results: [] };
    }

    try {
      const { results } = await client.search({
        collection_name: DatasetVectorTableName,
        data: vector,
        limit,
        filter: `(teamId == "${teamId}") and (datasetId in [${datasetIds.map((id) => `"${id}"`).join(',')}]) ${collectionIdQuery} ${forbidColQuery}`,
        output_fields: ['collectionId']
      });

      const rows = results as {
        score: number;
        id: string;
        collectionId: string;
      }[];

      return {
        results: rows.map((item) => ({
          id: String(item.id),
          collectionId: item.collectionId,
          score: item.score
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

  getVectorCountByTeamId = async (teamId: string) => {
    const client = await this.getClient();

    const result = await client.query({
      collection_name: DatasetVectorTableName,
      output_fields: ['count(*)'],
      filter: `teamId == "${String(teamId)}"`
    });

    const total = result.data?.[0]?.['count(*)'] as number;

    return total;
  };
  getVectorCountByDatasetId = async (teamId: string, datasetId: string) => {
    const client = await this.getClient();

    const result = await client.query({
      collection_name: DatasetVectorTableName,
      output_fields: ['count(*)'],
      filter: `(teamId == "${String(teamId)}") and (dataset == "${String(datasetId)}")`
    });

    const total = result.data?.[0]?.['count(*)'] as number;

    return total;
  };

  getVectorDataByTime = async (start: Date, end: Date) => {
    const client = await this.getClient();
    const startTimestamp = new Date(start).getTime();
    const endTimestamp = new Date(end).getTime();

    const result = await client.query({
      collection_name: DatasetVectorTableName,
      output_fields: ['id', 'teamId', 'datasetId'],
      filter: `(createTime >= ${startTimestamp}) and (createTime <= ${endTimestamp})`
    });

    const rows = result.data as {
      id: string;
      teamId: string;
      datasetId: string;
    }[];

    return rows.map((item) => ({
      id: String(item.id),
      teamId: item.teamId,
      datasetId: item.datasetId
    }));
  };
}

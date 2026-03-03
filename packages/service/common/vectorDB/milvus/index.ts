import { LoadState, MilvusClient } from '@zilliz/milvus2-sdk-node';
import {
  DatasetVectorDbName,
  DatasetVectorTableName,
  DBDatasetVectorTableName,
  DBDatasetValueVectorTableName,
  MILVUS_ADDRESS,
  MILVUS_TOKEN
} from '../constants';
import type {
  VectorControllerType,
  DatabaseEmbeddingRecallCtrlProps,
  DatabaseEmbeddingRecallResponse
} from '../type';
import { retryFn } from '@fastgpt/global/common/system/utils';
import { addLog } from '../../system/log';
import { customNanoid } from '@fastgpt/global/common/string/tools';
import {
  milvusCollectionDefinitions,
  type MilvusCollectionConfig,
  type MilvusInsertRow
} from './config';

export class MilvusCtrl implements VectorControllerType {
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
    await global.milvusClient.connectPromise;

    addLog.info(`Milvus connected`);

    return global.milvusClient;
  };
  private createMilvusCollection = async (client: MilvusClient, config: MilvusCollectionConfig) => {
    const { name, description, fields, indexParams } = config;

    const { value: hasCollection } = await client.hasCollection({
      collection_name: name
    });

    if (!hasCollection) {
      const result = await client.createCollection({
        collection_name: name,
        description,
        enableDynamicField: true,
        fields,
        index_params: indexParams
      });
      addLog.info(`Create milvus collection ${name}`, result);
      return;
    }
  };

  private loadCollection = async (client: MilvusClient, collectionName: string) => {
    const { state } = await client.getLoadState({
      collection_name: collectionName
    });

    if (state === LoadState.LoadStateNotExist || state === LoadState.LoadStateNotLoad) {
      await client.loadCollectionSync({
        collection_name: collectionName
      });
      addLog.info(`Milvus collection ${collectionName} load success`);
    }
  };
  init: VectorControllerType['init'] = async () => {
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

    for (const config of milvusCollectionDefinitions) {
      await this.createMilvusCollection(client, config);
      await this.loadCollection(client, config.name);
    }
  };

  insert: VectorControllerType['insert'] = async (props) => {

    const client = await this.getClient();
    const {
      teamId,
      datasetId,
      collectionId,
      vectors,
      tableName = DatasetVectorTableName,
      column_des_index,
      column_val_index
    } = props;

    const generateId = () => {
      // in js, the max safe integer is 2^53 - 1: 9007199254740991
      // so we can generate a random number between 1-8 as the first digit
      // and the rest 15 digits can be random
      const firstDigit = customNanoid('12345678', 1);
      const restDigits = customNanoid('1234567890', 15);
      return Number(`${firstDigit}${restDigits}`);
    };

    const now = Date.now();
    const data: MilvusInsertRow[] = vectors.map((vector) => {
      const row: MilvusInsertRow = {
        id: generateId(),
        vector,
        teamId: String(teamId),
        datasetId: String(datasetId),
        collectionId: String(collectionId),
        createTime: now
      };
      if (column_des_index) {
        row.columnDesIndex = column_des_index;
      }
      if (column_val_index) {
        row.columnValIndex = column_val_index;
      }
      return row;
    });

    const result = await client.insert({
      collection_name: tableName,
      data
    });

    if (result.IDs === null) {
      addLog.error(
        `[Milvus] insert error: ${result.status.error_code},detail: ${result.status.reason}`
      );
    }

    const insertIds = (() => {
      if ('int_id' in result.IDs) {
        return result.IDs.int_id.data.map((id) => String(id));
      }
      return result.IDs.str_id.data.map((id) => String(id));
    })();

    return {
      insertIds
    };
  };
  delete: VectorControllerType['delete'] = async (props) => {
    const { teamId, tableName = DatasetVectorTableName } = props;
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

    await client.delete({
      collection_name: tableName,
      filter: concatWhere
    });
  };
  embRecall: VectorControllerType['embRecall'] = async (props) => {
    const client = await this.getClient();
    const { teamId, datasetIds, vector, limit, forbidCollectionIdList, filterCollectionIdList } =
      props;

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
      ? `and (collectionId in [${formatFilterCollectionId.map((id) => `"${id}"`).join(',')}])`
      : ``;
    // Empty data
    if (formatFilterCollectionId && formatFilterCollectionId.length === 0) {
      return { results: [] };
    }

    const filterStr =
      `(teamId == "${teamId}") and (datasetId in [${datasetIds.map((id) => `"${id}"`).join(',')}]) ${collectionIdQuery} ${forbidColQuery}`.trim();

    const searchResult = await retryFn(() =>
      client.search({
        collection_name: DatasetVectorTableName,
        vector: vector,
        params: { ef: global.systemEnv?.hnswEfSearch || 100 },
        limit,
        expr: filterStr,
        output_fields: ['collectionId']
      })
    );

    const rows = (searchResult.results || []) as {
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
  };

  databaseEmbRecall: VectorControllerType['databaseEmbRecall'] = async (
    props: DatabaseEmbeddingRecallCtrlProps
  ): Promise<DatabaseEmbeddingRecallResponse> => {
    const client = await this.getClient();
    const {
      teamId,
      datasetIds,
      vector,
      limit,
      tableName,
      retry = 2,
      forbidCollectionIdList
    } = props;

    const forbidFilter =
      forbidCollectionIdList.length > 0
        ? `and (collectionId not in [${forbidCollectionIdList.map((id) => `"${String(id)}"`).join(',')}])`
        : '';

    const outputFields = ['collectionId'];
    if (tableName === DBDatasetVectorTableName) {
      outputFields.push('columnDesIndex');
    }
    if (tableName === DBDatasetValueVectorTableName) {
      outputFields.push('columnValIndex');
    }

    try {
      const { results } = await retryFn(
        () =>
          client.search({
            collection_name: tableName,
            data: vector,
            limit,
            filter: `(teamId == "${teamId}") and (datasetId in [${datasetIds
              .map((id) => `"${String(id)}"`)
              .join(',')}]) ${forbidFilter}`,
            output_fields: outputFields
          }),
        retry
      );

      const rows = results as Array<{
        score: number;
        id: string;
        collectionId: string;
        columnDesIndex?: string;
        columnValIndex?: string;
      }>;

      return {
        results: rows.map((item) => ({
          id: String(item.id),
          collectionId: item.collectionId,
          score: item.score,
          ...(item.columnDesIndex ? { columnDesIndex: item.columnDesIndex } : {}),
          ...(item.columnValIndex ? { columnValIndex: item.columnValIndex } : {})
        }))
      };
    } catch (error) {
      return Promise.reject(error);
    }
  };

  getVectorCount: VectorControllerType['getVectorCount'] = async (props) => {
    const { teamId, datasetId, collectionId } = props;
    const client = await this.getClient();

    // Build filter conditions dynamically (each condition wrapped in parentheses)
    const filterConditions: string[] = [];

    if (teamId) {
      filterConditions.push(`(teamId == "${String(teamId)}")`);
    }

    if (datasetId) {
      filterConditions.push(`(datasetId == "${String(datasetId)}")`);
    }

    if (collectionId) {
      filterConditions.push(`(collectionId == "${String(collectionId)}")`);
    }

    // If no conditions provided, count all (empty filter)
    const filter = filterConditions.length > 0 ? filterConditions.join(' and ') : '';

    const result = await client.query({
      collection_name: DatasetVectorTableName,
      output_fields: ['count(*)'],
      filter: filter || undefined
    });

    const total = result.data?.[0]?.['count(*)'];

    return Number(total);
  };

  getVectorDataByTime: VectorControllerType['getVectorDataByTime'] = async (start, end) => {
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

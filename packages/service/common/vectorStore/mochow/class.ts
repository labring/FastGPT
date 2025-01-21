import {
  FieldSchema,
  IndexSchema,
  TableSchema,
  FieldType,
  IndexType,
  MetricType,
  PartitionType,
  CreateTableArgs,
  InsertArgs,
  SelectArgs,
  DeleteArgs,
  VectorSearchArgs,
  VectorTopkSearchRequest,
  VectorSearchConfig,
  SearchResponse,
  Vector,
  Row,
  ServerErrCode,
  ClientConfiguration,
  MochowClient
} from '@mochow/mochow-sdk-node';
import {
  DatasetVectorDbName,
  DatasetVectorTableName,
  MOCHOW_ADDRESS,
  MOCHOW_ACCOUNT,
  MOCHOW_APIKEY,
  MOCHOW_REPLICA_NUM
} from '../constants';
import type {
  DelDatasetVectorCtrlProps,
  EmbeddingRecallCtrlProps,
  EmbeddingRecallResponse,
  InsertVectorControllerProps
} from '../controller.d';
import { delay } from '@fastgpt/global/common/system/utils';
import { addLog } from '../../system/log';
import { customNanoid } from '@fastgpt/global/common/string/tools';

export class MochowCtrl {
  constructor() {}
  getClient = async () => {
    if (!MOCHOW_ADDRESS) {
      return Promise.reject('MOCHOW_ADDRESS is not set');
    }
    if (global.mochowClient) return global.mochowClient;

    let config: ClientConfiguration = {
      endpoint: MOCHOW_ADDRESS,
      credential: {
        account: MOCHOW_ACCOUNT,
        apiKey: MOCHOW_APIKEY
      }
    };
    global.mochowClient = new MochowClient(config);

    addLog.info(`Mochow connected`);

    return global.mochowClient;
  };
  init = async () => {
    const client = await this.getClient();

    const list_database_resp = await client.listDatabases();
    if (list_database_resp.code != ServerErrCode.OK) {
      return Promise.reject('list databases error: ' + list_database_resp.msg);
    }

    if (!list_database_resp.databases.includes(DatasetVectorDbName)) {
      const create_database_resp = await client.createDatabase(DatasetVectorDbName);
      if (create_database_resp.code != ServerErrCode.OK) {
        return Promise.reject('create databases error: ' + create_database_resp.msg);
      }
    }

    const list_table_resp = await client.listTables(DatasetVectorDbName);
    if (list_table_resp.code != ServerErrCode.OK) {
      return Promise.reject('list tables error: ' + list_table_resp.msg);
    }

    if (!list_table_resp.tables.includes(DatasetVectorTableName)) {
      let fields: FieldSchema[] = [
        {
          fieldName: 'id',
          fieldType: FieldType.Int64,
          primaryKey: true,
          partitionKey: true,
          autoIncrement: false,
          notNull: true
        },
        {
          fieldName: 'teamId',
          fieldType: FieldType.String,
          notNull: true
        },
        {
          fieldName: 'datasetId',
          fieldType: FieldType.String,
          notNull: true
        },
        {
          fieldName: 'collectionId',
          fieldType: FieldType.String,
          notNull: true
        },
        {
          fieldName: 'createTime',
          fieldType: FieldType.Int64,
          notNull: true
        },
        {
          fieldName: 'vector',
          fieldType: FieldType.FloatVector,
          notNull: true,
          dimension: 1536
        }
      ];

      // Indexes
      let indexes: IndexSchema[] = [
        {
          indexName: 'teamId_idx',
          field: 'teamId',
          indexType: IndexType.SecondaryIndex
        },
        {
          indexName: 'datasetId_idx',
          field: 'datasetId',
          indexType: IndexType.SecondaryIndex
        },
        {
          indexName: 'collectionId_idx',
          field: 'collectionId',
          indexType: IndexType.SecondaryIndex
        },
        {
          indexName: 'createTime_idx',
          field: 'createTime',
          indexType: IndexType.SecondaryIndex
        },
        {
          indexName: 'vector_idx',
          field: 'vector',
          indexType: IndexType.HNSW,
          metricType: MetricType.IP,
          params: {
            M: 64,
            efConstruction: 32
          },
          autoBuild: false
        }
      ];

      // create table
      let schema: TableSchema = { fields: fields, indexes: indexes };
      let createTableReq: CreateTableArgs = {
        database: DatasetVectorDbName,
        table: DatasetVectorTableName,
        description: 'fastgpt',
        replication: Number(MOCHOW_REPLICA_NUM),
        partition: {
          partitionType: PartitionType.HASH,
          partitionNum: 3
        },
        enableDynamicField: false,
        schema: schema
      };
      const create_table_resp = await client.createTable(createTableReq);
      if (create_table_resp.code != ServerErrCode.OK) {
        return Promise.reject('list tables error: ' + list_table_resp.msg);
      }
      addLog.info(`Create mochow table success`);
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
    const insertArgs: InsertArgs = {
      database: DatasetVectorDbName,
      table: DatasetVectorTableName,
      rows: [
        {
          id: id,
          teamId: String(teamId),
          datasetId: String(datasetId),
          collectionId: String(collectionId),
          createTime: Date.now(),
          vector: vector
        }
      ]
    };
    try {
      const insert_resp = await client.insert(insertArgs);
      if (insert_resp.code != ServerErrCode.OK) {
        return Promise.reject('insert tables error: ' + insert_resp.msg);
      }
      if (insert_resp.affectedCount == 1) {
        return {
          insertId: String(id)
        };
      } else {
        return Promise.reject('insertDatasetData: unknown error');
      }
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

    const teamIdWhere = `(teamId=='${String(teamId)}')`;
    const where = await (() => {
      if ('id' in props && props.id) return `(id==${props.id})`;

      if ('datasetIds' in props && props.datasetIds) {
        const datasetIdWhere = `(datasetId in [${props.datasetIds
          .map((id) => `${String(id)}`)
          .join(',')}])`;

        if ('collectionIds' in props && props.collectionIds) {
          return `${datasetIdWhere} and (collectionId in [${props.collectionIds
            .map((id) => `${String(id)}`)
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
    let deleteReq: DeleteArgs = {
      database: DatasetVectorDbName,
      table: DatasetVectorTableName,
      filter: concatWhere
    };

    try {
      await client.delete(deleteReq);
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
        ? `and (collectionId not in [${formatForbidCollectionIdList.map((id) => `${id}`).join(',')}])`
        : '';

    // filter collection id
    const formatFilterCollectionId = (() => {
      if (!filterCollectionIdList) return;
      return filterCollectionIdList
        .map((id) => String(id))
        .filter((id) => !forbidCollectionIdList.includes(id));
    })();
    const collectionIdQuery = formatFilterCollectionId
      ? `and (collectionId in [${formatFilterCollectionId.map((id) => `${id}`)}])`
      : ``;
    // Empty data
    if (formatFilterCollectionId && formatFilterCollectionId.length === 0) {
      return { results: [] };
    }

    try {
      let searchArgs: VectorSearchArgs = {
        database: DatasetVectorDbName,
        table: DatasetVectorTableName,
        request: new VectorTopkSearchRequest('vector', new Vector(vector), limit)
          .Filter(
            `(teamId == '${teamId}') and (datasetId in [${datasetIds.map((id) => `'${id}'`).join(',')}]) ${collectionIdQuery} ${forbidColQuery}`
          )
          .Projections(['collectionId'])
          .Config(new VectorSearchConfig().Ef(100))
      };
      const vector_search_resp = await client.vectorSearch(searchArgs);
      if (vector_search_resp.code != 0) {
        addLog.warn(`fail to search data due to: ` + vector_search_resp.msg);
        return Promise.reject('search row error: ' + vector_search_resp.msg);
      }
      const rows = (vector_search_resp as SearchResponse).rows as Row[];

      return {
        results: rows.map((item) => ({
          id: item['id'],
          collectionId: item['collectionId'],
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
    let total = 0;
    let isTruncated = true;
    let marker = undefined;
    while (isTruncated) {
      let selectArgs: SelectArgs = {
        database: DatasetVectorDbName,
        table: DatasetVectorTableName,
        filter: `teamId == '${String(teamId)}'`,
        projections: ['id'],
        marker: marker,
        limit: 1000
      };
      let resp = await client.select(selectArgs);
      if (resp.code != 0) {
        addLog.warn(`fail to select data due to: ` + resp.msg);
        return Promise.reject('fail to select data due to: ' + resp.msg);
      }
      isTruncated = resp.isTruncated;
      marker = resp.nextMarker;
      total = total + resp.rows.length;
    }

    return total;
  };
  getVectorCountByDatasetId = async (teamId: string, datasetId: string) => {
    const client = await this.getClient();

    let total = 0;
    let isTruncated = true;
    let marker = undefined;
    while (isTruncated) {
      let selectArgs: SelectArgs = {
        database: DatasetVectorDbName,
        table: DatasetVectorTableName,
        filter: `(teamId == '${String(teamId)}') and (dataset == '${String(datasetId)}')`,
        projections: ['id'],
        marker: marker,
        limit: 1000
      };
      let resp = await client.select(selectArgs);
      if (resp.code != 0) {
        addLog.warn(`fail to select data due to: ` + resp.msg);
        return Promise.reject('select row error: ' + resp.msg);
      }
      isTruncated = resp.isTruncated;
      marker = resp.nextMarker;
      total = total + resp.rows.length;
    }

    return total;
  };

  getVectorDataByTime = async (start: Date, end: Date) => {
    const client = await this.getClient();
    const startTimestamp = new Date(start).getTime();
    const endTimestamp = new Date(end).getTime();

    let isTruncated = true;
    let marker = undefined;
    let selectRows: Row[] = [];
    while (isTruncated) {
      let selectArgs: SelectArgs = {
        database: DatasetVectorDbName,
        table: DatasetVectorTableName,
        filter: `(createTime >= ${startTimestamp}) and (createTime <= ${endTimestamp})`,
        projections: ['id', 'teamId', 'datasetId'],
        marker: marker,
        limit: 1000
      };
      let resp = await client.select(selectArgs);
      if (resp.code != 0) {
        addLog.warn(`fail to select data due to: ` + resp.msg);
        return Promise.reject('select row error: ' + resp.msg);
      }
      selectRows.push(resp.rows);
      isTruncated = resp.isTruncated;
      marker = resp.nextMarker;
    }

    return selectRows.map((item) => ({
      id: item['id'],
      teamId: item['teamId'],
      datasetId: item['datasetId']
    }));
  };
}

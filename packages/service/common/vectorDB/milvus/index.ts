import { LoadState, MilvusClient } from '@zilliz/milvus2-sdk-node';
import {
  DatasetVectorDbName,
  DatasetVectorTableName,
  DBDatasetVectorTableName,
  DBDatasetValueVectorTableName,
  MILVUS_ADDRESS,
  MILVUS_TOKEN,
  MILVUS_TIMEOUT
} from '../constants';
import type {
  VectorControllerType,
  DatabaseEmbeddingRecallCtrlProps,
  DatabaseEmbeddingRecallResponse,
  InsertVectorControllerPropsType
} from '../type';
import { retryFn } from '@fastgpt/global/common/system/utils';
import { addLog } from '../../system/log';
import { customNanoid } from '@fastgpt/global/common/string/tools';
import {
  getMilvusCollectionDefinitions,
  MILVUS_TEXT_MAX_LENGTH,
  type MilvusCollectionConfig,
  type MilvusInsertRow
} from './config';
import { milvusVersionManager } from './version';

export class MilvusCtrl implements VectorControllerType {
  constructor() {}
  getClient = async () => {
    if (!MILVUS_ADDRESS) {
      return Promise.reject('MILVUS_ADDRESS is not set');
    }
    if (global.milvusClient) return global.milvusClient;

    global.milvusClient = new MilvusClient({
      address: MILVUS_ADDRESS,
      token: MILVUS_TOKEN,
      timeout: MILVUS_TIMEOUT
    });
    await global.milvusClient.connectPromise;

    addLog.info(`Milvus connected`);

    return global.milvusClient;
  };
  private createMilvusCollection = async (client: MilvusClient, config: MilvusCollectionConfig) => {
    const { name, description, fields, indexParams, functions } = config;

    const { value: hasCollection } = await client.hasCollection({
      collection_name: name
    });

    if (!hasCollection) {
      const result = await client.createCollection({
        collection_name: name,
        description,
        enableDynamicField: true,
        fields,
        index_params: indexParams,
        functions: functions // Milvus 2.6+ BM25 Function
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

    // 版本检测（必须在集合创建之前完成）
    await milvusVersionManager.detectVersion(client);

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

    // 在版本检测完成后，动态生成集合定义
    const collectionDefinitions = getMilvusCollectionDefinitions();

    for (const config of collectionDefinitions) {
      await this.createMilvusCollection(client, config);
      await this.loadCollection(client, config.name);
    }
  };

  insert: VectorControllerType['insert'] = async (
    props: InsertVectorControllerPropsType
  ): Promise<{ insertIds: string[] }> => {
    const client = await this.getClient();
    const {
      teamId,
      datasetId,
      collectionId,
      vectors,
      tableName = DatasetVectorTableName,
      column_des_index,
      column_val_index,
      textContents,
      metadataList
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
    const data: MilvusInsertRow[] = vectors.map((vector, index) => {
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
      // Milvus 2.6+ 添加原始文本（BM25 Function 会自动生成 sparse 字段）
      if (textContents && textContents[index] && milvusVersionManager.supportsFullText()) {
        const rawText = textContents[index];
        if (rawText.length > MILVUS_TEXT_MAX_LENGTH) {
          addLog.warn(
            `[Milvus] text field truncated: original length ${rawText.length} exceeds max_length ${MILVUS_TEXT_MAX_LENGTH}, id=${row.id}, collectionId=${collectionId}`
          );
          row.text = rawText.slice(0, MILVUS_TEXT_MAX_LENGTH);
        } else {
          row.text = rawText;
        }
      }
      // Milvus 2.6+ 添加元数据
      // Ensure metadata is always a valid object (not null/undefined) to avoid Milvus errors
      if (milvusVersionManager.supportsFullText()) {
        row.metadata = (metadataList && metadataList[index]) || {};
      }
      return row;
    });

    const result = await client.insert({
      collection_name: tableName,
      skip_check_schema: true, // milvus 2.6 可能因为缓存导致 collection schema mismatch
      data
    });

    if (result.IDs === null) {
      addLog.error(
        `[Milvus] insert error: ${result.status.error_code},detail: ${result.status.reason}`
      );
      return Promise.reject(
        new Error(`Milvus insert failed: ${result.status.error_code} - ${result.status.reason}`)
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
        data: [vector],
        params: { ef: global.systemEnv?.hnswEfSearch || 100 },
        limit,
        expr: filterStr,
        output_fields: ['id', 'collectionId']
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

  // Milvus 2.6+ 全文检索方法
  fullTextSearch = async ({
    teamId,
    datasetIds,
    query,
    limit,
    forbidCollectionIdList,
    filterCollectionIdList
  }: {
    teamId: string;
    datasetIds: string[];
    query: string;
    limit: number;
    forbidCollectionIdList: string[];
    filterCollectionIdList?: string[];
  }): Promise<
    Array<{
      id: string;
      collectionId: string;
      score: number;
    }>
  > => {
    const client = await this.getClient();

    // 构建禁止集合过滤条件（复用 embRecall 逻辑）
    const formatForbidCollectionIdList = (() => {
      if (!filterCollectionIdList) return forbidCollectionIdList;
      return forbidCollectionIdList
        .map((id) => String(id))
        .filter((id) => !filterCollectionIdList.includes(id));
    })();

    const forbidColQuery =
      formatForbidCollectionIdList.length > 0
        ? `and (collectionId not in [${formatForbidCollectionIdList.map((id) => `"${id}"`).join(',')}])`
        : '';

    // 构建集合过滤条件
    const formatFilterCollectionId = (() => {
      if (!filterCollectionIdList) return;
      return filterCollectionIdList
        .map((id) => String(id))
        .filter((id) => !forbidCollectionIdList.includes(id));
    })();

    const collectionIdQuery = formatFilterCollectionId
      ? `and (collectionId in [${formatFilterCollectionId.map((id) => `"${id}"`).join(',')}])`
      : '';

    // 空数据检查
    if (formatFilterCollectionId && formatFilterCollectionId.length === 0) {
      return [];
    }

    // Milvus 2.6 BM25 全文检索（使用 sparse 字段）
    const { results } = await retryFn(() =>
      client.search({
        collection_name: DatasetVectorTableName,
        filter: `(teamId == "${teamId}") and (datasetId in [${datasetIds.map((id) => `"${id}"`).join(',')}]) ${collectionIdQuery} ${forbidColQuery}`,
        output_fields: ['id', 'collectionId'],
        anns_field: 'sparse', // BM25 Function 生成的稀疏向量字段
        data: [query], // 直接传入原始文本，Milvus 自动转换为稀疏向量
        limit,
        params: {
          metric_type: 'BM25'
        }
      } as any)
    );

    const rows = results as {
      score: number;
      id: string;
      collectionId: string;
    }[];

    return rows.map((item) => ({
      id: String(item.id),
      collectionId: item.collectionId,
      score: item.score
    }));
  };

  hybridSearch = async ({
    teamId,
    datasetIds,
    vector,
    query,
    limit,
    forbidCollectionIdList,
    filterCollectionIdList
  }: {
    teamId: string;
    datasetIds: string[];
    vector: number[];
    query: string;
    limit: number;
    forbidCollectionIdList: string[];
    filterCollectionIdList?: string[];
  }): Promise<
    Array<{
      id: string;
      collectionId: string;
      score: number;
    }>
  > => {
    const client = await this.getClient();

    const formatForbidCollectionIdList = (() => {
      if (!filterCollectionIdList) return forbidCollectionIdList;
      return forbidCollectionIdList
        .map((id) => String(id))
        .filter((id) => !filterCollectionIdList.includes(id));
    })();

    const forbidColQuery =
      formatForbidCollectionIdList.length > 0
        ? `and (collectionId not in [${formatForbidCollectionIdList.map((id) => `"${id}"`).join(',')}])`
        : '';

    const formatFilterCollectionId = (() => {
      if (!filterCollectionIdList) return;
      return filterCollectionIdList
        .map((id) => String(id))
        .filter((id) => !forbidCollectionIdList.includes(id));
    })();

    const collectionIdQuery = formatFilterCollectionId
      ? `and (collectionId in [${formatFilterCollectionId.map((id) => `"${id}"`).join(',')}])`
      : '';

    if (formatFilterCollectionId && formatFilterCollectionId.length === 0) {
      return [];
    }

    const { results } = await retryFn(() =>
      client.search({
        collection_name: DatasetVectorTableName,
        limit,
        filter: `(teamId == "${teamId}") and (datasetId in [${datasetIds.map((id) => `"${id}"`).join(',')}]) ${collectionIdQuery} ${forbidColQuery}`,
        output_fields: ['id', 'collectionId'],
        data: [
          {
            data: vector,
            anns_field: 'vector',
            params: { ef: global.systemEnv?.hnswEfSearch || 100 },
            limit
          },
          {
            data: query,
            anns_field: 'sparse',
            params: { metric_type: 'BM25' },
            limit
          }
        ],
        rerank: {
          strategy: 'rrf', // RRF (Reciprocal Rank Fusion) 策略
          // k 越高，对排名靠前的敏感度越低
          // rrf: milvus对每种search使用相同的k，与fastgpt不同，加权可以使用weighted reranker
          params: { k: 60 }
        }
      } as any)
    );

    const rows = results as {
      score: number;
      id: string;
      collectionId: string;
    }[];

    return rows.map((item) => ({
      id: String(item.id),
      collectionId: item.collectionId,
      score: item.score
    }));
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

    const outputFields = ['id', 'collectionId'];
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

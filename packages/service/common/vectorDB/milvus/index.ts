import { LoadState, MilvusClient } from '@zilliz/milvus2-sdk-node';
import type {
  FieldType,
  FunctionObject
} from '@zilliz/milvus2-sdk-node/dist/milvus/types/Collection';
import type { CreateIndexSimpleReq } from '@zilliz/milvus2-sdk-node/dist/milvus/types/MilvusIndex';
import {
  DatasetVectorDbName,
  DatasetVectorTableNameV2,
  MILVUS_ADDRESS,
  MILVUS_TOKEN,
  getDatasetVectorTableName
} from '../constants';
import { assertFullTextCapability, assertMilvusVersion, buildCollectionFilter } from './fullText';
import {
  buildAnalyzerParams,
  createBM25Function,
  createFullTextFieldDefs,
  createFullTextIndexParams,
  getMilvusLanguageIdentifier,
  MILVUS_TEXT_MAX_LENGTH,
  truncateFullTextByBytes
} from './fullTextConfig';
import type { VectorControllerType } from '../type';
import { retryFn } from '@fastgpt/global/common/system/utils';
import { getLogger, LogCategories } from '../../logger';
import { customNanoid } from '@fastgpt/global/common/string/tools';

const logger = getLogger(LogCategories.INFRA.VECTOR);

type EnsureCollectionOptions = {
  description: string;
  enableDynamicField?: boolean;
  fields: FieldType[];
  index_params: Omit<CreateIndexSimpleReq, 'collection_name'>[];
  functions?: FunctionObject[];
};

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

    logger.info('Milvus connected', { address: MILVUS_ADDRESS });

    return global.milvusClient;
  };

  /**
   * 幂等创建并加载集合。
   * modeldata 与 modeldata_v2 共用同一套样板:hasCollection → createCollection → getLoadState → loadCollectionSync。
   */
  private async ensureCollection(
    client: MilvusClient,
    name: string,
    options: EnsureCollectionOptions
  ) {
    const { value: hasCollection } = await client.hasCollection({
      collection_name: name
    });
    if (!hasCollection) {
      const result = await client.createCollection({
        collection_name: name,
        ...options
      });

      logger.info('Milvus collection created', {
        collection: name,
        result
      });
    }

    const { state } = await client.getLoadState({
      collection_name: name
    });

    if (state === LoadState.LoadStateNotExist || state === LoadState.LoadStateNotLoad) {
      await client.loadCollectionSync({
        collection_name: name
      });
      logger.info('Milvus collection loaded', { collection: name });
    }
  }

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
    } catch (error) {
      logger.warn('Milvus database initialization skipped or failed', { error });
    }

    await assertMilvusVersion(client);

    await this.ensureCollection(client, DatasetVectorTableNameV2, {
      description: 'Store dataset vector + BM25 full-text (single table)',
      enableDynamicField: true,
      fields: createFullTextFieldDefs(buildAnalyzerParams(getMilvusLanguageIdentifier())),
      index_params: [
        {
          field_name: 'vector',
          index_name: 'vector_HNSW',
          index_type: 'HNSW',
          metric_type: 'IP',
          params: { efConstruction: 128, M: 32 }
        },
        ...createFullTextIndexParams()
      ],
      functions: [createBM25Function()]
    });

    await assertFullTextCapability(client);
    logger.info('Milvus full-text capability verified');
  };

  insert: VectorControllerType['insert'] = async (props) => {
    const client = await this.getClient();
    const { teamId, datasetId, collectionId, vectors, texts } = props;

    // 单表方案:BM25 文本随向量一并写入 modeldata_v2。texts 缺失会让全文行静默变空文本、
    // 全文检索永远命中不了,故 Milvus 分支强制要求 texts 存在且与 vectors 一一对应;
    // 数组元素允许空串(imageEmbedding 不索引文本,与迁移行为一致)。
    if (texts === undefined) {
      throw new Error('Milvus insert requires texts (per-vector BM25 text)');
    }
    if (texts.length !== vectors.length) {
      throw new Error(
        `Milvus insert texts length (${texts.length}) does not match vectors length (${vectors.length})`
      );
    }

    const generateId = () => {
      // in js, the max safe integer is 2^53 - 1: 9007199254740991
      // so we can generate a random number between 1-8 as the first digit
      // and the rest 15 digits can be random
      const firstDigit = customNanoid('12345678', 1);
      const restDigits = customNanoid('1234567890', 15);
      return Number(`${firstDigit}${restDigits}`);
    };

    const collectionName = getDatasetVectorTableName();

    const result = await client.insert({
      collection_name: collectionName,
      data: vectors.map((vector, index) => ({
        id: generateId(),
        vector,
        teamId: String(teamId),
        datasetId: String(datasetId),
        collectionId: String(collectionId),
        createTime: Date.now(),
        // 单表方案:provider=milvus 时全文 text 随向量一并写入 modeldata_v2。
        // VarChar max_length 按 UTF-8 字节计,写入前按字节截断,避免中文等多字节文本超限导致插入失败
        text: truncateFullTextByBytes(texts[index] ?? '', MILVUS_TEXT_MAX_LENGTH)
      }))
    });

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
    const { teamId } = props;
    const client = await this.getClient();

    const teamIdWhere = `(teamId=="${String(teamId)}")`;
    const where = await (() => {
      if ('id' in props && props.id) return `(id==${String(props.id)})`;

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
      collection_name: getDatasetVectorTableName(),
      filter: concatWhere
    });
  };
  embRecall: VectorControllerType['embRecall'] = async (props) => {
    const client = await this.getClient();
    const { teamId, datasetIds, vector, limit, forbidCollectionIdList, filterCollectionIdList } =
      props;

    // collection 过滤子句(与 MilvusFullTextStore.search 共用同一实现)
    const { collectionIdQuery, forbidColQuery, empty } = buildCollectionFilter({
      forbidCollectionIdList,
      filterCollectionIdList
    });
    // Empty data
    if (empty) {
      return { results: [] };
    }

    const filterStr =
      `(teamId == "${teamId}") and (datasetId in [${datasetIds.map((id) => `"${id}"`).join(',')}]) ${collectionIdQuery} ${forbidColQuery}`.trim();

    const searchResult = await retryFn(() =>
      client.search({
        collection_name: getDatasetVectorTableName(),
        // SDK 2.6 起 search 使用 data 字段(向量/文本)替代 vector
        data: [vector],
        limit,
        expr: filterStr,
        // SDK 不自动回填主键:search 结果只含 output_fields 指定的字段,id 需显式列出
        output_fields: ['id', 'collectionId']
      } as any)
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
      collection_name: getDatasetVectorTableName(),
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
      collection_name: getDatasetVectorTableName(),
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

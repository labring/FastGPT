import { DataType, LoadState, MilvusClient } from '@zilliz/milvus2-sdk-node';
import {
  DatasetVectorDbName,
  DatasetVectorTableName,
  MILVUS_ADDRESS,
  MILVUS_TOKEN
} from '../constants';
import type {
  VectorControllerType,
  InsertVectorControllerPropsType,
  EmbeddingRecallCtrlPropsType,
  EmbeddingRecallResponseType,
  FullTextSearchCtrlPropsType
} from '../type';
import { retryFn } from '@fastgpt/global/common/system/utils';
import { getLogger, LogCategories } from '../../logger';
import { customNanoid } from '@fastgpt/global/common/string/tools';
import { serviceEnv } from '../../../env';
import {
  getMilvusCollectionDefinitions,
  MILVUS_TEXT_MAX_LENGTH,
  MILVUS_QUERY_MAX_LENGTH,
  isSchemaMismatchError,
  type MilvusCollectionConfig,
  type MilvusInsertRow
} from './config';
import { milvusVersionManager } from './version';

const logger = getLogger(LogCategories.INFRA.VECTOR);

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
      timeout: serviceEnv.MILVUS_TIMEOUT
    });
    await global.milvusClient.connectPromise;

    logger.info('Milvus connected', { address: MILVUS_ADDRESS });

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
        functions
      });
      logger.info('Milvus collection created', { collection: name, result });
      return;
    }

    logger.info('Milvus collection already exists', { collection: name });
  };

  private loadCollection = async (client: MilvusClient, name: string) => {
    const { state: colLoadState } = await client.getLoadState({
      collection_name: name
    });

    if (
      colLoadState === LoadState.LoadStateNotExist ||
      colLoadState === LoadState.LoadStateNotLoad
    ) {
      await client.loadCollectionSync({
        collection_name: name
      });
      logger.info('Milvus collection loaded', { collection: name });
    }
  };

  init: VectorControllerType['init'] = async () => {
    const client = await this.getClient();

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
    } catch (error) {
      logger.warn('Milvus database initialization skipped or failed', { error });
    }

    const supportsFullText = milvusVersionManager.supportsFullText();
    const collectionDefinitions = getMilvusCollectionDefinitions(supportsFullText);

    for (const config of collectionDefinitions) {
      await this.createMilvusCollection(client, config);
      await this.loadCollection(client, config.name);
    }
  };

  insert: VectorControllerType['insert'] = async (props: InsertVectorControllerPropsType) => {
    const client = await this.getClient();
    const { teamId, datasetId, collectionId, vectors, textContents } = props;

    if (textContents && textContents.length !== vectors.length) {
      logger.error('textContents length does not match vectors length', {
        teamId,
        datasetId,
        collectionId,
        textContentsLength: textContents.length,
        vectorsLength: vectors.length
      });
      throw new Error('textContents length must match vectors length');
    }

    const generateId = () => {
      const firstDigit = customNanoid('12345678', 1);
      const restDigits = customNanoid('1234567890', 15);
      return Number(`${firstDigit}${restDigits}`);
    };

    const now = Date.now();
    const supportsFullText = milvusVersionManager.supportsFullText();

    const data: MilvusInsertRow[] = vectors.map((vector, index) => {
      const row: MilvusInsertRow = {
        id: generateId(),
        vector,
        teamId: String(teamId),
        datasetId: String(datasetId),
        collectionId: String(collectionId),
        createTime: now
      };

      if (supportsFullText && textContents) {
        const rawText = textContents[index] ?? '';
        if (rawText.length > MILVUS_TEXT_MAX_LENGTH) {
          logger.warn('Milvus text field truncated', {
            originalLength: rawText.length,
            maxLength: MILVUS_TEXT_MAX_LENGTH,
            id: row.id,
            collectionId
          });
          row.text = rawText.slice(0, MILVUS_TEXT_MAX_LENGTH);
        } else {
          row.text = rawText;
        }
      }

      return row;
    });

    try {
      const result = await client.insert({
        collection_name: DatasetVectorTableName,
        data
      });

      if (result.status?.error_code !== 'Success' && result.status?.error_code !== 0) {
        throw new Error(
          `Milvus insert failed: ${result.status?.error_code} - ${result.status?.reason}`
        );
      }

      const insertIds = (() => {
        if ('int_id' in result.IDs) {
          return result.IDs.int_id.data.map((id) => String(id));
        }
        return result.IDs.str_id.data.map((id) => String(id));
      })();

      return { insertIds };
    } catch (err) {
      if (supportsFullText && isSchemaMismatchError(err)) {
        logger.warn('Milvus insert schema mismatch, retrying with skip_check_schema', {
          collectionName: DatasetVectorTableName,
          error: err instanceof Error ? err.message : String(err)
        });
        const result = await client.insert({
          collection_name: DatasetVectorTableName,
          data,
          skip_check_schema: true
        });

        if (result.status?.error_code !== 'Success' && result.status?.error_code !== 0) {
          throw new Error(
            `Milvus insert failed: ${result.status?.error_code} - ${result.status?.reason}`
          );
        }

        const insertIds = (() => {
          if ('int_id' in result.IDs) {
            return result.IDs.int_id.data.map((id) => String(id));
          }
          return result.IDs.str_id.data.map((id) => String(id));
        })();

        return { insertIds };
      }
      throw err;
    }
  };

  delete: VectorControllerType['delete'] = async (props) => {
    const { teamId } = props;
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
      collection_name: DatasetVectorTableName,
      filter: concatWhere
    });
  };

  embRecall: VectorControllerType['embRecall'] = async (
    props: EmbeddingRecallCtrlPropsType
  ): Promise<EmbeddingRecallResponseType> => {
    const client = await this.getClient();
    const { teamId, datasetIds, vector, limit, forbidCollectionIdList, filterCollectionIdList } =
      props;

    // Forbid collection
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

    if (formatFilterCollectionId && formatFilterCollectionId.length === 0) {
      return { results: [] };
    }

    const filterStr =
      `(teamId == "${teamId}") and (datasetId in [${datasetIds.map((id) => `"${id}"`).join(',')}]) ${collectionIdQuery} ${forbidColQuery}`.trim();

    const searchParams: any = {
      collection_name: DatasetVectorTableName,
      limit,
      expr: filterStr,
      output_fields: ['id', 'collectionId'],
      params: { ef: global.systemEnv?.hnswEfSearch || 100 }
    };

    if (milvusVersionManager.getFeatureLevel() === 'V26') {
      searchParams.data = [vector];
    } else {
      searchParams.vector = vector;
    }

    const searchResult = await retryFn(() => client.search(searchParams));

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

  fullTextSearch = async (
    props: FullTextSearchCtrlPropsType
  ): Promise<EmbeddingRecallResponseType> => {
    const client = await this.getClient();
    const { teamId, datasetIds, query, limit, forbidCollectionIdList, filterCollectionIdList } =
      props;

    if (!query || limit === 0 || datasetIds.length === 0) {
      return { results: [] };
    }

    let trimmedQuery = query;
    if (query.length > MILVUS_QUERY_MAX_LENGTH) {
      trimmedQuery = query.slice(0, MILVUS_QUERY_MAX_LENGTH);
      logger.warn('Milvus full-text query truncated', {
        originalLength: query.length,
        maxLength: MILVUS_QUERY_MAX_LENGTH
      });
    }

    // Forbid collection
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

    // filter collection id
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
      return { results: [] };
    }

    const filterStr =
      `(teamId == "${teamId}") and (datasetId in [${datasetIds.map((id) => `"${id}"`).join(',')}]) ${collectionIdQuery} ${forbidColQuery}`.trim();

    const searchResult = await retryFn(() =>
      client.search({
        collection_name: DatasetVectorTableName,
        data: [trimmedQuery],
        anns_field: 'sparse',
        filter: filterStr,
        limit,
        output_fields: ['id', 'collectionId'],
        params: { metric_type: 'BM25' }
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

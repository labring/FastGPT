import { QdrantClient } from '@qdrant/qdrant-js';
import { DatasetVectorTableName, QDRANT_ADDRESS, QDRANT_TOKEN } from '../constants';
import type {
  DelDatasetVectorCtrlProps,
  EmbeddingRecallCtrlProps,
  EmbeddingRecallResponse,
  InsertVectorControllerProps
} from '../controller.d';
import { delay } from '@fastgpt/global/common/system/utils';
import { addLog } from '../../system/log';

export class QdrantCtrl {
  constructor() {}
  getClient = async () => {
    if (!QDRANT_ADDRESS) {
      return Promise.reject('QDRANT_ADDRESS is not set');
    }
    if (global.qdrantClient) return global.qdrantClient;

    global.qdrantClient = new QdrantClient({
      url: QDRANT_ADDRESS,
      apiKey: QDRANT_TOKEN
    });

    addLog.info(`Qdrant connected`);

    return global.qdrantClient;
  };

  init = async () => {
    const client = await this.getClient();

    try {
      const response = await client.getCollections();
      const collectionNames = response.collections.map((collection) => collection.name);
      if (!collectionNames.includes(DatasetVectorTableName)) {
        await client.createCollection(DatasetVectorTableName, {
          vectors: {
            size: 1536,
            distance: 'Cosine'
          },
          hnsw_config: {
            m: 64,
            ef_construct: 256
          },
          quantization_config: {
            binary: {
              always_ram: true
            }
          }
        });
        await client.createPayloadIndex(DatasetVectorTableName, {
          field_name: 'team_id',
          field_schema: 'keyword',
          wait: true
        });
        await client.createPayloadIndex(DatasetVectorTableName, {
          field_name: 'collection_id',
          field_schema: 'keyword',
          wait: true
        });
        await client.createPayloadIndex(DatasetVectorTableName, {
          field_name: 'dataset_id',
          field_schema: 'keyword',
          wait: true
        });
        await client.createPayloadIndex(DatasetVectorTableName, {
          field_name: 'createtime',
          field_schema: 'keyword',
          wait: true
        });
        addLog.info(`Created Qdrant collection: ${DatasetVectorTableName}`);
      }
    } catch (error) {
      addLog.error('Failed to initialize collection:', error);
      throw error;
    }
  };

  insert = async (props: InsertVectorControllerProps): Promise<{ insertId: string }> => {
    const client = await this.getClient();
    const { teamId, datasetId, collectionId, vector, retry = 3 } = props;

    try {
      // 提前生成 ID
      const insertId = Date.now();
      // 使用 upsert 方法插入或更新数据点
      await client.upsert(DatasetVectorTableName, {
        wait: false, // 等待操作完成
        points: [
          {
            id: insertId, // 使用当前时间戳作为唯一ID，也可以使用其他唯一标识符
            vector: vector,
            payload: {
              teamId: String(teamId),
              datasetId: String(datasetId),
              collectionId: String(collectionId),
              createtime: new Date().toISOString()
            }
          }
        ]
      });
      return { insertId: String(insertId) };
    } catch (error) {
      if (retry <= 0) {
        return Promise.reject(error);
      }
      await delay(500);
      return this.insert({ ...props, retry: retry - 1 });
    }
  };
  delete = async (props: DelDatasetVectorCtrlProps): Promise<any> => {
    const client = await this.getClient();
    const { teamId, retry = 2 } = props;

    const where = await (() => {
      if (teamId) {
        // 处理 datasetIds 和 collectionIds，构建 OR 逻辑
        if ('datasetIds' in props && props.datasetIds && props.datasetIds.length > 0) {
          const should: any[] = [];
          props.datasetIds.forEach((datasetId) => {
            // 使用可选链操作符确保collectionIds存在并进行迭代
            props.collectionIds?.forEach((collectionId) => {
              should.push({
                must: [
                  { key: 'teamId', match: { value: String(teamId) } },
                  { key: 'datasetId', match: { value: datasetId } },
                  { key: 'collectionId', match: { value: collectionId } }
                ]
              });
            });

            // 如果 collectionIds 为空或未定义，只添加 datasetId 和 teamId
            if (!props.collectionIds || props.collectionIds.length === 0) {
              should.push({
                must: [
                  { key: 'teamId', match: { value: String(teamId) } },
                  { key: 'datasetId', match: { value: datasetId } }
                ]
              });
            }
          });

          return should;
        } else {
          // 当没有 datasetIds 时，只基于 teamId 创建条件
          return [
            {
              must: [{ key: 'teamId', match: { value: String(teamId) } }]
            }
          ];
        }
      } else {
        return [];
      }
    })();

    if (!where) return;
    // console.log('+++++++\n', where);
    try {
      if ('idList' in props && Array.isArray(props.idList)) {
        const idNumbers = props.idList.map((id) => Number(id)).filter((id) => !isNaN(id));
        await client.delete(DatasetVectorTableName, { points: idNumbers });
      } else {
        // Deleting points by complex filters
        await client.delete(DatasetVectorTableName, {
          filter: where[0]
        });
      }
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
    const { teamId, datasetIds, vector, limit, retry = 2 } = props;

    try {
      const filter = {
        should: datasetIds.map((datasetId) => ({
          must: [
            { key: 'teamId', match: { value: String(teamId) } },
            { key: 'datasetId', match: { value: datasetId } }
          ]
        }))
      };
      const response = await client.search(DatasetVectorTableName, {
        filter: filter,
        vector: vector,
        limit: limit
      });
      // 根据Qdrant的实际响应结构处理数据
      const results = response.map((hit) => ({
        id: hit.id.toString(),
        collectionId: hit.payload ? hit.payload.collectionId : null,
        score: hit.score
      }));

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
      await delay(500);
      return this.embRecall({ ...props, retry: retry - 1 });
    }
  };
  getVectorCountByTeamId = async (teamId: string) => {
    const client = await this.getClient();
    const collectionInfo = await client.count(DatasetVectorTableName, {
      filter: {
        must: [
          {
            key: 'teamId',
            match: {
              value: `${String(teamId)}`
            }
          }
        ]
      },
      exact: true
    });
    const total = collectionInfo.count as number;
    return total;
  };
  getVectorDataByTime = async (start: Date, end: Date) => {
    // 占位
    return [];
  };
}

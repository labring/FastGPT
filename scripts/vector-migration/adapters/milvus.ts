/**
 * Milvus 数据库适配器
 */
import { MilvusClient, DataType } from '@zilliz/milvus2-sdk-node';
import { DatabaseAdapter } from './base';
import type { VectorRecord, DatabaseConfig } from '../types';

const DatasetVectorDbName = 'fastgpt';
const DatasetVectorTableName = 'modeldata';

export class MilvusAdapter extends DatabaseAdapter {
  private client: MilvusClient | null = null;

  async connect(): Promise<void> {
    if (!this.config.milvusAddress) {
      throw new Error('Milvus address is required');
    }

    this.client = new MilvusClient({
      address: this.config.milvusAddress,
      token: this.config.milvusToken
    });

    await this.client.connectPromise;
  }

  async disconnect(): Promise<void> {
    if (this.client) {
      await this.client.closeConnection();
      this.client = null;
    }
  }

  async getTotalCount(): Promise<number> {
    if (!this.client) throw new Error('Not connected');
    await this.ensureDatabase();
    const result = await this.client.query({
      collection_name: DatasetVectorTableName,
      expr: '',
      output_fields: ['count(*)']
    });
    return (result.data?.[0]?.['count(*)'] as number) || 0;
  }

  async readBatch(offset: number, limit: number): Promise<VectorRecord[]> {
    if (!this.client) throw new Error('Not connected');
    await this.ensureDatabase();

    // Milvus 不支持 OFFSET，需要通过 ID 范围查询
    // 这里简化处理，读取所有数据后分页
    const result = await this.client.query({
      collection_name: DatasetVectorTableName,
      expr: '',
      output_fields: ['id', 'vector', 'teamId', 'datasetId', 'collectionId', 'createTime'],
      limit: limit + offset
    });

    const rows = (result.data || []).slice(offset, offset + limit) as Array<{
      id: string;
      vector: number[];
      teamId: string;
      datasetId: string;
      collectionId: string;
      createTime: number;
    }>;

    return rows.map((row) => ({
      id: String(row.id),
      vector: row.vector,
      team_id: row.teamId,
      dataset_id: row.datasetId,
      collection_id: row.collectionId,
      createtime: new Date(row.createTime)
    }));
  }

  async readByTimeRange(startTime: Date, endTime: Date): Promise<VectorRecord[]> {
    if (!this.client) throw new Error('Not connected');
    await this.ensureDatabase();

    const startTimestamp = startTime.getTime();
    const endTimestamp = endTime.getTime();

    const result = await this.client.query({
      collection_name: DatasetVectorTableName,
      expr: `(createTime >= ${startTimestamp}) and (createTime <= ${endTimestamp})`,
      output_fields: ['id', 'vector', 'teamId', 'datasetId', 'collectionId', 'createTime']
    });

    const rows = (result.data || []) as Array<{
      id: string;
      vector: number[];
      teamId: string;
      datasetId: string;
      collectionId: string;
      createTime: number;
    }>;

    return rows.map((row) => ({
      id: String(row.id),
      vector: row.vector,
      team_id: row.teamId,
      dataset_id: row.datasetId,
      collection_id: row.collectionId,
      createtime: new Date(row.createTime)
    }));
  }

  async readByIdRange(startId: string, endId: string, limit: number): Promise<VectorRecord[]> {
    if (!this.client) throw new Error('Not connected');
    await this.ensureDatabase();

    const result = await this.client.query({
      collection_name: DatasetVectorTableName,
      expr: `(id >= ${startId}) and (id <= ${endId})`,
      output_fields: ['id', 'vector', 'teamId', 'datasetId', 'collectionId', 'createTime'],
      limit
    });

    const rows = (result.data || []) as Array<{
      id: string;
      vector: number[];
      teamId: string;
      datasetId: string;
      collectionId: string;
      createTime: number;
    }>;

    return rows.map((row) => ({
      id: String(row.id),
      vector: row.vector,
      team_id: row.teamId,
      dataset_id: row.datasetId,
      collection_id: row.collectionId,
      createtime: new Date(row.createTime)
    }));
  }

  async writeBatch(records: VectorRecord[]): Promise<string[]> {
    if (!this.client) throw new Error('Not connected');
    if (records.length === 0) return [];
    await this.ensureDatabase();

    const data = records.map((record) => ({
      id: Number(record.id),
      vector: record.vector,
      teamId: record.team_id,
      datasetId: record.dataset_id,
      collectionId: record.collection_id,
      createTime:
        record.createtime instanceof Date
          ? record.createtime.getTime()
          : new Date(record.createtime).getTime()
    }));

    const result = await this.client.insert({
      collection_name: DatasetVectorTableName,
      data
    });

    const insertIds = (() => {
      if ('int_id' in result.IDs) {
        return result.IDs.int_id.data.map((id) => String(id));
      }
      return result.IDs.str_id.data.map((id) => String(id));
    })();

    return insertIds;
  }

  async validateRecord(record: VectorRecord): Promise<boolean> {
    if (!this.client) throw new Error('Not connected');
    await this.ensureDatabase();
    const result = await this.client.query({
      collection_name: DatasetVectorTableName,
      expr: `id == ${record.id}`,
      output_fields: ['id']
    });
    return (result.data?.length || 0) > 0;
  }

  async initSchema(): Promise<void> {
    if (!this.client) throw new Error('Not connected');

    // 创建数据库
    try {
      const { db_names } = await this.client.listDatabases();
      if (!db_names.includes(DatasetVectorDbName)) {
        await this.client.createDatabase({
          db_name: DatasetVectorDbName
        });
      }
      await this.client.useDatabase({
        db_name: DatasetVectorDbName
      });
    } catch (error) {
      // 忽略错误（可能是云版本不支持）
    }

    // 创建集合
    const { value: hasCollection } = await this.client.hasCollection({
      collection_name: DatasetVectorTableName
    });

    if (!hasCollection) {
      await this.client.createCollection({
        collection_name: DatasetVectorTableName,
        description: 'Store dataset vector',
        enableDynamicField: true,
        fields: [
          {
            name: 'id',
            data_type: DataType.Int64,
            is_primary_key: true,
            autoID: false
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
          }
        ]
      });
    }
  }

  getType(): 'milvus' {
    return 'milvus';
  }

  private async ensureDatabase(): Promise<void> {
    if (!this.client) return;
    try {
      const { db_names } = await this.client.listDatabases();
      if (db_names.includes(DatasetVectorDbName)) {
        await this.client.useDatabase({
          db_name: DatasetVectorDbName
        });
      }
    } catch (error) {
      // 忽略错误
    }
  }
}

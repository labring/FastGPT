/**
 * Vector database importers for migration
 * Each importer implements the VectorImporter interface to write vectors to target database
 */

import type { VectorImporter, VectorRecord, MigrationError } from './type';
import { DatasetVectorTableName, DatasetVectorDbName, VectorVQ } from '../constants';
import { PgClient, connectPg } from '../pg/controller';
import { ObClient, getClient as getObClient } from '../oceanbase/controller';
import { MilvusClient, DataType, LoadState } from '@zilliz/milvus2-sdk-node';
import { addLog } from '../../system/log';
import { customNanoid } from '@fastgpt/global/common/string/tools';
import { Pool } from 'pg';
import mysql from 'mysql2/promise';

// PostgreSQL Importer
export class PgImporter implements VectorImporter {
  private targetPool: Pool | null = null;
  private targetAddress: string;

  constructor(address: string) {
    this.targetAddress = address;
  }

  private async getPool(): Promise<Pool> {
    if (this.targetPool) return this.targetPool;

    this.targetPool = new Pool({
      connectionString: this.targetAddress,
      max: 10,
      min: 2,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000
    });

    return this.targetPool;
  }

  async init(): Promise<void> {
    const pool = await this.getPool();
    const isHalfVec = VectorVQ === 16;

    await pool.query(`CREATE EXTENSION IF NOT EXISTS vector;`);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS ${DatasetVectorTableName} (
        id BIGSERIAL PRIMARY KEY,
        vector ${isHalfVec ? 'HALFVEC(1536)' : 'VECTOR(1536)'} NOT NULL,
        team_id VARCHAR(50) NOT NULL,
        dataset_id VARCHAR(50) NOT NULL,
        collection_id VARCHAR(50) NOT NULL,
        createtime TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Create indexes
    try {
      await pool.query(
        `CREATE INDEX CONCURRENTLY IF NOT EXISTS vector_index ON ${DatasetVectorTableName} USING hnsw (vector ${isHalfVec ? 'halfvec_ip_ops' : 'vector_ip_ops'}) WITH (m = 32, ef_construction = 128);`
      );
    } catch {
      // Index might already exist
    }

    try {
      await pool.query(
        `CREATE INDEX CONCURRENTLY IF NOT EXISTS team_dataset_collection_index ON ${DatasetVectorTableName} USING btree(team_id, dataset_id, collection_id);`
      );
    } catch {
      // Index might already exist
    }

    addLog.info('[Migration] PostgreSQL target initialized');
  }

  async importBatch(records: VectorRecord[]): Promise<{
    insertedIds: string[];
    idMappings: Map<string, string>;
    errors: MigrationError[];
  }> {
    const pool = await this.getPool();
    const insertedIds: string[] = [];
    const idMappings = new Map<string, string>();
    const errors: MigrationError[] = [];

    if (records.length === 0) {
      return { insertedIds, idMappings, errors };
    }

    try {
      // Build bulk insert with explicit IDs
      const values = records
        .map((record) => {
          const vectorStr = `[${record.vector.join(',')}]`;
          const timestamp = record.createTime.toISOString();
          return `(${record.id}, '${vectorStr}', '${record.teamId}', '${record.datasetId}', '${record.collectionId}', '${timestamp}')`;
        })
        .join(',');

      const sql = `
        INSERT INTO ${DatasetVectorTableName} (id, vector, team_id, dataset_id, collection_id, createtime)
        VALUES ${values}
        ON CONFLICT (id) DO NOTHING
        RETURNING id
      `;

      const result = await pool.query<{ id: string }>(sql);

      for (const row of result.rows) {
        insertedIds.push(String(row.id));
      }

      // For PostgreSQL with explicit IDs, mappings are 1:1
      for (const record of records) {
        idMappings.set(record.id, record.id);
      }
    } catch (error: any) {
      addLog.error('[Migration] PG import batch error', error);
      errors.push({
        type: 'unknown',
        message: error.message || 'Unknown error during import',
        timestamp: new Date(),
        retryable: true
      });
    }

    return { insertedIds, idMappings, errors };
  }

  async deleteBatch(ids: string[]): Promise<void> {
    if (ids.length === 0) return;

    const pool = await this.getPool();
    await pool.query(`DELETE FROM ${DatasetVectorTableName} WHERE id IN (${ids.join(',')})`);
  }

  async getCount(): Promise<number> {
    const pool = await this.getPool();
    const result = await pool.query(`SELECT COUNT(*) FROM ${DatasetVectorTableName}`);
    return parseInt(result.rows[0].count, 10);
  }

  async close(): Promise<void> {
    if (this.targetPool) {
      await this.targetPool.end();
      this.targetPool = null;
    }
  }
}

// OceanBase Importer
export class OceanBaseImporter implements VectorImporter {
  private targetPool: mysql.Pool | null = null;
  private targetAddress: string;

  constructor(address: string) {
    this.targetAddress = address;
  }

  private async getPool(): Promise<mysql.Pool> {
    if (this.targetPool) return this.targetPool;

    this.targetPool = mysql.createPool({
      uri: this.targetAddress,
      waitForConnections: true,
      connectionLimit: 10,
      connectTimeout: 20000,
      idleTimeout: 60000
    });

    return this.targetPool;
  }

  async init(): Promise<void> {
    const pool = await this.getPool();

    await pool.query(`
      CREATE TABLE IF NOT EXISTS ${DatasetVectorTableName} (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        vector VECTOR(1536) NOT NULL,
        team_id VARCHAR(50) NOT NULL,
        dataset_id VARCHAR(50) NOT NULL,
        collection_id VARCHAR(50) NOT NULL,
        createtime TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Create indexes
    try {
      await pool.query(
        `CREATE VECTOR INDEX IF NOT EXISTS vector_index ON ${DatasetVectorTableName}(vector) WITH (distance=inner_product, type=hnsw, m=32, ef_construction=128);`
      );
    } catch {
      // Index might already exist
    }

    try {
      await pool.query(
        `CREATE INDEX IF NOT EXISTS team_dataset_collection_index ON ${DatasetVectorTableName}(team_id, dataset_id, collection_id);`
      );
    } catch {
      // Index might already exist
    }

    addLog.info('[Migration] OceanBase target initialized');
  }

  async importBatch(records: VectorRecord[]): Promise<{
    insertedIds: string[];
    idMappings: Map<string, string>;
    errors: MigrationError[];
  }> {
    const pool = await this.getPool();
    const insertedIds: string[] = [];
    const idMappings = new Map<string, string>();
    const errors: MigrationError[] = [];

    if (records.length === 0) {
      return { insertedIds, idMappings, errors };
    }

    try {
      // Build bulk insert with explicit IDs
      const values = records
        .map((record) => {
          const vectorStr = `[${record.vector.join(',')}]`;
          const timestamp = record.createTime.toISOString().replace('T', ' ').replace('Z', '');
          return `(${record.id}, '${vectorStr}', '${record.teamId}', '${record.datasetId}', '${record.collectionId}', '${timestamp}')`;
        })
        .join(',');

      const sql = `
        INSERT IGNORE INTO ${DatasetVectorTableName} (id, vector, team_id, dataset_id, collection_id, createtime)
        VALUES ${values}
      `;

      await pool.query(sql);

      // For OceanBase with explicit IDs, mappings are 1:1
      for (const record of records) {
        insertedIds.push(record.id);
        idMappings.set(record.id, record.id);
      }
    } catch (error: any) {
      addLog.error('[Migration] OceanBase import batch error', error);
      errors.push({
        type: 'unknown',
        message: error.message || 'Unknown error during import',
        timestamp: new Date(),
        retryable: true
      });
    }

    return { insertedIds, idMappings, errors };
  }

  async deleteBatch(ids: string[]): Promise<void> {
    if (ids.length === 0) return;

    const pool = await this.getPool();
    await pool.query(`DELETE FROM ${DatasetVectorTableName} WHERE id IN (${ids.join(',')})`);
  }

  async getCount(): Promise<number> {
    const pool = await this.getPool();
    const [rows] = await pool.query<mysql.RowDataPacket[]>(
      `SELECT COUNT(*) as count FROM ${DatasetVectorTableName}`
    );
    return rows[0].count;
  }

  async close(): Promise<void> {
    if (this.targetPool) {
      await this.targetPool.end();
      this.targetPool = null;
    }
  }
}

// Milvus Importer
export class MilvusImporter implements VectorImporter {
  private client: MilvusClient | null = null;
  private address: string;
  private token?: string;

  constructor(address: string, token?: string) {
    this.address = address;
    this.token = token;
  }

  private async getClient(): Promise<MilvusClient> {
    if (this.client) return this.client;

    this.client = new MilvusClient({
      address: this.address,
      token: this.token
    });
    await this.client.connectPromise;

    return this.client;
  }

  async init(): Promise<void> {
    const client = await this.getClient();

    // Create database if not exists
    try {
      const { db_names } = await client.listDatabases();
      if (!db_names.includes(DatasetVectorDbName)) {
        await client.createDatabase({ db_name: DatasetVectorDbName });
      }
      await client.useDatabase({ db_name: DatasetVectorDbName });
    } catch {
      // Zilliz cloud might not support database operations
    }

    // Check if collection exists
    const { value: hasCollection } = await client.hasCollection({
      collection_name: DatasetVectorTableName
    });

    if (!hasCollection) {
      await client.createCollection({
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
          { name: 'createTime', data_type: DataType.Int64 }
        ],
        index_params: [
          {
            field_name: 'vector',
            index_name: 'vector_HNSW',
            index_type: 'HNSW',
            metric_type: 'IP',
            params: { efConstruction: 32, M: 64 }
          },
          { field_name: 'teamId', index_type: 'Trie' },
          { field_name: 'datasetId', index_type: 'Trie' },
          { field_name: 'collectionId', index_type: 'Trie' },
          { field_name: 'createTime', index_type: 'STL_SORT' }
        ]
      });
    }

    // Load collection
    const { state } = await client.getLoadState({
      collection_name: DatasetVectorTableName
    });

    if (state === LoadState.LoadStateNotExist || state === LoadState.LoadStateNotLoad) {
      await client.loadCollectionSync({
        collection_name: DatasetVectorTableName
      });
    }

    addLog.info('[Migration] Milvus target initialized');
  }

  async importBatch(records: VectorRecord[]): Promise<{
    insertedIds: string[];
    idMappings: Map<string, string>;
    errors: MigrationError[];
  }> {
    const client = await this.getClient();
    const insertedIds: string[] = [];
    const idMappings = new Map<string, string>();
    const errors: MigrationError[] = [];

    if (records.length === 0) {
      return { insertedIds, idMappings, errors };
    }

    try {
      // Milvus uses Int64 for ID, we need to convert string IDs
      // For migration from PG/OB, the IDs are numeric strings, so we can use them directly
      // For migration from another Milvus, IDs might be different format
      const data = records.map((record) => {
        // Try to use original ID if it's numeric
        let newId: number;
        const numericId = parseInt(record.id, 10);

        if (!isNaN(numericId) && numericId > 0 && numericId <= Number.MAX_SAFE_INTEGER) {
          newId = numericId;
        } else {
          // Generate new ID for non-numeric IDs
          const firstDigit = customNanoid('12345678', 1);
          const restDigits = customNanoid('1234567890', 15);
          newId = Number(`${firstDigit}${restDigits}`);
        }

        idMappings.set(record.id, String(newId));

        return {
          id: newId,
          vector: record.vector,
          teamId: record.teamId,
          datasetId: record.datasetId,
          collectionId: record.collectionId,
          createTime: record.createTime.getTime()
        };
      });

      const result = await client.insert({
        collection_name: DatasetVectorTableName,
        data
      });

      // Get inserted IDs from result
      if ('int_id' in result.IDs) {
        for (const id of result.IDs.int_id.data) {
          insertedIds.push(String(id));
        }
      } else {
        for (const id of result.IDs.str_id.data) {
          insertedIds.push(String(id));
        }
      }
    } catch (error: any) {
      addLog.error('[Migration] Milvus import batch error', error);
      errors.push({
        type: 'unknown',
        message: error.message || 'Unknown error during import',
        timestamp: new Date(),
        retryable: true
      });
    }

    return { insertedIds, idMappings, errors };
  }

  async deleteBatch(ids: string[]): Promise<void> {
    if (ids.length === 0) return;

    const client = await this.getClient();
    await client.delete({
      collection_name: DatasetVectorTableName,
      filter: `id in [${ids.join(',')}]`
    });
  }

  async getCount(): Promise<number> {
    const client = await this.getClient();
    const result = await client.query({
      collection_name: DatasetVectorTableName,
      output_fields: ['count(*)']
    });
    return result.data?.[0]?.['count(*)'] as number;
  }

  async close(): Promise<void> {
    if (this.client) {
      await this.client.closeConnection();
      this.client = null;
    }
  }
}

// Factory function to create importer based on database type
export function createImporter(
  type: 'pg' | 'oceanbase' | 'milvus',
  config: { address: string; token?: string }
): VectorImporter & { close?: () => Promise<void> } {
  switch (type) {
    case 'pg':
      return new PgImporter(config.address);
    case 'oceanbase':
      return new OceanBaseImporter(config.address);
    case 'milvus':
      return new MilvusImporter(config.address, config.token);
    default:
      throw new Error(`Unknown importer type: ${type}`);
  }
}

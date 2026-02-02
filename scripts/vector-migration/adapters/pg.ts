/**
 * PostgreSQL 数据库适配器
 */
import { Pool } from 'pg';
import { DatabaseAdapter } from './base';
import type { VectorRecord, DatabaseConfig } from '../types';

const DatasetVectorTableName = 'modeldata';

export class PgAdapter extends DatabaseAdapter {
  private pool: Pool | null = null;

  async connect(): Promise<void> {
    if (!this.config.pgUrl) {
      throw new Error('PostgreSQL URL is required');
    }

    this.pool = new Pool({
      connectionString: this.config.pgUrl,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 20000
    });

    // 测试连接
    await this.pool.query('SELECT 1');
  }

  async disconnect(): Promise<void> {
    if (this.pool) {
      await this.pool.end();
      this.pool = null;
    }
  }

  async getTotalCount(): Promise<number> {
    if (!this.pool) throw new Error('Not connected');
    const result = await this.pool.query(`SELECT COUNT(*) FROM ${DatasetVectorTableName}`);
    return parseInt(result.rows[0].count, 10);
  }

  async readBatch(offset: number, limit: number): Promise<VectorRecord[]> {
    if (!this.pool) throw new Error('Not connected');
    const result = await this.pool.query<{
      id: string;
      vector: string;
      team_id: string;
      dataset_id: string;
      collection_id: string;
      createtime: Date;
    }>(
      `SELECT id, vector::text, team_id, dataset_id, collection_id, createtime 
       FROM ${DatasetVectorTableName} 
       ORDER BY id 
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    );

    return result.rows.map((row) => ({
      id: String(row.id),
      vector: this.parseVector(row.vector),
      team_id: row.team_id,
      dataset_id: row.dataset_id,
      collection_id: row.collection_id,
      createtime: row.createtime
    }));
  }

  async readByTimeRange(startTime: Date, endTime: Date): Promise<VectorRecord[]> {
    if (!this.pool) throw new Error('Not connected');
    const result = await this.pool.query<{
      id: string;
      vector: string;
      team_id: string;
      dataset_id: string;
      collection_id: string;
      createtime: Date;
    }>(
      `SELECT id, vector::text, team_id, dataset_id, collection_id, createtime 
       FROM ${DatasetVectorTableName} 
       WHERE createtime BETWEEN $1 AND $2 
       ORDER BY createtime, id`,
      [startTime, endTime]
    );

    return result.rows.map((row) => ({
      id: String(row.id),
      vector: this.parseVector(row.vector),
      team_id: row.team_id,
      dataset_id: row.dataset_id,
      collection_id: row.collection_id,
      createtime: row.createtime
    }));
  }

  async readByIdRange(startId: string, endId: string, limit: number): Promise<VectorRecord[]> {
    if (!this.pool) throw new Error('Not connected');
    const result = await this.pool.query<{
      id: string;
      vector: string;
      team_id: string;
      dataset_id: string;
      collection_id: string;
      createtime: Date;
    }>(
      `SELECT id, vector::text, team_id, dataset_id, collection_id, createtime 
       FROM ${DatasetVectorTableName} 
       WHERE id >= $1 AND id <= $2 
       ORDER BY id 
       LIMIT $3`,
      [startId, endId, limit]
    );

    return result.rows.map((row) => ({
      id: String(row.id),
      vector: this.parseVector(row.vector),
      team_id: row.team_id,
      dataset_id: row.dataset_id,
      collection_id: row.collection_id,
      createtime: row.createtime
    }));
  }

  async writeBatch(records: VectorRecord[]): Promise<string[]> {
    if (!this.pool) throw new Error('Not connected');
    if (records.length === 0) return [];

    const values = records
      .map(
        (record, idx) =>
          `($${idx * 6 + 1}::bigint, $${idx * 6 + 2}::vector, $${idx * 6 + 3}, $${idx * 6 + 4}, $${idx * 6 + 5}, $${idx * 6 + 6})`
      )
      .join(', ');

    const params: any[] = [];
    records.forEach((record) => {
      params.push(
        record.id,
        `[${record.vector.join(',')}]`,
        record.team_id,
        record.dataset_id,
        record.collection_id,
        record.createtime instanceof Date ? record.createtime : new Date(record.createtime)
      );
    });

    const result = await this.pool.query<{ id: string }>(
      `INSERT INTO ${DatasetVectorTableName} (id, vector, team_id, dataset_id, collection_id, createtime) 
       VALUES ${values} 
       ON CONFLICT (id) DO UPDATE SET 
         vector = EXCLUDED.vector,
         team_id = EXCLUDED.team_id,
         dataset_id = EXCLUDED.dataset_id,
         collection_id = EXCLUDED.collection_id,
         createtime = EXCLUDED.createtime
       RETURNING id`,
      params
    );

    return result.rows.map((row) => String(row.id));
  }

  async validateRecord(record: VectorRecord): Promise<boolean> {
    if (!this.pool) throw new Error('Not connected');
    const result = await this.pool.query(
      `SELECT COUNT(*) FROM ${DatasetVectorTableName} WHERE id = $1`,
      [record.id]
    );
    return parseInt(result.rows[0].count, 10) > 0;
  }

  async initSchema(): Promise<void> {
    if (!this.pool) throw new Error('Not connected');
    await this.pool.query(`
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
  }

  getType(): 'pg' {
    return 'pg';
  }

  private parseVector(vectorStr: string): number[] {
    // PostgreSQL vector 格式: [1,2,3] 或 {1,2,3}
    const cleaned = vectorStr.replace(/[\[\]{}]/g, '');
    return cleaned.split(',').map((v) => parseFloat(v.trim()));
  }
}

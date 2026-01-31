/**
 * OceanBase 数据库适配器
 */
import mysql, { type Pool } from 'mysql2/promise';
import { DatabaseAdapter } from './base';
import type { VectorRecord, DatabaseConfig } from '../types';

const DatasetVectorTableName = 'modeldata';

export class OceanBaseAdapter extends DatabaseAdapter {
  private pool: Pool | null = null;

  async connect(): Promise<void> {
    if (!this.config.oceanbaseUrl) {
      throw new Error('OceanBase URL is required');
    }

    this.pool = mysql.createPool({
      uri: this.config.oceanbaseUrl,
      waitForConnections: true,
      connectionLimit: 20,
      connectTimeout: 20000,
      idleTimeout: 60000
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
    const [rows] = await this.pool.query<[{ 'COUNT(*)': number }[]]>(
      `SELECT COUNT(*) FROM ${DatasetVectorTableName}`
    );
    return rows[0]?.['COUNT(*)'] || 0;
  }

  async readBatch(offset: number, limit: number): Promise<VectorRecord[]> {
    if (!this.pool) throw new Error('Not connected');
    const [rows] = await this.pool.query<
      Array<{
        id: string;
        vector: string;
        team_id: string;
        dataset_id: string;
        collection_id: string;
        createtime: Date;
      }>
    >(
      `SELECT id, vector, team_id, dataset_id, collection_id, createtime 
       FROM ${DatasetVectorTableName} 
       ORDER BY id 
       LIMIT ? OFFSET ?`,
      [limit, offset]
    );

    return rows.map((row) => ({
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
    const [rows] = await this.pool.query<
      Array<{
        id: string;
        vector: string;
        team_id: string;
        dataset_id: string;
        collection_id: string;
        createtime: Date;
      }>
    >(
      `SELECT id, vector, team_id, dataset_id, collection_id, createtime 
       FROM ${DatasetVectorTableName} 
       WHERE createtime BETWEEN ? AND ? 
       ORDER BY createtime, id`,
      [startTime, endTime]
    );

    return rows.map((row) => ({
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
    const [rows] = await this.pool.query<
      Array<{
        id: string;
        vector: string;
        team_id: string;
        dataset_id: string;
        collection_id: string;
        createtime: Date;
      }>
    >(
      `SELECT id, vector, team_id, dataset_id, collection_id, createtime 
       FROM ${DatasetVectorTableName} 
       WHERE id >= ? AND id <= ? 
       ORDER BY id 
       LIMIT ?`,
      [startId, endId, limit]
    );

    return rows.map((row) => ({
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

    const values = records.map(() => '(?, ?, ?, ?, ?, ?)').join(', ');
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

    await this.pool.query(
      `INSERT INTO ${DatasetVectorTableName} (id, vector, team_id, dataset_id, collection_id, createtime) 
       VALUES ${values} 
       ON DUPLICATE KEY UPDATE 
         vector = VALUES(vector),
         team_id = VALUES(team_id),
         dataset_id = VALUES(dataset_id),
         collection_id = VALUES(collection_id),
         createtime = VALUES(createtime)`,
      params
    );

    // OceanBase 返回插入的 ID
    return records.map((r) => r.id);
  }

  async validateRecord(record: VectorRecord): Promise<boolean> {
    if (!this.pool) throw new Error('Not connected');
    const [rows] = await this.pool.query<Array<{ count: number }>>(
      `SELECT COUNT(*) as count FROM ${DatasetVectorTableName} WHERE id = ?`,
      [record.id]
    );
    return (rows[0]?.count || 0) > 0;
  }

  async initSchema(): Promise<void> {
    if (!this.pool) throw new Error('Not connected');
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS ${DatasetVectorTableName} (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        vector VECTOR(1536) NOT NULL,
        team_id VARCHAR(50) NOT NULL,
        dataset_id VARCHAR(50) NOT NULL,
        collection_id VARCHAR(50) NOT NULL,
        createtime TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
  }

  getType(): 'oceanbase' {
    return 'oceanbase';
  }

  private parseVector(vectorStr: string): number[] {
    // OceanBase vector 格式: [1,2,3]
    const cleaned = vectorStr.replace(/[\[\]]/g, '');
    return cleaned.split(',').map((v) => parseFloat(v.trim()));
  }
}

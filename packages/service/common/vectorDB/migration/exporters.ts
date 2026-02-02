/**
 * Vector database exporters for migration
 * Each exporter implements the VectorExporter interface to read vectors from source database
 */

import type { VectorExporter, VectorRecord, MigrationError } from './type';
import { DatasetVectorTableName } from '../constants';
import { PgClient, connectPg } from '../pg/controller';
import { ObClient, getClient as getObClient } from '../oceanbase/controller';
import { MilvusClient, DataType } from '@zilliz/milvus2-sdk-node';
import type { RowDataPacket } from 'mysql2/promise';
import dayjs from 'dayjs';

// PostgreSQL Exporter
export class PgExporter implements VectorExporter {
  async getCount(filter?: { teamId?: string; datasetId?: string }): Promise<number> {
    await connectPg();
    const whereConditions: (string | [string, string])[] = [];

    if (filter?.teamId) {
      whereConditions.push(['team_id', filter.teamId]);
    }
    if (filter?.datasetId) {
      if (whereConditions.length > 0) whereConditions.push('and');
      whereConditions.push(['dataset_id', filter.datasetId]);
    }

    return PgClient.count(DatasetVectorTableName, {
      where: whereConditions.length > 0 ? whereConditions : undefined
    });
  }

  async exportBatch(options: {
    afterId?: string;
    limit: number;
    teamId?: string;
    datasetId?: string;
  }): Promise<{
    records: VectorRecord[];
    hasMore: boolean;
    lastId?: string;
  }> {
    const pg = await connectPg();

    const { afterId, limit, teamId, datasetId } = options;
    const whereConditions: string[] = [];
    const params: (string | number)[] = [];
    let paramIndex = 1;

    if (afterId) {
      whereConditions.push(`id > $${paramIndex++}`);
      params.push(afterId);
    }
    if (teamId) {
      whereConditions.push(`team_id = $${paramIndex++}`);
      params.push(teamId);
    }
    if (datasetId) {
      whereConditions.push(`dataset_id = $${paramIndex++}`);
      params.push(datasetId);
    }

    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';
    params.push(limit + 1);

    const { rows } = await pg.query<{
      id: string;
      vector: string;
      team_id: string;
      dataset_id: string;
      collection_id: string;
      createtime: Date;
    }>(
      `
      SELECT id, vector::text, team_id, dataset_id, collection_id, createtime
      FROM ${DatasetVectorTableName}
      ${whereClause}
      ORDER BY id ASC
      LIMIT $${paramIndex}
    `,
      params
    );

    const hasMore = rows.length > limit;
    const records = rows.slice(0, limit).map((row) => ({
      id: String(row.id),
      vector: parseVectorString(row.vector),
      teamId: row.team_id,
      datasetId: row.dataset_id,
      collectionId: row.collection_id,
      createTime: new Date(row.createtime)
    }));

    return {
      records,
      hasMore,
      lastId: records.length > 0 ? records[records.length - 1].id : undefined
    };
  }

  async exportByTimeRange(start: Date, end: Date): Promise<VectorRecord[]> {
    const pg = await connectPg();

    const { rows } = await pg.query<{
      id: string;
      vector: string;
      team_id: string;
      dataset_id: string;
      collection_id: string;
      createtime: Date;
    }>(
      `
      SELECT id, vector::text, team_id, dataset_id, collection_id, createtime
      FROM ${DatasetVectorTableName}
      WHERE createtime BETWEEN $1 AND $2
      ORDER BY id ASC
    `,
      [start, end]
    );

    return rows.map((row) => ({
      id: String(row.id),
      vector: parseVectorString(row.vector),
      teamId: row.team_id,
      datasetId: row.dataset_id,
      collectionId: row.collection_id,
      createTime: new Date(row.createtime)
    }));
  }
}

// OceanBase Exporter
export class OceanBaseExporter implements VectorExporter {
  async getCount(filter?: { teamId?: string; datasetId?: string }): Promise<number> {
    const whereConditions: (string | [string, string])[] = [];

    if (filter?.teamId) {
      whereConditions.push(['team_id', filter.teamId]);
    }
    if (filter?.datasetId) {
      if (whereConditions.length > 0) whereConditions.push('and');
      whereConditions.push(['dataset_id', filter.datasetId]);
    }

    return ObClient.count(DatasetVectorTableName, {
      where: whereConditions.length > 0 ? whereConditions : undefined
    });
  }

  async exportBatch(options: {
    afterId?: string;
    limit: number;
    teamId?: string;
    datasetId?: string;
  }): Promise<{
    records: VectorRecord[];
    hasMore: boolean;
    lastId?: string;
  }> {
    const client = await getObClient();
    const { afterId, limit, teamId, datasetId } = options;
    const whereConditions: string[] = [];
    const params: (string | number)[] = [];

    if (afterId) {
      whereConditions.push(`id > ?`);
      params.push(afterId);
    }
    if (teamId) {
      whereConditions.push(`team_id = ?`);
      params.push(teamId);
    }
    if (datasetId) {
      whereConditions.push(`dataset_id = ?`);
      params.push(datasetId);
    }

    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';
    params.push(limit + 1);

    const [rows] = await client.query<
      ({
        id: string;
        vector: string;
        team_id: string;
        dataset_id: string;
        collection_id: string;
        createtime: Date;
      } & RowDataPacket)[]
    >(
      `
      SELECT id, CAST(vector AS CHAR) as vector, team_id, dataset_id, collection_id, createtime
      FROM ${DatasetVectorTableName}
      ${whereClause}
      ORDER BY id ASC
      LIMIT ?
    `,
      params
    );

    const hasMore = rows.length > limit;
    const records = rows.slice(0, limit).map((row) => ({
      id: String(row.id),
      vector: parseVectorString(row.vector),
      teamId: row.team_id,
      datasetId: row.dataset_id,
      collectionId: row.collection_id,
      createTime: new Date(row.createtime)
    }));

    return {
      records,
      hasMore,
      lastId: records.length > 0 ? records[records.length - 1].id : undefined
    };
  }

  async exportByTimeRange(start: Date, end: Date): Promise<VectorRecord[]> {
    const client = await getObClient();
    const [rows] = await client.query<
      ({
        id: string;
        vector: string;
        team_id: string;
        dataset_id: string;
        collection_id: string;
        createtime: Date;
      } & RowDataPacket)[]
    >(
      `
      SELECT id, CAST(vector AS CHAR) as vector, team_id, dataset_id, collection_id, createtime
      FROM ${DatasetVectorTableName}
      WHERE createtime BETWEEN ? AND ?
      ORDER BY id ASC
    `,
      [start, end]
    );

    return rows.map((row) => ({
      id: String(row.id),
      vector: parseVectorString(row.vector),
      teamId: row.team_id,
      datasetId: row.dataset_id,
      collectionId: row.collection_id,
      createTime: new Date(row.createtime)
    }));
  }
}

// Milvus Exporter
export class MilvusExporter implements VectorExporter {
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

    // Try to use fastgpt database
    try {
      await this.client.useDatabase({ db_name: 'fastgpt' });
    } catch {
      // Ignore if database doesn't exist
    }

    return this.client;
  }

  async getCount(filter?: { teamId?: string; datasetId?: string }): Promise<number> {
    const client = await this.getClient();
    const filterConditions: string[] = [];

    if (filter?.teamId) {
      filterConditions.push(`(teamId == "${filter.teamId}")`);
    }
    if (filter?.datasetId) {
      filterConditions.push(`(datasetId == "${filter.datasetId}")`);
    }

    const result = await client.query({
      collection_name: DatasetVectorTableName,
      output_fields: ['count(*)'],
      filter: filterConditions.length > 0 ? filterConditions.join(' and ') : undefined
    });

    return result.data?.[0]?.['count(*)'] as number;
  }

  async exportBatch(options: {
    afterId?: string;
    limit: number;
    teamId?: string;
    datasetId?: string;
  }): Promise<{
    records: VectorRecord[];
    hasMore: boolean;
    lastId?: string;
  }> {
    const client = await this.getClient();
    const { afterId, limit, teamId, datasetId } = options;
    const filterConditions: string[] = [];

    if (afterId) {
      filterConditions.push(`(id > ${afterId})`);
    }
    if (teamId) {
      filterConditions.push(`(teamId == "${teamId}")`);
    }
    if (datasetId) {
      filterConditions.push(`(datasetId == "${datasetId}")`);
    }

    // Milvus query with pagination
    const result = await client.query({
      collection_name: DatasetVectorTableName,
      output_fields: ['id', 'vector', 'teamId', 'datasetId', 'collectionId', 'createTime'],
      filter: filterConditions.length > 0 ? filterConditions.join(' and ') : undefined,
      limit: limit + 1
    });

    const rows = result.data as {
      id: string | number;
      vector: number[];
      teamId: string;
      datasetId: string;
      collectionId: string;
      createTime: number;
    }[];

    // Sort by ID since Milvus query doesn't guarantee order
    rows.sort((a, b) => Number(a.id) - Number(b.id));

    const hasMore = rows.length > limit;
    const records = rows.slice(0, limit).map((row) => ({
      id: String(row.id),
      vector: row.vector,
      teamId: row.teamId,
      datasetId: row.datasetId,
      collectionId: row.collectionId,
      createTime: new Date(row.createTime)
    }));

    return {
      records,
      hasMore,
      lastId: records.length > 0 ? records[records.length - 1].id : undefined
    };
  }

  async exportByTimeRange(start: Date, end: Date): Promise<VectorRecord[]> {
    const client = await this.getClient();
    const startTimestamp = start.getTime();
    const endTimestamp = end.getTime();

    const result = await client.query({
      collection_name: DatasetVectorTableName,
      output_fields: ['id', 'vector', 'teamId', 'datasetId', 'collectionId', 'createTime'],
      filter: `(createTime >= ${startTimestamp}) and (createTime <= ${endTimestamp})`
    });

    const rows = result.data as {
      id: string | number;
      vector: number[];
      teamId: string;
      datasetId: string;
      collectionId: string;
      createTime: number;
    }[];

    return rows.map((row) => ({
      id: String(row.id),
      vector: row.vector,
      teamId: row.teamId,
      datasetId: row.datasetId,
      collectionId: row.collectionId,
      createTime: new Date(row.createTime)
    }));
  }
}

// Helper function to parse vector string from PostgreSQL/OceanBase
function parseVectorString(vectorStr: string): number[] {
  // Vector format: [0.1,0.2,0.3,...] or (0.1,0.2,0.3,...)
  const cleaned = vectorStr.replace(/[\[\]\(\)]/g, '');
  return cleaned.split(',').map((v) => parseFloat(v.trim()));
}

// Factory function to create exporter based on database type
export function createExporter(
  type: 'pg' | 'oceanbase' | 'milvus',
  config?: { address?: string; token?: string }
): VectorExporter {
  switch (type) {
    case 'pg':
      return new PgExporter();
    case 'oceanbase':
      return new OceanBaseExporter();
    case 'milvus':
      if (!config?.address) {
        throw new Error('Milvus address is required');
      }
      return new MilvusExporter(config.address, config.token);
    default:
      throw new Error(`Unknown exporter type: ${type}`);
  }
}

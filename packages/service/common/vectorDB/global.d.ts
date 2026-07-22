import type { Pool as PgPool } from 'pg';
import type { Pool as MysqlPool } from 'mysql2/promise';
import type { MilvusClient } from '@zilliz/milvus2-sdk-node';
import type { MilvusVersionManager } from './milvus/version';

declare global {
  var pgClient: PgPool | null;
  var obClient: MysqlPool | null;
  var milvusClient: MilvusClient | null;
  var milvusVersionManager: MilvusVersionManager | undefined;
}

export {};

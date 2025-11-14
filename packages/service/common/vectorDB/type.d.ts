import type { Pool } from 'pg';
import type { Pool as MysqlPool } from 'mysql2/promise';
import type { MilvusClient } from '@zilliz/milvus2-sdk-node';

declare global {
  var pgClient: Pool | null;
  var obClient: MysqlPool | null;
  var milvusClient: MilvusClient | null;
}

export type EmbeddingRecallItemType = {
  id: string;
  collectionId: string;
  score: number;
};

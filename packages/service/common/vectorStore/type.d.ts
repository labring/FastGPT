import type { Pool } from 'pg';
import { MilvusClient } from '@zilliz/milvus2-sdk-node';

declare global {
  var pgClient: Pool | null;
  var milvusClient: MilvusClient | null;
}

export type EmbeddingRecallItemType = {
  id: string;
  collectionId: string;
  score: number;
};

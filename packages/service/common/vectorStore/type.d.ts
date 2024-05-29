import type { Pool } from 'pg';
import type { Milvus } from './milvus/class';

declare global {
  var pgClient: Pool | null;
  var milvusClient: Milvus;
}

export type EmbeddingRecallItemType = {
  id: string;
  collectionId: string;
  score: number;
};

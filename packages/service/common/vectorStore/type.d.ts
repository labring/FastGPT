import type { Pool } from 'pg';
import type { MilvusCtrl } from './milvus/class';

declare global {
  var pgClient: Pool | null;
  var milvusClient: MilvusCtrl;
}

export type EmbeddingRecallItemType = {
  id: string;
  collectionId: string;
  score: number;
};

import type { Pool } from 'pg';
import { MilvusClient } from '@zilliz/milvus2-sdk-node';
import { QdrantClient } from '@qdrant/qdrant-js';

declare global {
  var pgClient: Pool | null;
  var milvusClient: MilvusClient | null;
  var qdrantClient: QdrantClient | null;
}

export type EmbeddingRecallItemType = {
  id: string;
  collectionId: string;
  score: number;
};

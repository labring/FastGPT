import type { Pool } from 'pg';

declare global {
  var pgClient: Pool | null;
}

export type EmbeddingRecallItemType = {
  id: string;
  collectionId: string;
  score: number;
};

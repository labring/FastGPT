import type { Pool } from 'pg';

declare global {
  var pgClient: Pool | null;
}

export type SearchProps = {
  similarity?: number; // min distance
  limit: number; // max Token limit
  datasetIds: string[];
  searchMode?: `${DatasetSearchModeEnum}`;
};

export type EmbeddingRecallItemType = {
  id: string;
  collectionId: string;
  dataId: string;
  score: number;
};

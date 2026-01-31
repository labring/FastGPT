/**
 * Shared test data for vector DB integration tests (PG, Oceanbase, Milvus).
 * All vector DBs use the same teamId/datasetId/collectionId and vectors.
 */

export const VECTOR_DIM = 1536;

export const TEST_TEAM_ID = 'integration_test_team';
export const TEST_DATASET_ID = 'integration_test_dataset';
export const TEST_COLLECTION_ID = 'integration_test_collection';

/**
 * Generate a deterministic 1536-dim vector for testing.
 * @param seed - Used to vary the vector (e.g. 0, 1, 2 for multiple vectors)
 */
function makeVector(seed: number): number[] {
  const vec: number[] = [];
  for (let i = 0; i < VECTOR_DIM; i++) {
    vec.push((Math.sin(seed * 1000 + i * 0.1) * 0.5 + 0.5) * 0.01);
  }
  return vec;
}

/** Fixed 1536-dim vectors for insert and embRecall; same data across all vector DBs */
export const TEST_VECTORS: number[][] = [makeVector(0), makeVector(1), makeVector(2)];

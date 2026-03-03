export const VECTOR_DIM = 1536;

const buildBaseVector = () =>
  Array.from({ length: VECTOR_DIM }, (_, index) => ((index % 10) + 1) / 100);

const baseVector = buildBaseVector();

export const TEST_VECTORS = [
  baseVector,
  baseVector.map((value) => value * 0.7),
  baseVector.map((value) => value * 0.3)
];

export const QUERY_VECTOR = baseVector;

export const TEST_COLLECTION_IDS = ['col_1', 'col_2', 'col_3'];

export const createTestIds = () => {
  const suffix = `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  return {
    teamId: `test_team`,
    datasetId: `test_dataset_${suffix}`
  };
};

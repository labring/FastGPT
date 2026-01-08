import { vi } from 'vitest';

/**
 * Mock Vector Controller for testing
 */

export const mockVectorInsert = vi.fn().mockResolvedValue({
  insertIds: ['id_1', 'id_2', 'id_3']
});

export const mockVectorDelete = vi.fn().mockResolvedValue(undefined);

export const mockVectorEmbRecall = vi.fn().mockResolvedValue({
  results: [
    { id: '1', collectionId: 'col_1', score: 0.95 },
    { id: '2', collectionId: 'col_2', score: 0.85 }
  ]
});

export const mockVectorInit = vi.fn().mockResolvedValue(undefined);

export const mockGetVectorDataByTime = vi.fn().mockResolvedValue([
  { id: '1', teamId: 'team_1', datasetId: 'dataset_1' },
  { id: '2', teamId: 'team_1', datasetId: 'dataset_2' }
]);

export const mockGetVectorCountByTeamId = vi.fn().mockResolvedValue(100);

export const mockGetVectorCount = vi.fn().mockResolvedValue(50);

const MockVectorCtrl = vi.fn().mockImplementation(() => ({
  init: mockVectorInit,
  insert: mockVectorInsert,
  delete: mockVectorDelete,
  embRecall: mockVectorEmbRecall,
  getVectorDataByTime: mockGetVectorDataByTime,
  getVectorCountByTeamId: mockGetVectorCountByTeamId,
  getVectorCount: mockGetVectorCount
}));

// Mock PgVectorCtrl
vi.mock('@fastgpt/service/common/vectorDB/pg', () => ({
  PgVectorCtrl: MockVectorCtrl
}));

// Mock ObVectorCtrl
vi.mock('@fastgpt/service/common/vectorDB/oceanbase', () => ({
  ObVectorCtrl: MockVectorCtrl
}));

// Mock MilvusCtrl
vi.mock('@fastgpt/service/common/vectorDB/milvus', () => ({
  MilvusCtrl: MockVectorCtrl
}));

// Mock constants - use PG_ADDRESS to ensure PgVectorCtrl is used
vi.mock('@fastgpt/service/common/vectorDB/constants', () => ({
  DatasetVectorDbName: 'fastgpt',
  DatasetVectorTableName: 'modeldata',
  PG_ADDRESS: 'mock://pg',
  OCEANBASE_ADDRESS: undefined,
  MILVUS_ADDRESS: undefined,
  MILVUS_TOKEN: undefined
}));

// Export mocks for test assertions
export const resetVectorMocks = () => {
  mockVectorInsert.mockClear();
  mockVectorDelete.mockClear();
  mockVectorEmbRecall.mockClear();
  mockVectorInit.mockClear();
  mockGetVectorDataByTime.mockClear();
  mockGetVectorCountByTeamId.mockClear();
  mockGetVectorCount.mockClear();
};

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import {
  mockVectorInsert,
  mockVectorDelete,
  mockVectorEmbRecall,
  mockVectorInit,
  mockGetVectorDataByTime,
  mockGetVectorCountByTeamId,
  mockGetVectorCount,
  resetVectorMocks
} from '@test/mocks/common/vector';
import { mockGetVectorsByText } from '@test/mocks/core/ai/embedding';

// Import controller functions after mocks are set up
import {
  initVectorStore,
  recallFromVectorStore,
  getVectorDataByTime,
  getVectorCountByTeamId,
  getVectorCount,
  insertDatasetDataVector,
  deleteDatasetDataVector
} from '@fastgpt/service/common/vectorDB/controller';

// Mock redis cache functions
const mockGetRedisCache = vi.fn();
const mockSetRedisCache = vi.fn();
const mockDelRedisCache = vi.fn();
const mockIncrValueToCache = vi.fn();

vi.mock('@fastgpt/service/common/redis/cache', () => ({
  setRedisCache: (...args: any[]) => mockSetRedisCache(...args),
  getRedisCache: (...args: any[]) => mockGetRedisCache(...args),
  delRedisCache: (...args: any[]) => mockDelRedisCache(...args),
  incrValueToCache: (...args: any[]) => mockIncrValueToCache(...args),
  CacheKeyEnum: {
    team_vector_count: 'team_vector_count',
    team_point_surplus: 'team_point_surplus',
    team_point_total: 'team_point_total'
  },
  CacheKeyEnumTime: {
    team_vector_count: 1800,
    team_point_surplus: 60,
    team_point_total: 60
  }
}));

describe('VectorDB Controller', () => {
  beforeEach(() => {
    resetVectorMocks();
    mockGetRedisCache.mockReset();
    mockSetRedisCache.mockReset();
    mockDelRedisCache.mockReset();
    mockIncrValueToCache.mockReset();
    mockGetVectorsByText.mockClear();
  });

  describe('initVectorStore', () => {
    it('should call Vector.init', async () => {
      await initVectorStore();
      expect(mockVectorInit).toHaveBeenCalled();
    });
  });

  describe('recallFromVectorStore', () => {
    it('should call Vector.embRecall with correct props', async () => {
      const props = {
        teamId: 'team_123',
        datasetIds: ['dataset_1', 'dataset_2'],
        vector: [0.1, 0.2, 0.3],
        limit: 10,
        forbidCollectionIdList: ['col_forbidden']
      };

      const result = await recallFromVectorStore(props);

      expect(mockVectorEmbRecall).toHaveBeenCalledWith(props);
      expect(result).toEqual({
        results: [
          { id: '1', collectionId: 'col_1', score: 0.95 },
          { id: '2', collectionId: 'col_2', score: 0.85 }
        ]
      });
    });

    it('should handle filterCollectionIdList', async () => {
      const props = {
        teamId: 'team_123',
        datasetIds: ['dataset_1'],
        vector: [0.1, 0.2],
        limit: 5,
        forbidCollectionIdList: [],
        filterCollectionIdList: ['col_1', 'col_2']
      };

      await recallFromVectorStore(props);

      expect(mockVectorEmbRecall).toHaveBeenCalledWith(props);
    });
  });

  describe('getVectorDataByTime', () => {
    it('should call Vector.getVectorDataByTime with correct date range', async () => {
      const start = new Date('2024-01-01');
      const end = new Date('2024-01-31');

      const result = await getVectorDataByTime(start, end);

      expect(mockGetVectorDataByTime).toHaveBeenCalledWith(start, end);
      expect(result).toEqual([
        { id: '1', teamId: 'team_1', datasetId: 'dataset_1' },
        { id: '2', teamId: 'team_1', datasetId: 'dataset_2' }
      ]);
    });
  });

  describe('getVectorCountByTeamId', () => {
    it('should return cached count if available', async () => {
      mockGetRedisCache.mockResolvedValue('150');

      const result = await getVectorCountByTeamId('team_123');

      expect(result).toBe(150);
      expect(mockGetVectorCount).not.toHaveBeenCalled();
    });

    it('should fetch from Vector and cache if no cache exists', async () => {
      mockGetRedisCache.mockResolvedValue(null);
      mockGetVectorCount.mockResolvedValue(200);

      const result = await getVectorCountByTeamId('team_456');

      expect(result).toBe(200);
      expect(mockGetVectorCount).toHaveBeenCalledWith({ teamId: 'team_456' });
    });

    it('should handle undefined cache value', async () => {
      mockGetRedisCache.mockResolvedValue(undefined);
      mockGetVectorCount.mockResolvedValue(50);

      const result = await getVectorCountByTeamId('team_789');

      expect(result).toBe(50);
      expect(mockGetVectorCount).toHaveBeenCalledWith({ teamId: 'team_789' });
    });
  });

  describe('getVectorCount', () => {
    it('should call Vector.getVectorCount', async () => {
      const result = await getVectorCount({ teamId: 'team_1', datasetId: 'dataset_1' });

      expect(mockGetVectorCount).toHaveBeenCalledWith({
        teamId: 'team_1',
        datasetId: 'dataset_1'
      });
      expect(result).toBe(50);
    });
  });

  describe('insertDatasetDataVector', () => {
    const mockModel = {
      model: 'text-embedding-ada-002',
      name: 'text-embedding-ada-002',
      charsPointsPrice: 0,
      maxToken: 8192,
      weight: 100,
      defaultToken: 512,
      dbConfig: {},
      queryExtensionModel: ''
    };

    it('should generate embeddings and insert vectors', async () => {
      const mockVectors = [
        [0.1, 0.2],
        [0.3, 0.4]
      ];
      mockGetVectorsByText.mockResolvedValue({
        tokens: 100,
        vectors: mockVectors
      });
      mockVectorInsert.mockResolvedValue({
        insertIds: ['id_1', 'id_2']
      });

      const result = await insertDatasetDataVector({
        teamId: 'team_123',
        datasetId: 'dataset_456',
        collectionId: 'col_789',
        inputs: ['hello world', 'test text'],
        model: mockModel as any
      });

      expect(mockGetVectorsByText).toHaveBeenCalledWith({
        model: mockModel,
        input: ['hello world', 'test text'],
        type: 'db'
      });
      expect(mockVectorInsert).toHaveBeenCalledWith({
        teamId: 'team_123',
        datasetId: 'dataset_456',
        collectionId: 'col_789',
        vectors: mockVectors
      });
      expect(result).toEqual({
        tokens: 100,
        insertIds: ['id_1', 'id_2']
      });
    });

    it('should increment team vector cache', async () => {
      mockGetVectorsByText.mockResolvedValue({
        tokens: 50,
        vectors: [[0.1]]
      });
      mockVectorInsert.mockResolvedValue({
        insertIds: ['id_1']
      });

      await insertDatasetDataVector({
        teamId: 'team_abc',
        datasetId: 'dataset_def',
        collectionId: 'col_ghi',
        inputs: ['single input'],
        model: mockModel as any
      });

      // Cache increment is called asynchronously
      await new Promise((resolve) => setTimeout(resolve, 10));
      expect(mockIncrValueToCache).toHaveBeenCalled();
    });

    it('should handle empty inputs', async () => {
      mockGetVectorsByText.mockResolvedValue({
        tokens: 0,
        vectors: []
      });
      mockVectorInsert.mockResolvedValue({
        insertIds: []
      });

      const result = await insertDatasetDataVector({
        teamId: 'team_123',
        datasetId: 'dataset_456',
        collectionId: 'col_789',
        inputs: [],
        model: mockModel as any
      });

      expect(result).toEqual({
        tokens: 0,
        insertIds: []
      });
    });
  });

  describe('deleteDatasetDataVector', () => {
    it('should delete by single id', async () => {
      const props = {
        teamId: 'team_123',
        id: 'vector_id_1'
      };

      await deleteDatasetDataVector(props);

      expect(mockVectorDelete).toHaveBeenCalledWith(props);
    });

    it('should delete by datasetIds', async () => {
      const props = {
        teamId: 'team_123',
        datasetIds: ['dataset_1', 'dataset_2']
      };

      await deleteDatasetDataVector(props);

      expect(mockVectorDelete).toHaveBeenCalledWith(props);
    });

    it('should delete by datasetIds and collectionIds', async () => {
      const props = {
        teamId: 'team_123',
        datasetIds: ['dataset_1'],
        collectionIds: ['col_1', 'col_2']
      };

      await deleteDatasetDataVector(props);

      expect(mockVectorDelete).toHaveBeenCalledWith(props);
    });

    it('should delete by idList', async () => {
      const props = {
        teamId: 'team_123',
        idList: ['id_1', 'id_2', 'id_3']
      };

      await deleteDatasetDataVector(props);

      expect(mockVectorDelete).toHaveBeenCalledWith(props);
    });

    it('should call delete and return result', async () => {
      mockVectorDelete.mockResolvedValue({ deletedCount: 5 });

      const props = {
        teamId: 'team_cache_test',
        id: 'some_id'
      };

      const result = await deleteDatasetDataVector(props);

      expect(mockVectorDelete).toHaveBeenCalledWith(props);
      expect(result).toEqual({ deletedCount: 5 });
    });
  });
});

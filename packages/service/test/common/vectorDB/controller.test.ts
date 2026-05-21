import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import {
  mockVectorInsert,
  mockVectorDelete,
  mockVectorEmbRecall,
  mockVectorInit,
  mockGetVectorDataByTime,
  mockGetVectorCount,
  resetVectorMocks
} from '@test/mocks/common/vector';
import { mockGetVectors } from '@test/mocks/core/ai/embedding';

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
const mockLoggerWarn = vi.fn();

vi.mock('@fastgpt/service/common/redis/cache', () => ({
  setRedisCache: (...args: any[]) => mockSetRedisCache(...args),
  getRedisCache: (...args: any[]) => mockGetRedisCache(...args),
  delRedisCache: (...args: any[]) => mockDelRedisCache(...args),
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

vi.mock('@fastgpt/service/common/logger', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@fastgpt/service/common/logger')>();

  return {
    ...actual,
    getLogger: () => ({
      debug: vi.fn(),
      info: vi.fn(),
      warn: (...args: any[]) => mockLoggerWarn(...args),
      error: vi.fn()
    })
  };
});

describe('VectorDB Controller', () => {
  beforeEach(() => {
    resetVectorMocks();
    mockGetRedisCache.mockReset();
    mockSetRedisCache.mockReset();
    mockDelRedisCache.mockReset();
    mockLoggerWarn.mockReset();
    mockGetVectors.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
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

    it('should fallback to Vector count when cache read fails', async () => {
      mockGetRedisCache.mockRejectedValueOnce(new Error('redis down'));
      mockGetVectorCount.mockResolvedValue(200);

      const result = await getVectorCountByTeamId('team_456');

      expect(result).toBe(200);
      expect(mockGetVectorCount).toHaveBeenCalledWith({ teamId: 'team_456' });
      expect(mockLoggerWarn).toHaveBeenCalledWith('Failed to get team vector count cache', {
        teamId: 'team_456',
        error: expect.any(Error)
      });
    });

    it('should fallback to Vector count when cache read times out', async () => {
      vi.useFakeTimers();
      mockGetRedisCache.mockReturnValueOnce(new Promise(() => {}));
      mockGetVectorCount.mockResolvedValue(120);

      const resultPromise = getVectorCountByTeamId('team_timeout');

      await vi.advanceTimersByTimeAsync(3000);

      await expect(resultPromise).resolves.toBe(120);
      expect(mockGetVectorCount).toHaveBeenCalledWith({ teamId: 'team_timeout' });
      expect(mockLoggerWarn).toHaveBeenCalledWith('Failed to get team vector count cache', {
        teamId: 'team_timeout',
        error: expect.any(Error)
      });
    });

    it('should not block count result when cache write times out', async () => {
      vi.useFakeTimers();
      mockGetRedisCache.mockResolvedValue(null);
      mockGetVectorCount.mockResolvedValue(300);
      mockSetRedisCache.mockReturnValueOnce(new Promise(() => {}));

      const result = await getVectorCountByTeamId('team_set_timeout');

      expect(result).toBe(300);
      expect(mockGetVectorCount).toHaveBeenCalledWith({ teamId: 'team_set_timeout' });
      expect(mockSetRedisCache).toHaveBeenCalledWith(
        'team_vector_count:team_set_timeout',
        300,
        1800
      );

      await vi.advanceTimersByTimeAsync(3000);

      expect(mockLoggerWarn).toHaveBeenCalledWith('Failed to set team vector count cache', {
        teamId: 'team_set_timeout',
        error: expect.any(Error)
      });
    });
  });

  describe('getVectorCount', () => {
    it('should call Vector.getVectorCount', async () => {
      mockGetVectorCount.mockResolvedValue(50);

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
      mockGetVectors.mockResolvedValue({
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

      expect(mockGetVectors).toHaveBeenCalledWith({
        model: mockModel,
        inputs: [
          {
            type: 'text',
            input: 'hello world'
          },
          {
            type: 'text',
            input: 'test text'
          }
        ],
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

    it('should pass explicit image inputs to embedding generation', async () => {
      const mockVectors = [[0.1, 0.2]];
      mockGetVectors.mockResolvedValue({
        tokens: 1,
        vectors: mockVectors
      });
      mockVectorInsert.mockResolvedValue({
        insertIds: ['image_id']
      });

      const result = await insertDatasetDataVector({
        teamId: 'team_123',
        datasetId: 'dataset_456',
        collectionId: 'col_789',
        inputs: [
          {
            type: 'image',
            input: 'data:image/png;base64,image'
          }
        ],
        model: mockModel as any
      });

      expect(mockGetVectors).toHaveBeenCalledWith({
        model: mockModel,
        inputs: [
          {
            type: 'image',
            input: 'data:image/png;base64,image'
          }
        ],
        type: 'db'
      });
      expect(mockVectorInsert).toHaveBeenCalledWith({
        teamId: 'team_123',
        datasetId: 'dataset_456',
        collectionId: 'col_789',
        vectors: mockVectors
      });
      expect(result).toEqual({
        tokens: 1,
        insertIds: ['image_id']
      });
    });

    it('should invalidate team vector cache after insert', async () => {
      mockGetVectors.mockResolvedValue({
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

      expect(mockDelRedisCache).toHaveBeenCalledWith('team_vector_count:team_abc');
    });

    it('should return insert result when team vector cache invalidation fails', async () => {
      mockGetVectors.mockResolvedValue({
        tokens: 50,
        vectors: [[0.1]]
      });
      mockVectorInsert.mockResolvedValue({
        insertIds: ['id_1']
      });
      mockDelRedisCache.mockRejectedValueOnce(new Error('redis down'));

      const result = await insertDatasetDataVector({
        teamId: 'team_abc',
        datasetId: 'dataset_def',
        collectionId: 'col_ghi',
        inputs: ['single input'],
        model: mockModel as any
      });

      expect(result).toEqual({
        tokens: 50,
        insertIds: ['id_1']
      });
      expect(mockDelRedisCache).toHaveBeenCalledWith('team_vector_count:team_abc');
      expect(mockLoggerWarn).toHaveBeenCalledWith('Failed to invalidate team vector count cache', {
        teamId: 'team_abc',
        error: expect.any(Error)
      });
    });

    it('should return insert result when team vector cache invalidation times out', async () => {
      vi.useFakeTimers();
      mockGetVectors.mockResolvedValue({
        tokens: 50,
        vectors: [[0.1]]
      });
      mockVectorInsert.mockResolvedValue({
        insertIds: ['id_1']
      });
      mockDelRedisCache.mockReturnValueOnce(new Promise(() => {}));

      const resultPromise = insertDatasetDataVector({
        teamId: 'team_abc',
        datasetId: 'dataset_def',
        collectionId: 'col_ghi',
        inputs: ['single input'],
        model: mockModel as any
      });

      await vi.advanceTimersByTimeAsync(3000);

      await expect(resultPromise).resolves.toEqual({
        tokens: 50,
        insertIds: ['id_1']
      });
      expect(mockDelRedisCache).toHaveBeenCalledWith('team_vector_count:team_abc');
      expect(mockLoggerWarn).toHaveBeenCalledWith('Failed to invalidate team vector count cache', {
        teamId: 'team_abc',
        error: expect.any(Error)
      });
    });

    it('should handle empty inputs', async () => {
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
      expect(mockGetVectors).not.toHaveBeenCalled();
      expect(mockVectorInsert).not.toHaveBeenCalled();
      expect(mockDelRedisCache).not.toHaveBeenCalled();
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
      expect(mockDelRedisCache).toHaveBeenCalledWith('team_vector_count:team_cache_test');
    });

    it('should return delete result when team vector cache invalidation fails', async () => {
      mockVectorDelete.mockResolvedValue({ deletedCount: 5 });
      mockDelRedisCache.mockRejectedValueOnce(new Error('redis down'));

      const props = {
        teamId: 'team_cache_test',
        id: 'some_id'
      };

      const result = await deleteDatasetDataVector(props);

      expect(mockVectorDelete).toHaveBeenCalledWith(props);
      expect(result).toEqual({ deletedCount: 5 });
      expect(mockDelRedisCache).toHaveBeenCalledWith('team_vector_count:team_cache_test');
      expect(mockLoggerWarn).toHaveBeenCalledWith('Failed to invalidate team vector count cache', {
        teamId: 'team_cache_test',
        error: expect.any(Error)
      });
    });

    it('should return delete result when team vector cache invalidation times out', async () => {
      vi.useFakeTimers();
      mockVectorDelete.mockResolvedValue({ deletedCount: 5 });
      mockDelRedisCache.mockReturnValueOnce(new Promise(() => {}));

      const props = {
        teamId: 'team_cache_test',
        id: 'some_id'
      };

      const resultPromise = deleteDatasetDataVector(props);

      await vi.advanceTimersByTimeAsync(3000);

      await expect(resultPromise).resolves.toEqual({ deletedCount: 5 });
      expect(mockVectorDelete).toHaveBeenCalledWith(props);
      expect(mockDelRedisCache).toHaveBeenCalledWith('team_vector_count:team_cache_test');
      expect(mockLoggerWarn).toHaveBeenCalledWith('Failed to invalidate team vector count cache', {
        teamId: 'team_cache_test',
        error: expect.any(Error)
      });
    });
  });
});

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import {
  mockVectorInsert,
  mockVectorDelete,
  mockVectorRefreshCreateTime,
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
  refreshTeamVectorCount,
  getVectorCount,
  insertDatasetDataVector,
  deleteDatasetDataVector,
  refreshDatasetDataVectorCreateTime
} from '@fastgpt/service/common/vectorDB/controller';

// Mock redis cache functions
const mockRedisStringGet = vi.fn();
const mockRedisStringSet = vi.fn();
const mockRedisStringDelete = vi.fn();
const mockLoggerWarn = vi.fn();

vi.mock('@fastgpt/dal/redis/caches', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@fastgpt/dal/redis/caches')>();

  return {
    ...actual,
    TeamVectorCountCache: class MockTeamVectorCountCache extends actual.TeamVectorCountCache {
      constructor({ logger }: Parameters<typeof actual.TeamVectorCountCache>[0]) {
        super({
          logger,
          redis: {
            set: (...args: any[]) => mockRedisStringSet(...args),
            get: (...args: any[]) => mockRedisStringGet(...args),
            delete: (...args: any[]) => mockRedisStringDelete(...args)
          }
        });
      }
    }
  };
});

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
  const onVectorRowsChanged = vi.fn().mockResolvedValue(undefined);
  beforeEach(() => {
    resetVectorMocks();
    mockVectorInsert.mockReset().mockResolvedValue({ insertIds: ['id_1', 'id_2', 'id_3'] });
    mockVectorDelete.mockReset().mockResolvedValue(undefined);
    mockVectorRefreshCreateTime.mockReset().mockResolvedValue(undefined);
    mockRedisStringGet.mockReset();
    mockRedisStringSet.mockReset();
    mockRedisStringDelete.mockReset();
    mockRedisStringSet.mockResolvedValue(undefined);
    mockRedisStringDelete.mockResolvedValue(false);
    mockLoggerWarn.mockReset();
    mockGetVectors.mockClear();
    onVectorRowsChanged.mockReset().mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('vector rows notifications', () => {
    it.each([
      {
        props: { teamId: 't', datasetIds: ['a', 'b'] },
        datasets: ['a', 'b'],
        filter: { teamId: 't', datasetIds: ['a', 'b'] }
      },
      {
        props: { teamId: 't', id: '1', datasetId: 'a' },
        datasets: ['a'],
        filter: { teamId: 't', id: '1' }
      },
      {
        props: { teamId: 't', idList: ['1'], datasetId: 'a' },
        datasets: ['a'],
        filter: { teamId: 't', idList: ['1'] }
      }
    ])(
      'notifies the affected scopes without changing the provider deletion filter',
      async ({ props, datasets, filter }) => {
        await deleteDatasetDataVector({ ...props, onVectorRowsChanged });
        expect(onVectorRowsChanged).toHaveBeenCalledWith({ teamId: 't', datasetIds: datasets });
        expect(mockVectorDelete).toHaveBeenCalledWith(filter);
        expect(mockRedisStringDelete).not.toHaveBeenCalled();
        expect(mockVectorDelete.mock.invocationCallOrder[0]).toBeLessThan(
          onVectorRowsChanged.mock.invocationCallOrder[0]
        );
      }
    );

    it.each(['insert', 'delete'])('does not notify after a failed vector %s', async (operation) => {
      vi.useFakeTimers();
      const error = new Error('vector database unavailable');
      mockVectorInsert.mockRejectedValue(error);
      mockVectorDelete.mockRejectedValue(error);
      mockGetVectors.mockResolvedValue({ vectors: [[0.1]], tokens: 1 });
      const pending =
        operation === 'insert'
          ? insertDatasetDataVector({
              teamId: 't',
              datasetId: 'a',
              collectionId: 'c',
              model: {} as any,
              inputs: ['text'],
              onVectorRowsChanged
            })
          : deleteDatasetDataVector({ teamId: 't', datasetIds: ['a'], onVectorRowsChanged });
      const rejected = expect(pending).rejects.toThrow(error);
      await vi.advanceTimersByTimeAsync(2000);
      await rejected;
      expect(onVectorRowsChanged).not.toHaveBeenCalled();
      expect(mockRedisStringDelete).not.toHaveBeenCalled();
    });
  });

  describe('refreshDatasetDataVectorCreateTime', () => {
    it('skips empty lists and deduplicates IDs before bounded batches', async () => {
      await refreshDatasetDataVectorCreateTime({ teamId: 'team', idList: [] });
      expect(mockVectorRefreshCreateTime).not.toHaveBeenCalled();
      const ids = Array.from({ length: 101 }, (_, i) => String(i));
      await refreshDatasetDataVectorCreateTime({ teamId: 'team', idList: [...ids, ids[0]] });
      expect(mockVectorRefreshCreateTime.mock.calls).toEqual([
        [{ teamId: 'team', idList: ids.slice(0, 100) }],
        [{ teamId: 'team', idList: ids.slice(100) }]
      ]);
    });

    it('retries a failed batch and rejects when retries are exhausted', async () => {
      mockVectorRefreshCreateTime.mockRejectedValueOnce(new Error('temporary'));
      await refreshDatasetDataVectorCreateTime({ teamId: 'team', idList: ['1'] });
      expect(mockVectorRefreshCreateTime).toHaveBeenCalledTimes(2);
      mockVectorRefreshCreateTime.mockRejectedValue(new Error('offline'));
      await expect(
        refreshDatasetDataVectorCreateTime({ teamId: 'team', idList: ['2'] })
      ).rejects.toThrow('offline');
    });
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
      mockRedisStringGet.mockResolvedValue('150');

      const result = await getVectorCountByTeamId('team_123');

      expect(result).toBe(150);
      expect(mockGetVectorCount).not.toHaveBeenCalled();
    });

    it('should fetch from Vector and cache if no cache exists', async () => {
      mockRedisStringGet.mockResolvedValue(null);
      mockGetVectorCount.mockResolvedValue(200);

      const result = await getVectorCountByTeamId('team_456');

      expect(result).toBe(200);
      expect(mockGetVectorCount).toHaveBeenCalledWith({ teamId: 'team_456' });
    });

    it('should handle undefined cache value', async () => {
      mockRedisStringGet.mockResolvedValue(undefined);
      mockGetVectorCount.mockResolvedValue(50);

      const result = await getVectorCountByTeamId('team_789');

      expect(result).toBe(50);
      expect(mockGetVectorCount).toHaveBeenCalledWith({ teamId: 'team_789' });
    });

    it('should fallback to Vector count when cache read fails', async () => {
      mockRedisStringGet.mockRejectedValueOnce(new Error('redis down'));
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
      mockRedisStringGet.mockReturnValueOnce(new Promise(() => {}));
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
      mockRedisStringGet.mockResolvedValue(null);
      mockGetVectorCount.mockResolvedValue(300);
      mockRedisStringSet.mockReturnValueOnce(new Promise(() => {}));

      const result = await getVectorCountByTeamId('team_set_timeout');

      expect(result).toBe(300);
      expect(mockGetVectorCount).toHaveBeenCalledWith({ teamId: 'team_set_timeout' });
      expect(mockRedisStringSet).toHaveBeenCalledWith({
        key: 'cache:team_vector_count:team_set_timeout',
        value: '300',
        ttlMs: 1_800_000
      });

      await vi.advanceTimersByTimeAsync(3000);

      expect(mockLoggerWarn).toHaveBeenCalledWith('Failed to set team vector count cache', {
        teamId: 'team_set_timeout',
        error: expect.any(Error)
      });
    });
  });

  describe('refreshTeamVectorCount', () => {
    it('does not fill the team cache with a count returned after cancellation', async () => {
      const controller = new AbortController();
      mockGetVectorCount.mockImplementationOnce(async () => {
        controller.abort(new Error('execution timed out'));
        return 100;
      });
      await expect(refreshTeamVectorCount('team_cancelled', controller.signal)).rejects.toThrow(
        'execution timed out'
      );
      expect(mockRedisStringSet).not.toHaveBeenCalled();
    });

    it('keeps cached reads available during mutations and publishes the completed count', async () => {
      mockRedisStringGet.mockResolvedValue('90');
      mockGetVectors.mockResolvedValue({ tokens: 1, vectors: [[0.1]] });
      mockGetVectorCount.mockImplementationOnce(async () => {
        // 模拟 COUNT 执行期间仍在增删，当前读请求继续使用上次成功的快照。
        await insertDatasetDataVector({
          teamId: 'team_hot',
          datasetId: 'dataset_a',
          collectionId: 'collection_a',
          inputs: ['text'],
          model: {} as any,
          onVectorRowsChanged
        });
        await deleteDatasetDataVector({
          teamId: 'team_hot',
          datasetId: 'dataset_a',
          id: '1',
          onVectorRowsChanged
        });
        expect(await getVectorCountByTeamId('team_hot')).toBe(90);
        return 100;
      });

      await expect(refreshTeamVectorCount('team_hot')).resolves.toBe(100);
      expect(mockGetVectorCount).toHaveBeenCalledTimes(1);
      expect(mockRedisStringDelete).not.toHaveBeenCalled();
      expect(onVectorRowsChanged).toHaveBeenCalledTimes(2);
      expect(mockRedisStringSet).toHaveBeenCalledWith({
        key: 'cache:team_vector_count:team_hot',
        value: '100',
        ttlMs: 1_800_000
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
        onVectorRowsChanged,
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
        onVectorRowsChanged,
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

    it('notifies statistics without clearing the previous team count', async () => {
      mockGetVectors.mockResolvedValue({
        tokens: 50,
        vectors: [[0.1]]
      });
      mockVectorInsert.mockResolvedValue({
        insertIds: ['id_1']
      });

      await insertDatasetDataVector({
        onVectorRowsChanged,
        teamId: 'team_abc',
        datasetId: 'dataset_def',
        collectionId: 'col_ghi',
        inputs: ['single input'],
        model: mockModel as any
      });

      expect(mockRedisStringDelete).not.toHaveBeenCalled();
      expect(onVectorRowsChanged).toHaveBeenCalledWith({
        teamId: 'team_abc',
        datasetIds: ['dataset_def']
      });
    });

    it('should handle empty inputs', async () => {
      const result = await insertDatasetDataVector({
        onVectorRowsChanged,
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
      expect(mockRedisStringDelete).not.toHaveBeenCalled();
      expect(onVectorRowsChanged).not.toHaveBeenCalled();
    });

    /**
     * 被测函数名: insertDatasetDataVector
     * 被测函数等级: 3-High
     * 单测函数功能描述: 确认 texts 通过 ...props 透传到 Vector.insert
     * 单测函数测试思路(正常场景):
     * 1、(全文文本透传) mock Vector.insert;调用 insertDatasetDataVector({inputs, texts, ...})
     *    期望: Vector.insert 收到 texts(TC-9.1)
     */
    it('TC-9.1 forwards texts to Vector.insert', async () => {
      const mockVectors = [[0.1, 0.2]];
      mockGetVectors.mockResolvedValue({
        tokens: 10,
        vectors: mockVectors
      });
      mockVectorInsert.mockResolvedValue({
        insertIds: ['id_1']
      });

      const result = await insertDatasetDataVector({
        onVectorRowsChanged,
        teamId: 'team_123',
        datasetId: 'dataset_456',
        collectionId: 'col_789',
        inputs: ['hello'],
        texts: ['hello'],
        model: mockModel as any
      });

      expect(mockVectorInsert).toHaveBeenCalledWith({
        teamId: 'team_123',
        datasetId: 'dataset_456',
        collectionId: 'col_789',
        vectors: mockVectors,
        texts: ['hello']
      });
      expect(result).toEqual({
        tokens: 10,
        insertIds: ['id_1']
      });
    });
  });

  describe('deleteDatasetDataVector', () => {
    it('should delete by single id', async () => {
      const props = {
        teamId: 'team_123',
        id: 'vector_id_1'
      };

      await deleteDatasetDataVector({ ...props, datasetId: 'dataset_456', onVectorRowsChanged });

      expect(mockVectorDelete).toHaveBeenCalledWith(props);
    });

    it('should delete by datasetIds', async () => {
      const props = {
        teamId: 'team_123',
        datasetIds: ['dataset_1', 'dataset_2']
      };

      await deleteDatasetDataVector({ ...props, onVectorRowsChanged });

      expect(mockVectorDelete).toHaveBeenCalledWith(props);
    });

    it('should delete by datasetIds and collectionIds', async () => {
      const props = {
        teamId: 'team_123',
        datasetIds: ['dataset_1'],
        collectionIds: ['col_1', 'col_2']
      };

      await deleteDatasetDataVector({ ...props, onVectorRowsChanged });

      expect(mockVectorDelete).toHaveBeenCalledWith(props);
    });

    it('should delete by idList', async () => {
      const props = {
        teamId: 'team_123',
        idList: ['id_1', 'id_2', 'id_3']
      };

      await deleteDatasetDataVector({ ...props, datasetId: 'dataset_456', onVectorRowsChanged });

      expect(mockVectorDelete).toHaveBeenCalledWith(props);
    });

    it('should call delete and return result', async () => {
      mockVectorDelete.mockResolvedValue({ deletedCount: 5 });

      const props = {
        teamId: 'team_cache_test',
        id: 'some_id'
      };

      const result = await deleteDatasetDataVector({
        ...props,
        datasetId: 'dataset_456',
        onVectorRowsChanged
      });

      expect(mockVectorDelete).toHaveBeenCalledWith(props);
      expect(result).toEqual({ deletedCount: 5 });
      expect(mockRedisStringDelete).not.toHaveBeenCalled();
    });
  });
});

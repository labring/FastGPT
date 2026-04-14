import { describe, test, expect, vi, beforeEach } from 'vitest';
import {
  createRerankTrainset,
  deleteRerankTrainset
} from '@fastgpt/service/core/train/rerank/trainset/controller';
import {
  authRerankTrainset,
  authGenerateFromDatasets
} from '@fastgpt/service/support/permission/train/rerank/auth';
import { createMockDoc } from './mockDoc';

// Mock dependencies
vi.mock('@fastgpt/service/common/system/log', () => ({
  addLog: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn()
  }
}));

vi.mock('@fastgpt/service/core/train/rerank/trainset/schema', () => ({
  MongoRerankTrainset: {
    create: vi.fn(),
    findOne: vi.fn(),
    findById: vi.fn(),
    deleteOne: vi.fn()
  }
}));

vi.mock('@fastgpt/service/support/permission/auth/common', () => ({
  authCert: vi.fn()
}));

vi.mock('@fastgpt/service/support/permission/dataset/auth', () => ({
  authDataset: vi.fn()
}));

// Mock calculateRerankTrainsetStats
vi.mock('@fastgpt/service/core/train/rerank/data/controller', () => ({
  calculateRerankTrainsetStats: vi.fn()
}));

describe('Rerank Trainset Controller', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createRerankTrainset', () => {
    test('应该成功创建训练集', async () => {
      const { MongoRerankTrainset } = await import(
        '@fastgpt/service/core/train/rerank/trainset/schema'
      );

      (MongoRerankTrainset.create as any).mockResolvedValue([
        createMockDoc({ _id: 'trainset_123' })
      ]);

      const trainset = await createRerankTrainset({
        teamId: 'team_123',
        tmbId: 'tmb_123',
        name: 'My Trainset'
      });

      expect(String(trainset._id)).toBe('trainset_123');
      expect(MongoRerankTrainset.create).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            teamId: 'team_123',
            tmbId: 'tmb_123',
            name: 'My Trainset'
          })
        ])
      );
    });

    test('未提供名称时应使用默认名称', async () => {
      const { MongoRerankTrainset } = await import(
        '@fastgpt/service/core/train/rerank/trainset/schema'
      );

      (MongoRerankTrainset.create as any).mockResolvedValue([
        createMockDoc({ _id: 'trainset_123' })
      ]);

      await createRerankTrainset({
        teamId: 'team_123',
        tmbId: 'tmb_123'
      });

      const createCall = (MongoRerankTrainset.create as any).mock.calls[0][0][0];
      expect(createCall.name).toBeDefined();
      expect(typeof createCall.name).toBe('string');
    });
  });

  describe('deleteRerankTrainset', () => {
    test('应该成功删除训练集', async () => {
      const { MongoRerankTrainset } = await import(
        '@fastgpt/service/core/train/rerank/trainset/schema'
      );

      (MongoRerankTrainset.deleteOne as any).mockResolvedValue({ deletedCount: 1 });

      await deleteRerankTrainset('trainset_123');

      expect(MongoRerankTrainset.deleteOne).toHaveBeenCalledWith(
        { _id: 'trainset_123' },
        { session: undefined }
      );
    });
  });
});

describe('Rerank Trainset Permission', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('authRerankTrainset', () => {
    test('应该验证训练集权限并返回训练集信息', async () => {
      const { MongoRerankTrainset } = await import(
        '@fastgpt/service/core/train/rerank/trainset/schema'
      );
      const { authCert } = await import('@fastgpt/service/support/permission/auth/common');
      const { calculateRerankTrainsetStats } = await import(
        '@fastgpt/service/core/train/rerank/data/controller'
      );

      const mockTrainset = {
        _id: 'trainset_123',
        teamId: 'team_123',
        name: 'Test Trainset'
      };

      const mockStats = {
        dataCount: 10,
        positiveCount: 10,
        negativeCount: 50,
        sourceSummary: []
      };

      (MongoRerankTrainset.findById as any).mockReturnValue({
        lean: vi.fn().mockResolvedValue(mockTrainset)
      });

      (authCert as any).mockResolvedValue({
        teamId: 'team_123',
        tmbId: 'tmb_123'
      });

      (calculateRerankTrainsetStats as any).mockResolvedValue(mockStats);

      const result = await authRerankTrainset({
        trainsetId: 'trainset_123',
        per: 1,
        req: {} as any,
        authToken: true
      });

      expect(result.trainset).toEqual({
        ...mockTrainset,
        statistics: mockStats
      });
      expect(authCert).toHaveBeenCalled();
    });

    test('训练集不存在时应拒绝', async () => {
      const { MongoRerankTrainset } = await import(
        '@fastgpt/service/core/train/rerank/trainset/schema'
      );

      (MongoRerankTrainset.findById as any).mockReturnValue({
        lean: vi.fn().mockResolvedValue(null)
      });

      await expect(
        authRerankTrainset({
          trainsetId: 'non_existent',
          per: 1,
          req: {} as any,
          authToken: true
        })
      ).rejects.toBeDefined();
    });

    test('teamId 不匹配时应拒绝', async () => {
      const { MongoRerankTrainset } = await import(
        '@fastgpt/service/core/train/rerank/trainset/schema'
      );
      const { authCert } = await import('@fastgpt/service/support/permission/auth/common');

      (MongoRerankTrainset.findById as any).mockReturnValue({
        lean: vi.fn().mockResolvedValue({
          _id: 'trainset_123',
          teamId: 'team_other',
          name: 'Test Trainset'
        })
      });

      (authCert as any).mockResolvedValue({
        teamId: 'team_123', // Different teamId
        tmbId: 'tmb_123'
      });

      await expect(
        authRerankTrainset({
          trainsetId: 'trainset_123',
          per: 1,
          req: {} as any,
          authToken: true
        })
      ).rejects.toBeDefined();
    });
  });

  describe('authGenerateFromDatasets', () => {
    test('应该验证所有知识库的读权限', async () => {
      const { authDataset } = await import('@fastgpt/service/support/permission/dataset/auth');

      const mockDatasets = [
        { _id: 'dataset_1', name: 'Dataset 1' },
        { _id: 'dataset_2', name: 'Dataset 2' }
      ];

      (authDataset as any)
        .mockResolvedValueOnce({ dataset: mockDatasets[0] })
        .mockResolvedValueOnce({ dataset: mockDatasets[1] });

      const result = await authGenerateFromDatasets({
        datasetIds: ['dataset_1', 'dataset_2'],
        req: {} as any,
        authToken: true
      });

      expect(result.datasets).toHaveLength(2);
      expect(authDataset).toHaveBeenCalledTimes(2);
      expect(authDataset).toHaveBeenCalledWith(
        expect.objectContaining({
          datasetId: 'dataset_1'
        })
      );
    });
  });
});

import { describe, test, expect, vi, beforeEach } from 'vitest';
import {
  createEmbeddingTrainset,
  deleteEmbeddingTrainset
} from '@fastgpt/service/core/train/embedding/trainset/controller';
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

vi.mock('@fastgpt/service/core/train/embedding/trainset/schema', () => ({
  MongoEmbeddingTrainset: {
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
vi.mock('@fastgpt/service/core/train/embedding/data/controller', () => ({
  calculateEmbeddingTrainsetStats: vi.fn()
}));

describe('Embedding Trainset Controller', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createEmbeddingTrainset', () => {
    test('应该成功创建训练集', async () => {
      const { MongoEmbeddingTrainset } = await import(
        '@fastgpt/service/core/train/embedding/trainset/schema'
      );

      (MongoEmbeddingTrainset.create as any).mockResolvedValue([
        createMockDoc({ _id: 'trainset_123' })
      ]);

      const trainset = await createEmbeddingTrainset({
        teamId: 'team_123',
        tmbId: 'tmb_123',
        name: 'My Trainset'
      });

      expect(String(trainset._id)).toBe('trainset_123');
      expect(MongoEmbeddingTrainset.create).toHaveBeenCalledWith(
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
      const { MongoEmbeddingTrainset } = await import(
        '@fastgpt/service/core/train/embedding/trainset/schema'
      );

      (MongoEmbeddingTrainset.create as any).mockResolvedValue([
        createMockDoc({ _id: 'trainset_123' })
      ]);

      await createEmbeddingTrainset({
        teamId: 'team_123',
        tmbId: 'tmb_123'
      });

      const createCall = (MongoEmbeddingTrainset.create as any).mock.calls[0][0][0];
      expect(createCall.name).toBeDefined();
      expect(typeof createCall.name).toBe('string');
    });

    test('应该支持可选的 description 参数', async () => {
      const { MongoEmbeddingTrainset } = await import(
        '@fastgpt/service/core/train/embedding/trainset/schema'
      );

      (MongoEmbeddingTrainset.create as any).mockResolvedValue([
        createMockDoc({ _id: 'trainset_123' })
      ]);

      const trainset = await createEmbeddingTrainset({
        teamId: 'team_123',
        tmbId: 'tmb_123',
        name: 'My Trainset',
        description: 'Test description'
      });

      expect(String(trainset._id)).toBe('trainset_123');
      expect(MongoEmbeddingTrainset.create).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            description: 'Test description'
          })
        ])
      );
    });
  });

  describe('deleteEmbeddingTrainset', () => {
    test('应该成功删除训练集', async () => {
      const { MongoEmbeddingTrainset } = await import(
        '@fastgpt/service/core/train/embedding/trainset/schema'
      );

      (MongoEmbeddingTrainset.deleteOne as any).mockResolvedValue({ deletedCount: 1 });

      await deleteEmbeddingTrainset('trainset_123');

      expect(MongoEmbeddingTrainset.deleteOne).toHaveBeenCalledWith(
        { _id: 'trainset_123' },
        { session: undefined }
      );
    });
  });
});

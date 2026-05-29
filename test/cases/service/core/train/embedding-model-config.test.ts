import { describe, test, expect, vi, beforeEach } from 'vitest';

// Mock dependencies before importing the controller
vi.mock('@fastgpt/service/common/system/log', () => ({
  addLog: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn()
  }
}));

vi.mock('@fastgpt/service/core/ai/config/utils', () => ({
  updatedReloadSystemModel: vi.fn().mockResolvedValue(undefined)
}));

vi.mock('@fastgpt/service/core/ai/config/schema', () => ({
  MongoSystemModel: {
    create: vi.fn(),
    findOneAndUpdate: vi.fn()
  }
}));

vi.mock('@fastgpt/service/core/train/embedding/task/schema', () => ({
  MongoEmbeddingTrainTask: {
    findById: vi.fn(),
    updateOne: vi.fn()
  }
}));

vi.mock('@fastgpt/global/core/ai/provider', () => ({
  getModelProvider: vi.fn().mockReturnValue({
    id: 'aicp'
  })
}));

vi.mock('@fastgpt/service/core/app/provider/controller', () => ({
  getModelProvider: vi.fn().mockReturnValue({
    id: 'aicp',
    en: 'Test Provider',
    zh: '测试提供商'
  })
}));

vi.mock('@fastgpt/service/core/train/embedding/task/helpers/channel', () => ({
  createTunedModelChannel: vi.fn().mockResolvedValue(undefined),
  deleteTunedModelChannel: vi.fn().mockResolvedValue(undefined),
  waitForChannelAvailable: vi.fn().mockResolvedValue(undefined)
}));

vi.mock('@fastgpt/service/core/train/embedding/external', () => ({
  deleteSFTModel: vi.fn().mockResolvedValue({ success: true, message: 'Deleted' })
}));

import { createEmbeddingModelConfig } from '@fastgpt/service/core/train/embedding/model/controller';

describe('Embedding Model Config Controller', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createEmbeddingModelConfig', () => {
    test('should successfully create embedding model configuration', async () => {
      const { MongoSystemModel } = await import('@fastgpt/service/core/ai/config/schema');
      const { MongoEmbeddingTrainTask } = await import(
        '@fastgpt/service/core/train/embedding/task/schema'
      );
      const { updatedReloadSystemModel } = await import('@fastgpt/service/core/ai/config/utils');

      (MongoEmbeddingTrainTask.findById as any).mockReturnValue({
        lean: vi.fn().mockResolvedValue({ checkpoint: { data: {} } })
      });
      (MongoSystemModel.create as any).mockResolvedValue({ _id: 'config_123' });

      const configId = await createEmbeddingModelConfig({
        name: 'Test Embedding Model',
        endpoint: {
          base_url: 'http://192.168.1.100:8080/v1',
          api_key: 'test-api-key',
          model: 'test-model'
        },
        isActive: true,
        tmbId: 'tmb_test',
        teamId: 'team_test',
        charsPointsPrice: 1,
        taskId: 'task_123'
      });

      expect(configId).toBe('config_123');
      expect(MongoSystemModel.create).toHaveBeenCalledWith({
        provider: 'aicp',
        model: 'test-model',
        name: 'Test Embedding Model',
        isActive: true,
        isCustom: true,
        isTuned: true,
        type: 'embedding',
        charsPointsPrice: 1,
        defaultToken: 512,
        maxToken: 512,
        weight: 0,
        normalization: undefined,
        batchSize: undefined,
        defaultConfig: undefined,
        instruction: undefined,
        tmbId: 'tmb_test',
        teamId: 'team_test',
        isShared: false
      });
      expect(MongoEmbeddingTrainTask.updateOne).toHaveBeenCalledWith(
        { _id: 'task_123' },
        {
          'checkpoint.data.registering.tunedModelId': 'config_123',
          updateTime: expect.any(Date)
        }
      );

      expect(updatedReloadSystemModel).toHaveBeenCalled();
    });

    test('should verify model type is embedding', async () => {
      const { MongoSystemModel } = await import('@fastgpt/service/core/ai/config/schema');
      const { MongoEmbeddingTrainTask } = await import(
        '@fastgpt/service/core/train/embedding/task/schema'
      );

      (MongoEmbeddingTrainTask.findById as any).mockReturnValue({
        lean: vi.fn().mockResolvedValue({ checkpoint: { data: {} } })
      });
      (MongoSystemModel.create as any).mockResolvedValue({ _id: 'config_type' });

      await createEmbeddingModelConfig({
        name: 'Type Check Model',
        endpoint: {
          base_url: 'http://example.com/v1',
          api_key: 'test-key',
          model: 'type-check-model'
        },
        isActive: true,
        tmbId: 'tmb_test',
        teamId: 'team_test',
        charsPointsPrice: 1,
        taskId: 'task_type'
      });

      const callArgs = (MongoSystemModel.create as any).mock.calls[0];
      expect(callArgs[0].type).toBe('embedding');
    });

    test('should update existing model config from checkpoint model id', async () => {
      const { MongoSystemModel } = await import('@fastgpt/service/core/ai/config/schema');
      const { MongoEmbeddingTrainTask } = await import(
        '@fastgpt/service/core/train/embedding/task/schema'
      );

      (MongoEmbeddingTrainTask.findById as any).mockReturnValue({
        lean: vi.fn().mockResolvedValue({
          checkpoint: { data: { registering: { tunedModelId: 'existing_model_id' } } }
        })
      });
      (MongoSystemModel.findOneAndUpdate as any).mockResolvedValue({ _id: 'existing_model_id' });

      const configId = await createEmbeddingModelConfig({
        name: 'Retry Embedding Model',
        endpoint: {
          base_url: 'http://example.com/v1',
          api_key: 'test-key',
          model: 'retry-model'
        },
        isActive: true,
        tmbId: 'tmb_test',
        teamId: 'team_test',
        taskId: 'task_retry'
      });

      expect(configId).toBe('existing_model_id');
      expect(MongoSystemModel.findOneAndUpdate).toHaveBeenCalledWith(
        { _id: 'existing_model_id' },
        expect.objectContaining({
          model: 'retry-model',
          tmbId: 'tmb_test',
          teamId: 'team_test',
          isShared: false
        }),
        { new: true }
      );
      expect(MongoSystemModel.create).not.toHaveBeenCalled();
      expect(MongoEmbeddingTrainTask.updateOne).not.toHaveBeenCalled();
    });
  });
});

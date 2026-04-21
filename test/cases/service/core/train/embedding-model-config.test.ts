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
    findOneAndUpdate: vi.fn()
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
      const { updatedReloadSystemModel } = await import('@fastgpt/service/core/ai/config/utils');

      // Mock database findOneAndUpdate
      (MongoSystemModel.findOneAndUpdate as any).mockResolvedValue({ _id: 'config_123' });

      const configId = await createEmbeddingModelConfig({
        name: 'Test Embedding Model',
        endpoint: {
          base_url: 'http://192.168.1.100:8080/v1',
          api_key: 'test-api-key',
          model: 'test-model'
        },
        isActive: true,
        charsPointsPrice: 1
      });

      expect(configId).toBe('config_123');
      expect(MongoSystemModel.findOneAndUpdate).toHaveBeenCalledWith(
        { model: 'test-model' },
        {
          model: 'test-model',
          metadata: expect.objectContaining({
            provider: 'aicp',
            model: 'test-model',
            name: 'Test Embedding Model',
            isActive: true,
            isCustom: true,
            isTuned: true,
            type: 'embedding', // Verify type is 'embedding' not 'rerank'
            charsPointsPrice: 1,
            instruction: undefined
          })
        },
        {
          upsert: true,
          new: true
        }
      );

      expect(updatedReloadSystemModel).toHaveBeenCalled();
    });

    test('should verify model type is embedding', async () => {
      const { MongoSystemModel } = await import('@fastgpt/service/core/ai/config/schema');

      (MongoSystemModel.findOneAndUpdate as any).mockResolvedValue({ _id: 'config_type' });

      await createEmbeddingModelConfig({
        name: 'Type Check Model',
        endpoint: {
          base_url: 'http://example.com/v1',
          api_key: 'test-key',
          model: 'type-check-model'
        },
        isActive: true,
        charsPointsPrice: 1
      });

      const callArgs = (MongoSystemModel.findOneAndUpdate as any).mock.calls[0];
      expect(callArgs[1].metadata.type).toBe('embedding');
    });
  });
});

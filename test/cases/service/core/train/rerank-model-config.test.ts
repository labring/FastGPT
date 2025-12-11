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

import { createRerankModelConfig } from '@fastgpt/service/core/train/rerank/model/controller';

describe('Rerank Model Config Controller', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createRerankModelConfig', () => {
    test('应该成功创建rerank模型配置', async () => {
      const { MongoSystemModel } = await import('@fastgpt/service/core/ai/config/schema');
      const { updatedReloadSystemModel } = await import('@fastgpt/service/core/ai/config/utils');

      // Mock database findOneAndUpdate
      (MongoSystemModel.findOneAndUpdate as any).mockResolvedValue({ _id: 'config_123' });

      const configId = await createRerankModelConfig({
        name: 'Test Rerank Model',
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
            name: 'Test Rerank Model',
            isActive: true,
            isCustom: true,
            requestUrl: 'http://192.168.1.100:8080/v1',
            requestAuth: 'test-api-key',
            type: 'rerank',
            charsPointsPrice: 1
          })
        },
        {
          upsert: true,
          new: true
        }
      );

      expect(updatedReloadSystemModel).toHaveBeenCalled();
    });

    test('应该处理空的API密钥', async () => {
      const { MongoSystemModel } = await import('@fastgpt/service/core/ai/config/schema');
      const { updatedReloadSystemModel } = await import('@fastgpt/service/core/ai/config/utils');

      (MongoSystemModel.findOneAndUpdate as any).mockResolvedValue({ _id: 'config_456' });

      await createRerankModelConfig({
        name: 'Simple Model',
        endpoint: {
          base_url: 'http://example.com/v1',
          api_key: '',
          model: 'simple-model'
        },
        isActive: false,
        charsPointsPrice: 2
      });

      expect(MongoSystemModel.findOneAndUpdate).toHaveBeenCalledWith(
        { model: 'simple-model' },
        {
          model: 'simple-model',
          metadata: expect.objectContaining({
            provider: 'aicp',
            model: 'simple-model',
            name: 'Simple Model',
            isActive: false,
            isCustom: true,
            requestUrl: 'http://example.com/v1',
            requestAuth: '',
            type: 'rerank',
            charsPointsPrice: 2
          })
        },
        {
          upsert: true,
          new: true
        }
      );

      expect(updatedReloadSystemModel).toHaveBeenCalled();
    });

    test('应该处理数据库创建错误', async () => {
      const { MongoSystemModel } = await import('@fastgpt/service/core/ai/config/schema');
      const { addLog } = await import('@fastgpt/service/common/system/log');

      (MongoSystemModel.findOneAndUpdate as any).mockRejectedValue(
        new Error('Database connection failed')
      );

      await expect(
        createRerankModelConfig({
          name: 'Error Model',
          endpoint: {
            base_url: 'http://example.com/v1',
            api_key: 'test-key',
            model: 'error-model'
          },
          isActive: true,
          charsPointsPrice: 1
        })
      ).rejects.toThrow('Failed to create rerank model config: Database connection failed');

      expect(addLog.error).toHaveBeenCalledWith(
        'Failed to create rerank model config',
        expect.objectContaining({
          model: 'error-model',
          name: 'Error Model'
        })
      );
    });

    test('应该正确记录创建日志', async () => {
      const { MongoSystemModel } = await import('@fastgpt/service/core/ai/config/schema');
      const { addLog } = await import('@fastgpt/service/common/system/log');
      const { updatedReloadSystemModel } = await import('@fastgpt/service/core/ai/config/utils');

      (MongoSystemModel.findOneAndUpdate as any).mockResolvedValue({ _id: 'config_log' });

      await createRerankModelConfig({
        name: 'Log Test Model',
        endpoint: {
          base_url: 'http://test.com/v1',
          api_key: 'log-key',
          model: 'log-test-model'
        },
        isActive: true,
        charsPointsPrice: 0
      });

      expect(addLog.info).toHaveBeenCalledWith(
        'Created or updated rerank model config in database',
        expect.objectContaining({
          model: 'log-test-model',
          name: 'Log Test Model',
          objectId: 'config_log',
          requestUrl: 'http://test.com/v1',
          isActive: true
        })
      );

      expect(addLog.info).toHaveBeenCalledWith(
        'Reloaded system models after creating rerank model',
        expect.objectContaining({
          model: 'log-test-model',
          objectId: 'config_log'
        })
      );

      expect(updatedReloadSystemModel).toHaveBeenCalled();
    });
  });
});

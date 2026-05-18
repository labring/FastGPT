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

vi.mock('@fastgpt/service/core/train/rerank/task/helpers/channel', () => ({
  createTunedModelChannel: vi.fn().mockResolvedValue(undefined),
  deleteTunedModelChannel: vi.fn().mockResolvedValue(undefined),
  waitForChannelAvailable: vi.fn().mockResolvedValue(undefined)
}));

vi.mock('@fastgpt/service/core/train/rerank/external', () => ({
  deleteSFTModel: vi.fn().mockResolvedValue({ success: true, message: 'Deleted' })
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
        tmbId: 'tmb_test',
        teamId: 'team_test',
        isActive: true,
        charsPointsPrice: 1,
        maxToken: 8192
      });

      expect(configId).toBe('config_123');
      expect(MongoSystemModel.findOneAndUpdate).toHaveBeenCalledWith(
        { model: 'test-model' },
        {
          model: 'test-model',
          tmbId: 'tmb_test',
          teamId: 'team_test',
          isShared: false,
          metadata: expect.objectContaining({
            provider: 'aicp',
            model: 'test-model',
            name: 'Test Rerank Model',
            isActive: true,
            isCustom: true,
            isTuned: true, // Verify isTuned field is set correctly
            type: 'rerank',
            charsPointsPrice: 1,
            maxToken: 8192,
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

    test('应该在创建后调用waitForChannelAvailable进行轮询验证', async () => {
      const { MongoSystemModel } = await import('@fastgpt/service/core/ai/config/schema');
      const { waitForChannelAvailable } = await import(
        '@fastgpt/service/core/train/rerank/task/helpers/channel'
      );

      (MongoSystemModel.findOneAndUpdate as any).mockResolvedValue({ _id: 'config_poll' });

      const endpoint = {
        base_url: 'http://192.168.1.100:8080/v1',
        api_key: 'test-api-key',
        model: 'test-model'
      };

      await createRerankModelConfig({
        name: 'Poll Test Model',
        endpoint,
        isActive: true,
        tmbId: 'tmb_test',
        teamId: 'team_test',
        charsPointsPrice: 1
      });

      expect(waitForChannelAvailable).toHaveBeenCalledWith({
        model: 'test-model',
        endpoint
      });
    });

    test('应该在通道不可用时抛出超时错误', async () => {
      const { MongoSystemModel } = await import('@fastgpt/service/core/ai/config/schema');
      const { waitForChannelAvailable } = await import(
        '@fastgpt/service/core/train/rerank/task/helpers/channel'
      );

      (MongoSystemModel.findOneAndUpdate as any).mockResolvedValue({ _id: 'config_timeout' });
      (waitForChannelAvailable as any).mockRejectedValueOnce(
        new Error(
          'Channel for model "test-model" did not become available within 30 minutes. Last error: connection refused'
        )
      );

      await expect(
        createRerankModelConfig({
          name: 'Timeout Model',
          endpoint: {
            base_url: 'http://example.com/v1',
            api_key: 'test-key',
            model: 'test-model'
          },
          isActive: true,
          tmbId: 'tmb_test',
          teamId: 'team_test',
          charsPointsPrice: 1
        })
      ).rejects.toThrow('did not become available');
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
        tmbId: 'tmb_test',
        teamId: 'team_test',
        charsPointsPrice: 2
      });

      expect(MongoSystemModel.findOneAndUpdate).toHaveBeenCalledWith(
        { model: 'simple-model' },
        {
          model: 'simple-model',
          tmbId: 'tmb_test',
          teamId: 'team_test',
          isShared: false,
          metadata: expect.objectContaining({
            provider: 'aicp',
            model: 'simple-model',
            name: 'Simple Model',
            isActive: false,
            isCustom: true,
            isTuned: true, // Created by training module, should have isTuned flag
            type: 'rerank',
            charsPointsPrice: 2,
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

    test('应该处理数据库创建错误', async () => {
      const { MongoSystemModel } = await import('@fastgpt/service/core/ai/config/schema');

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
          tmbId: 'tmb_test',
          teamId: 'team_test',
          charsPointsPrice: 1
        })
      ).rejects.toThrow('Database connection failed');
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
        tmbId: 'tmb_test',
        teamId: 'team_test',
        charsPointsPrice: 0
      });

      expect(addLog.info).toHaveBeenCalledWith(
        'Created or updated rerank model config',
        expect.objectContaining({
          model: 'log-test-model',
          name: 'Log Test Model',
          objectId: 'config_log',
          isActive: true
        })
      );

      expect(addLog.info).toHaveBeenCalledWith(
        'Reloaded system models',
        expect.objectContaining({
          model: 'log-test-model',
          objectId: 'config_log'
        })
      );

      expect(updatedReloadSystemModel).toHaveBeenCalled();
    });
  });
});

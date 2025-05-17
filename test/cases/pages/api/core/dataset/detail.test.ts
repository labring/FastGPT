import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handler } from '@/pages/api/core/dataset/detail';
import { DatasetStatusEnum, DatasetTypeEnum } from '@fastgpt/global/core/dataset/constants';
import { CommonErrEnum } from '@fastgpt/global/common/error/code/common';

// Mock modules
vi.mock('@fastgpt/service/support/permission/dataset/auth', () => ({
  authDataset: vi.fn()
}));

vi.mock('@fastgpt/service/core/dataset/websiteSync', () => ({
  getWebsiteSyncDatasetStatus: vi.fn()
}));

vi.mock('@fastgpt/service/core/ai/model', () => ({
  getLLMModel: vi.fn(),
  getEmbeddingModel: vi.fn(),
  getVlmModel: vi.fn()
}));

describe('dataset detail handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should reject when dataset id is missing', async () => {
    await expect(
      handler({
        query: { id: '' }
      } as any)
    ).rejects.toBe(CommonErrEnum.missingParams);
  });

  it('should return dataset details for non-website dataset', async () => {
    const mockDataset = {
      id: 'test-id',
      type: DatasetTypeEnum.qaDataset,
      vectorModel: 'test-vector',
      agentModel: 'test-agent',
      vlmModel: 'test-vlm'
    };

    const mockPermission = {
      read: true
    };

    const { authDataset } = await import('@fastgpt/service/support/permission/dataset/auth');
    const { getEmbeddingModel, getLLMModel, getVlmModel } = await import(
      '@fastgpt/service/core/ai/model'
    );

    vi.mocked(authDataset).mockResolvedValue({
      dataset: mockDataset,
      permission: mockPermission
    });

    vi.mocked(getEmbeddingModel).mockReturnValue('mock-vector');
    vi.mocked(getLLMModel).mockReturnValue('mock-llm');
    vi.mocked(getVlmModel).mockReturnValue('mock-vlm');

    const result = await handler({
      query: { id: 'test-id' }
    } as any);

    expect(result).toEqual({
      ...mockDataset,
      status: DatasetStatusEnum.active,
      permission: mockPermission,
      vectorModel: 'mock-vector',
      agentModel: 'mock-llm',
      vlmModel: 'mock-vlm'
    });
  });

  it('should return dataset details for website dataset', async () => {
    const mockDataset = {
      id: 'test-id',
      type: DatasetTypeEnum.websiteDataset,
      vectorModel: 'test-vector',
      agentModel: 'test-agent',
      vlmModel: 'test-vlm',
      apiServer: {
        baseUrl: 'http://test.com',
        basePath: '/api'
      },
      yuqueServer: {
        userId: 'test-user',
        basePath: '/docs'
      },
      feishuServer: {
        appId: 'test-app',
        appSecret: 'secret',
        folderToken: 'token'
      }
    };

    const mockPermission = {
      read: true
    };

    const { authDataset } = await import('@fastgpt/service/support/permission/dataset/auth');
    const { getWebsiteSyncDatasetStatus } = await import(
      '@fastgpt/service/core/dataset/websiteSync'
    );
    const { getEmbeddingModel, getLLMModel, getVlmModel } = await import(
      '@fastgpt/service/core/ai/model'
    );

    vi.mocked(authDataset).mockResolvedValue({
      dataset: mockDataset,
      permission: mockPermission
    });

    vi.mocked(getWebsiteSyncDatasetStatus).mockResolvedValue({
      status: DatasetStatusEnum.syncing,
      errorMsg: 'test error'
    });

    vi.mocked(getEmbeddingModel).mockReturnValue('mock-vector');
    vi.mocked(getLLMModel).mockReturnValue('mock-llm');
    vi.mocked(getVlmModel).mockReturnValue('mock-vlm');

    const result = await handler({
      query: { id: 'test-id' }
    } as any);

    expect(result).toEqual({
      ...mockDataset,
      status: DatasetStatusEnum.syncing,
      errorMsg: 'test error',
      permission: mockPermission,
      vectorModel: 'mock-vector',
      agentModel: 'mock-llm',
      vlmModel: 'mock-vlm',
      apiServer: {
        baseUrl: 'http://test.com',
        authorization: '',
        basePath: '/api'
      },
      yuqueServer: {
        userId: 'test-user',
        token: '',
        basePath: '/docs'
      },
      feishuServer: {
        appId: 'test-app',
        appSecret: '',
        folderToken: 'token'
      }
    });
  });
});

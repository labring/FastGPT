import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApiRequestProps } from '@fastgpt/next/type';
import type {
  TestDocumentParseBody,
  TestDocumentParseResponse
} from '@fastgpt/global/openapi/admin/system/instanceConfig/testDocumentParse';

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  readDomainConfig: vi.fn(),
  testProvider: vi.fn()
}));

vi.mock('@/service/middleware/entry', () => ({ NextAPI: (handler: unknown) => handler }));
vi.mock('@fastgpt/service/support/permission/user/auth', () => ({
  authSystemAdmin: mocks.auth
}));
vi.mock('@fastgpt/service/common/system/systemInstanceConfig/controller', () => ({
  getDomainConfig: mocks.readDomainConfig
}));
vi.mock('@fastgpt/service/common/file/read/testDocumentParse', () => ({
  testDocumentParseProvider: mocks.testProvider
}));

import handler from '@/pages/api/admin/system/config/testDocumentParse';

const call = (body: TestDocumentParseBody) =>
  (
    handler as unknown as (
      request: ApiRequestProps<TestDocumentParseBody>
    ) => Promise<TestDocumentParseResponse>
  )({ body } as ApiRequestProps<TestDocumentParseBody>);

describe('admin testDocumentParse API', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.auth.mockResolvedValue({});
    mocks.readDomainConfig.mockResolvedValue({
      effectiveConfig: {
        documentParse: {
          customPdf: {
            url: 'https://saved-custom.example.com/v2/parse/file',
            key: 'stored-custom-key',
            somarkBaseUrl: 'https://somark.ai/api/v1',
            somarkApiKey: 'stored-somark-key',
            doc2xKey: 'stored-doc2x-key',
            textinAppId: 'stored-textin-app',
            textinSecretCode: 'stored-textin-secret'
          },
          sangfor: {
            url: 'https://saved-sangfor.example.com/parse',
            key: 'stored-sangfor-key'
          }
        }
      }
    });
    mocks.testProvider.mockResolvedValue({
      success: true,
      pages: 1,
      responseTimeMs: 120
    });
  });

  it('requires system administrator authorization before reading stored secrets', async () => {
    mocks.auth.mockRejectedValueOnce(new Error('denied'));
    await expect(call({ provider: 'somark' })).rejects.toThrow('denied');
    expect(mocks.readDomainConfig).not.toHaveBeenCalled();
    expect(mocks.testProvider).not.toHaveBeenCalled();
  });

  it('reuses stored SoMark credential only when target base URL matches or is omitted', async () => {
    await call({ provider: 'somark' });
    expect(mocks.testProvider).toHaveBeenLastCalledWith({
      provider: 'somark',
      somarkBaseUrl: 'https://somark.ai/api/v1',
      somarkApiKey: 'stored-somark-key'
    });

    await call({ provider: 'somark', somarkBaseUrl: 'https://somark.ai/api/v1/' });
    expect(mocks.testProvider).toHaveBeenLastCalledWith({
      provider: 'somark',
      somarkBaseUrl: 'https://somark.ai/api/v1/',
      somarkApiKey: 'stored-somark-key'
    });

    // 目标地址变更但未提供新密钥时，绝不把原服务的已存密钥发往新目标
    await call({ provider: 'somark', somarkBaseUrl: 'https://somark.cn/api/v1' });
    expect(mocks.testProvider).toHaveBeenLastCalledWith({
      provider: 'somark',
      somarkBaseUrl: 'https://somark.cn/api/v1',
      somarkApiKey: ''
    });

    // 目标地址变更且显式提供新密钥时，使用新密钥且无需读库
    mocks.readDomainConfig.mockClear();
    await call({
      provider: 'somark',
      somarkBaseUrl: 'https://somark.cn/api/v1',
      somarkApiKey: 'explicit-cn-key'
    });
    expect(mocks.readDomainConfig).not.toHaveBeenCalled();
    expect(mocks.testProvider).toHaveBeenLastCalledWith({
      provider: 'somark',
      somarkBaseUrl: 'https://somark.cn/api/v1',
      somarkApiKey: 'explicit-cn-key'
    });
  });

  it.each([
    {
      provider: 'customPdf' as const,
      savedUrl: 'https://saved-custom.example.com/v2/parse/file',
      savedKey: 'stored-custom-key'
    },
    {
      provider: 'sangfor' as const,
      savedUrl: 'https://saved-sangfor.example.com/parse',
      savedKey: 'stored-sangfor-key'
    }
  ])(
    'binds $provider URL and key as one credential group and blocks cross-target secret reuse',
    async ({ provider, savedUrl, savedKey }) => {
      // 省略 URL 和 key 时，回读完整原组
      await call({ provider });
      expect(mocks.testProvider).toHaveBeenLastCalledWith({
        provider,
        url: savedUrl,
        key: savedKey
      });

      // URL 未变更时复用已存密钥
      await call({ provider, url: ` ${savedUrl} ` });
      expect(mocks.testProvider).toHaveBeenLastCalledWith({
        provider,
        url: savedUrl,
        key: savedKey
      });

      // URL 变更但未显式传 key 时不附带旧密钥
      await call({ provider, url: 'https://other-host.example.com/parse' });
      expect(mocks.testProvider).toHaveBeenLastCalledWith({
        provider,
        url: 'https://other-host.example.com/parse',
        key: ''
      });

      // 显式传空字符串时不回退已存密钥
      await call({ provider, url: savedUrl, key: '' });
      expect(mocks.testProvider).toHaveBeenLastCalledWith({
        provider,
        url: savedUrl,
        key: ''
      });

      // URL 变更且显式传新密钥时使用新密钥
      await call({ provider, url: 'https://other-host.example.com/parse', key: 'new-key' });
      expect(mocks.testProvider).toHaveBeenLastCalledWith({
        provider,
        url: 'https://other-host.example.com/parse',
        key: 'new-key'
      });
    }
  );

  it('reuses stored credentials for fixed-endpoint Doc2X and TextIn providers', async () => {
    await call({ provider: 'doc2x' });
    expect(mocks.testProvider).toHaveBeenLastCalledWith({
      provider: 'doc2x',
      doc2xKey: 'stored-doc2x-key'
    });

    await call({ provider: 'textln', textinAppId: 'draft-app' });
    expect(mocks.testProvider).toHaveBeenLastCalledWith({
      provider: 'textln',
      textinAppId: 'draft-app',
      textinSecretCode: 'stored-textin-secret'
    });
  });
});

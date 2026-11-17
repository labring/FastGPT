import { afterEach, describe, expect, it, vi } from 'vitest';
import { FASTGPT_PRO_TOKEN_HEADER } from '@fastgpt/global/common/system/constants';
import { createProxyAxios } from '@fastgpt/service/common/api/axios';
import { AxiosHeaders } from 'axios';

const { mockCreateProxyAxios, mockRequest, mockRequestInterceptor } = vi.hoisted(() => ({
  mockCreateProxyAxios: vi.fn(),
  mockRequest: vi.fn(),
  mockRequestInterceptor: vi.fn()
}));
const configuredProToken = 'configured_pro_token_32_chars_min';

vi.mock('@fastgpt/service/common/api/axios', () => ({
  createProxyAxios: mockCreateProxyAxios.mockImplementation(() => ({
    interceptors: {
      request: { use: mockRequestInterceptor },
      response: { use: vi.fn() }
    },
    request: mockRequest
  }))
}));

const importPlusRequest = async () => {
  vi.resetModules();
  mockRequest.mockResolvedValue({
    data: {
      data: { ok: true }
    }
  });
  return import('@fastgpt/service/thirdProvider/fastgptPro/plusRequest');
};

describe('plusRequest', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
    mockCreateProxyAxios.mockClear();
    mockRequest.mockReset();
    mockRequestInterceptor.mockClear();
  });

  it('创建请求实例时默认携带 PRO_TOKEN header', async () => {
    vi.stubEnv('PRO_URL', 'https://pro.example.com');
    vi.stubEnv('PRO_TOKEN', configuredProToken);

    await importPlusRequest();

    expect(createProxyAxios).toHaveBeenCalledWith(
      expect.objectContaining({
        headers: expect.objectContaining({
          'content-type': 'application/json',
          'Cache-Control': 'no-cache',
          [FASTGPT_PRO_TOKEN_HEADER]: configuredProToken
        })
      }),
      false
    );
  });

  it('封装请求会校验内部 Pro 请求配置', async () => {
    vi.stubEnv('PRO_URL', 'https://pro.example.com');
    vi.stubEnv('PRO_TOKEN', configuredProToken);

    const { POST } = await importPlusRequest();

    await POST(
      '/support/test',
      { value: 1 },
      {
        headers: {
          'x-custom-header': 'custom',
          [FASTGPT_PRO_TOKEN_HEADER]: 'caller_token'
        }
      }
    );

    expect(mockRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        baseURL: 'https://pro.example.com/api',
        url: '/support/test',
        headers: expect.objectContaining({
          'x-custom-header': 'custom'
        })
      })
    );
  });

  it('原始 plusRequest 会校验内部 Pro 请求配置', async () => {
    vi.stubEnv('PRO_URL', 'https://pro.example.com');
    vi.stubEnv('PRO_TOKEN', configuredProToken);

    const { plusRequest } = await importPlusRequest();

    await plusRequest({
      url: '/support/raw',
      headers: {
        'x-custom-header': 'custom',
        [FASTGPT_PRO_TOKEN_HEADER]: 'caller_token'
      }
    });

    expect(mockRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        baseURL: 'https://pro.example.com/api',
        url: '/support/raw',
        headers: expect.objectContaining({
          'x-custom-header': 'custom'
        })
      })
    );
  });

  it('Pro 返回 UserError 时转换为 FastGPT UserError', async () => {
    vi.stubEnv('PRO_URL', 'https://pro.example.com');
    vi.stubEnv('PRO_TOKEN', configuredProToken);
    mockRequest.mockResolvedValueOnce({
      data: {
        code: 500,
        message: 'API key has expired',
        errorType: 'UserError'
      }
    });

    const { POST } = await importPlusRequest();
    await expect(POST('/support/test-user-error', {})).rejects.toMatchObject({
      name: 'UserError',
      message: 'API key has expired'
    });
  });

  it('只为有请求上下文且未显式指定语言的内部请求补齐语言头', async () => {
    vi.stubEnv('PRO_URL', 'https://pro.example.com');
    vi.stubEnv('PRO_TOKEN', configuredProToken);
    await importPlusRequest();
    const interceptor = mockRequestInterceptor.mock.calls.at(-1)![0];
    const { createApiI18n } = await import('@fastgpt/service/common/i18n/request');
    const { generatedLoaders } = await import('@fastgpt/web/i18n/resourceLoaders.generated');
    const withI18n = createApiI18n(generatedLoaders);
    const config = { headers: new AxiosHeaders({ 'content-length': '123' }) };
    interceptor(config);
    expect(config.headers.has('content-length')).toBe(false);
    expect(config.headers.has('x-fastgpt-language')).toBe(false);
    await withI18n(
      { req: { headers: { 'x-fastgpt-language': 'zh-CN' } } as any, res: {} as any },
      () => {
        interceptor(config);
        expect(config.headers.get('x-fastgpt-language')).toBe('zh-CN');
        const explicit = { headers: new AxiosHeaders({ 'x-fastgpt-language': 'en' }) };
        interceptor(explicit);
        expect(explicit.headers.get('x-fastgpt-language')).toBe('en');
        const share = { headers: new AxiosHeaders({ 'x-fastgpt-share-language': 'zh-Hant' }) };
        interceptor(share);
        expect(share.headers.has('x-fastgpt-language')).toBe(false);
      }
    );
  });

  it.each(['success-response', 'http-error'])(
    'Pro 已翻译的 UserError 仍保留业务码和展示文案：%s',
    async (transport) => {
      vi.stubEnv('PRO_URL', 'https://pro.example.com');
      vi.stubEnv('PRO_TOKEN', configuredProToken);
      const { POST } = await importPlusRequest();
      const data = {
        code: 401,
        statusText: 'unAuthorization',
        message: '凭证错误',
        data: null,
        errorType: 'UserError'
      };
      if (transport === 'http-error') mockRequest.mockRejectedValueOnce({ response: { data } });
      else mockRequest.mockResolvedValueOnce({ data });
      await expect(POST('/support/user-error', {})).rejects.toMatchObject({
        name: 'UserError',
        message: 'unAuthorization',
        displayMessage: '凭证错误',
        code: 401,
        statusText: 'unAuthorization'
      });
    }
  );
});

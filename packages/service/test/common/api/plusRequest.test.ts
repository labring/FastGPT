import { afterEach, describe, expect, it, vi } from 'vitest';
import { FASTGPT_PRO_TOKEN_HEADER } from '@fastgpt/global/common/system/constants';
import { createProxyAxios } from '@fastgpt/service/common/api/axios';

const { mockCreateProxyAxios, mockRequest } = vi.hoisted(() => ({
  mockCreateProxyAxios: vi.fn(),
  mockRequest: vi.fn()
}));
const configuredProToken = 'configured_pro_token_32_chars_min';

vi.mock('@fastgpt/service/common/api/axios', () => ({
  createProxyAxios: mockCreateProxyAxios.mockImplementation(() => ({
    interceptors: {
      request: { use: vi.fn() },
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
  return import('@fastgpt/service/common/api/plusRequest');
};

describe('plusRequest', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
    mockCreateProxyAxios.mockClear();
    mockRequest.mockReset();
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
    await expect(POST('/support/openapi/authLimit', {})).rejects.toMatchObject({
      name: 'UserError',
      message: 'API key has expired'
    });
  });
});

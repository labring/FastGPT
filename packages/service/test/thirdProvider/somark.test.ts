import FormData from 'form-data';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { postMock, createProxyAxiosMock, mockEnv } = vi.hoisted(() => ({
  postMock: vi.fn(),
  createProxyAxiosMock: vi.fn(() => ({
    post: postMock
  })),
  mockEnv: {
    PARSE_FILE_TIMEOUT_SECONDS: 600
  }
}));

vi.mock('@fastgpt/service/common/api/axios', () => ({
  createProxyAxios: createProxyAxiosMock
}));

vi.mock('@fastgpt/service/env', () => ({
  serviceEnv: mockEnv
}));

const { useSomarkServer } = await import('@fastgpt/service/thirdProvider/somark');

const mockSomarkSuccess = () => {
  postMock.mockResolvedValueOnce({
    data: {
      code: 0,
      message: 'success',
      data: {
        metadata: {
          page_num: 3
        },
        result: {
          outputs: {
            markdown: '# Parsed document'
          }
        }
      }
    }
  });
};

describe('useSomarkServer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEnv.PARSE_FILE_TIMEOUT_SECONDS = 600;
  });

  it('通过同步接口解析 PDF 并返回 Markdown 与页数', async () => {
    mockSomarkSuccess();

    const result = await useSomarkServer({ apiKey: 'sk-test' }).parsePDF(
      Buffer.from('pdf-content')
    );

    expect(result).toEqual({
      pages: 3,
      text: '# Parsed document'
    });
    expect(postMock).toHaveBeenCalledWith(
      '/parse/sync',
      expect.any(FormData),
      expect.objectContaining({
        headers: expect.objectContaining({
          'content-type': expect.stringContaining('multipart/form-data')
        })
      })
    );
    expect(createProxyAxiosMock).toHaveBeenCalledWith(
      expect.objectContaining({
        baseURL: 'https://somark.ai/api/v1',
        timeout: 600000
      }),
      false
    );

    const form = postMock.mock.calls[0][1] as FormData;
    const body = form.getBuffer().toString();
    expect(body).toContain('name="file"; filename="file.pdf"');
    expect(body).toContain('Content-Type: application/pdf');
    expect(body).toContain('name="api_key"');
    expect(body).toContain('sk-test');
    expect(body).toContain('name="output_formats"');
    expect(body).toContain('markdown');
    expect(body).toContain('"image":"url"');
    expect(body).toContain('"formula":"latex"');
    expect(body).toContain('"table":"markdown"');
  });

  it('业务状态码非零时返回原始错误信息（不带厂商前缀）', async () => {
    postMock.mockResolvedValueOnce({
      data: {
        code: 1107,
        message: 'Invalid API Key'
      }
    });

    await expect(
      useSomarkServer({ apiKey: 'invalid-key' }).parsePDF(Buffer.from('pdf-content'))
    ).rejects.toThrow(/^Invalid API Key$/);
  });

  it('成功响应缺少 Markdown 时拒绝结果', async () => {
    postMock.mockResolvedValueOnce({
      data: {
        code: 0,
        data: {
          metadata: {
            page_num: 1
          },
          result: {
            outputs: {}
          }
        }
      }
    });

    await expect(
      useSomarkServer({ apiKey: 'sk-test' }).parsePDF(Buffer.from('pdf-content'))
    ).rejects.toThrow(/^No markdown content in response$/);
  });

  it('成功响应页数无效时拒绝结果', async () => {
    postMock.mockResolvedValueOnce({
      data: {
        code: 0,
        data: {
          metadata: {
            page_num: 0
          },
          result: {
            outputs: {
              markdown: '# Parsed document'
            }
          }
        }
      }
    });

    await expect(
      useSomarkServer({ apiKey: 'sk-test' }).parsePDF(Buffer.from('pdf-content'))
    ).rejects.toThrow(/^Invalid page count in response$/);
  });

  it('支持国内站与自定义 baseUrl 并在空值时回退国际站', async () => {
    mockSomarkSuccess();
    await useSomarkServer({ apiKey: 'sk-cn', baseUrl: 'https://somark.cn/api/v1/' }).parsePDF(
      Buffer.from('pdf-content')
    );
    expect(createProxyAxiosMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ baseURL: 'https://somark.cn/api/v1' }),
      false
    );

    mockSomarkSuccess();
    await useSomarkServer({
      apiKey: 'sk-custom',
      baseUrl: '  https://oxr.internal.example/api/v1/  '
    }).parsePDF(Buffer.from('pdf-content'));
    expect(createProxyAxiosMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ baseURL: 'https://oxr.internal.example/api/v1' }),
      false
    );

    mockSomarkSuccess();
    await useSomarkServer({ apiKey: 'sk-empty', baseUrl: '   ' }).parsePDF(
      Buffer.from('pdf-content')
    );
    expect(createProxyAxiosMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ baseURL: 'https://somark.ai/api/v1' }),
      false
    );
  });

  it('HTTP 请求失败时规范化错误信息', async () => {
    postMock.mockRejectedValueOnce(new Error('network unavailable'));

    await expect(
      useSomarkServer({ apiKey: 'sk-test' }).parsePDF(Buffer.from('pdf-content'))
    ).rejects.toThrow(/^network unavailable$/);
  });
});

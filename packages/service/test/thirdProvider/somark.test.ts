import FormData from 'form-data';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { postMock } = vi.hoisted(() => ({
  postMock: vi.fn()
}));

vi.mock('@fastgpt/service/common/api/axios', () => ({
  createProxyAxios: vi.fn(() => ({
    post: postMock
  }))
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

  it('业务状态码非零时返回带 SoMark 前缀的错误', async () => {
    postMock.mockResolvedValueOnce({
      data: {
        code: 1107,
        message: 'Invalid API Key'
      }
    });

    await expect(
      useSomarkServer({ apiKey: 'invalid-key' }).parsePDF(Buffer.from('pdf-content'))
    ).rejects.toThrow('[SoMark] Invalid API Key');
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
    ).rejects.toThrow('[SoMark] No markdown content in response');
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
    ).rejects.toThrow('[SoMark] Invalid page count in response');
  });

  it('HTTP 请求失败时规范化错误信息', async () => {
    postMock.mockRejectedValueOnce(new Error('network unavailable'));

    await expect(
      useSomarkServer({ apiKey: 'sk-test' }).parsePDF(Buffer.from('pdf-content'))
    ).rejects.toThrow('[SoMark] network unavailable');
  });
});

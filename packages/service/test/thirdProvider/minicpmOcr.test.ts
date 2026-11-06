import FormData from 'form-data';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { postMock, getMock, deleteMock, createProxyAxiosMock, delayMock, timeoutState, mockEnv } =
  vi.hoisted(() => ({
    postMock: vi.fn(),
    getMock: vi.fn(),
    deleteMock: vi.fn(),
    createProxyAxiosMock: vi.fn(),
    delayMock: vi.fn(() => Promise.resolve()),
    timeoutState: {
      value: 600000
    },
    mockEnv: {
      PARSE_FILE_TIMEOUT_SECONDS: 600
    }
  }));

createProxyAxiosMock.mockImplementation(() => ({
  post: postMock,
  get: getMock,
  delete: deleteMock
}));

vi.mock('@fastgpt/service/common/api/axios', () => ({
  createProxyAxios: createProxyAxiosMock
}));

vi.mock('@fastgpt/service/common/file/parseTimeout', () => ({
  getBackendFileOperationTimeoutMs: () => timeoutState.value
}));

vi.mock('@fastgpt/global/common/system/utils', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@fastgpt/global/common/system/utils')>()),
  delay: delayMock
}));

vi.mock('@fastgpt/service/env', () => ({
  serviceEnv: mockEnv
}));

const { useMiniCPMOcrServer } = await import('@fastgpt/service/thirdProvider/minicpmOcr');

const mockSubmit = (jobId = 'job-1') => {
  postMock.mockResolvedValueOnce({
    data: {
      id: jobId,
      status: 'Running'
    }
  });
};

describe('useMiniCPMOcrServer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    timeoutState.value = 600000;
    mockEnv.PARSE_FILE_TIMEOUT_SECONDS = 600;
    deleteMock.mockResolvedValue({ data: {} });
  });

  it('提交任务并轮询到成功后返回 Markdown 与页数', async () => {
    mockSubmit();
    getMock.mockResolvedValueOnce({ data: { status: 'Running' } }).mockResolvedValueOnce({
      data: {
        status: 'Success',
        markdown: '# Parsed document',
        pages_total: 2
      }
    });

    const result = await useMiniCPMOcrServer({ apiKey: 'sk-test' }).parsePDF(
      Buffer.from('pdf-content')
    );

    expect(result).toEqual({
      pages: 2,
      text: '# Parsed document'
    });
    expect(postMock).toHaveBeenCalledWith(
      '/document-parse/jobs',
      expect.any(FormData),
      expect.objectContaining({
        headers: expect.objectContaining({
          'content-type': expect.stringContaining('multipart/form-data')
        })
      })
    );
    expect(getMock).toHaveBeenCalledWith(
      '/document-parse/jobs/job-1',
      expect.objectContaining({ timeout: expect.any(Number) })
    );

    const form = postMock.mock.calls[0][1] as FormData;
    const body = form.getBuffer().toString();
    expect(body).toContain('name="file"; filename="file.pdf"');
    expect(body).toContain('Content-Type: application/pdf');
  });

  it('默认使用国内站地址，并支持自定义服务地址', async () => {
    mockSubmit();
    getMock.mockResolvedValueOnce({
      data: {
        status: 'Success',
        markdown: 'text',
        pages_total: 1
      }
    });

    await useMiniCPMOcrServer({ apiKey: 'sk-test' }).parsePDF(Buffer.from('pdf-content'));

    expect(createProxyAxiosMock).toHaveBeenCalledWith(
      expect.objectContaining({
        baseURL: 'https://api.modelbest.cn/v1',
        headers: { Authorization: 'Bearer sk-test' }
      })
    );

    createProxyAxiosMock.mockClear();
    mockSubmit();
    getMock.mockResolvedValueOnce({
      data: {
        status: 'Success',
        markdown: 'text',
        pages_total: 1
      }
    });

    await useMiniCPMOcrServer({
      apiKey: 'sk-test',
      baseURL: 'https://api.modelbest.ai/v1/'
    }).parsePDF(Buffer.from('pdf-content'));

    expect(createProxyAxiosMock).toHaveBeenCalledWith(
      expect.objectContaining({
        baseURL: 'https://api.modelbest.ai/v1'
      })
    );
  });

  it('缺少顶层 Markdown 时按页拼接内容', async () => {
    mockSubmit();
    getMock.mockResolvedValueOnce({
      data: {
        status: 'Success',
        pages: [
          { choices: [{ message: { content: 'page one' } }] },
          { choices: [{ message: { content: 'page two' } }] }
        ]
      }
    });

    const result = await useMiniCPMOcrServer({ apiKey: 'sk-test' }).parsePDF(
      Buffer.from('pdf-content')
    );

    expect(result).toEqual({
      pages: 2,
      text: 'page one\n\npage two'
    });
  });

  it('删除空图片占位符，避免 FastGPT 展示破图', async () => {
    mockSubmit();
    getMock.mockResolvedValueOnce({
      data: {
        status: 'Success',
        markdown: '![image]()\n\n# Title\n\n![figure]()\n\nBody',
        pages_total: 1
      }
    });

    const result = await useMiniCPMOcrServer({ apiKey: 'sk-test' }).parsePDF(
      Buffer.from('pdf-content')
    );

    expect(result.text).not.toContain('![image]()');
    expect(result.text).not.toContain('![figure]()');
    expect(result.text).toContain('# Title');
    expect(result.text).toContain('Body');
  });

  it('任务失败时返回带 provider 前缀的错误', async () => {
    mockSubmit();
    getMock.mockResolvedValueOnce({
      data: {
        status: 'Failed',
        error: {
          message: 'document parse failed'
        }
      }
    });

    await expect(
      useMiniCPMOcrServer({ apiKey: 'sk-test' }).parsePDF(Buffer.from('pdf-content'))
    ).rejects.toThrow('[MiniCPM-OCR] Job failed: document parse failed');
  });

  it('任务取消时返回带 provider 前缀的错误', async () => {
    mockSubmit();
    getMock.mockResolvedValueOnce({
      data: {
        status: 'Cancelled'
      }
    });

    await expect(
      useMiniCPMOcrServer({ apiKey: 'sk-test' }).parsePDF(Buffer.from('pdf-content'))
    ).rejects.toThrow('[MiniCPM-OCR] Job cancelled: Unknown error');
  });

  it('提交遇到 429 后退避重试并成功', async () => {
    postMock
      .mockRejectedValueOnce({
        response: {
          status: 429,
          headers: {
            'retry-after': '0'
          },
          data: {
            error: {
              message: 'rate limited'
            }
          }
        }
      })
      .mockResolvedValueOnce({
        data: {
          id: 'job-1',
          status: 'Running'
        }
      });
    getMock.mockResolvedValueOnce({
      data: {
        status: 'Success',
        markdown: 'retried submit',
        pages_total: 1
      }
    });

    const result = await useMiniCPMOcrServer({ apiKey: 'sk-test' }).parsePDF(
      Buffer.from('pdf-content')
    );

    expect(result.text).toBe('retried submit');
    expect(postMock).toHaveBeenCalledTimes(2);
    expect(delayMock).toHaveBeenCalled();
  });

  it('提交连续 429 达到上限后返回限流错误', async () => {
    postMock.mockRejectedValue({
      response: {
        status: 429,
        headers: {
          'retry-after': '0'
        },
        data: {
          error: {
            message: 'rate limited'
          }
        }
      }
    });

    await expect(
      useMiniCPMOcrServer({ apiKey: 'sk-test' }).parsePDF(Buffer.from('pdf-content'))
    ).rejects.toThrow('[MiniCPM-OCR] Failed to submit job: rate limited');
    expect(postMock).toHaveBeenCalledTimes(20);
  });

  it('轮询遇到 429 后退避重试并继续同一个任务', async () => {
    mockSubmit();
    getMock
      .mockRejectedValueOnce({
        response: {
          status: 429,
          headers: {
            'retry-after': '0'
          }
        }
      })
      .mockResolvedValueOnce({
        data: {
          status: 'Success',
          markdown: 'retried poll',
          pages_total: 1
        }
      });

    const result = await useMiniCPMOcrServer({ apiKey: 'sk-test' }).parsePDF(
      Buffer.from('pdf-content')
    );

    expect(result.text).toBe('retried poll');
    expect(getMock).toHaveBeenCalledTimes(2);
    expect(getMock).toHaveBeenNthCalledWith(
      1,
      '/document-parse/jobs/job-1',
      expect.objectContaining({ timeout: expect.any(Number) })
    );
    expect(getMock).toHaveBeenNthCalledWith(
      2,
      '/document-parse/jobs/job-1',
      expect.objectContaining({ timeout: expect.any(Number) })
    );
    expect(deleteMock).not.toHaveBeenCalled();
  });

  it('轮询遇到 401 时快速失败，不继续重试', async () => {
    mockSubmit();
    getMock.mockRejectedValueOnce({
      response: {
        status: 401,
        data: {
          error: {
            message: 'invalid api key'
          }
        }
      }
    });

    await expect(
      useMiniCPMOcrServer({ apiKey: 'sk-test' }).parsePDF(Buffer.from('pdf-content'))
    ).rejects.toThrow('[MiniCPM-OCR] Failed to get job: invalid api key');
    expect(getMock).toHaveBeenCalledTimes(1);
  });

  it('Success 但正文块识别失败时拒绝结果', async () => {
    mockSubmit();
    getMock.mockResolvedValueOnce({
      data: {
        status: 'Success',
        markdown: '# Heading',
        pages_total: 1,
        pages: [
          {
            ocr: {
              blocks: [
                { label: 'doc_title', status: 'ok' },
                { label: 'text', status: 'failed' },
                { label: 'table', status: 'failed' }
              ]
            }
          }
        ]
      }
    });

    await expect(
      useMiniCPMOcrServer({ apiKey: 'sk-test' }).parsePDF(Buffer.from('pdf-content'))
    ).rejects.toThrow('[MiniCPM-OCR] Some content blocks failed to parse: text, table');
  });

  it('印章块 failed 时拒绝结果', async () => {
    mockSubmit();
    getMock.mockResolvedValueOnce({
      data: {
        status: 'Success',
        markdown: '# Heading\n\nBody\n\nSeal text',
        pages_total: 1,
        pages: [
          {
            ocr: {
              blocks: [
                { label: 'text', status: 'ok' },
                { label: 'seal', status: 'failed' }
              ]
            }
          }
        ]
      }
    });

    await expect(
      useMiniCPMOcrServer({ apiKey: 'sk-test' }).parsePDF(Buffer.from('pdf-content'))
    ).rejects.toThrow('[MiniCPM-OCR] Some content blocks failed to parse: seal');
  });

  it('印章识别被主动关闭时正常返回', async () => {
    mockSubmit();
    getMock.mockResolvedValueOnce({
      data: {
        status: 'Success',
        markdown: '# Heading\n\nBody',
        pages_total: 1,
        pages: [
          {
            ocr: {
              blocks: [
                { label: 'text', status: 'ok' },
                { label: 'seal', status: 'skipped_seal' }
              ]
            }
          }
        ]
      }
    });

    const result = await useMiniCPMOcrServer({ apiKey: 'sk-test' }).parsePDF(
      Buffer.from('pdf-content')
    );

    expect(result.text).toBe('# Heading\n\nBody');
  });

  it('skipped_no_vlm、skipped_seal 和非正文块失败不阻断解析', async () => {
    mockSubmit();
    getMock.mockResolvedValueOnce({
      data: {
        status: 'Success',
        markdown: '# Heading\n\nBody',
        pages_total: 1,
        pages: [
          {
            ocr: {
              blocks: [
                { label: 'header', status: 'failed' },
                { label: 'image', status: 'skipped_no_vlm' },
                { label: 'seal', status: 'skipped_seal' },
                { label: 'text', status: 'ok' }
              ]
            }
          }
        ]
      }
    });

    const result = await useMiniCPMOcrServer({ apiKey: 'sk-test' }).parsePDF(
      Buffer.from('pdf-content')
    );

    expect(result.text).toBe('# Heading\n\nBody');
  });

  it('提交失败时保留服务端错误信息', async () => {
    postMock.mockRejectedValueOnce({
      response: {
        data: {
          error: {
            message: 'API 密钥无效或已停用'
          }
        }
      }
    });

    await expect(
      useMiniCPMOcrServer({ apiKey: 'invalid-key' }).parsePDF(Buffer.from('pdf-content'))
    ).rejects.toThrow('[MiniCPM-OCR] Failed to submit job: API 密钥无效或已停用');
  });

  it('单次轮询失败后继续重试', async () => {
    mockSubmit();
    getMock.mockRejectedValueOnce(new Error('network unavailable')).mockResolvedValueOnce({
      data: {
        status: 'Success',
        markdown: 'retried text',
        pages_total: 1
      }
    });

    const result = await useMiniCPMOcrServer({ apiKey: 'sk-test' }).parsePDF(
      Buffer.from('pdf-content')
    );

    expect(result.text).toBe('retried text');
    expect(delayMock).toHaveBeenCalled();
  });

  it('成功响应缺少 Markdown 时拒绝结果', async () => {
    mockSubmit();
    getMock.mockResolvedValueOnce({
      data: {
        status: 'Success',
        pages: []
      }
    });

    await expect(
      useMiniCPMOcrServer({ apiKey: 'sk-test' }).parsePDF(Buffer.from('pdf-content'))
    ).rejects.toThrow('[MiniCPM-OCR] No markdown content in response');
  });

  it('成功响应页数无效时拒绝结果', async () => {
    mockSubmit();
    getMock.mockResolvedValueOnce({
      data: {
        status: 'Success',
        markdown: 'text',
        pages_total: 0
      }
    });

    await expect(
      useMiniCPMOcrServer({ apiKey: 'sk-test' }).parsePDF(Buffer.from('pdf-content'))
    ).rejects.toThrow('[MiniCPM-OCR] Invalid page count in response');
  });

  it('轮询超时后取消任务并报错', async () => {
    timeoutState.value = 1;
    mockSubmit();
    getMock.mockResolvedValue({
      data: {
        status: 'Running'
      }
    });

    await expect(
      useMiniCPMOcrServer({ apiKey: 'sk-test' }).parsePDF(Buffer.from('pdf-content'))
    ).rejects.toThrow('[MiniCPM-OCR] Process timeout');
    expect(deleteMock).toHaveBeenCalledWith(
      '/document-parse/jobs/job-1',
      expect.objectContaining({ timeout: expect.any(Number) })
    );
  });
});

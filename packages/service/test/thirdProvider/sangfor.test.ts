import FormData from 'form-data';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { postMock, parseMarkdownImagesMock, uploadParsedPdfImageMock, mockEnv } = vi.hoisted(() => ({
  postMock: vi.fn(),
  parseMarkdownImagesMock: vi.fn(
    async (markdown: string, _options?: Record<string, unknown>) => `normalized:${markdown}`
  ),
  uploadParsedPdfImageMock: vi.fn().mockResolvedValue({ key: 'parsed/image.png' }),
  mockEnv: {
    DOCUMENT_PARSE_PROVIDER: '' as '' | 'sangfor',
    SANGFOR_PARSE_EXTENSIONS: 'pdf',
    SANGFOR_PARSE_TIMEOUT_SECONDS: 600
  }
}));

vi.mock('@fastgpt/service/common/api/axios', () => ({
  axios: {
    post: postMock
  }
}));

vi.mock('@fastgpt/global/common/string/markdown', () => ({
  parseMarkdownBase64Images: parseMarkdownImagesMock
}));

vi.mock('@fastgpt/service/common/file/image/utils', () => ({
  getImageBuffer: vi.fn()
}));

vi.mock('@fastgpt/service/common/file/read/image', () => ({
  uploadParsedPdfImage: uploadParsedPdfImageMock
}));

vi.mock('@fastgpt/service/env', () => ({
  serviceEnv: mockEnv
}));

const { parseFromSangfor, useSangforParse } =
  await import('@fastgpt/service/thirdProvider/sangfor');

describe('Sangfor provider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEnv.DOCUMENT_PARSE_PROVIDER = '';
    mockEnv.SANGFOR_PARSE_EXTENSIONS = 'pdf';
    mockEnv.SANGFOR_PARSE_TIMEOUT_SECONDS = 600;
    vi.stubGlobal('systemEnv', {
      customPdfParse: { url: 'http://sangfor-parser.test/parse', key: 'sangfor-key' }
    });
  });

  afterEach(() => vi.unstubAllGlobals());

  it('requires provider selection, parser URL and a supported extension', () => {
    expect(useSangforParse('pdf')).toBe(false);

    mockEnv.DOCUMENT_PARSE_PROVIDER = 'sangfor';
    expect(useSangforParse('pdf')).toBe(true);
    expect(useSangforParse('docx')).toBe(false);
    expect(useSangforParse('')).toBe(false);

    vi.stubGlobal('systemEnv', { customPdfParse: { key: 'sangfor-key' } });
    expect(useSangforParse('pdf')).toBe(false);
  });

  it('normalizes configured extensions and ignores empty entries', () => {
    mockEnv.DOCUMENT_PARSE_PROVIDER = 'sangfor';
    mockEnv.SANGFOR_PARSE_EXTENSIONS = ' .PDF, DocX, ,pdf ';
    expect(useSangforParse(' .Pdf ')).toBe(true);
    expect(useSangforParse('DOCX')).toBe(true);
    expect(useSangforParse('xlsx')).toBe(false);
    expect(useSangforParse('')).toBe(false);

    mockEnv.SANGFOR_PARSE_EXTENSIONS = ' , ';
    expect(useSangforParse('pdf')).toBe(false);
  });

  it('reads the parser URL and key from systemEnv at parse time', async () => {
    vi.stubGlobal('systemEnv', {
      customPdfParse: { url: 'http://legacy-parser.test/parse', key: 'legacy-key' }
    });
    postMock.mockResolvedValueOnce({ data: { pages: 1, markdown: 'legacy' } });

    await parseFromSangfor({ fileBuffer: Buffer.from('pdf'), extension: 'pdf' });

    expect(postMock).toHaveBeenCalledWith(
      'http://legacy-parser.test/parse',
      expect.any(FormData),
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer legacy-key' })
      })
    );
  });

  it('sends the compatible multipart request and returns normalized content', async () => {
    postMock.mockResolvedValueOnce({
      data: {
        pages: 3,
        markdown: '# Parsed document'
      }
    });

    const result = await parseFromSangfor({
      fileBuffer: Buffer.from('docx-content'),
      extension: 'docx'
    });

    expect(result).toEqual({ pages: 3, text: 'normalized:# Parsed document' });
    expect(postMock).toHaveBeenCalledWith(
      'http://sangfor-parser.test/parse',
      expect.any(FormData),
      expect.objectContaining({
        timeout: 600000,
        headers: expect.objectContaining({
          Authorization: 'Bearer sangfor-key',
          'content-type': expect.stringContaining('multipart/form-data')
        })
      })
    );

    const form = postMock.mock.calls[0][1] as FormData;
    expect(form.getBuffer().toString()).toContain('name="file"; filename="file.docx"');
    expect(parseMarkdownImagesMock).toHaveBeenCalledWith(
      '# Parsed document',
      expect.objectContaining({ parseBase64: true, parseHttp: true })
    );
  });

  it('uses the dedicated Sangfor timeout in seconds', async () => {
    mockEnv.SANGFOR_PARSE_TIMEOUT_SECONDS = 45;
    postMock.mockResolvedValueOnce({ data: { pages: 1, markdown: 'parsed' } });

    await parseFromSangfor({ fileBuffer: Buffer.from('pdf'), extension: 'pdf' });

    expect(postMock).toHaveBeenCalledWith(
      'http://sangfor-parser.test/parse',
      expect.any(FormData),
      expect.objectContaining({ timeout: 45000 })
    );
  });

  it('uploads parsed images inside the provider', async () => {
    postMock.mockResolvedValueOnce({
      data: { pages: 1, markdown: '![image](data:image/png;base64,eA==)' }
    });
    const imageKeyOptions = { prefix: 'dataset/images' };

    await parseFromSangfor({
      fileBuffer: Buffer.from('docx-content'),
      extension: 'docx',
      imageKeyOptions
    });

    const options = parseMarkdownImagesMock.mock.calls[0][1] as {
      controller: (image: Record<string, string>) => Promise<unknown>;
    };
    const controller = options.controller;
    await controller({
      type: 'base64',
      mime: 'image/png',
      base64: 'eA==',
      dataUrl: 'data:image/png;base64,eA=='
    });

    expect(uploadParsedPdfImageMock).toHaveBeenCalledWith(
      {
        type: 'base64',
        mime: 'image/png',
        dataUrl: 'data:image/png;base64,eA=='
      },
      imageKeyOptions
    );
  });

  it('surfaces provider errors with an sangfor prefix', async () => {
    postMock.mockResolvedValueOnce({ data: { error: 'document is unsupported' } });

    await expect(
      parseFromSangfor({
        fileBuffer: Buffer.from('content'),
        extension: 'docx'
      })
    ).rejects.toThrow('[sangfor] document is unsupported');
  });

  it('rejects malformed success responses', async () => {
    postMock.mockResolvedValueOnce({ data: { pages: -1, markdown: 123 } });

    await expect(
      parseFromSangfor({
        fileBuffer: Buffer.from('content'),
        extension: 'pdf'
      })
    ).rejects.toThrow('[sangfor]');
  });

  it('rejects parsing when the provider URL is missing', async () => {
    vi.stubGlobal('systemEnv', {});

    await expect(
      parseFromSangfor({
        fileBuffer: Buffer.from('content'),
        extension: 'docx'
      })
    ).rejects.toThrow('[sangfor] global.systemEnv.customPdfParse.url is required');

    expect(postMock).not.toHaveBeenCalled();
  });
});

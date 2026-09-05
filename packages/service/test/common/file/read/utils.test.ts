import { describe, it, expect, vi, beforeEach } from 'vitest';

// Hoist all mock functions so they're available in vi.mock factories
const {
  mockReadRawContentFromBuffer,
  mockReadRawContentFromSource,
  mockAxiosPost,
  mockSomarkParsePDF,
  mockDoc2xParsePDF,
  mockTextinParsePDF,
  mockUploadImage2S3Bucket,
  mockGetImageBuffer,
  mockCreatePdfParseUsage,
  mockEnv
} = vi.hoisted(() => ({
  mockReadRawContentFromBuffer: vi.fn(async ({ extension, buffer, encoding }: any) => {
    if (extension === 'txt') {
      return {
        rawText: buffer.toString(encoding || 'utf-8'),
        formatText: buffer.toString(encoding || 'utf-8')
      };
    }
    if (extension === 'xlsx') {
      return {
        rawText: 'q,a\nquestion,answer',
        formatText: '| q | a |',
        tableInfo: {
          sheetCount: 1,
          mergedCellCount: 0
        }
      };
    }
    return {
      rawText: `parsed-${extension}-content`,
      formatText: `parsed-${extension}-content`
    };
  }),
  mockReadRawContentFromSource: vi.fn().mockResolvedValue({
    rawText: 'source-content',
    formatText: 'source-content'
  }),
  mockAxiosPost: vi.fn(),
  mockSomarkParsePDF: vi.fn().mockResolvedValue({
    pages: 2,
    text: 'somark-parsed-text'
  }),
  mockDoc2xParsePDF: vi.fn().mockResolvedValue({
    pages: 1,
    text: 'doc2x-parsed-text'
  }),
  mockTextinParsePDF: vi.fn().mockResolvedValue({
    pages: 1,
    text: 'textin-parsed-text'
  }),
  mockUploadImage2S3Bucket: vi.fn().mockResolvedValue('https://s3.example.com/uploaded-image.png'),
  mockGetImageBuffer: vi.fn().mockResolvedValue({
    buffer: Buffer.from('image-bytes'),
    mime: 'image/png'
  }),
  mockCreatePdfParseUsage: vi.fn(),
  mockEnv: {
    PARSE_FILE_TIMEOUT_SECONDS: 600,
    CUSTOM_PARSE_EXTENSIONS: undefined as string | undefined
  }
}));

vi.mock('@fastgpt/service/worker/function', () => ({
  readRawContentFromBuffer: (...args: any[]) => mockReadRawContentFromBuffer(...args),
  readRawContentFromSource: (...args: any[]) => mockReadRawContentFromSource(...args)
}));

vi.mock('@fastgpt/service/common/api/axios', () => ({
  axios: {
    get: vi.fn(),
    post: mockAxiosPost
  }
}));

vi.mock('@fastgpt/service/thirdProvider/doc2x', () => ({
  useDoc2xServer: vi.fn(() => ({
    parsePDF: mockDoc2xParsePDF
  }))
}));

vi.mock('@fastgpt/service/thirdProvider/somark', () => ({
  useSomarkServer: vi.fn(() => ({
    parsePDF: mockSomarkParsePDF
  }))
}));

vi.mock('@fastgpt/service/thirdProvider/textin', () => ({
  useTextinServer: vi.fn(() => ({
    parsePDF: mockTextinParsePDF
  }))
}));

vi.mock('@fastgpt/service/support/wallet/usage/controller', () => ({
  createPdfParseUsage: mockCreatePdfParseUsage
}));

vi.mock('@fastgpt/service/common/s3/utils', () => ({
  uploadImage2S3Bucket: mockUploadImage2S3Bucket
}));

vi.mock('@fastgpt/service/common/file/image/utils', () => ({
  getImageBuffer: mockGetImageBuffer
}));

vi.mock('@fastgpt/service/env', () => ({
  serviceEnv: mockEnv
}));

import {
  readFileContentByBuffer,
  readFileContentBySource
} from '@fastgpt/service/common/file/read/utils';

const teamId = 'test-team-id';
const tmbId = 'test-tmb-id';

describe('readFileContentByBuffer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.systemEnv = {} as any;
    mockEnv.PARSE_FILE_TIMEOUT_SECONDS = 600;
    mockEnv.CUSTOM_PARSE_EXTENSIONS = undefined;
  });

  it('should parse a txt buffer', async () => {
    const buffer = Buffer.from('Hello from buffer');

    const result = await readFileContentByBuffer({
      teamId,
      tmbId,
      extension: 'txt',
      buffer,
      encoding: 'utf-8'
    });

    expect(result.rawText).toBe('Hello from buffer');
    expect(mockReadRawContentFromBuffer).toHaveBeenLastCalledWith(
      expect.objectContaining({
        extension: 'txt'
      })
    );
  });

  it('should preserve table information returned by the readFile worker', async () => {
    const result = await readFileContentByBuffer({
      teamId,
      tmbId,
      extension: 'xlsx',
      buffer: Buffer.from('xlsx-content'),
      encoding: 'utf-8',
      getFormatText: false
    });

    expect(result).toEqual({
      rawText: 'q,a\nquestion,answer',
      tableInfo: {
        sheetCount: 1,
        mergedCellCount: 0
      }
    });
  });

  it('should use system parse for non-pdf files', async () => {
    const buffer = Buffer.from('markdown content');

    const result = await readFileContentByBuffer({
      teamId,
      tmbId,
      extension: 'md',
      buffer,
      encoding: 'utf-8'
    });

    expect(result.rawText).toBe('parsed-md-content');
  });

  it('should use system parse for pdf when customPdfParse is false', async () => {
    const buffer = Buffer.from('pdf content');

    const result = await readFileContentByBuffer({
      teamId,
      tmbId,
      extension: 'pdf',
      buffer,
      encoding: 'utf-8',
      customPdfParse: false
    });

    expect(result.rawText).toBe('parsed-pdf-content');
  });

  it('should use system parse for pdf when customPdfParse is true but no service configured', async () => {
    global.systemEnv = { customPdfParse: {} } as any;

    const buffer = Buffer.from('pdf content');

    const result = await readFileContentByBuffer({
      teamId,
      tmbId,
      extension: 'pdf',
      buffer,
      encoding: 'utf-8',
      customPdfParse: true
    });

    expect(result.rawText).toBe('parsed-pdf-content');
  });

  it('should return formatText when getFormatText is true', async () => {
    const buffer = Buffer.from('content');

    mockReadRawContentFromBuffer.mockResolvedValueOnce({
      rawText: 'raw-text-with-|',
      formatText: '| escaped\\|cell |',
      imageList: []
    });

    const result = await readFileContentByBuffer({
      teamId,
      tmbId,
      extension: 'txt',
      buffer,
      encoding: 'utf-8',
      getFormatText: true
    });

    expect(result.rawText).toBe('| escaped\\|cell |');
  });

  it('should return rawText when getFormatText is false', async () => {
    const buffer = Buffer.from('content');

    const result = await readFileContentByBuffer({
      teamId,
      tmbId,
      extension: 'txt',
      buffer,
      encoding: 'utf-8',
      getFormatText: false
    });

    expect(result.rawText).toBe('content');
  });

  it('should use custom URL service for pdf when configured', async () => {
    mockEnv.PARSE_FILE_TIMEOUT_SECONDS = 1200;
    global.systemEnv = {
      customPdfParse: { url: 'http://custom-pdf-service.com/parse', key: 'test-key' }
    } as any;

    mockAxiosPost.mockResolvedValueOnce({
      data: {
        pages: 3,
        markdown: 'custom-service-parsed-text'
      }
    });

    const buffer = Buffer.from('pdf content');

    const result = await readFileContentByBuffer({
      teamId,
      tmbId,
      extension: 'pdf',
      buffer,
      encoding: 'utf-8',
      customPdfParse: true
    });

    expect(result.rawText).toBe('custom-service-parsed-text');
    expect(mockAxiosPost).toHaveBeenCalledWith(
      'http://custom-pdf-service.com/parse',
      expect.anything(),
      expect.objectContaining({ timeout: 1200000 })
    );
  });

  it('should use custom URL service for docx when extensions list includes docx', async () => {
    mockEnv.CUSTOM_PARSE_EXTENSIONS = 'docx';
    global.systemEnv = {
      customPdfParse: {
        url: 'http://custom-pdf-service.com/parse',
        key: 'test-key'
      }
    } as any;

    mockAxiosPost.mockResolvedValueOnce({
      data: {
        pages: 2,
        markdown: 'custom-service-docx-text'
      }
    });

    const buffer = Buffer.from('docx content');

    const result = await readFileContentByBuffer({
      teamId,
      tmbId,
      extension: 'docx',
      buffer,
      encoding: 'utf-8',
      customPdfParse: true
    });

    expect(result.rawText).toBe('custom-service-docx-text');
    expect(mockAxiosPost).toHaveBeenCalled();
  });

  it('should use original pdf provider chain for pdf not in extensions list', async () => {
    mockEnv.CUSTOM_PARSE_EXTENSIONS = 'docx';
    global.systemEnv = {
      customPdfParse: { somarkApiKey: 'sk-test' }
    } as any;

    const buffer = Buffer.from('pdf content');

    const result = await readFileContentByBuffer({
      teamId,
      tmbId,
      extension: 'pdf',
      buffer,
      encoding: 'utf-8',
      customPdfParse: true
    });

    // pdf 不在扩展名列表中 → 不命中 URL 分支，走原 pdf Provider 链路（Somark 可用）
    expect(result.rawText).toBe('somark-parsed-text');
    expect(mockSomarkParsePDF).toHaveBeenCalled();
  });

  it('should normalize extensions list entries (case/dots/whitespace)', async () => {
    mockEnv.CUSTOM_PARSE_EXTENSIONS = '.DOCX, pptx ';
    global.systemEnv = {
      customPdfParse: {
        url: 'http://custom-pdf-service.com/parse',
        key: 'test-key'
      }
    } as any;

    mockAxiosPost.mockResolvedValueOnce({
      data: {
        pages: 2,
        markdown: 'custom-service-normalized'
      }
    });

    const buffer = Buffer.from('docx content');

    const result = await readFileContentByBuffer({
      teamId,
      tmbId,
      extension: 'docx',
      buffer,
      encoding: 'utf-8',
      customPdfParse: true
    });

    expect(result.rawText).toBe('custom-service-normalized');
    expect(mockAxiosPost).toHaveBeenCalled();
  });

  it('should split comma-separated extensions config', async () => {
    mockEnv.CUSTOM_PARSE_EXTENSIONS = 'docx,pdf';
    global.systemEnv = {
      customPdfParse: {
        url: 'http://custom-pdf-service.com/parse',
        key: 'test-key'
      }
    } as any;

    mockAxiosPost.mockResolvedValueOnce({
      data: {
        pages: 2,
        markdown: 'custom-service-fallback-text'
      }
    });

    const buffer = Buffer.from('pdf content');

    const result = await readFileContentByBuffer({
      teamId,
      tmbId,
      extension: 'pdf',
      buffer,
      encoding: 'utf-8',
      customPdfParse: true
    });

    expect(result.rawText).toBe('custom-service-fallback-text');
    expect(mockAxiosPost).toHaveBeenCalled();
  });

  it('should use URL custom service for listed extension even when customPdfParse flag is false', async () => {
    mockEnv.CUSTOM_PARSE_EXTENSIONS = 'docx';
    global.systemEnv = {
      customPdfParse: {
        url: 'http://custom-pdf-service.com/parse',
        key: 'test-key'
      }
    } as any;

    mockAxiosPost.mockResolvedValueOnce({
      data: {
        pages: 2,
        markdown: 'custom-service-flag-override'
      }
    });

    const buffer = Buffer.from('docx content');

    const result = await readFileContentByBuffer({
      teamId,
      tmbId,
      extension: 'docx',
      buffer,
      encoding: 'utf-8',
      customPdfParse: false
    });

    // extensions 为全局配置：列表内格式即使未勾选增强解析也走 URL 自定义服务
    expect(result.rawText).toBe('custom-service-flag-override');
    expect(mockAxiosPost).toHaveBeenCalled();
  });

  it('should use system parse for docx when only pdf-only provider (somark) is configured', async () => {
    mockEnv.CUSTOM_PARSE_EXTENSIONS = 'docx';
    global.systemEnv = {
      customPdfParse: { somarkApiKey: 'sk-test' }
    } as any;

    const buffer = Buffer.from('docx content');

    const result = await readFileContentByBuffer({
      teamId,
      tmbId,
      extension: 'docx',
      buffer,
      encoding: 'utf-8',
      customPdfParse: true
    });

    expect(result.rawText).toBe('parsed-docx-content');
    expect(mockSomarkParsePDF).not.toHaveBeenCalled();
  });

  it('should use system parse for pdf when extensions configured but only pdf-only provider (somark) is set', async () => {
    mockEnv.CUSTOM_PARSE_EXTENSIONS = 'docx,pdf';
    global.systemEnv = {
      customPdfParse: { somarkApiKey: 'sk-test' }
    } as any;

    const result = await readFileContentByBuffer({
      teamId,
      tmbId,
      extension: 'pdf',
      buffer: Buffer.from('pdf content'),
      encoding: 'utf-8',
      customPdfParse: true
    });

    // 显式配置 extensions 后只走 URL 自定义服务；未配 URL 时回退系统解析，PDF-only Provider 不被调用
    expect(result.rawText).toBe('parsed-pdf-content');
    expect(mockSomarkParsePDF).not.toHaveBeenCalled();
  });

  it('should route pdf to URL custom service when pdf in list and extensions configured', async () => {
    mockEnv.CUSTOM_PARSE_EXTENSIONS = 'pdf';
    global.systemEnv = {
      customPdfParse: {
        url: 'http://custom-pdf-service.com/parse',
        somarkApiKey: 'sk-test'
      }
    } as any;

    mockAxiosPost.mockResolvedValueOnce({
      data: {
        pages: 2,
        markdown: 'custom-service-pdf-in-list'
      }
    });

    const result = await readFileContentByBuffer({
      teamId,
      tmbId,
      extension: 'pdf',
      buffer: Buffer.from('pdf content'),
      encoding: 'utf-8',
      customPdfParse: true
    });

    // extensions 模式下 pdf 也走 URL 自定义服务，而非 Somark
    expect(result.rawText).toBe('custom-service-pdf-in-list');
    expect(mockSomarkParsePDF).not.toHaveBeenCalled();
    expect(mockAxiosPost).toHaveBeenCalled();
  });

  it('should prefer URL custom service over somark for docx in list', async () => {
    mockEnv.CUSTOM_PARSE_EXTENSIONS = 'docx';
    global.systemEnv = {
      customPdfParse: {
        url: 'http://custom-pdf-service.com/parse',
        somarkApiKey: 'sk-test'
      }
    } as any;

    mockAxiosPost.mockResolvedValueOnce({
      data: {
        pages: 2,
        markdown: 'custom-service-url-priority'
      }
    });

    const buffer = Buffer.from('docx content');

    const result = await readFileContentByBuffer({
      teamId,
      tmbId,
      extension: 'docx',
      buffer,
      encoding: 'utf-8',
      customPdfParse: true
    });

    expect(result.rawText).toBe('custom-service-url-priority');
    expect(mockSomarkParsePDF).not.toHaveBeenCalled();
    expect(mockAxiosPost).toHaveBeenCalled();
  });

  it('should report enhanced PDF usage to the caller without creating usage directly', async () => {
    global.systemEnv = {
      customPdfParse: {
        url: 'http://custom-pdf-service.com/parse',
        price: 4
      }
    } as any;
    mockAxiosPost.mockResolvedValueOnce({
      data: {
        pages: 3,
        markdown: 'custom-service-parsed-text'
      }
    });
    const onPdfParseUsage = vi.fn();

    await readFileContentByBuffer({
      teamId,
      tmbId,
      extension: 'pdf',
      buffer: Buffer.from('pdf content'),
      encoding: 'utf-8',
      customPdfParse: true,
      onPdfParseUsage
    });

    expect(onPdfParseUsage).toHaveBeenCalledWith({
      moduleName: 'account_usage:pdf_enhanced_parse',
      totalPoints: 12,
      pages: 3
    });
    expect(mockCreatePdfParseUsage).not.toHaveBeenCalled();
  });

  it('should upload custom URL service base64 and http markdown images with shared handler', async () => {
    global.systemEnv = {
      customPdfParse: { url: 'http://custom-pdf-service.com/parse', key: 'test-key' }
    } as any;
    const expiredTime = new Date('2030-01-01T00:00:00.000Z');
    mockAxiosPost.mockResolvedValueOnce({
      data: {
        pages: 3,
        markdown: [
          'base64 ![b](data:image/png;base64,iVBORw0KGgo=)',
          'http ![h](https://img.example.com/h.png)'
        ].join('\n')
      }
    });
    mockUploadImage2S3Bucket
      .mockResolvedValueOnce('dataset/ds1/file-parsed/base64.png')
      .mockResolvedValueOnce('dataset/ds1/file-parsed/http.png');

    const result = await readFileContentByBuffer({
      teamId,
      tmbId,
      extension: 'pdf',
      buffer: Buffer.from('pdf content'),
      encoding: 'utf-8',
      customPdfParse: true,
      imageKeyOptions: {
        prefix: 'dataset/ds1/file-parsed',
        expiredTime
      }
    });

    expect(mockGetImageBuffer).toHaveBeenCalledWith('https://img.example.com/h.png');
    expect(mockUploadImage2S3Bucket).toHaveBeenNthCalledWith(
      1,
      'private',
      expect.objectContaining({
        base64Img: 'data:image/png;base64,iVBORw0KGgo=',
        uploadKey: expect.stringMatching(/^dataset\/ds1\/file-parsed\/.+\.png$/),
        mimetype: 'image/png',
        filename: expect.stringMatching(/\.png$/),
        expiredTime
      })
    );
    expect(mockUploadImage2S3Bucket).toHaveBeenNthCalledWith(
      2,
      'private',
      expect.objectContaining({
        buffer: Buffer.from('image-bytes'),
        uploadKey: expect.stringMatching(/^dataset\/ds1\/file-parsed\/.+\.png$/),
        mimetype: 'image/png',
        filename: expect.stringMatching(/\.png$/),
        expiredTime
      })
    );
    expect(result.rawText).toContain('![b](dataset/ds1/file-parsed/base64.png)');
    expect(result.rawText).toContain('![h](dataset/ds1/file-parsed/http.png)');
  });

  it('should use textin service for pdf when textinAppId is configured', async () => {
    global.systemEnv = {
      customPdfParse: { textinAppId: 'app-id', textinSecretCode: 'secret' }
    } as any;

    const buffer = Buffer.from('pdf content');

    const result = await readFileContentByBuffer({
      teamId,
      tmbId,
      extension: 'pdf',
      buffer,
      encoding: 'utf-8',
      customPdfParse: true
    });

    expect(result.rawText).toBe('textin-parsed-text');
  });

  it('should use SoMark service for pdf when somarkApiKey is configured', async () => {
    global.systemEnv = {
      customPdfParse: { somarkApiKey: 'sk-test' }
    } as any;

    const result = await readFileContentByBuffer({
      teamId,
      tmbId,
      extension: 'pdf',
      buffer: Buffer.from('pdf content'),
      encoding: 'utf-8',
      customPdfParse: true
    });

    expect(mockSomarkParsePDF).toHaveBeenCalledWith(Buffer.from('pdf content'));
    expect(result.rawText).toBe('somark-parsed-text');
  });

  it('should upload SoMark markdown images with the shared image handler', async () => {
    global.systemEnv = {
      customPdfParse: { somarkApiKey: 'sk-test' }
    } as any;
    mockSomarkParsePDF.mockResolvedValueOnce({
      pages: 2,
      text: 'image ![img](https://somark.ai/image.png)'
    });

    const result = await readFileContentByBuffer({
      teamId,
      tmbId,
      extension: 'pdf',
      buffer: Buffer.from('pdf content'),
      encoding: 'utf-8',
      customPdfParse: true,
      imageKeyOptions: {
        prefix: 'dataset/ds1/file-parsed'
      }
    });

    expect(mockGetImageBuffer).toHaveBeenCalledWith('https://somark.ai/image.png');
    expect(result.rawText).toContain('https://s3.example.com/uploaded-image.png');
  });

  it('should prefer custom URL, SoMark, Textin, and Doc2x in that order', async () => {
    global.systemEnv = {
      customPdfParse: {
        url: 'http://custom-pdf-service.com/parse',
        key: 'custom-key',
        somarkApiKey: 'sk-test',
        textinAppId: 'app-id',
        textinSecretCode: 'secret',
        doc2xKey: 'doc2x-key'
      }
    } as any;
    mockAxiosPost.mockResolvedValueOnce({
      data: {
        pages: 1,
        markdown: 'custom-service-result'
      }
    });

    const customResult = await readFileContentByBuffer({
      teamId,
      tmbId,
      extension: 'pdf',
      buffer: Buffer.from('pdf content'),
      encoding: 'utf-8',
      customPdfParse: true
    });
    expect(customResult.rawText).toBe('custom-service-result');
    expect(mockSomarkParsePDF).not.toHaveBeenCalled();

    const providerConfig = global.systemEnv.customPdfParse!;
    providerConfig.url = undefined;
    const somarkResult = await readFileContentByBuffer({
      teamId,
      tmbId,
      extension: 'pdf',
      buffer: Buffer.from('pdf content'),
      encoding: 'utf-8',
      customPdfParse: true
    });
    expect(somarkResult.rawText).toBe('somark-parsed-text');
    expect(mockTextinParsePDF).not.toHaveBeenCalled();

    providerConfig.somarkApiKey = undefined;
    const textinResult = await readFileContentByBuffer({
      teamId,
      tmbId,
      extension: 'pdf',
      buffer: Buffer.from('pdf content'),
      encoding: 'utf-8',
      customPdfParse: true
    });
    expect(textinResult.rawText).toBe('textin-parsed-text');
    expect(mockDoc2xParsePDF).not.toHaveBeenCalled();

    providerConfig.textinAppId = undefined;
    const doc2xResult = await readFileContentByBuffer({
      teamId,
      tmbId,
      extension: 'pdf',
      buffer: Buffer.from('pdf content'),
      encoding: 'utf-8',
      customPdfParse: true
    });
    expect(doc2xResult.rawText).toBe('doc2x-parsed-text');
  });

  it('should pass Textin image upload handler when imageKeyOptions is provided', async () => {
    global.systemEnv = {
      customPdfParse: { textinAppId: 'app-id', textinSecretCode: 'secret' }
    } as any;
    const expiredTime = new Date('2030-01-01T00:00:00.000Z');

    await readFileContentByBuffer({
      teamId,
      tmbId,
      extension: 'pdf',
      buffer: Buffer.from('pdf content'),
      encoding: 'utf-8',
      customPdfParse: true,
      imageKeyOptions: {
        prefix: 'dataset/ds1/file-parsed',
        expiredTime
      }
    });

    const [, options] = mockTextinParsePDF.mock.calls.at(-1)!;
    expect(options.uploadImage).toBeInstanceOf(Function);

    const uploadResult = await options.uploadImage({
      type: 'base64',
      mime: 'image/png',
      base64: 'iVBORw0KGgo=',
      dataUrl: 'data:image/png;base64,iVBORw0KGgo='
    });

    expect(uploadResult).toEqual({
      key: 'https://s3.example.com/uploaded-image.png'
    });
    expect(mockUploadImage2S3Bucket).toHaveBeenCalledWith('private', {
      base64Img: 'data:image/png;base64,iVBORw0KGgo=',
      uploadKey: expect.stringMatching(/^dataset\/ds1\/file-parsed\/.+\.png$/),
      mimetype: 'image/png',
      filename: expect.stringMatching(/\.png$/),
      expiredTime
    });

    mockUploadImage2S3Bucket.mockClear();
    const httpUploadResult = await options.uploadImage({
      type: 'http',
      url: 'https://textin.example.com/image.png',
      mime: 'image/png',
      buffer: Buffer.from('image-bytes')
    });

    expect(httpUploadResult).toEqual({
      key: 'https://s3.example.com/uploaded-image.png'
    });
    expect(mockUploadImage2S3Bucket).toHaveBeenCalledWith('private', {
      buffer: Buffer.from('image-bytes'),
      uploadKey: expect.stringMatching(/^dataset\/ds1\/file-parsed\/.+\.png$/),
      mimetype: 'image/png',
      filename: expect.stringMatching(/\.png$/),
      expiredTime
    });
  });

  it('should use doc2x service for pdf when doc2xKey is configured', async () => {
    global.systemEnv = {
      customPdfParse: { doc2xKey: 'doc2x-api-key' }
    } as any;

    const buffer = Buffer.from('pdf content');

    const result = await readFileContentByBuffer({
      teamId,
      tmbId,
      extension: 'pdf',
      buffer,
      encoding: 'utf-8',
      customPdfParse: true
    });

    expect(result.rawText).toBe('doc2x-parsed-text');
  });

  it('should pass Doc2x image upload handler when imageKeyOptions is provided', async () => {
    global.systemEnv = {
      customPdfParse: { doc2xKey: 'doc2x-api-key' }
    } as any;
    const expiredTime = new Date('2030-01-01T00:00:00.000Z');

    await readFileContentByBuffer({
      teamId,
      tmbId,
      extension: 'pdf',
      buffer: Buffer.from('pdf content'),
      encoding: 'utf-8',
      customPdfParse: true,
      imageKeyOptions: {
        prefix: 'dataset/ds1/file-parsed',
        expiredTime
      }
    });

    const [, options] = mockDoc2xParsePDF.mock.calls.at(-1)!;
    expect(options.uploadImage).toBeInstanceOf(Function);

    const uploadResult = await options.uploadImage({
      type: 'http',
      url: 'https://doc2x.example.com/image.png',
      mime: 'image/png',
      buffer: Buffer.from('image-bytes')
    });

    expect(uploadResult).toEqual({
      key: 'https://s3.example.com/uploaded-image.png'
    });
    expect(mockUploadImage2S3Bucket).toHaveBeenCalledWith('private', {
      buffer: Buffer.from('image-bytes'),
      uploadKey: expect.stringMatching(/^dataset\/ds1\/file-parsed\/.+\.png$/),
      mimetype: 'image/png',
      filename: expect.stringMatching(/\.png$/),
      expiredTime
    });

    mockUploadImage2S3Bucket.mockClear();
    const base64UploadResult = await options.uploadImage({
      type: 'base64',
      mime: 'image/png',
      base64: 'iVBORw0KGgo=',
      dataUrl: 'data:image/png;base64,iVBORw0KGgo='
    });

    expect(base64UploadResult).toEqual({
      key: 'https://s3.example.com/uploaded-image.png'
    });
    expect(mockUploadImage2S3Bucket).toHaveBeenCalledWith('private', {
      base64Img: 'data:image/png;base64,iVBORw0KGgo=',
      uploadKey: expect.stringMatching(/^dataset\/ds1\/file-parsed\/.+\.png$/),
      mimetype: 'image/png',
      filename: expect.stringMatching(/\.png$/),
      expiredTime
    });
  });

  it('should reject when custom URL service returns error', async () => {
    global.systemEnv = {
      customPdfParse: { url: 'http://custom-pdf-service.com/parse' }
    } as any;

    mockAxiosPost.mockResolvedValueOnce({
      data: {
        pages: 0,
        markdown: '',
        error: 'Parse failed'
      }
    });

    const buffer = Buffer.from('pdf content');

    await expect(
      readFileContentByBuffer({
        teamId,
        tmbId,
        extension: 'pdf',
        buffer,
        encoding: 'utf-8',
        customPdfParse: true
      })
    ).rejects.toBe('Parse failed');
  });

  it('should fallback to system parse when custom URL service url is empty', async () => {
    global.systemEnv = {
      customPdfParse: { url: '' }
    } as any;

    const buffer = Buffer.from('pdf content');

    const result = await readFileContentByBuffer({
      teamId,
      tmbId,
      extension: 'pdf',
      buffer,
      encoding: 'utf-8',
      customPdfParse: true
    });

    expect(result.rawText).toBe('parsed-pdf-content');
  });

  it('should upload custom service markdown base64 images when imageKeyOptions is provided', async () => {
    global.systemEnv = {
      customPdfParse: { url: 'http://custom-pdf-service.com/parse' }
    } as any;
    mockAxiosPost.mockResolvedValueOnce({
      data: {
        pages: 1,
        markdown: 'text with ![img](data:image/png;base64,iVBORw0KGgo=)'
      }
    });

    const result = await readFileContentByBuffer({
      teamId,
      tmbId,
      extension: 'pdf',
      buffer: Buffer.from('pdf content'),
      encoding: 'utf-8',
      customPdfParse: true,
      imageKeyOptions: {
        prefix: 'test/prefix'
      }
    });

    expect(result.rawText).toContain('https://s3.example.com/uploaded-image.png');
    expect(result.rawText).not.toContain('data:image/png;base64');
    expect(mockUploadImage2S3Bucket).toHaveBeenCalledWith(
      'private',
      expect.objectContaining({
        base64Img: 'data:image/png;base64,iVBORw0KGgo=',
        uploadKey: expect.stringMatching(/^test\/prefix\/.+\.png$/),
        mimetype: 'image/png',
        filename: expect.stringMatching(/\.png$/)
      })
    );
  });

  it('should remove custom service markdown base64 images when imageKeyOptions is not provided', async () => {
    global.systemEnv = {
      customPdfParse: { url: 'http://custom-pdf-service.com/parse' }
    } as any;
    mockAxiosPost.mockResolvedValueOnce({
      data: {
        pages: 1,
        markdown: 'text with ![img](data:image/png;base64,iVBORw0KGgo=)'
      }
    });

    const result = await readFileContentByBuffer({
      teamId,
      tmbId,
      extension: 'pdf',
      buffer: Buffer.from('pdf content'),
      encoding: 'utf-8',
      customPdfParse: true
    });

    expect(result.rawText).toBe('text with');
    expect(result.rawText).not.toContain('data:image/png;base64');
  });
  it('应将大写扩展名归一化为小写后再传给解析器（#6996）', async () => {
    const buffer = Buffer.from('pdf content');

    const result = await readFileContentByBuffer({
      teamId,
      tmbId,
      extension: 'PDF',
      buffer,
      encoding: 'utf-8'
    });

    // 解析器应收到小写扩展名，从而命中对应分支而非报 "not supported"
    expect(mockReadRawContentFromBuffer).toHaveBeenLastCalledWith(
      expect.objectContaining({
        extension: 'pdf'
      })
    );
    expect(result.rawText).toBe('parsed-pdf-content');
  });

  it('应将混合大小写扩展名归一化为小写', async () => {
    const buffer = Buffer.from('docx content');

    await readFileContentByBuffer({
      teamId,
      tmbId,
      extension: 'Docx',
      buffer,
      encoding: 'utf-8'
    });

    expect(mockReadRawContentFromBuffer).toHaveBeenLastCalledWith(
      expect.objectContaining({
        extension: 'docx'
      })
    );
  });
});

describe('readFileContentBySource', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.systemEnv = {} as any;
    mockReadRawContentFromSource.mockResolvedValue({
      rawText: 'source-content',
      formatText: 'source-content'
    });
  });

  it('系统解析直接把轻量 source 交给 worker，不在入口提前物化', async () => {
    const source = {
      kind: 's3' as const,
      sizeBytes: 10,
      metadata: { filename: 'file.txt' },
      materialize: vi.fn()
    };

    await expect(readFileContentBySource({ teamId, tmbId, source })).resolves.toEqual({
      rawText: 'source-content',
      tableInfo: undefined
    });
    expect(source.materialize).not.toHaveBeenCalled();
    expect(mockReadRawContentFromSource).toHaveBeenCalledWith({
      source,
      imageKeyOptions: undefined
    });
  });

  it('启用自定义 PDF Provider 时只在调用 Provider 前物化 source', async () => {
    global.systemEnv = {
      customPdfParse: { somarkApiKey: 'key', price: 1 }
    } as any;
    const source = {
      kind: 's3' as const,
      sizeBytes: 3,
      metadata: { filename: 'file.pdf' },
      materialize: vi.fn().mockResolvedValue({
        buffer: Buffer.from('pdf'),
        metadata: { filename: 'file.pdf' }
      })
    };

    await expect(
      readFileContentBySource({ teamId, tmbId, source, customPdfParse: true })
    ).resolves.toMatchObject({ rawText: 'somark-parsed-text' });
    expect(source.materialize).toHaveBeenCalledTimes(1);
    expect(mockReadRawContentFromSource).not.toHaveBeenCalled();
    expect(mockSomarkParsePDF).toHaveBeenCalledWith(Buffer.from('pdf'));
  });
});

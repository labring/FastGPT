import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';

// Hoist all mock functions so they're available in vi.mock factories
const {
  mockReadRawContentFromBuffer,
  mockAxiosPost,
  mockDoc2xParsePDF,
  mockTextinParsePDF,
  mockUploadImage2S3Bucket,
  mockGetImageBuffer
} = vi.hoisted(() => ({
  mockReadRawContentFromBuffer: vi.fn(async ({ extension, buffer, encoding }: any) => {
    if (extension === 'txt') {
      return {
        rawText: buffer.toString(encoding || 'utf-8'),
        formatText: buffer.toString(encoding || 'utf-8')
      };
    }
    return {
      rawText: `parsed-${extension}-content`,
      formatText: `parsed-${extension}-content`
    };
  }),
  mockAxiosPost: vi.fn(),
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
  })
}));

vi.mock('@fastgpt/service/worker/function', () => ({
  readRawContentFromBuffer: (...args: any[]) => mockReadRawContentFromBuffer(...args)
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

vi.mock('@fastgpt/service/thirdProvider/textin', () => ({
  useTextinServer: vi.fn(() => ({
    parsePDF: mockTextinParsePDF
  }))
}));

vi.mock('@fastgpt/service/support/wallet/usage/controller', () => ({
  createPdfParseUsage: vi.fn()
}));

vi.mock('@fastgpt/service/common/s3/utils', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@fastgpt/service/common/s3/utils')>();
  return {
    ...mod,
    uploadImage2S3Bucket: mockUploadImage2S3Bucket
  };
});

vi.mock('@fastgpt/service/common/file/image/utils', () => ({
  getImageBuffer: mockGetImageBuffer
}));

import {
  readRawTextByLocalFile,
  readFileContentByBuffer
} from '@fastgpt/service/common/file/read/utils';

const teamId = 'test-team-id';
const tmbId = 'test-tmb-id';

describe('readRawTextByLocalFile', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fastgpt-read-test-'));
  });

  it('should read a txt file and return its content', async () => {
    const filePath = path.join(tmpDir, 'test.txt');
    fs.writeFileSync(filePath, 'Hello World', 'utf-8');

    const result = await readRawTextByLocalFile({
      teamId,
      tmbId,
      path: filePath,
      encoding: 'utf-8'
    });

    expect(result.rawText).toBe('Hello World');
    expect(mockReadRawContentFromBuffer).toHaveBeenLastCalledWith(
      expect.objectContaining({
        extension: 'txt'
      })
    );
  });

  it('should extract extension from file path', async () => {
    const filePath = path.join(tmpDir, 'document.pdf');
    fs.writeFileSync(filePath, 'fake-pdf-content');

    const result = await readRawTextByLocalFile({
      teamId,
      tmbId,
      path: filePath,
      encoding: 'utf-8'
    });

    expect(result.rawText).toBe('parsed-pdf-content');
  });
});

describe('readFileContentByBuffer', () => {
  beforeEach(() => {
    global.systemEnv = {} as any;
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

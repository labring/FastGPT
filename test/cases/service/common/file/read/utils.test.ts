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
  mockUploadImage2S3Bucket
} = vi.hoisted(() => ({
  mockReadRawContentFromBuffer: vi.fn(async ({ extension, buffer, encoding }: any) => {
    if (extension === 'txt') {
      return {
        rawText: buffer.toString(encoding || 'utf-8'),
        formatText: buffer.toString(encoding || 'utf-8'),
        imageList: []
      };
    }
    return {
      rawText: `parsed-${extension}-content`,
      formatText: `parsed-${extension}-content`,
      imageList: []
    };
  }),
  mockAxiosPost: vi.fn(),
  mockDoc2xParsePDF: vi.fn().mockResolvedValue({
    pages: 1,
    text: 'doc2x-parsed-text',
    imageList: []
  }),
  mockTextinParsePDF: vi.fn().mockResolvedValue({
    pages: 1,
    text: 'textin-parsed-text',
    imageList: []
  }),
  mockUploadImage2S3Bucket: vi.fn().mockResolvedValue('https://s3.example.com/uploaded-image.png')
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

    const result = await readFileContentByBuffer({
      teamId,
      tmbId,
      extension: 'txt',
      buffer,
      encoding: 'utf-8',
      getFormatText: true
    });

    expect(result.rawText).toBeDefined();
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

  it('should process images from parsed document with imageKeyOptions', async () => {
    mockReadRawContentFromBuffer.mockResolvedValueOnce({
      rawText: 'text with ![img](IMAGE_abc123_IMAGE)',
      formatText: 'text with ![img](IMAGE_abc123_IMAGE)',
      imageList: [
        {
          uuid: 'IMAGE_abc123_IMAGE',
          base64: 'iVBORw0KGgo=',
          mime: 'image/png'
        }
      ]
    });

    const buffer = Buffer.from('content with images');

    const result = await readFileContentByBuffer({
      teamId,
      tmbId,
      extension: 'md',
      buffer,
      encoding: 'utf-8',
      imageKeyOptions: {
        prefix: 'test/prefix'
      }
    });

    expect(result.rawText).toContain('https://s3.example.com/uploaded-image.png');
    expect(result.rawText).not.toContain('IMAGE_abc123_IMAGE');
  });

  it('should skip image upload when imageKeyOptions is not provided', async () => {
    mockReadRawContentFromBuffer.mockResolvedValueOnce({
      rawText: 'text with ![img](IMAGE_abc123_IMAGE)',
      formatText: 'text with ![img](IMAGE_abc123_IMAGE)',
      imageList: [
        {
          uuid: 'IMAGE_abc123_IMAGE',
          base64: 'iVBORw0KGgo=',
          mime: 'image/png'
        }
      ]
    });

    const buffer = Buffer.from('content with images');

    const result = await readFileContentByBuffer({
      teamId,
      tmbId,
      extension: 'md',
      buffer,
      encoding: 'utf-8'
    });

    // Without imageKeyOptions, images get empty string replacement
    expect(result.rawText).not.toContain('IMAGE_abc123_IMAGE');
  });
});

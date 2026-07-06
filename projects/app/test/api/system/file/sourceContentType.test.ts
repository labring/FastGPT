import { Readable } from 'node:stream';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import proxyDownloadHandler from '@/pages/api/system/file/download/[token]';
import proxyUploadHandler from '@/pages/api/system/file/upload/[token]';
import legacyFileHandler from '@/pages/api/system/file/[jwt]';
import { resolveS3ProxyErrorResponse } from '@/service/common/s3/proxy';
import { CommonErrEnum } from '@fastgpt/global/common/error/code/common';
import {
  jwtVerifyS3DownloadToken,
  jwtVerifyS3UploadToken,
  verifyToken
} from '@fastgpt/service/common/s3/security/token';
import { getS3DatasetSource } from '@fastgpt/service/common/s3/sources/dataset';
import { getS3ChatSource } from '@fastgpt/service/common/s3/sources/chat';

vi.mock('@fastgpt/service/common/s3/security/token', () => ({
  jwtVerifyS3DownloadToken: vi.fn(),
  jwtVerifyS3UploadToken: vi.fn(),
  verifyToken: vi.fn(),
  isS3ObjectKeyTokenPayload: vi.fn()
}));

vi.mock('@fastgpt/service/common/s3/sources/dataset', () => ({
  getS3DatasetSource: vi.fn()
}));

vi.mock('@fastgpt/service/common/s3/sources/chat', () => ({
  getS3ChatSource: vi.fn()
}));

const makeMockStream = () => {
  const stream = {
    pipe: vi.fn(),
    on: vi.fn(() => stream)
  };
  return stream;
};

const makeMockRes = () => {
  const headers: Record<string, string | number> = {};
  const res = {
    headers,
    statusCode: 200,
    headersSent: false,
    writableFinished: false,
    setHeader: vi.fn((key: string, value: string | number) => {
      headers[key] = value;
    }),
    getHeader: vi.fn((key: string) => headers[key]),
    once: vi.fn(() => res),
    status: vi.fn((statusCode: number) => {
      res.statusCode = statusCode;
      return res;
    }),
    end: vi.fn(() => {
      res.writableFinished = true;
    }),
    json: vi.fn(() => {
      res.writableFinished = true;
    }),
    destroy: vi.fn()
  };
  return res;
};

describe('system file response content type', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (global as any).s3BucketMap = {};
  });

  it('adds utf-8 charset for text files in proxy download mode', async () => {
    const stream = makeMockStream();
    const bucket = {
      getFileStream: vi.fn().mockResolvedValue(stream),
      getFileMetadata: vi.fn().mockResolvedValue({
        filename: 'aaa.md',
        contentType: 'text/markdown',
        contentLength: 32
      })
    };
    (global as any).s3BucketMap = {
      'fastgpt-private': bucket
    };
    vi.mocked(jwtVerifyS3DownloadToken).mockResolvedValue({
      objectKey: 'dataset/team/aaa.md',
      bucketName: 'fastgpt-private',
      type: 'download'
    });

    const req = {
      method: 'GET',
      url: '/api/system/file/download/token',
      headers: {},
      query: { token: 'token' }
    } as any;
    const res = makeMockRes() as any;

    await proxyDownloadHandler(req, res);

    expect(res.headers['Content-Type']).toBe('text/markdown; charset=utf-8');
    expect(res.headers['Content-Length']).toBe(32);
    expect(stream.pipe).toHaveBeenCalledWith(res);
  });

  it('keeps binary content type unchanged in proxy download mode', async () => {
    const stream = makeMockStream();
    const bucket = {
      getFileStream: vi.fn().mockResolvedValue(stream),
      getFileMetadata: vi.fn().mockResolvedValue({
        filename: 'image.png',
        contentType: 'image/png',
        contentLength: 64
      })
    };
    (global as any).s3BucketMap = {
      'fastgpt-private': bucket
    };
    vi.mocked(jwtVerifyS3DownloadToken).mockResolvedValue({
      objectKey: 'dataset/team/image.png',
      bucketName: 'fastgpt-private',
      type: 'download'
    });

    const req = {
      method: 'GET',
      url: '/api/system/file/download/token',
      headers: {},
      query: { token: 'token' }
    } as any;
    const res = makeMockRes() as any;

    await proxyDownloadHandler(req, res);

    expect(res.headers['Content-Type']).toBe('image/png');
  });

  it('maps expected proxy errors without turning them into HTTP 500', () => {
    expect(resolveS3ProxyErrorResponse(CommonErrEnum.unAuthFile)).toEqual({
      httpStatus: 403,
      publicError: CommonErrEnum.unAuthFile
    });
    expect(resolveS3ProxyErrorResponse(new Error('InvalidUploadFileType')).httpStatus).toBe(400);
    expect(resolveS3ProxyErrorResponse(new Error('EntityTooLarge')).httpStatus).toBe(413);
  });

  it('keeps legacy jwt proxy upload mode working through the shared proxy handler', async () => {
    const uploadObject = vi.fn().mockResolvedValue(undefined);
    (global as any).s3BucketMap = {
      'fastgpt-private': {
        client: {
          uploadObject
        }
      }
    };
    vi.mocked(jwtVerifyS3UploadToken).mockResolvedValue({
      objectKey: 'chat/app/user/chat/file.txt',
      bucketName: 'fastgpt-private',
      maxSize: 1024,
      uploadConstraints: {
        defaultContentType: 'text/plain',
        allowedExtensions: ['.txt']
      },
      metadata: {
        originFilename: encodeURIComponent('file.txt')
      },
      type: 'upload'
    });

    const req = {
      method: 'PUT',
      url: '/api/system/file/upload/token',
      headers: { 'content-length': '5' },
      query: { token: 'token' },
      pipe: vi.fn((target) => {
        Readable.from([Buffer.from('hello')]).pipe(target);
        return target;
      })
    } as any;
    const res = makeMockRes() as any;

    await proxyUploadHandler(req, res);

    expect(uploadObject).toHaveBeenCalledWith(
      expect.objectContaining({
        key: 'chat/app/user/chat/file.txt',
        contentType: 'text/plain',
        contentLength: 5
      })
    );
  });

  it('adds utf-8 charset for text files in legacy file entry', async () => {
    const stream = makeMockStream();
    const datasetSource = {
      getFileStream: vi.fn().mockResolvedValue(stream),
      getFileMetadata: vi.fn().mockResolvedValue({
        filename: 'page.html',
        contentType: 'text/html',
        contentLength: 128
      })
    };
    vi.mocked(getS3DatasetSource).mockReturnValue(datasetSource as any);
    vi.mocked(getS3ChatSource).mockReturnValue({} as any);
    vi.mocked(verifyToken).mockResolvedValue({
      objectKey: 'dataset/team/page.html'
    });

    const req = { query: { jwt: 'jwt' } } as any;
    const res = makeMockRes() as any;

    await legacyFileHandler(req, res);

    expect(res.headers['Content-Type']).toBe('text/html; charset=utf-8');
    expect(stream.pipe).toHaveBeenCalledWith(res);
  });
});

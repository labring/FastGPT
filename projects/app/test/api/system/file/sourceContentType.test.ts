import { beforeEach, describe, expect, it, vi } from 'vitest';
import proxyDownloadHandler from '@/pages/api/system/file/download/[token]';
import legacyFileHandler from '@/pages/api/system/file/[jwt]';
import { jwtVerifyS3DownloadToken } from '@fastgpt/service/common/s3/security/token';
import { getS3DatasetSource } from '@fastgpt/service/common/s3/sources/dataset';
import { getS3ChatSource } from '@fastgpt/service/common/s3/sources/chat';
import { jwtVerifyS3ObjectKey } from '@fastgpt/service/common/s3/utils';

vi.mock('@fastgpt/service/common/s3/security/token', () => ({
  jwtVerifyS3DownloadToken: vi.fn()
}));

vi.mock('@fastgpt/service/common/s3/utils', () => ({
  jwtVerifyS3ObjectKey: vi.fn(),
  isS3ObjectKey: vi.fn(
    (key: string | undefined, source: string) =>
      typeof key === 'string' && key.startsWith(`${source}/`)
  )
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
    headersSent: false,
    setHeader: vi.fn((key: string, value: string | number) => {
      headers[key] = value;
    }),
    status: vi.fn(() => res),
    end: vi.fn(),
    json: vi.fn()
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

    const req = { method: 'GET', query: { token: 'token' } } as any;
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

    const req = { method: 'GET', query: { token: 'token' } } as any;
    const res = makeMockRes() as any;

    await proxyDownloadHandler(req, res);

    expect(res.headers['Content-Type']).toBe('image/png');
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
    vi.mocked(jwtVerifyS3ObjectKey).mockResolvedValue({
      objectKey: 'dataset/team/page.html'
    });

    const req = { query: { jwt: 'jwt' } } as any;
    const res = makeMockRes() as any;

    await legacyFileHandler(req, res);

    expect(res.headers['Content-Type']).toBe('text/html; charset=utf-8');
    expect(stream.pipe).toHaveBeenCalledWith(res);
  });
});

import axios from 'axios';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { S3FileUploader } from '@fastgpt/web/common/file/uploader';

const file = new File(['abcdefghij'], 'large.txt', { type: 'text/plain' });
const t = (key: string) => key;

const createUploadParams = (overrides: Record<string, unknown> = {}) => ({
  url: '/api/system/file/u/token',
  uploadMode: 'multipart' as const,
  completeUrl: '/api/system/file/u/token/complete',
  abortUrl: '/api/system/file/u/token/abort',
  file,
  partSize: 4,
  concurrency: 3,
  maxRetry: 1,
  headers: {
    'content-type': 'text/plain'
  },
  t,
  ...overrides
});

describe('S3FileUploader', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('uses single PUT when upload mode is omitted and normalizes progress', async () => {
    const progress: Array<[number, number]> = [];
    const onSuccess = vi.fn();
    const put = vi.spyOn(axios, 'put').mockImplementation(async (_url, _body, config) => {
      config?.onUploadProgress?.({ loaded: 5, total: 10 } as any);
      return { status: 200, data: {} } as any;
    });

    const uploader = new S3FileUploader({
      url: '/api/system/file/u/token',
      file,
      t,
      onProgress: (loaded, total) => progress.push([loaded, total]),
      onSuccess
    });
    await uploader.upload();

    expect(put).toHaveBeenCalledTimes(1);
    expect(put.mock.calls[0]?.[2]).toEqual(
      expect.objectContaining({
        signal: undefined,
        timeout: 5 * 60 * 1000
      })
    );
    expect(progress).toEqual([
      [0, file.size],
      [5, file.size],
      [file.size, file.size]
    ]);
    expect(onSuccess).toHaveBeenCalledTimes(1);
  });

  it('maps single PUT failures through the shared S3 error parser', async () => {
    const put = vi.spyOn(axios, 'put').mockRejectedValue({
      code: 'ECONNABORTED',
      message: 'timeout of 300000ms exceeded'
    });

    const uploader = new S3FileUploader({
      url: '/api/system/file/u/token',
      file,
      maxSize: 100,
      t
    });

    await expect(uploader.upload()).rejects.toBe('common:error:s3_upload_timeout');
    expect(put).toHaveBeenCalledTimes(1);
  });

  it('uploads exact and short final parts, then completes in part order', async () => {
    const put = vi.spyOn(axios, 'put').mockImplementation(
      async (url) =>
        ({
          status: 200,
          data: {
            data: {
              etag: `etag-${new URL(url, 'https://fastgpt.example.com').searchParams.get('partNumber')}`
            }
          }
        }) as any
    );
    const post = vi.spyOn(axios, 'post').mockResolvedValue({ status: 200, data: {} } as any);
    const progress: number[] = [];

    const uploader = new S3FileUploader({
      ...createUploadParams(),
      maxRetry: 0,
      onProgress: (loaded) => progress.push(loaded)
    });
    await uploader.upload();

    expect(put).toHaveBeenCalledTimes(3);
    expect(put.mock.calls.map(([url]) => String(url))).toEqual([
      '/api/system/file/u/token?partNumber=1',
      '/api/system/file/u/token?partNumber=2',
      '/api/system/file/u/token?partNumber=3'
    ]);
    expect((put.mock.calls[0]?.[1] as Blob).size).toBe(4);
    expect((put.mock.calls[1]?.[1] as Blob).size).toBe(4);
    expect((put.mock.calls[2]?.[1] as Blob).size).toBe(2);
    expect(put.mock.calls.every(([, , config]) => config?.timeout === 120 * 1000)).toBe(true);
    expect(post).toHaveBeenCalledWith(
      '/api/system/file/u/token/complete',
      {
        parts: [
          { partNumber: 1, etag: 'etag-1' },
          { partNumber: 2, etag: 'etag-2' },
          { partNumber: 3, etag: 'etag-3' }
        ]
      },
      expect.objectContaining({ timeout: expect.any(Number) })
    );
    expect(post.mock.calls[0]?.[2]?.timeout).toBe(120 * 1000);
    expect(Math.max(...progress)).toBeLessThanOrEqual(file.size);
    expect(progress.at(-1)).toBe(file.size);
  });

  it('adds part number without replacing existing URL query parameters', async () => {
    const put = vi.spyOn(axios, 'put').mockImplementation(
      async (url) =>
        ({
          status: 200,
          data: {
            data: {
              etag: `etag-${new URL(url, 'https://fastgpt.example.com').searchParams.get('partNumber')}`
            }
          }
        }) as any
    );
    vi.spyOn(axios, 'post').mockResolvedValue({ status: 200, data: {} } as any);

    const uploader = new S3FileUploader({
      ...createUploadParams({ url: '/api/system/file/u/token?session=abc' }),
      maxRetry: 0
    });
    await uploader.upload();

    expect(put.mock.calls.map(([url]) => String(url))).toEqual([
      '/api/system/file/u/token?session=abc&partNumber=1',
      '/api/system/file/u/token?session=abc&partNumber=2',
      '/api/system/file/u/token?session=abc&partNumber=3'
    ]);
  });

  it('preserves relative, protocol-relative, and fragment URL forms', async () => {
    const put = vi.spyOn(axios, 'put').mockImplementation(
      async (url) =>
        ({
          status: 200,
          data: { data: { etag: `etag-${String(url)}` } }
        }) as any
    );
    vi.spyOn(axios, 'post').mockResolvedValue({ status: 200, data: {} } as any);

    const relativeUploader = new S3FileUploader({
      ...createUploadParams({
        file: new File(['a'], 'small.txt'),
        partSize: 1,
        concurrency: 1,
        url: 'uploads/token?session=abc#signature'
      }),
      maxRetry: 0
    });
    await relativeUploader.upload();

    const protocolRelativeUploader = new S3FileUploader({
      ...createUploadParams({
        file: new File(['a'], 'small.txt'),
        partSize: 1,
        concurrency: 1,
        url: '//cdn.example.com/token?session=abc'
      }),
      maxRetry: 0
    });
    await protocolRelativeUploader.upload();

    expect(String(put.mock.calls[0]?.[0])).toBe('uploads/token?session=abc&partNumber=1#signature');
    expect(String(put.mock.calls[1]?.[0])).toBe('//cdn.example.com/token?session=abc&partNumber=1');
  });

  it('retries only the failed part and resets its progress before retrying', async () => {
    const attempts = new Map<number, number>();
    const progress: number[] = [];
    const put = vi.spyOn(axios, 'put').mockImplementation(async (url) => {
      const partNumber = Number(
        new URL(url, 'https://fastgpt.example.com').searchParams.get('partNumber')
      );
      const attempt = (attempts.get(partNumber) ?? 0) + 1;
      attempts.set(partNumber, attempt);
      if (partNumber === 2 && attempt === 1) {
        throw new Error('temporary failure');
      }

      return {
        status: 200,
        data: { data: { etag: `etag-${partNumber}` } }
      } as any;
    });
    const post = vi.spyOn(axios, 'post').mockResolvedValue({ status: 200, data: {} } as any);

    const uploader = new S3FileUploader({
      ...createUploadParams(),
      onProgress: (loaded) => progress.push(loaded)
    });
    await uploader.upload();

    expect(put).toHaveBeenCalledTimes(4);
    expect(attempts).toEqual(
      new Map([
        [1, 1],
        [2, 2],
        [3, 1]
      ])
    );
    expect(post).toHaveBeenCalledTimes(1);
    expect(Math.max(...progress)).toBeLessThanOrEqual(file.size);
    expect(progress.at(-1)).toBe(file.size);
  });

  it('aborts the multipart session with an independent request after cancellation', async () => {
    const controller = new AbortController();
    const post = vi.spyOn(axios, 'post').mockResolvedValue({ status: 200, data: {} } as any);
    vi.spyOn(axios, 'put').mockImplementation((_url, _body, config) => {
      return new Promise((_resolve, reject) => {
        config?.signal?.addEventListener(
          'abort',
          () => reject(config.signal?.reason ?? new Error('aborted')),
          { once: true }
        );
      }) as any;
    });

    const uploader = new S3FileUploader({
      ...createUploadParams(),
      signal: controller.signal
    });
    const uploadPromise = uploader.upload();
    controller.abort();

    await expect(uploadPromise).rejects.toMatchObject({ name: 'AbortError' });
    expect(post).toHaveBeenCalledWith(
      '/api/system/file/u/token/abort',
      undefined,
      expect.objectContaining({ timeout: expect.any(Number) })
    );
    expect(post.mock.calls[0]?.[2]).not.toHaveProperty('signal');
  });

  it('aborts the multipart session when complete fails', async () => {
    const put = vi.spyOn(axios, 'put').mockImplementation(async (url) => {
      const partNumber = new URL(url, 'https://fastgpt.example.com').searchParams.get('partNumber');
      return {
        status: 200,
        data: { data: { etag: `etag-${partNumber}` } }
      } as any;
    });
    const post = vi.spyOn(axios, 'post').mockImplementation(async (url) => {
      if (String(url).endsWith('/complete')) {
        throw new Error('complete failed');
      }
      return { status: 200, data: {} } as any;
    });

    const uploader = new S3FileUploader({
      ...createUploadParams(),
      maxRetry: 0
    });

    await expect(uploader.upload()).rejects.toBeTruthy();

    expect(put).toHaveBeenCalledTimes(3);
    expect(post).toHaveBeenCalledTimes(2);
    expect(post.mock.calls[1]?.[0]).toBe('/api/system/file/u/token/abort');
    expect(post.mock.calls[1]?.[2]).not.toHaveProperty('signal');
  });

  it('aborts a presigned multipart session without uploading parts when already cancelled', async () => {
    const controller = new AbortController();
    controller.abort();
    const put = vi.spyOn(axios, 'put');
    const post = vi.spyOn(axios, 'post').mockResolvedValue({ status: 200, data: {} } as any);

    const uploader = new S3FileUploader({
      ...createUploadParams(),
      signal: controller.signal
    });

    await expect(uploader.upload()).rejects.toMatchObject({ name: 'AbortError' });

    expect(put).not.toHaveBeenCalled();
    expect(post).toHaveBeenCalledWith(
      '/api/system/file/u/token/abort',
      undefined,
      expect.objectContaining({ timeout: expect.any(Number) })
    );
    expect(post.mock.calls[0]?.[2]).not.toHaveProperty('signal');
  });

  it('exposes an independent best-effort abort for a presigned multipart session', async () => {
    const post = vi.spyOn(axios, 'post').mockResolvedValue({ status: 200, data: {} } as any);
    const controller = new AbortController();
    controller.abort();
    const uploader = new S3FileUploader({
      ...createUploadParams(),
      signal: controller.signal
    });

    await uploader.abort();

    expect(post).toHaveBeenCalledWith(
      '/api/system/file/u/token/abort',
      undefined,
      expect.objectContaining({ timeout: expect.any(Number) })
    );
    expect(post.mock.calls[0]?.[2]).not.toHaveProperty('signal');
  });

  it('maps non-cancel part failures after abort cleanup', async () => {
    const put = vi.spyOn(axios, 'put').mockRejectedValue(new Error('network failure'));
    const post = vi.spyOn(axios, 'post').mockResolvedValue({ status: 200, data: {} } as any);

    const uploader = new S3FileUploader({
      ...createUploadParams(),
      concurrency: 1,
      maxRetry: 0
    });

    await expect(uploader.upload()).rejects.toBe('common:error:s3_upload_network_error');

    expect(put).toHaveBeenCalledTimes(1);
    expect(post).toHaveBeenCalledTimes(1);
  });

  it('rejects invalid multipart parameters before creating requests', async () => {
    const put = vi.spyOn(axios, 'put');

    const invalidConcurrencyUploader = new S3FileUploader({
      ...createUploadParams(),
      concurrency: 0
    });
    await expect(invalidConcurrencyUploader.upload()).rejects.toThrow(
      'Multipart concurrency must be a positive integer'
    );

    const emptyFileUploader = new S3FileUploader({
      ...createUploadParams({ file: new File([], 'empty.txt') })
    });
    await expect(emptyFileUploader.upload()).rejects.toThrow(
      'Multipart file size must be a positive integer'
    );

    const tooManyPartsUploader = new S3FileUploader({
      ...createUploadParams({
        file: new File(['a'.repeat(10001)], 'too-many-parts.txt'),
        partSize: 1
      })
    });
    await expect(tooManyPartsUploader.upload()).rejects.toThrow(
      'Multipart upload cannot exceed 10000 parts'
    );
    expect(put).not.toHaveBeenCalled();
  });
});

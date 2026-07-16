import { EventEmitter } from 'node:events';
import { PassThrough, Readable, Writable } from 'node:stream';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { handleS3ProxyDownload } from '@/service/common/s3/proxy';

const createRequest = (method = 'GET') =>
  Object.assign(new EventEmitter(), {
    method,
    aborted: false
  }) as any;

const createResponse = () => {
  const headers: Record<string, string | number> = {};
  const chunks: Buffer[] = [];
  const res = new Writable({
    write(chunk, _encoding, callback) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      callback();
    }
  }) as Writable & {
    headers: typeof headers;
    chunks: Buffer[];
    statusCode: number;
    headersSent: boolean;
    setHeader: (key: string, value: string | number) => void;
    status: (statusCode: number) => typeof res;
  };

  Object.assign(res, {
    headers,
    chunks,
    statusCode: 200,
    headersSent: false,
    setHeader(key: string, value: string | number) {
      headers[key] = value;
    },
    status(statusCode: number) {
      res.statusCode = statusCode;
      return res;
    }
  });

  return res;
};

const payload = {
  bucketName: 'fastgpt-private',
  objectKey: 'dataset/team/image.png',
  filename: 'image.png'
};

describe('handleS3ProxyDownload', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.s3BucketMap = {} as any;
  });

  it('streams the complete object and removes request lifecycle listeners', async () => {
    const req = createRequest();
    const res = createResponse();
    const getFileStream = vi.fn().mockResolvedValue(Readable.from([Buffer.from('image-data')]));
    global.s3BucketMap = {
      'fastgpt-private': {
        getFileStream,
        getFileMetadata: vi.fn().mockResolvedValue({
          filename: 'image.png',
          contentType: 'image/png',
          contentLength: 10
        })
      }
    } as any;

    await handleS3ProxyDownload({ req, res: res as any, payload });

    expect(Buffer.concat(res.chunks).toString()).toBe('image-data');
    expect(res.headers['Content-Type']).toBe('image/png');
    expect(getFileStream).toHaveBeenCalledWith(
      payload.objectKey,
      expect.objectContaining({ abortSignal: expect.any(AbortSignal) })
    );
    expect(req.listenerCount('aborted')).toBe(0);
  });

  it('serves HEAD from metadata without creating an object stream', async () => {
    const req = createRequest('HEAD');
    const res = createResponse();
    const getFileStream = vi.fn();
    global.s3BucketMap = {
      'fastgpt-private': {
        getFileStream,
        getFileMetadata: vi.fn().mockResolvedValue({
          filename: 'image.png',
          contentType: 'image/png',
          contentLength: 10
        })
      }
    } as any;

    await handleS3ProxyDownload({ req, res: res as any, payload });

    expect(res.statusCode).toBe(200);
    expect(res.writableEnded).toBe(true);
    expect(getFileStream).not.toHaveBeenCalled();
  });

  it('aborts an S3 request when the client disconnects before the stream is ready', async () => {
    const req = createRequest();
    const res = createResponse();
    let downloadSignal: AbortSignal | undefined;
    const getFileStream = vi.fn((_key, options) => {
      downloadSignal = options.abortSignal;
      return new Promise((_, reject) => {
        options.abortSignal.addEventListener('abort', () => reject(options.abortSignal.reason), {
          once: true
        });
      });
    });
    global.s3BucketMap = {
      'fastgpt-private': {
        getFileStream,
        getFileMetadata: vi.fn().mockResolvedValue({ contentType: 'image/png' })
      }
    } as any;

    const downloadPromise = handleS3ProxyDownload({ req, res: res as any, payload });
    await vi.waitFor(() => expect(downloadSignal).toBeDefined());
    req.aborted = true;
    req.emit('aborted');
    await downloadPromise;

    expect(downloadSignal?.aborted).toBe(true);
    expect(req.listenerCount('aborted')).toBe(0);
  });

  it('destroys the upstream stream when the downstream response closes early', async () => {
    const req = createRequest();
    const res = createResponse();
    const source = new PassThrough();
    let downloadSignal: AbortSignal | undefined;
    global.s3BucketMap = {
      'fastgpt-private': {
        getFileStream: vi.fn(async (_key, options) => {
          downloadSignal = options.abortSignal;
          return source;
        }),
        getFileMetadata: vi.fn().mockResolvedValue({ contentType: 'image/png' })
      }
    } as any;

    const downloadPromise = handleS3ProxyDownload({ req, res: res as any, payload });
    await vi.waitFor(() => expect(downloadSignal).toBeDefined());
    res.destroy();
    await downloadPromise;

    expect(downloadSignal?.aborted).toBe(true);
    expect(source.destroyed).toBe(true);
  });

  it('aborts and destroys an opened stream when metadata loading fails', async () => {
    const req = createRequest();
    const res = createResponse();
    const source = new PassThrough();
    let downloadSignal: AbortSignal | undefined;
    global.s3BucketMap = {
      'fastgpt-private': {
        getFileStream: vi.fn(async (_key, options) => {
          downloadSignal = options.abortSignal;
          return source;
        }),
        getFileMetadata: vi.fn().mockRejectedValue(new Error('metadata failed'))
      }
    } as any;

    await expect(handleS3ProxyDownload({ req, res: res as any, payload })).rejects.toThrow(
      'metadata failed'
    );

    expect(downloadSignal?.aborted).toBe(true);
    expect(source.destroyed).toBe(true);
    expect(req.listenerCount('aborted')).toBe(0);
  });
});

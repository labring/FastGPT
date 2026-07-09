import { Readable } from 'node:stream';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ERROR_RESPONSE } from '@fastgpt/global/common/error/errorCode';
import { CommonErrEnum } from '@fastgpt/global/common/error/code/common';
import { S3ErrEnum } from '@fastgpt/global/common/error/code/s3';
import { parseS3UploadError } from '@fastgpt/global/common/error/s3';
import { jsonRes } from '@fastgpt/service/common/response';
import downloadAccessHandler from '@/pages/api/system/file/d/[signedAlias]';
import uploadAccessHandler from '@/pages/api/system/file/u/[token]';
import {
  createS3DownloadAccessUrl,
  createS3UploadAccessUrl,
  encodeExpiresAtMinute,
  revokeS3UploadSessionToken,
  signS3DownloadAlias
} from '@fastgpt/service/common/s3/accessLink';

const originalStorageEnv = {
  STORAGE_DOWNLOAD_URL_MODE: process.env.STORAGE_DOWNLOAD_URL_MODE,
  STORAGE_DOWNLOAD_REDIRECT_TTL_SECONDS: process.env.STORAGE_DOWNLOAD_REDIRECT_TTL_SECONDS,
  STORAGE_EXTERNAL_ENDPOINT: process.env.STORAGE_EXTERNAL_ENDPOINT,
  STORAGE_S3_CDN_ENDPOINT: process.env.STORAGE_S3_CDN_ENDPOINT
};

const makeMockRes = () => {
  const headers: Record<string, string | number> = {};
  const res = {
    headers,
    statusCode: 200,
    headersSent: false,
    writableFinished: false,
    body: undefined as any,
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
      res.headersSent = true;
    }),
    json: vi.fn((body: any) => {
      res.body = body;
      res.writableFinished = true;
      res.headersSent = true;
      return res;
    }),
    destroy: vi.fn()
  };
  return res;
};

const makeMockStream = () => {
  const stream = {
    pipe: vi.fn(),
    on: vi.fn(() => stream)
  };
  return stream;
};

const createDownloadReq = (signedAlias: string) =>
  ({
    method: 'GET',
    url: `/api/system/file/d/${signedAlias}`,
    headers: {},
    query: { signedAlias }
  }) as any;

const createUploadReq = ({
  token,
  contentLength,
  chunks = []
}: {
  token: string;
  contentLength?: string;
  chunks?: Buffer[];
}) =>
  ({
    method: 'PUT',
    url: `/api/system/file/u/${token}`,
    headers: {
      ...(contentLength ? { 'content-length': contentLength } : {})
    },
    query: { token },
    pipe: vi.fn((target) => {
      Readable.from(chunks).pipe(target);
      return target;
    })
  }) as any;

const getFutureDate = (minutes: number) => new Date(Date.now() + minutes * 60 * 1000);

const extractLastPathSegment = (url: string) => url.split('/').pop() || '';

const buildSignedAlias = ({
  aliasId = 'R7mQG0Yh2kVxP9Za',
  expiresAt = getFutureDate(10)
}: {
  aliasId?: string;
  expiresAt?: Date;
} = {}) => {
  const expMinute36 = encodeExpiresAtMinute(expiresAt);
  const sig = signS3DownloadAlias({ aliasId, expMinute36 });

  return `${aliasId}.${expMinute36}.${sig}`;
};

const createTranslator = () =>
  vi.fn((key: string, params?: Record<string, string>) =>
    params ? `${key}:${JSON.stringify(params)}` : key
  );

const jsonResMockImplementation = (res: any, props: any = {}) => {
  const { code = 200, data = null, error, message = '' } = props;

  if (!error) {
    return res.status(code).json({
      code,
      statusText: '',
      message,
      data
    });
  }

  const errorKey = typeof error === 'string' ? error : error?.message;
  const errorResponse = errorKey ? ERROR_RESPONSE[errorKey] : undefined;
  const httpStatus = (() => {
    if (errorKey === 'EntityTooLarge') return 413;
    if (
      typeof errorResponse?.code === 'number' &&
      errorResponse.code >= 510000 &&
      errorResponse.code < 511000
    ) {
      return 400;
    }
    if (typeof code === 'number' && code >= 400 && code <= 599) return code;
    return 500;
  })();

  return res.status(httpStatus).json({
    code: errorResponse?.code ?? code,
    statusText: errorResponse?.statusText ?? 'error',
    message: message || errorResponse?.message || errorKey || '请求错误',
    data: errorResponse?.data ?? null
  });
};

const setupJsonResMock = (targetJsonRes = jsonRes) => {
  vi.mocked(targetJsonRes).mockImplementation(jsonResMockImplementation);
};

const setupDynamicResponseMock = () => {
  vi.doMock('@fastgpt/service/common/response', () => ({
    jsonRes: vi.fn(jsonResMockImplementation),
    sseErrRes: vi.fn(),
    responseWrite: vi.fn(),
    responseWriteController: vi.fn(),
    responseWriteNodeStatus: vi.fn(),
    processError: vi.fn()
  }));
};

describe('s3 short access link api', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupJsonResMock();
    global.s3BucketMap = {} as any;
  });

  it('returns 403 for expired signed aliases', async () => {
    const signedAlias = buildSignedAlias({ expiresAt: getFutureDate(-10) });
    const res = makeMockRes() as any;

    await downloadAccessHandler(createDownloadReq(signedAlias), res);

    expect(res.statusCode).toBe(403);
    expect(res.body.statusText).toBe(CommonErrEnum.unAuthFile);
  });

  it('returns 403 for tampered signed alias expiry', async () => {
    const aliasId = 'R7mQG0Yh2kVxP9Za';
    const expMinute36 = encodeExpiresAtMinute(getFutureDate(10));
    const sig = signS3DownloadAlias({ aliasId, expMinute36 });
    const tamperedExpMinute36 = (Number.parseInt(expMinute36, 36) + 60).toString(36);
    const res = makeMockRes() as any;

    await downloadAccessHandler(createDownloadReq(`${aliasId}.${tamperedExpMinute36}.${sig}`), res);

    expect(res.statusCode).toBe(403);
    expect(res.body.statusText).toBe(CommonErrEnum.unAuthFile);
  });

  it('returns 403 when the signed alias has no backing document', async () => {
    const res = makeMockRes() as any;

    await downloadAccessHandler(createDownloadReq(buildSignedAlias()), res);

    expect(res.statusCode).toBe(403);
    expect(res.body.statusText).toBe(CommonErrEnum.unAuthFile);
  });

  it('returns 404 when a valid alias points to a missing S3 object', async () => {
    const url = await createS3DownloadAccessUrl({
      bucketName: 'fastgpt-private',
      objectKey: 'dataset/team/missing.png',
      expiredTime: getFutureDate(10),
      filename: 'missing.png'
    });
    const signedAlias = extractLastPathSegment(url);
    global.s3BucketMap = {
      'fastgpt-private': {
        getFileStream: vi.fn().mockResolvedValue(null),
        getFileMetadata: vi.fn().mockResolvedValue(undefined)
      }
    } as any;
    const res = makeMockRes() as any;

    await downloadAccessHandler(createDownloadReq(signedAlias), res);

    expect(res.statusCode).toBe(404);
    expect(res.body.statusText).toBe(CommonErrEnum.fileNotFound);
  });

  it('streams a valid short download alias with S3 metadata headers', async () => {
    const url = await createS3DownloadAccessUrl({
      bucketName: 'fastgpt-private',
      objectKey: 'dataset/team/page.md',
      expiredTime: getFutureDate(10),
      filename: 'page.md'
    });
    const signedAlias = extractLastPathSegment(url);
    const stream = makeMockStream();
    global.s3BucketMap = {
      'fastgpt-private': {
        getFileStream: vi.fn().mockResolvedValue(stream),
        getFileMetadata: vi.fn().mockResolvedValue({
          filename: 'page.md',
          contentType: 'text/markdown',
          contentLength: 5
        })
      }
    } as any;
    const res = makeMockRes() as any;

    await downloadAccessHandler(createDownloadReq(signedAlias), res);

    expect(res.headers['Content-Type']).toBe('text/markdown; charset=utf-8');
    expect(res.headers['Content-Length']).toBe(5);
    expect(stream.pipe).toHaveBeenCalledWith(res);
  });

  it('redirects a valid short download alias to a short-lived presigned S3 URL in short-redirect mode', async () => {
    vi.stubEnv('STORAGE_DOWNLOAD_URL_MODE', 'short-redirect');
    vi.stubEnv('STORAGE_DOWNLOAD_REDIRECT_TTL_SECONDS', '120');
    vi.stubEnv('STORAGE_EXTERNAL_ENDPOINT', 'https://s3.example.com');
    vi.stubEnv('STORAGE_S3_CDN_ENDPOINT', 'https://cdn.example.com/files');
    vi.resetModules();
    setupDynamicResponseMock();

    try {
      const [{ default: redirectDownloadAccessHandler }, { createS3DownloadAccessUrl }] =
        await Promise.all([
          import('@/pages/api/system/file/d/[signedAlias]'),
          import('@fastgpt/service/common/s3/accessLink')
        ]);
      const url = await createS3DownloadAccessUrl({
        bucketName: 'fastgpt-private',
        objectKey: 'dataset/team/page.md',
        expiredTime: getFutureDate(10),
        filename: 'page.md',
        responseContentType: 'text/markdown; charset=utf-8'
      });
      const signedAlias = extractLastPathSegment(url);
      const generatePresignedGetUrl = vi.fn().mockResolvedValue({
        bucket: 'fastgpt-private',
        key: 'dataset/team/page.md',
        url: 'https://s3.example.com/fastgpt-private/dataset/team/page.md?X-Amz-Signature=abc'
      });
      global.s3BucketMap = {
        'fastgpt-private': {
          isObjectExists: vi.fn().mockResolvedValue(true),
          externalClient: {
            generatePresignedGetUrl
          }
        }
      } as any;
      const res = makeMockRes() as any;

      await redirectDownloadAccessHandler(createDownloadReq(signedAlias), res);

      expect(res.statusCode).toBe(302);
      expect(res.headers['Cache-Control']).toBe('no-store');
      expect(res.headers.Location).toBe(
        'https://cdn.example.com/files/fastgpt-private/dataset/team/page.md?X-Amz-Signature=abc'
      );
      expect(generatePresignedGetUrl).toHaveBeenCalledWith({
        key: 'dataset/team/page.md',
        expiredSeconds: 120,
        responseContentType: 'text/markdown; charset=utf-8'
      });
    } finally {
      vi.stubEnv('STORAGE_DOWNLOAD_URL_MODE', originalStorageEnv.STORAGE_DOWNLOAD_URL_MODE);
      vi.stubEnv(
        'STORAGE_DOWNLOAD_REDIRECT_TTL_SECONDS',
        originalStorageEnv.STORAGE_DOWNLOAD_REDIRECT_TTL_SECONDS
      );
      vi.stubEnv('STORAGE_EXTERNAL_ENDPOINT', originalStorageEnv.STORAGE_EXTERNAL_ENDPOINT);
      vi.stubEnv('STORAGE_S3_CDN_ENDPOINT', originalStorageEnv.STORAGE_S3_CDN_ENDPOINT);
      vi.resetModules();
    }
  });

  it('does not generate presigned URLs when a short-redirect alias is invalid or revoked', async () => {
    vi.stubEnv('STORAGE_DOWNLOAD_URL_MODE', 'short-redirect');
    vi.stubEnv('STORAGE_EXTERNAL_ENDPOINT', 'https://s3.example.com');
    vi.resetModules();
    setupDynamicResponseMock();

    try {
      const [
        { default: redirectDownloadAccessHandler },
        {
          createS3DownloadAccessUrl,
          encodeExpiresAtMinute,
          revokeS3DownloadAlias,
          signS3DownloadAlias
        },
        { jsonRes: freshJsonRes }
      ] = await Promise.all([
        import('@/pages/api/system/file/d/[signedAlias]'),
        import('@fastgpt/service/common/s3/accessLink'),
        import('@fastgpt/service/common/response')
      ]);
      setupJsonResMock(freshJsonRes);
      const aliasId = 'R7mQG0Yh2kVxP9Za';
      const expMinute36 = encodeExpiresAtMinute(getFutureDate(10));
      const sig = signS3DownloadAlias({ aliasId, expMinute36 });
      const tamperedExpMinute36 = (Number.parseInt(expMinute36, 36) + 60).toString(36);
      const revokedUrl = await createS3DownloadAccessUrl({
        bucketName: 'fastgpt-private',
        objectKey: 'dataset/team/revoked.md',
        expiredTime: getFutureDate(10),
        filename: 'revoked.md'
      });
      const revokedAlias = extractLastPathSegment(revokedUrl);
      await revokeS3DownloadAlias(revokedAlias.split('.')[0] || '');
      const cases = [
        buildSignedAlias({ expiresAt: getFutureDate(-10) }),
        `${aliasId}.${tamperedExpMinute36}.${sig}`,
        revokedAlias
      ];
      const generatePresignedGetUrl = vi.fn();
      global.s3BucketMap = {
        'fastgpt-private': {
          isObjectExists: vi.fn().mockResolvedValue(true),
          externalClient: {
            generatePresignedGetUrl
          }
        }
      } as any;

      for (const signedAlias of cases) {
        const res = makeMockRes() as any;

        await redirectDownloadAccessHandler(createDownloadReq(signedAlias), res);

        expect(res.statusCode).toBe(403);
        expect(res.body.statusText).toBe(CommonErrEnum.unAuthFile);
      }
      expect(generatePresignedGetUrl).not.toHaveBeenCalled();
    } finally {
      vi.stubEnv('STORAGE_DOWNLOAD_URL_MODE', originalStorageEnv.STORAGE_DOWNLOAD_URL_MODE);
      vi.stubEnv('STORAGE_EXTERNAL_ENDPOINT', originalStorageEnv.STORAGE_EXTERNAL_ENDPOINT);
      vi.resetModules();
    }
  });

  it('returns 403 for missing, expired, or revoked upload tokens', async () => {
    const expiredUrl = await createS3UploadAccessUrl({
      bucketName: 'fastgpt-private',
      objectKey: 'chat/app/user/chat/expired.txt',
      expiredTime: getFutureDate(-10),
      maxSize: 1024,
      uploadConstraints: {
        defaultContentType: 'text/plain'
      }
    });
    const revokedUrl = await createS3UploadAccessUrl({
      bucketName: 'fastgpt-private',
      objectKey: 'chat/app/user/chat/revoked.txt',
      expiredTime: getFutureDate(10),
      maxSize: 1024,
      uploadConstraints: {
        defaultContentType: 'text/plain'
      }
    });
    const cases = [
      'wZ6rm5X4l6Ygm1oDQX8JbA',
      extractLastPathSegment(expiredUrl),
      extractLastPathSegment(revokedUrl)
    ];
    await revokeS3UploadSessionToken(extractLastPathSegment(revokedUrl));

    for (const token of cases) {
      const res = makeMockRes() as any;

      await uploadAccessHandler(createUploadReq({ token, contentLength: '1' }), res);

      expect(res.statusCode).toBe(403);
      expect(res.body.statusText).toBe(CommonErrEnum.unAuthFile);
    }
  });

  it('returns 413 for upload bodies larger than the session max size', async () => {
    const url = await createS3UploadAccessUrl({
      bucketName: 'fastgpt-private',
      objectKey: 'chat/app/user/chat/large.txt',
      expiredTime: getFutureDate(10),
      maxSize: 1,
      uploadConstraints: {
        defaultContentType: 'text/plain'
      }
    });
    const res = makeMockRes() as any;
    global.s3BucketMap = {
      'fastgpt-private': {
        client: {
          uploadObject: vi.fn()
        }
      }
    } as any;

    await uploadAccessHandler(
      createUploadReq({
        token: extractLastPathSegment(url),
        contentLength: '2'
      }),
      res
    );

    const t = createTranslator();
    expect(res.statusCode).toBe(413);
    expect(
      parseS3UploadError({
        t,
        error: { response: { data: res.body } },
        maxSize: 1
      })
    ).toContain('common:error:s3_upload_file_too_large');
  });

  it('returns 400 for upload file type validation errors', async () => {
    const url = await createS3UploadAccessUrl({
      bucketName: 'fastgpt-private',
      objectKey: 'chat/app/user/chat/file.png',
      expiredTime: getFutureDate(10),
      maxSize: 1024,
      uploadConstraints: {
        defaultContentType: 'image/png',
        allowedExtensions: ['.png']
      },
      metadata: {
        originFilename: encodeURIComponent('file.png')
      }
    });
    const uploadObject = vi.fn();
    global.s3BucketMap = {
      'fastgpt-private': {
        client: {
          uploadObject
        }
      }
    } as any;
    const res = makeMockRes() as any;

    await uploadAccessHandler(
      createUploadReq({
        token: extractLastPathSegment(url),
        contentLength: '5',
        chunks: [Buffer.from('hello')]
      }),
      res
    );

    const t = createTranslator();
    expect(res.statusCode).toBe(400);
    expect([S3ErrEnum.invalidUploadFileType, S3ErrEnum.uploadFileTypeMismatch]).toContain(
      res.body.statusText
    );
    expect(
      parseS3UploadError({
        t,
        error: { response: { data: res.body } }
      })
    ).toBe('common:error:s3_upload_invalid_file_type');
    expect(uploadObject).not.toHaveBeenCalled();
  });

  it('uploads a valid short upload session through the proxy handler', async () => {
    const url = await createS3UploadAccessUrl({
      bucketName: 'fastgpt-private',
      objectKey: 'chat/app/user/chat/file.txt',
      expiredTime: getFutureDate(10),
      maxSize: 1024,
      uploadConstraints: {
        defaultContentType: 'text/plain',
        allowedExtensions: ['.txt']
      },
      metadata: {
        originFilename: encodeURIComponent('file.txt')
      }
    });
    const uploadObject = vi.fn().mockResolvedValue(undefined);
    global.s3BucketMap = {
      'fastgpt-private': {
        client: {
          uploadObject
        }
      }
    } as any;

    await uploadAccessHandler(
      createUploadReq({
        token: extractLastPathSegment(url),
        contentLength: '5',
        chunks: [Buffer.from('hello')]
      }),
      makeMockRes() as any
    );

    expect(uploadObject).toHaveBeenCalledWith(
      expect.objectContaining({
        key: 'chat/app/user/chat/file.txt',
        contentType: 'text/plain',
        contentLength: 5,
        metadata: expect.objectContaining({
          originFilename: 'file.txt'
        })
      })
    );
  });

  it('uploads extensionless png content and fixes metadata filename', async () => {
    const pngBuffer = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      'base64'
    );
    const url = await createS3UploadAccessUrl({
      bucketName: 'fastgpt-private',
      objectKey: 'chat/app/user/chat/image',
      expiredTime: getFutureDate(10),
      maxSize: 1024,
      uploadConstraints: {
        defaultContentType: 'application/octet-stream',
        allowedExtensions: ['.png']
      },
      uploadPolicy: {
        defaultContentType: 'application/octet-stream',
        allowedExtensions: ['.png'],
        extensionRules: [
          {
            extension: '.png',
            source: 'builtin',
            verification: 'content'
          }
        ],
        allowMissingExtension: true
      },
      fileHint: {
        filename: 'image'
      },
      metadata: {
        originFilename: encodeURIComponent('image')
      }
    });
    const uploadObject = vi.fn().mockResolvedValue(undefined);
    global.s3BucketMap = {
      'fastgpt-private': {
        client: {
          uploadObject
        }
      }
    } as any;

    await uploadAccessHandler(
      createUploadReq({
        token: extractLastPathSegment(url),
        contentLength: String(pngBuffer.length),
        chunks: [pngBuffer]
      }),
      makeMockRes() as any
    );

    expect(uploadObject).toHaveBeenCalledWith(
      expect.objectContaining({
        key: 'chat/app/user/chat/image',
        contentType: 'image/png',
        metadata: expect.objectContaining({
          originFilename: 'image.png'
        })
      })
    );
  });

  it('uploads declared opaque custom extension content', async () => {
    const body = Buffer.from([0, 1, 2, 3]);
    const url = await createS3UploadAccessUrl({
      bucketName: 'fastgpt-private',
      objectKey: 'chat/app/user/chat/data',
      expiredTime: getFutureDate(10),
      maxSize: 1024,
      uploadConstraints: {
        defaultContentType: 'application/octet-stream',
        allowedExtensions: ['.dat']
      },
      uploadPolicy: {
        defaultContentType: 'application/octet-stream',
        allowedExtensions: ['.dat'],
        extensionRules: [
          {
            extension: '.dat',
            source: 'custom',
            verification: 'opaque'
          }
        ],
        allowMissingExtension: true,
        fallbackExtension: '.dat'
      },
      fileHint: {
        filename: 'data',
        declaredExtension: '.dat',
        source: 'remote-url'
      },
      metadata: {
        originFilename: encodeURIComponent('data')
      }
    });
    const uploadObject = vi.fn().mockResolvedValue(undefined);
    global.s3BucketMap = {
      'fastgpt-private': {
        client: {
          uploadObject
        }
      }
    } as any;

    await uploadAccessHandler(
      createUploadReq({
        token: extractLastPathSegment(url),
        contentLength: String(body.length),
        chunks: [body]
      }),
      makeMockRes() as any
    );

    expect(uploadObject).toHaveBeenCalledWith(
      expect.objectContaining({
        key: 'chat/app/user/chat/data',
        contentType: 'application/octet-stream',
        metadata: expect.objectContaining({
          originFilename: 'data.dat'
        })
      })
    );
  });
});

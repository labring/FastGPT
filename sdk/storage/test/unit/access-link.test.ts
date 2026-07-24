import { describe, expect, it, vi } from 'vitest';
import {
  S3AccessLinkErrCode,
  S3AccessLinkError,
  S3_DOWNLOAD_URL_BATCH_MAX_SIZE,
  createMemoryS3AccessLinkStores,
  createS3AccessLinkCrypto,
  createS3AccessLinkService,
  encodeExpiresAtMinute,
  type S3DownloadAliasStore
} from '../../src/access-link';

const baseNow = new Date('2026-01-01T00:00:00.000Z');
const getFutureDate = (minutes: number) => new Date(baseNow.getTime() + minutes * 60_000);

const createDeterministicService = (
  overrides: Partial<Parameters<typeof createS3AccessLinkService>[0]> = {}
) => {
  const stores = createMemoryS3AccessLinkStores();
  let aliasIdIndex = 0;
  let uploadTokenIndex = 0;
  const aliasIds = ['AliasId12345678', 'AliasId87654321'];
  const uploadTokens = ['UploadToken1234567890AB', 'UploadToken9876543210AB'];

  const service = createS3AccessLinkService({
    secret: 'test-secret',
    routes: {
      buildDownloadUrl: (signedAlias) => `https://file.example.com/d/${signedAlias}`,
      buildUploadUrl: (token) => `https://file.example.com/u/${token}`
    },
    stores: {
      downloadAlias: stores.downloadAliasStore,
      uploadSession: stores.uploadSessionStore
    },
    clock: () => baseNow,
    idGenerator: {
      aliasId: () => aliasIds[aliasIdIndex++] ?? `AliasId${aliasIdIndex}Fallback`,
      uploadToken: () =>
        uploadTokens[uploadTokenIndex++] ?? `UploadToken${uploadTokenIndex}Fallback`
    },
    ...overrides
  });

  return { service, stores };
};

const extractLastPathSegment = (url: string) => url.split('/').at(-1) ?? '';

describe('S3 access link SDK core', () => {
  it('creates stable download URLs backed by one alias record', async () => {
    const { service, stores } = createDeterministicService();
    const params = {
      bucketName: 'private',
      objectKey: 'dataset/team-1/file.png',
      filename: 'file.png',
      responseContentType: 'image/png',
      expiredTime: getFutureDate(10)
    };

    const firstUrl = await service.createDownloadUrl(params);
    const secondUrl = await service.createDownloadUrl(params);

    expect(firstUrl).toBe(secondUrl);
    expect(stores.downloadAliases.size).toBe(1);

    const payload = await service.verifyDownloadAlias(extractLastPathSegment(firstUrl));

    expect(payload).toMatchObject({
      bucketName: 'private',
      objectKey: 'dataset/team-1/file.png',
      filename: 'file.png',
      responseContentType: 'image/png'
    });
    expect(payload.expiresAt).toBeInstanceOf(Date);
  });

  it('batches alias lookup and creation while preserving input order and duplicate URLs', async () => {
    const stores = createMemoryS3AccessLinkStores();
    const findByAliasKeys = vi.fn(stores.downloadAliasStore.findByAliasKeys);
    const createMany = vi.fn(stores.downloadAliasStore.createMany);
    const onDownloadUrlTiming = vi.fn();
    const { service } = createDeterministicService({
      stores: {
        downloadAlias: {
          ...stores.downloadAliasStore,
          findByAliasKeys,
          createMany
        },
        uploadSession: stores.uploadSessionStore
      },
      onDownloadUrlTiming
    });
    const first = {
      bucketName: 'private',
      objectKey: 'dataset/team-1/first.png',
      expiredTime: getFutureDate(10)
    };
    const second = {
      bucketName: 'private',
      objectKey: 'dataset/team-1/second.png',
      expiredTime: getFutureDate(10)
    };

    const urls = await service.createDownloadUrls([first, second, first]);

    expect(urls).toHaveLength(3);
    expect(urls[0]).toBe(urls[2]);
    expect(urls[0]).not.toBe(urls[1]);
    expect(findByAliasKeys).toHaveBeenCalledTimes(1);
    expect(findByAliasKeys.mock.calls[0]?.[0]).toHaveLength(2);
    expect(createMany).toHaveBeenCalledTimes(1);
    expect(createMany.mock.calls[0]?.[0]).toHaveLength(2);
    expect(stores.downloadAliases.size).toBe(2);
    expect(onDownloadUrlTiming).toHaveBeenCalledWith(
      expect.objectContaining({
        inputCount: 3,
        uniqueAliasCount: 2,
        reusedAliasCount: 0,
        createdAliasCount: 2,
        leaseTouchedCount: 0
      })
    );
  });

  it('batch re-queries aliases after a concurrent duplicate insert', async () => {
    const stores = createMemoryS3AccessLinkStores();
    const findByAliasKeys = vi.fn(stores.downloadAliasStore.findByAliasKeys);
    const createMany = vi.fn(async (records) => {
      await stores.downloadAliasStore.createMany(records);
      throw new S3AccessLinkError(S3AccessLinkErrCode.duplicateAliasKey);
    });
    const { service } = createDeterministicService({
      stores: {
        downloadAlias: {
          ...stores.downloadAliasStore,
          findByAliasKeys,
          createMany
        },
        uploadSession: stores.uploadSessionStore
      }
    });

    await expect(
      service.createDownloadUrls([
        {
          bucketName: 'private',
          objectKey: 'dataset/team-1/race.png',
          expiredTime: getFutureDate(10)
        }
      ])
    ).resolves.toHaveLength(1);
    expect(findByAliasKeys).toHaveBeenCalledTimes(2);
    expect(stores.downloadAliases.size).toBe(1);
  });

  it('rejects oversized download URL batches before querying the store', async () => {
    const stores = createMemoryS3AccessLinkStores();
    const findByAliasKeys = vi.fn(stores.downloadAliasStore.findByAliasKeys);
    const { service } = createDeterministicService({
      stores: {
        downloadAlias: {
          ...stores.downloadAliasStore,
          findByAliasKeys
        },
        uploadSession: stores.uploadSessionStore
      }
    });

    await expect(
      service.createDownloadUrls(
        Array.from({ length: S3_DOWNLOAD_URL_BATCH_MAX_SIZE + 1 }, (_, index) => ({
          bucketName: 'private',
          objectKey: `dataset/team-1/${index}.png`,
          expiredTime: getFutureDate(10)
        }))
      )
    ).rejects.toMatchObject({ code: S3AccessLinkErrCode.invalidDownloadBatch });
    expect(findByAliasKeys).not.toHaveBeenCalled();
  });

  it('reports download URL HMAC and store timing without affecting issuance', async () => {
    const onDownloadUrlTiming = vi.fn();
    const { service } = createDeterministicService({ onDownloadUrlTiming });
    const params = {
      bucketName: 'private',
      objectKey: 'dataset/team-1/file.png',
      filename: 'file.png',
      responseContentType: 'image/png',
      expiredTime: getFutureDate(10)
    };

    await service.createDownloadUrl(params);
    await service.createDownloadUrl(params);

    expect(onDownloadUrlTiming).toHaveBeenCalledTimes(2);
    expect(onDownloadUrlTiming).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        aliasReused: false,
        duplicateAliasRetry: false,
        leaseTouched: false,
        totalDurationMs: expect.any(Number),
        hmacDurationMs: expect.any(Number),
        storeIoDurationMs: expect.any(Number),
        storeTouchLeaseDurationMs: 0
      })
    );
    expect(onDownloadUrlTiming).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        aliasReused: true,
        duplicateAliasRetry: false,
        leaseTouched: false,
        storeCreateDurationMs: 0,
        storeTouchLeaseDurationMs: 0
      })
    );
  });

  it('refreshes an alias lease only when it approaches the requested expiry', async () => {
    const stores = createMemoryS3AccessLinkStores();
    const touchLeases = vi.fn(stores.downloadAliasStore.touchLeases);
    const onDownloadUrlTiming = vi.fn();
    let now = new Date(baseNow);
    const { service } = createDeterministicService({
      clock: () => now,
      stores: {
        downloadAlias: {
          ...stores.downloadAliasStore,
          touchLeases
        },
        uploadSession: stores.uploadSessionStore
      },
      onDownloadUrlTiming
    });
    const params = {
      bucketName: 'private',
      objectKey: 'dataset/team-1/file.png'
    };

    await service.createDownloadUrl({
      ...params,
      expiredTime: new Date(now.getTime() + 10 * 60_000)
    });
    await service.createDownloadUrl({
      ...params,
      expiredTime: new Date(now.getTime() + 10 * 60_000)
    });

    expect(touchLeases).not.toHaveBeenCalled();

    now = new Date(baseNow.getTime() + 23 * 60 * 60_000);
    await service.createDownloadUrl({
      ...params,
      expiredTime: new Date(now.getTime() + 10 * 60_000)
    });

    expect(touchLeases).toHaveBeenCalledTimes(1);
    expect(touchLeases.mock.calls[0]?.[0]).toHaveLength(1);
    expect(onDownloadUrlTiming).toHaveBeenLastCalledWith(
      expect.objectContaining({
        aliasReused: true,
        leaseTouched: true,
        storeTouchLeaseDurationMs: expect.any(Number)
      })
    );
  });

  it('does not fail download URL issuance when the timing callback throws', async () => {
    const { service } = createDeterministicService({
      onDownloadUrlTiming: () => {
        throw new Error('telemetry unavailable');
      }
    });

    await expect(
      service.createDownloadUrl({
        bucketName: 'private',
        objectKey: 'dataset/team-1/file.png',
        expiredTime: getFutureDate(10)
      })
    ).resolves.toContain('https://file.example.com/d/');
  });

  it('rejects expired download aliases before querying the store', async () => {
    const findByAliasId = vi.fn<S3DownloadAliasStore['findByAliasId']>();
    const stores = createMemoryS3AccessLinkStores();
    const crypto = createS3AccessLinkCrypto({ secret: 'test-secret' });
    const aliasId = 'AliasId12345678';
    const expMinute36 = encodeExpiresAtMinute(getFutureDate(-10));
    const signedAlias = `${aliasId}.${expMinute36}.${crypto.signDownloadAlias({
      aliasId,
      expMinute36
    })}`;
    const service = createS3AccessLinkService({
      secret: 'test-secret',
      routes: {
        buildDownloadUrl: (value) => value,
        buildUploadUrl: (value) => value
      },
      stores: {
        downloadAlias: {
          ...stores.downloadAliasStore,
          findByAliasId
        },
        uploadSession: stores.uploadSessionStore
      },
      clock: () => baseNow
    });

    await expect(service.verifyDownloadAlias(signedAlias)).rejects.toMatchObject({
      code: S3AccessLinkErrCode.expiredSignedAlias
    });
    expect(findByAliasId).not.toHaveBeenCalled();
  });

  it('rejects tampered download alias signatures before querying the store', async () => {
    const findByAliasId = vi.fn<S3DownloadAliasStore['findByAliasId']>();
    const stores = createMemoryS3AccessLinkStores();
    const aliasId = 'AliasId12345678';
    const expMinute36 = encodeExpiresAtMinute(getFutureDate(10));
    const service = createS3AccessLinkService({
      secret: 'test-secret',
      routes: {
        buildDownloadUrl: (value) => value,
        buildUploadUrl: (value) => value
      },
      stores: {
        downloadAlias: {
          ...stores.downloadAliasStore,
          findByAliasId
        },
        uploadSession: stores.uploadSessionStore
      },
      clock: () => baseNow
    });

    await expect(
      service.verifyDownloadAlias(`${aliasId}.${expMinute36}.InvalidSignature1234`)
    ).rejects.toMatchObject({
      code: S3AccessLinkErrCode.invalidSignedAliasSignature
    });
    expect(findByAliasId).not.toHaveBeenCalled();
  });

  it('stores upload token hashes and verifies upload payloads', async () => {
    const { service, stores } = createDeterministicService();
    const url = await service.createUploadUrl({
      bucketName: 'private',
      objectKey: 'chat/team-1/file.txt',
      expiredTime: getFutureDate(10),
      maxSize: 1024,
      uploadConstraints: {
        defaultContentType: 'text/plain',
        allowedExtensions: ['.txt']
      },
      uploadPolicy: {
        defaultContentType: 'text/plain',
        allowedExtensions: ['.txt'],
        extensionRules: [
          {
            extension: '.txt',
            source: 'builtin',
            verification: 'text'
          }
        ],
        textFallbackExtension: '.txt'
      },
      fileHint: {
        filename: 'file',
        declaredExtension: '.txt',
        source: 'remote-url',
        size: 0
      },
      metadata: {
        originFilename: 'file.txt'
      }
    });
    const token = extractLastPathSegment(url);
    const [tokenHash] = Array.from(stores.uploadSessions.keys());

    expect(token).toBe('UploadToken1234567890AB');
    expect(tokenHash).not.toBe(token);
    expect(tokenHash).toHaveLength(64);

    const payload = await service.verifyUploadToken(token);

    expect(payload).toEqual({
      bucketName: 'private',
      objectKey: 'chat/team-1/file.txt',
      maxSize: 1024,
      uploadConstraints: {
        defaultContentType: 'text/plain',
        allowedExtensions: ['.txt']
      },
      uploadPolicy: {
        defaultContentType: 'text/plain',
        allowedExtensions: ['.txt'],
        extensionRules: [
          {
            extension: '.txt',
            source: 'builtin',
            verification: 'text'
          }
        ],
        textFallbackExtension: '.txt'
      },
      fileHint: {
        filename: 'file',
        declaredExtension: '.txt',
        source: 'remote-url',
        size: 0
      },
      metadata: {
        originFilename: 'file.txt'
      }
    });
    expect(stores.uploadSessions.get(tokenHash!)?.usedAt).toEqual(baseNow);
  });

  it('rejects revoked and expired upload sessions', async () => {
    const { service } = createDeterministicService();
    const revokedUrl = await service.createUploadUrl({
      bucketName: 'private',
      objectKey: 'chat/team-1/revoked.txt',
      expiredTime: getFutureDate(10),
      maxSize: 1024,
      uploadConstraints: {
        defaultContentType: 'text/plain'
      }
    });
    const expiredUrl = await service.createUploadUrl({
      bucketName: 'private',
      objectKey: 'chat/team-1/expired.txt',
      expiredTime: getFutureDate(-10),
      maxSize: 1024,
      uploadConstraints: {
        defaultContentType: 'text/plain'
      }
    });

    await service.revokeUploadToken(extractLastPathSegment(revokedUrl));

    await expect(
      service.verifyUploadToken(extractLastPathSegment(revokedUrl))
    ).rejects.toMatchObject({
      code: S3AccessLinkErrCode.uploadSessionRevoked
    });
    await expect(
      service.verifyUploadToken(extractLastPathSegment(expiredUrl))
    ).rejects.toMatchObject({
      code: S3AccessLinkErrCode.uploadSessionExpired
    });
  });

  it('can reject reused upload sessions when configured', async () => {
    const { service } = createDeterministicService({
      uploadSessionUsePolicy: 'reject-used'
    });
    const url = await service.createUploadUrl({
      bucketName: 'private',
      objectKey: 'chat/team-1/file.txt',
      expiredTime: getFutureDate(10),
      maxSize: 1024,
      uploadConstraints: {
        defaultContentType: 'text/plain'
      }
    });
    const token = extractLastPathSegment(url);

    await service.verifyUploadToken(token);

    await expect(service.verifyUploadToken(token)).rejects.toMatchObject({
      code: S3AccessLinkErrCode.uploadSessionUsed
    });
  });
});

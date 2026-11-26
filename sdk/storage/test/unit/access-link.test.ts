import { describe, expect, it, vi } from 'vitest';
import {
  S3AccessLinkErrCode,
  S3AccessLinkError,
  S3_DOWNLOAD_URL_BATCH_MAX_SIZE,
  createDefaultIdGenerator,
  createMemoryS3AccessLinkStores,
  createS3AccessLinkCrypto,
  createS3AccessLinkService,
  encodeExpiresAtMinute,
  parseSignedS3DownloadAlias,
  type S3DownloadAliasStore
} from '../../src/access-link';
import { formatSignedS3DownloadAlias } from '../../src/access-link/download';
import {
  normalizeS3DownloadExtension,
  resolveS3DownloadExtension
} from '../../src/access-link/extension';

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
    expect(firstUrl).toMatch(
      /^https:\/\/file\.example\.com\/d\/v2-AliasId12345678-[0-9a-z]+-[A-Za-z0-9]{22}\.png$/
    );
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
    const v2SignedAlias = formatSignedS3DownloadAlias({
      aliasId,
      expMinute36,
      sig: crypto.signDownloadAlias({
        aliasId,
        expMinute36,
        extension: 'png',
        version: 'v2'
      }),
      extension: 'png',
      version: 'v2'
    });
    const v1SignedAlias = formatSignedS3DownloadAlias({
      aliasId,
      expMinute36,
      sig: crypto.signDownloadAlias({
        aliasId,
        expMinute36,
        version: 'v1'
      }),
      version: 'v1'
    });
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

    await expect(service.verifyDownloadAlias(v2SignedAlias)).rejects.toMatchObject({
      code: S3AccessLinkErrCode.expiredSignedAlias
    });
    await expect(service.verifyDownloadAlias(v1SignedAlias)).rejects.toMatchObject({
      code: S3AccessLinkErrCode.expiredSignedAlias
    });
    expect(findByAliasId).not.toHaveBeenCalled();
  });

  it('rejects tampered download alias signatures and extensions before querying the store', async () => {
    const findByAliasId = vi.fn<S3DownloadAliasStore['findByAliasId']>();
    const stores = createMemoryS3AccessLinkStores();
    const crypto = createS3AccessLinkCrypto({ secret: 'test-secret' });
    const aliasId = 'AliasId12345678';
    const expMinute36 = encodeExpiresAtMinute(getFutureDate(10));
    const v2PngSig = crypto.signDownloadAlias({
      aliasId,
      expMinute36,
      extension: 'png',
      version: 'v2'
    });
    const v2NoExtSig = crypto.signDownloadAlias({
      aliasId,
      expMinute36,
      version: 'v2'
    });
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

    // v2 篡改签名、篡改后缀、去掉后缀、为无后缀签名追加后缀均须在查 store 前拒绝。
    await expect(
      service.verifyDownloadAlias(`v2-${aliasId}-${expMinute36}-InvalidSignature123456.png`)
    ).rejects.toMatchObject({
      code: S3AccessLinkErrCode.invalidSignedAliasSignature
    });
    await expect(
      service.verifyDownloadAlias(`v2-${aliasId}-${expMinute36}-${v2PngSig}.jpg`)
    ).rejects.toMatchObject({
      code: S3AccessLinkErrCode.invalidSignedAliasSignature
    });
    await expect(
      service.verifyDownloadAlias(`v2-${aliasId}-${expMinute36}-${v2PngSig}`)
    ).rejects.toMatchObject({
      code: S3AccessLinkErrCode.invalidSignedAliasSignature
    });
    await expect(
      service.verifyDownloadAlias(`v2-${aliasId}-${expMinute36}-${v2NoExtSig}.png`)
    ).rejects.toMatchObject({
      code: S3AccessLinkErrCode.invalidSignedAliasSignature
    });
    // 存量 v1 篡改签名同样拒绝。
    await expect(
      service.verifyDownloadAlias(`${aliasId}.${expMinute36}.InvalidSignature1234`)
    ).rejects.toMatchObject({
      code: S3AccessLinkErrCode.invalidSignedAliasSignature
    });
    expect(findByAliasId).not.toHaveBeenCalled();
  });

  it('omits extension when file has no safe extension and supports legacy v1 verification and hyphenated aliasIds', async () => {
    const stores = createMemoryS3AccessLinkStores();
    const crypto = createS3AccessLinkCrypto({ secret: 'test-secret' });
    const legacyAliasId = 'legacy-alias_1234';
    const { service } = createDeterministicService({
      stores: {
        downloadAlias: stores.downloadAliasStore,
        uploadSession: stores.uploadSessionStore
      },
      idGenerator: {
        aliasId: () => legacyAliasId
      }
    });

    // 无扩展名对象：v2 整段不含 '.'
    const noExtUrl = await service.createDownloadUrl({
      bucketName: 'private',
      objectKey: 'dataset/team-1/raw-object',
      filename: 'report.2026',
      expiredTime: getFutureDate(10)
    });
    const noExtAlias = extractLastPathSegment(noExtUrl);
    expect(noExtAlias).toMatch(/^v2-legacy-alias_1234-[0-9a-z]+-[A-Za-z0-9]{22}$/);
    expect(noExtAlias).not.toContain('.');
    const parsedNoExt = parseSignedS3DownloadAlias(noExtAlias);
    expect(parsedNoExt).toMatchObject({
      version: 'v2',
      aliasId: legacyAliasId
    });
    expect(parsedNoExt.extension).toBeUndefined();
    await expect(service.verifyDownloadAlias(noExtAlias)).resolves.toMatchObject({
      bucketName: 'private',
      objectKey: 'dataset/team-1/raw-object'
    });

    // 同一 aliasId 的历史 v1 固定样本（按旧版 v1 算法离线预计算）依然可验证通过
    const frozenLegacyV1SignedAlias = 'legacy-alias_1234.hkh9a.Hn1SUbhgqZDhIphaN59dhR';
    expect(parseSignedS3DownloadAlias(frozenLegacyV1SignedAlias)).toMatchObject({
      version: 'v1',
      aliasId: legacyAliasId,
      expMinute36: 'hkh9a',
      sig: 'Hn1SUbhgqZDhIphaN59dhR'
    });
    await expect(service.verifyDownloadAlias(frozenLegacyV1SignedAlias)).resolves.toMatchObject({
      bucketName: 'private',
      objectKey: 'dataset/team-1/raw-object'
    });

    // 支持配置 downloadSignVersion='v1' 用于多实例滚动升级或代理过渡期，同时保持双版本验签。
    const { service: v1IssuerService } = createDeterministicService({
      downloadSignVersion: 'v1',
      stores: {
        downloadAlias: stores.downloadAliasStore,
        uploadSession: stores.uploadSessionStore
      },
      idGenerator: {
        aliasId: () => legacyAliasId
      }
    });
    const issuedV1Url = await v1IssuerService.createDownloadUrl({
      bucketName: 'private',
      objectKey: 'dataset/team-1/raw-object',
      filename: 'report.2026',
      expiredTime: getFutureDate(10)
    });
    const issuedV1Alias = extractLastPathSegment(issuedV1Url);
    expect(issuedV1Alias).toMatch(/^legacy-alias_1234\.[0-9a-z]+\.[A-Za-z0-9_-]{22}$/);
    await expect(v1IssuerService.verifyDownloadAlias(issuedV1Alias)).resolves.toMatchObject({
      bucketName: 'private',
      objectKey: 'dataset/team-1/raw-object'
    });
    await expect(v1IssuerService.verifyDownloadAlias(noExtAlias)).resolves.toMatchObject({
      bucketName: 'private',
      objectKey: 'dataset/team-1/raw-object'
    });
    // 同时校验 crypto 显式 v1 签发输出与固定历史样本一致
    expect(
      crypto.signDownloadAlias({
        aliasId: legacyAliasId,
        expMinute36: 'hkh9a',
        version: 'v1'
      })
    ).toBe('Hn1SUbhgqZDhIphaN59dhR');
  });

  it('does not URI-decode literal filenames when deriving extensions, while decoding encoded objectKeys', async () => {
    const { service } = createDeterministicService();

    // 业务 filename 中的字面量 %2E 不能被再次解码成点号，应跳过并回退到 fallbackExtension。
    const urlWithLiteralPercent = await service.createDownloadUrl({
      bucketName: 'private',
      objectKey: 'dataset/team-1/opaque-blob',
      filename: 'report%2Epng',
      fallbackExtension: 'webp',
      expiredTime: getFutureDate(10)
    });
    expect(urlWithLiteralPercent).toMatch(
      /^https:\/\/file\.example\.com\/d\/v2-AliasId12345678-[0-9a-z]+-[A-Za-z0-9]{22}\.webp$/
    );

    // 编码后的 S3 objectKey 应正确解码提取真实后缀。
    const urlWithEncodedKey = await service.createDownloadUrl({
      bucketName: 'private',
      objectKey: 'dataset/team-1/record%2Emp3',
      filename: 'report%2Epng',
      expiredTime: getFutureDate(10)
    });
    expect(urlWithEncodedKey).toMatch(
      /^https:\/\/file\.example\.com\/d\/v2-AliasId87654321-[0-9a-z]+-[A-Za-z0-9]{22}\.mp3$/
    );
  });

  it('generates Base62 default aliasIds and normalizes safe extensions', () => {
    const { service } = createDeterministicService();
    const idGenerator = createDefaultIdGenerator();
    for (let index = 0; index < 32; index++) {
      expect(idGenerator.aliasId()).toMatch(/^[A-Za-z0-9]{16}$/);
    }

    expect(normalizeS3DownloadExtension('.PNG')).toBe('png');
    expect(normalizeS3DownloadExtension('7z')).toBe('7z');
    expect(normalizeS3DownloadExtension('..png')).toBe('');
    expect(normalizeS3DownloadExtension('2026')).toBe('');
    expect(normalizeS3DownloadExtension('tar.gz')).toBe('');
    expect(
      service.resolveDownloadExtension({
        filename: 'png',
        objectKey: 'chat/app/app-1/user-1/chat-1/file/opaque-id'
      })
    ).toBe('');
    expect(
      service.resolveDownloadExtension({
        filename: 'png',
        objectKey: 'chat/app/app-1/user-1/chat-1/file/opaque-id',
        fallbackExtension: 'png'
      })
    ).toBe('png');
    expect(
      service.resolveDownloadExtension({
        filename: 'report.2026',
        objectKey: 'chat/app/app-1/user-1/chat-1/file/opaque-id'
      })
    ).toBe('');
    expect(
      resolveS3DownloadExtension({
        filename: '显示名无后缀',
        objectKey: 'dataset/team/photo%201.JPEG'
      })
    ).toBe('jpeg');
    expect(
      resolveS3DownloadExtension({
        filename: 'report%2Epng',
        objectKey: 'dataset/team/raw-object'
      })
    ).toBe('');
    expect(
      resolveS3DownloadExtension({
        filename: '100%25 done.pdf',
        objectKey: 'dataset/team/raw-object'
      })
    ).toBe('pdf');
    expect(
      resolveS3DownloadExtension({
        filename: 'photo.png',
        objectKey: 'dataset/team/photo.jpg',
        fallbackExtension: '.webp'
      })
    ).toBe('png');
    expect(
      resolveS3DownloadExtension({
        filename: 'cover',
        objectKey: 'dataset/team/raw-object',
        fallbackExtension: '.webp'
      })
    ).toBe('webp');
    expect(
      resolveS3DownloadExtension({
        filename: '.env',
        objectKey: 'dataset/folder.v1/noext'
      })
    ).toBe('');
  });

  it('stores upload token hashes and verifies upload payloads', async () => {
    const { service, stores } = createDeterministicService();
    const url = await service.createUploadUrl({
      bucketName: 'private',
      objectKey: 'chat/team-1/file.txt',
      expiredTime: getFutureDate(10),
      maxSize: 1024,
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
    expect(stores.uploadSessions.get(tokenHash!)?.uploadPolicy).toBeDefined();
    expect(stores.uploadSessions.get(tokenHash!)).not.toHaveProperty('uploadConstraints');

    const payload = await service.verifyUploadToken(token);

    expect(payload).toEqual({
      bucketName: 'private',
      objectKey: 'chat/team-1/file.txt',
      maxSize: 1024,
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

  it('rejects invalid Multipart create state, size, and part count', async () => {
    const createParams = {
      bucketName: 'private',
      objectKey: 'dataset/team-1/large-file.pdf',
      expiredTime: getFutureDate(10),
      maxSize: 100 * 1024 * 1024,
      uploadPolicy: {
        defaultContentType: 'application/pdf'
      },
      multipart: {
        uploadId: 'upload-1',
        partSize: 8 * 1024 * 1024,
        totalSize: 50 * 1024 * 1024,
        status: 'active' as const
      }
    };

    for (const multipart of [
      { ...createParams.multipart, status: 'completed' as const },
      { ...createParams.multipart, totalSize: createParams.maxSize + 1 },
      { ...createParams.multipart, partSize: 1, totalSize: 10001 }
    ]) {
      const { service } = createDeterministicService();
      await expect(service.createUploadUrl({ ...createParams, multipart })).rejects.toMatchObject({
        code: S3AccessLinkErrCode.uploadSessionNotFound
      });
    }

    const { service } = createDeterministicService();
    await expect(
      service.createUploadUrl({
        ...createParams,
        maxSize: Number.MAX_SAFE_INTEGER + 1
      })
    ).rejects.toMatchObject({ code: S3AccessLinkErrCode.uploadSessionNotFound });
  });

  it('reuses multipart tokens and atomically transitions active sessions', async () => {
    const { service, stores } = createDeterministicService();
    const url = await service.createUploadUrl({
      bucketName: 'private',
      objectKey: 'dataset/team-1/large-file.pdf',
      expiredTime: getFutureDate(10),
      maxSize: 100 * 1024 * 1024,
      uploadPolicy: {
        defaultContentType: 'application/pdf'
      },
      multipart: {
        uploadId: 'upload-1',
        partSize: 8 * 1024 * 1024,
        totalSize: 50 * 1024 * 1024,
        status: 'active'
      }
    });
    const token = extractLastPathSegment(url);
    const completedAt = getFutureDate(1);

    await expect(service.verifyUploadToken(token)).resolves.toMatchObject({
      multipart: {
        uploadId: 'upload-1',
        status: 'active',
        totalSize: 50 * 1024 * 1024
      }
    });

    const completionAttemptId = await service.markMultipartCompleting({ token });
    expect(completionAttemptId).toEqual(expect.any(String));
    await expect(service.verifyUploadToken(token)).resolves.toMatchObject({
      multipart: {
        status: 'completing'
      }
    });
    expect(
      await service.markMultipartCompleted({
        token,
        completionAttemptId: completionAttemptId!,
        completedAt
      })
    ).toBe(true);
    expect(await service.markMultipartAborted({ token })).toBe(false);
    await expect(service.verifyUploadToken(token)).resolves.toMatchObject({
      multipart: {
        status: 'completed',
        completedAt
      }
    });

    const storedSession = Array.from(stores.uploadSessions.values())[0];
    expect(storedSession?.multipart?.status).toBe('completed');
  });

  it('reclaims only an expired completing lease', async () => {
    const { service, stores } = createDeterministicService();
    const url = await service.createUploadUrl({
      bucketName: 'private',
      objectKey: 'dataset/team-1/retryable-file.pdf',
      expiredTime: getFutureDate(10),
      maxSize: 100 * 1024 * 1024,
      uploadPolicy: {
        defaultContentType: 'application/pdf'
      },
      multipart: {
        uploadId: 'upload-retry',
        partSize: 8 * 1024 * 1024,
        totalSize: 50 * 1024 * 1024,
        status: 'active'
      }
    });
    const token = extractLastPathSegment(url);

    const firstAttemptId = await service.markMultipartCompleting({
      token,
      completingAt: baseNow
    });
    expect(firstAttemptId).toEqual(expect.any(String));
    expect(
      await service.markMultipartCompleting({
        token,
        reclaimBefore: new Date(baseNow.getTime() - 1)
      })
    ).toBeNull();
    const reclaimedAttemptId = await service.markMultipartCompleting({
      token,
      reclaimBefore: new Date(baseNow.getTime() + 1)
    });
    expect(reclaimedAttemptId).toEqual(expect.any(String));
    expect(reclaimedAttemptId).not.toBe(firstAttemptId);

    const storedSession = Array.from(stores.uploadSessions.values())[0];
    expect(storedSession?.multipart).toMatchObject({
      uploadId: 'upload-retry',
      status: 'completing',
      completingAt: baseNow
    });
  });

  it('fences stale completion updates after a lease is reclaimed', async () => {
    const { service } = createDeterministicService();
    const url = await service.createUploadUrl({
      bucketName: 'private',
      objectKey: 'dataset/team-1/stale-attempt.pdf',
      expiredTime: getFutureDate(10),
      maxSize: 100 * 1024 * 1024,
      uploadPolicy: {
        defaultContentType: 'application/pdf'
      },
      multipart: {
        uploadId: 'upload-stale-attempt',
        partSize: 8 * 1024 * 1024,
        totalSize: 50 * 1024 * 1024,
        status: 'active'
      }
    });
    const token = extractLastPathSegment(url);
    const firstAttemptId = await service.markMultipartCompleting({
      token,
      completingAt: baseNow
    });
    const secondAttemptId = await service.markMultipartCompleting({
      token,
      reclaimBefore: new Date(baseNow.getTime() + 1)
    });

    expect(firstAttemptId).toEqual(expect.any(String));
    expect(secondAttemptId).toEqual(expect.any(String));
    expect(secondAttemptId).not.toBe(firstAttemptId);
    expect(
      await service.markMultipartCompleted({
        token,
        completionAttemptId: firstAttemptId!
      })
    ).toBe(false);
    expect(
      await service.markMultipartCompleteFailed({
        token,
        completionAttemptId: firstAttemptId!
      })
    ).toBe(false);
    await expect(service.verifyUploadToken(token)).resolves.toMatchObject({
      multipart: {
        status: 'completing',
        completionAttemptId: secondAttemptId
      }
    });
  });

  it('marks a completing multipart session aborted only through complete failure', async () => {
    const { service } = createDeterministicService();
    const url = await service.createUploadUrl({
      bucketName: 'private',
      objectKey: 'dataset/team-1/complete-failed-file.pdf',
      expiredTime: getFutureDate(10),
      maxSize: 100 * 1024 * 1024,
      uploadPolicy: {
        defaultContentType: 'application/pdf'
      },
      multipart: {
        uploadId: 'upload-3',
        partSize: 8 * 1024 * 1024,
        totalSize: 50 * 1024 * 1024,
        status: 'active'
      }
    });
    const token = extractLastPathSegment(url);

    const completionAttemptId = await service.markMultipartCompleting({ token });
    expect(completionAttemptId).toEqual(expect.any(String));
    expect(await service.markMultipartAborted({ token })).toBe(false);
    expect(
      await service.markMultipartCompleteFailed({
        token,
        completionAttemptId: completionAttemptId!
      })
    ).toBe(true);
    expect(
      await service.markMultipartCompleted({
        token,
        completionAttemptId: completionAttemptId!
      })
    ).toBe(false);
  });

  it('marks an active multipart session aborted and makes the transition idempotent', async () => {
    const { service } = createDeterministicService();
    const url = await service.createUploadUrl({
      bucketName: 'private',
      objectKey: 'dataset/team-1/aborted-file.pdf',
      expiredTime: getFutureDate(10),
      maxSize: 100 * 1024 * 1024,
      uploadPolicy: {
        defaultContentType: 'application/pdf'
      },
      multipart: {
        uploadId: 'upload-2',
        partSize: 8 * 1024 * 1024,
        totalSize: 50 * 1024 * 1024,
        status: 'active'
      }
    });
    const token = extractLastPathSegment(url);

    expect(await service.markMultipartAborted({ token })).toBe(true);
    expect(await service.markMultipartAborted({ token })).toBe(false);
    expect(
      await service.markMultipartCompleted({
        token,
        completionAttemptId: 'stale-attempt'
      })
    ).toBe(false);
    await expect(service.verifyUploadToken(token)).resolves.toMatchObject({
      multipart: {
        uploadId: 'upload-2',
        status: 'aborted',
        abortedAt: expect.any(Date)
      }
    });
  });

  it('rejects revoked and expired upload sessions', async () => {
    const { service } = createDeterministicService();
    const revokedUrl = await service.createUploadUrl({
      bucketName: 'private',
      objectKey: 'chat/team-1/revoked.txt',
      expiredTime: getFutureDate(10),
      maxSize: 1024,
      uploadPolicy: {
        defaultContentType: 'text/plain'
      }
    });
    const expiredUrl = await service.createUploadUrl({
      bucketName: 'private',
      objectKey: 'chat/team-1/expired.txt',
      expiredTime: getFutureDate(-10),
      maxSize: 1024,
      uploadPolicy: {
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
      uploadPolicy: {
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

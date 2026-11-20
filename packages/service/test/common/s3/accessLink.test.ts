import { getTestInstanceConfig } from '@test/utils/instanceConfigSnapshot';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const strongFileTokenKey = '1234567890abcdef1234567890abcdef';
const originalEnv = {
  FILE_TOKEN_KEY: process.env.FILE_TOKEN_KEY,
  fileDomain: getTestInstanceConfig().storage.fileDomain,
  publicUrl: getTestInstanceConfig().site.publicUrl,
  FILE_DOWNLOAD_PUBLIC_URL_PREFIX: process.env.FILE_DOWNLOAD_PUBLIC_URL_PREFIX,
  STORAGE_DOWNLOAD_SIGN_VERSION: process.env.STORAGE_DOWNLOAD_SIGN_VERSION,
  FE_DOMAIN: process.env.FE_DOMAIN,
  NEXT_PUBLIC_BASE_URL: process.env.NEXT_PUBLIC_BASE_URL
};

const loadAccessLinkModules = async (
  env: {
    fileDomain?: string;
    fileDownloadPublicUrlPrefix?: string;
    storageDownloadSignVersion?: 'v1' | 'v2';
    publicUrl?: string;
    nextPublicBaseUrl?: string;
  } = {}
) => {
  vi.resetModules();
  vi.stubEnv('FILE_TOKEN_KEY', strongFileTokenKey);
  getTestInstanceConfig().storage.fileDomain = env.fileDomain ?? 'https://files.example.com/';
  vi.stubEnv('FILE_DOWNLOAD_PUBLIC_URL_PREFIX', env.fileDownloadPublicUrlPrefix);
  vi.stubEnv('STORAGE_DOWNLOAD_SIGN_VERSION', env.storageDownloadSignVersion);
  getTestInstanceConfig().site.publicUrl = env.publicUrl ?? 'https://app.example.com';
  vi.stubEnv('FE_DOMAIN', 'https://ignored-legacy.test');
  vi.stubEnv('NEXT_PUBLIC_BASE_URL', env.nextPublicBaseUrl ?? '/fastgpt');

  const [accessLink, downloadAliasSchema, uploadSessionSchema] = await Promise.all([
    import('@fastgpt/service/common/s3/accessLink'),
    import('@fastgpt/service/common/s3/accessLink/downloadAlias/schema'),
    import('@fastgpt/service/common/s3/accessLink/uploadSession/schema')
  ]);

  return {
    ...accessLink,
    MongoS3DownloadAlias: downloadAliasSchema.MongoS3DownloadAlias,
    MongoS3UploadSession: uploadSessionSchema.MongoS3UploadSession
  };
};

const getFutureDate = (minutes: number) => new Date(Date.now() + minutes * 60 * 1000);

const extractLastPathSegment = (url: string) => url.split('/').pop() || '';

describe('s3 access link', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.stubEnv('FILE_TOKEN_KEY', originalEnv.FILE_TOKEN_KEY);
    getTestInstanceConfig().storage.fileDomain = originalEnv.fileDomain;
    getTestInstanceConfig().site.publicUrl = originalEnv.publicUrl;
    vi.stubEnv('FILE_DOWNLOAD_PUBLIC_URL_PREFIX', originalEnv.FILE_DOWNLOAD_PUBLIC_URL_PREFIX);
    vi.stubEnv('STORAGE_DOWNLOAD_SIGN_VERSION', originalEnv.STORAGE_DOWNLOAD_SIGN_VERSION);
    vi.stubEnv('FE_DOMAIN', originalEnv.FE_DOMAIN);
    vi.stubEnv('NEXT_PUBLIC_BASE_URL', originalEnv.NEXT_PUBLIC_BASE_URL);
    vi.restoreAllMocks();
  });

  it('uses saved domains immediately and falls back to the live site.publicUrl after an explicit clear', async () => {
    vi.stubEnv('FILE_DOMAIN', 'https://ignored-legacy.test');
    const { createS3DownloadAccessUrl, createS3UploadAccessUrl } = await loadAccessLinkModules();
    const download = {
      bucketName: 'fastgpt-private',
      objectKey: 'test/hot-domain.txt',
      expiredTime: getFutureDate(10)
    };
    const before = await createS3DownloadAccessUrl(download);
    getTestInstanceConfig().storage.fileDomain = 'https://updated.test/';
    const after = await createS3DownloadAccessUrl(download);
    expect(after).toBe(before.replace('https://files.example.com', 'https://updated.test'));
    getTestInstanceConfig().storage.fileDomain = '';
    const fallback = await createS3DownloadAccessUrl(download);
    expect(fallback).toBe(before.replace('https://files.example.com', 'https://app.example.com'));
    const upload = await createS3UploadAccessUrl({
      ...download,
      maxSize: 1024,
      uploadPolicy: { defaultContentType: 'text/plain' }
    });
    expect(upload).toMatch(/^https:\/\/app\.example\.com\/fastgpt\/api\/system\/file\/u\//);
    getTestInstanceConfig().site.publicUrl = '';
    const relative = await createS3DownloadAccessUrl(download);
    expect(relative).toBe(before.replace('https://files.example.com', ''));
    vi.unstubAllEnvs();
  });

  it('creates stable short download URLs backed by one alias document', async () => {
    const {
      createS3DownloadAccessUrl,
      parseSignedS3DownloadAlias,
      verifyS3DownloadAccess,
      revokeS3DownloadAlias,
      MongoS3DownloadAlias
    } = await loadAccessLinkModules();
    const params = {
      bucketName: 'fastgpt-private',
      objectKey: 'dataset/team-1/file.png',
      expiredTime: getFutureDate(30),
      filename: 'file.png',
      responseContentType: 'image/png'
    };

    const firstUrl = await createS3DownloadAccessUrl(params);
    const secondUrl = await createS3DownloadAccessUrl(params);

    expect(firstUrl).toBe(secondUrl);
    expect(firstUrl).toMatch(
      /^https:\/\/files\.example\.com\/fastgpt\/api\/system\/file\/d\/v2-[A-Za-z0-9]{16}-[0-9a-z]+-[A-Za-z0-9]{22}\.png$/
    );
    expect(firstUrl).not.toContain(params.objectKey);

    const aliases = await MongoS3DownloadAlias.find({}).lean();
    expect(aliases).toHaveLength(1);
    expect(aliases[0]?.bucketName).toBe(params.bucketName);
    expect(aliases[0]?.objectKey).toBe(params.objectKey);
    expect(aliases[0]?.purgeAt.getTime()).toBeGreaterThan(params.expiredTime.getTime());

    const signedAlias = extractLastPathSegment(firstUrl);
    const verified = await verifyS3DownloadAccess(signedAlias);
    expect(verified).toMatchObject({
      bucketName: params.bucketName,
      objectKey: params.objectKey,
      filename: params.filename,
      responseContentType: params.responseContentType
    });
    expect(verified.expiresAt).toBeInstanceOf(Date);

    const { aliasId } = parseSignedS3DownloadAlias(signedAlias);
    await revokeS3DownloadAlias(aliasId);

    await expect(verifyS3DownloadAccess(signedAlias)).rejects.toThrow('DownloadAliasRevoked');
  });

  it('uses one Mongo batch lookup and insert for unique download aliases', async () => {
    const { createS3DownloadAccessUrls, MongoS3DownloadAlias } = await loadAccessLinkModules();
    const findSpy = vi.spyOn(MongoS3DownloadAlias, 'find');
    const insertManySpy = vi.spyOn(MongoS3DownloadAlias, 'insertMany');
    const firstParams = {
      bucketName: 'fastgpt-private',
      objectKey: 'dataset/team-1/batch-first.png',
      expiredTime: getFutureDate(30)
    };
    const secondParams = {
      bucketName: 'fastgpt-private',
      objectKey: 'dataset/team-1/batch-second.png',
      expiredTime: getFutureDate(30)
    };

    const urls = await createS3DownloadAccessUrls([firstParams, secondParams, firstParams]);

    expect(urls).toHaveLength(3);
    expect(urls[0]).toBe(urls[2]);
    expect(findSpy).toHaveBeenCalledTimes(1);
    expect(findSpy).toHaveBeenCalledWith({
      aliasKey: {
        $in: expect.arrayContaining([expect.any(String), expect.any(String)])
      }
    });
    expect(insertManySpy).toHaveBeenCalledTimes(1);
    expect(insertManySpy.mock.calls[0]?.[0]).toHaveLength(2);
    expect(insertManySpy.mock.calls[0]?.[1]).toEqual({ ordered: false });
  });

  it('uses one Mongo bulk write when a batch of reused aliases needs lease renewal', async () => {
    const { createS3DownloadAccessUrls, MongoS3DownloadAlias } = await loadAccessLinkModules();
    const params = ['first', 'second'].map((name) => ({
      bucketName: 'fastgpt-private',
      objectKey: `dataset/team-1/renew-${name}.png`,
      expiredTime: getFutureDate(10)
    }));
    await createS3DownloadAccessUrls(params);
    const bulkWriteSpy = vi.spyOn(MongoS3DownloadAlias, 'bulkWrite');

    await createS3DownloadAccessUrls(
      params.map((item) => ({
        ...item,
        expiredTime: getFutureDate(60 * 48)
      }))
    );

    expect(bulkWriteSpy).toHaveBeenCalledTimes(1);
    expect(bulkWriteSpy.mock.calls[0]?.[0]).toHaveLength(2);
    expect(bulkWriteSpy.mock.calls[0]?.[1]).toEqual({ ordered: false });
  });

  it('uses public download URL prefix without changing upload URLs', async () => {
    const {
      createS3DownloadAccessUrl,
      createS3UploadAccessUrl,
      verifyS3DownloadAccess,
      MongoS3DownloadAlias
    } = await loadAccessLinkModules({
      fileDomain: 'https://app.example.com/',
      fileDownloadPublicUrlPrefix: 'https://files.example.com/'
    });
    const downloadParams = {
      bucketName: 'fastgpt-private',
      objectKey: 'dataset/team-1/public-prefix.png',
      expiredTime: getFutureDate(30),
      filename: 'public-prefix.png'
    };

    const downloadUrl = await createS3DownloadAccessUrl(downloadParams);
    const uploadUrl = await createS3UploadAccessUrl({
      bucketName: 'fastgpt-private',
      objectKey: 'chat/app/user/chat/public-prefix.txt',
      expiredTime: getFutureDate(10),
      maxSize: 1024,
      uploadPolicy: {
        defaultContentType: 'text/plain',
        allowedExtensions: ['.txt']
      }
    });

    expect(downloadUrl).toMatch(
      /^https:\/\/files\.example\.com\/v2-[A-Za-z0-9]{16}-[0-9a-z]+-[A-Za-z0-9]{22}\.png$/
    );
    expect(uploadUrl).toMatch(
      /^https:\/\/app\.example\.com\/fastgpt\/api\/system\/file\/u\/[A-Za-z0-9_-]{22}$/
    );

    await expect(
      verifyS3DownloadAccess(extractLastPathSegment(downloadUrl))
    ).resolves.toMatchObject({
      bucketName: downloadParams.bucketName,
      objectKey: downloadParams.objectKey
    });

    const aliases = await MongoS3DownloadAlias.find({ objectKey: downloadParams.objectKey }).lean();
    expect(aliases).toHaveLength(1);
  });

  it('supports path based public download URL prefix', async () => {
    const { createS3DownloadAccessUrl } = await loadAccessLinkModules({
      fileDomain: 'https://app.example.com/',
      fileDownloadPublicUrlPrefix: 'https://files.example.com/f/'
    });

    const downloadUrl = await createS3DownloadAccessUrl({
      bucketName: 'fastgpt-private',
      objectKey: 'dataset/team-1/path-prefix.png',
      expiredTime: getFutureDate(30),
      filename: 'path-prefix.png'
    });

    expect(downloadUrl).toMatch(
      /^https:\/\/files\.example\.com\/f\/v2-[A-Za-z0-9]{16}-[0-9a-z]+-[A-Za-z0-9]{22}\.png$/
    );
  });

  it('extends download alias purgeAt without creating another alias document', async () => {
    const { createS3DownloadAccessUrl, MongoS3DownloadAlias } = await loadAccessLinkModules();
    const params = {
      bucketName: 'fastgpt-private',
      objectKey: 'dataset/team-1/long-lived.png',
      filename: 'long-lived.png'
    };

    await createS3DownloadAccessUrl({
      ...params,
      expiredTime: getFutureDate(10)
    });
    const firstAlias = await MongoS3DownloadAlias.findOne({ objectKey: params.objectKey }).lean();

    await createS3DownloadAccessUrl({
      ...params,
      expiredTime: getFutureDate(60 * 48)
    });
    const aliases = await MongoS3DownloadAlias.find({ objectKey: params.objectKey }).lean();

    expect(aliases).toHaveLength(1);
    expect(aliases[0]?.purgeAt.getTime()).toBeGreaterThan(firstAlias?.purgeAt.getTime() || 0);
  });

  it('rejects expired or tampered signed aliases before alias lookup', async () => {
    const { assertS3DownloadAliasSignature, encodeExpiresAtMinute, signS3DownloadAlias } =
      await loadAccessLinkModules();
    const aliasId = 'R7mQG0Yh2kVxP9Za';
    const expMinute36 = encodeExpiresAtMinute(getFutureDate(10));
    const sig = signS3DownloadAlias({ aliasId, expMinute36, extension: 'png' });
    const tamperedExpMinute36 = (Number.parseInt(expMinute36, 36) + 60).toString(36);
    const expiredExpMinute36 = encodeExpiresAtMinute(getFutureDate(-10));
    const expiredSig = signS3DownloadAlias({
      aliasId,
      expMinute36: expiredExpMinute36,
      extension: 'png'
    });
    const v1Sig = signS3DownloadAlias({ aliasId, expMinute36, version: 'v1' });
    const v1ExpiredSig = signS3DownloadAlias({
      aliasId,
      expMinute36: expiredExpMinute36,
      version: 'v1'
    });

    // v2 合法签名通过，篡改过期时间、篡改扩展名与过期链接均拒绝
    expect(assertS3DownloadAliasSignature(`v2-${aliasId}-${expMinute36}-${sig}.png`)).toMatchObject(
      { version: 'v2', aliasId, extension: 'png' }
    );
    expect(() =>
      assertS3DownloadAliasSignature(`v2-${aliasId}-${tamperedExpMinute36}-${sig}.png`)
    ).toThrow('InvalidSignedAliasSignature');
    expect(() => assertS3DownloadAliasSignature(`v2-${aliasId}-${expMinute36}-${sig}.jpg`)).toThrow(
      'InvalidSignedAliasSignature'
    );
    expect(() =>
      assertS3DownloadAliasSignature(`v2-${aliasId}-${expiredExpMinute36}-${expiredSig}.png`)
    ).toThrow('ExpiredSignedAlias');

    // 存量 v1 点分格式（含离线冻结的旧版样本）仍兼容校验
    expect(
      assertS3DownloadAliasSignature('R7mQG0Yh2kVxP9Za.200000.42NZcU3jc37asuRDQ0BStA')
    ).toMatchObject({
      version: 'v1',
      aliasId: 'R7mQG0Yh2kVxP9Za',
      expMinute36: '200000',
      sig: '42NZcU3jc37asuRDQ0BStA'
    });
    expect(assertS3DownloadAliasSignature(`${aliasId}.${expMinute36}.${v1Sig}`)).toMatchObject({
      version: 'v1',
      aliasId
    });
    expect(() =>
      assertS3DownloadAliasSignature(`${aliasId}.${tamperedExpMinute36}.${v1Sig}`)
    ).toThrow('InvalidSignedAliasSignature');
    expect(() =>
      assertS3DownloadAliasSignature(`${aliasId}.${expiredExpMinute36}.${v1ExpiredSig}`)
    ).toThrow('ExpiredSignedAlias');
  });

  it('resolves signed download aliases only from configured download routes and public prefixes', async () => {
    const v2Alias = 'v2-R7mQG0Yh2kVxP9Za-200000-4k9LmN2pQrStUvWxYz12Ab.pdf';
    const externalCdnUrl =
      'https://cdn.example.com/reports/v2-quarterlyreport-2026-A1B2C3D4E5F6G7H8I9J0K1.pdf';

    await loadAccessLinkModules({
      fileDomain: 'https://files.example.com/',
      publicUrl: 'https://app.example.com',
      fileDownloadPublicUrlPrefix: 'https://short.example.com/f/',
      nextPublicBaseUrl: '/fastgpt'
    });
    const { resolveS3DownloadAliasFromUrl } =
      await import('@fastgpt/service/common/s3/accessLink/url');

    expect(
      resolveS3DownloadAliasFromUrl(
        `https://files.example.com/fastgpt/api/system/file/d/${v2Alias}`
      )
    ).toBe(v2Alias);
    expect(
      resolveS3DownloadAliasFromUrl(`https://app.example.com/api/system/file/d/${v2Alias}`)
    ).toBe(v2Alias);
    expect(resolveS3DownloadAliasFromUrl(`/fastgpt/api/system/file/d/${v2Alias}`)).toBe(v2Alias);
    expect(resolveS3DownloadAliasFromUrl(`https://short.example.com/f/${v2Alias}`)).toBe(v2Alias);

    // 非本实例域名、嵌套子路径及普通外部 CDN 上形如 v2 的文件名均不识别为本实例短链
    expect(resolveS3DownloadAliasFromUrl(externalCdnUrl)).toBe('');
    expect(resolveS3DownloadAliasFromUrl(`https://short.example.com/f/nested/${v2Alias}`)).toBe('');
    expect(resolveS3DownloadAliasFromUrl(`https://short.example.com/${v2Alias}`)).toBe('');
    expect(
      resolveS3DownloadAliasFromUrl(
        `https://other-fastgpt.example.com/api/system/file/d/${v2Alias}`
      )
    ).toBe('');
  });

  it('supports STORAGE_DOWNLOAD_SIGN_VERSION=v1 for staged rollout while still verifying v2 aliases', async () => {
    const v2Modules = await loadAccessLinkModules({ storageDownloadSignVersion: 'v2' });
    const params = {
      bucketName: 'fastgpt-private',
      objectKey: 'dataset/team-1/staged.png',
      expiredTime: getFutureDate(30),
      filename: 'staged.png'
    };
    const v2Url = await v2Modules.createS3DownloadAccessUrl(params);
    const v2Alias = extractLastPathSegment(v2Url);

    const v1Modules = await loadAccessLinkModules({ storageDownloadSignVersion: 'v1' });
    const v1Url = await v1Modules.createS3DownloadAccessUrl(params);
    const v1Alias = extractLastPathSegment(v1Url);

    expect(v1Url).toMatch(
      /^https:\/\/files\.example\.com\/fastgpt\/api\/system\/file\/d\/[A-Za-z0-9]{16}\.[0-9a-z]+\.[A-Za-z0-9_-]{22}$/
    );
    await expect(v1Modules.verifyS3DownloadAccess(v1Alias)).resolves.toMatchObject({
      objectKey: params.objectKey
    });
    await expect(v1Modules.verifyS3DownloadAccess(v2Alias)).resolves.toMatchObject({
      objectKey: params.objectKey
    });
  });

  it('derives extension from responseContentType when key and filename lack one, ignores literal %2E, and omits it for octet-stream', async () => {
    const { createS3DownloadAccessUrl, verifyS3DownloadAccess } = await loadAccessLinkModules();

    const imageUrl = await createS3DownloadAccessUrl({
      bucketName: 'fastgpt-private',
      objectKey: 'dataset/team-1/opaque-image',
      expiredTime: getFutureDate(10),
      filename: 'cover',
      responseContentType: 'image/webp'
    });
    expect(imageUrl).toMatch(
      /^https:\/\/files\.example\.com\/fastgpt\/api\/system\/file\/d\/v2-[A-Za-z0-9]{16}-[0-9a-z]+-[A-Za-z0-9]{22}\.webp$/
    );
    await expect(verifyS3DownloadAccess(extractLastPathSegment(imageUrl))).resolves.toMatchObject({
      objectKey: 'dataset/team-1/opaque-image',
      responseContentType: 'image/webp'
    });

    const literalPercentUrl = await createS3DownloadAccessUrl({
      bucketName: 'fastgpt-private',
      objectKey: 'dataset/team-1/opaque-jpeg',
      expiredTime: getFutureDate(10),
      filename: 'report%2Epng',
      responseContentType: 'image/jpeg'
    });
    expect(literalPercentUrl).toMatch(
      /^https:\/\/files\.example\.com\/fastgpt\/api\/system\/file\/d\/v2-[A-Za-z0-9]{16}-[0-9a-z]+-[A-Za-z0-9]{22}\.jpg$/
    );

    const binaryUrl = await createS3DownloadAccessUrl({
      bucketName: 'fastgpt-private',
      objectKey: 'dataset/team-1/raw-binary',
      expiredTime: getFutureDate(10),
      responseContentType: 'application/octet-stream'
    });
    expect(binaryUrl).toMatch(
      /^https:\/\/files\.example\.com\/fastgpt\/api\/system\/file\/d\/v2-[A-Za-z0-9]{16}-[0-9a-z]+-[A-Za-z0-9]{22}$/
    );
    expect(extractLastPathSegment(binaryUrl)).not.toContain('.');
  });

  it('stores upload session payload behind a short hashed token', async () => {
    const {
      createS3UploadAccessUrl,
      verifyS3UploadSessionToken,
      parseSignedS3DownloadAlias,
      MongoS3UploadSession
    } = await loadAccessLinkModules();

    const url = await createS3UploadAccessUrl({
      bucketName: 'fastgpt-private',
      objectKey: 'chat/app/user/chat/file.txt',
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
        source: 'remote-url'
      },
      metadata: {
        originFilename: 'file.txt'
      }
    });
    const token = extractLastPathSegment(url);

    expect(url).toMatch(
      /^https:\/\/files\.example\.com\/fastgpt\/api\/system\/file\/u\/[A-Za-z0-9_-]{22}$/
    );
    expect(() => parseSignedS3DownloadAlias(token)).toThrow('InvalidSignedAlias');

    const sessions = await MongoS3UploadSession.find({}).lean();
    expect(sessions).toHaveLength(1);
    expect(sessions[0]?.tokenHash).toMatch(/^[a-f0-9]{64}$/);
    expect(sessions[0]?.tokenHash).not.toBe(token);
    expect(sessions[0]).not.toHaveProperty('uploadConstraints');

    await expect(verifyS3UploadSessionToken(token)).resolves.toMatchObject({
      bucketName: 'fastgpt-private',
      objectKey: 'chat/app/user/chat/file.txt',
      maxSize: 1024,
      uploadPolicy: expect.objectContaining({
        textFallbackExtension: '.txt',
        extensionRules: [
          {
            extension: '.txt',
            source: 'builtin',
            verification: 'text'
          }
        ]
      }),
      fileHint: {
        filename: 'file',
        declaredExtension: '.txt',
        source: 'remote-url'
      }
    });

    const usedSession = await MongoS3UploadSession.findOne({
      tokenHash: sessions[0]?.tokenHash
    }).lean();
    expect(usedSession?.usedAt).toBeInstanceOf(Date);
  });

  it('stores multipart state and prevents complete/abort races from overwriting terminal state', async () => {
    const {
      createS3UploadAccessUrl,
      verifyS3MultipartUploadSessionToken,
      markS3MultipartUploadCompleting,
      markS3MultipartUploadCompleted,
      markS3MultipartUploadAborted,
      MongoS3UploadSession
    } = await loadAccessLinkModules();
    const url = await createS3UploadAccessUrl({
      bucketName: 'fastgpt-private',
      objectKey: 'dataset/team-1/large-file.pdf',
      expiredTime: getFutureDate(30),
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
    const completedAt = new Date();

    await expect(verifyS3MultipartUploadSessionToken(token)).resolves.toMatchObject({
      multipart: {
        uploadId: 'upload-1',
        status: 'active',
        partSize: 8 * 1024 * 1024,
        totalSize: 50 * 1024 * 1024
      }
    });
    const completionAttemptId = await markS3MultipartUploadCompleting(token);
    expect(completionAttemptId).toEqual(expect.any(String));
    expect(await markS3MultipartUploadCompleted(token, completionAttemptId!, completedAt)).toBe(
      true
    );
    expect(await markS3MultipartUploadAborted(token)).toBe(false);

    const session = await MongoS3UploadSession.findOne({}).lean();
    expect(session?.multipart).toMatchObject({
      uploadId: 'upload-1',
      status: 'completed',
      completedAt
    });
  });

  it('restricts Multipart create payloads to active sessions within size and part limits', async () => {
    const { CreateS3UploadAccessUrlParamsSchema } = await loadAccessLinkModules();
    const baseParams = {
      bucketName: 'fastgpt-private',
      objectKey: 'dataset/team-1/large-file.pdf',
      expiredTime: getFutureDate(30),
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

    expect(
      CreateS3UploadAccessUrlParamsSchema.safeParse({
        ...baseParams,
        multipart: { ...baseParams.multipart, status: 'completed' }
      }).success
    ).toBe(false);
    expect(
      CreateS3UploadAccessUrlParamsSchema.safeParse({
        ...baseParams,
        multipart: {
          ...baseParams.multipart,
          totalSize: baseParams.maxSize + 1
        }
      }).success
    ).toBe(false);
    expect(
      CreateS3UploadAccessUrlParamsSchema.safeParse({
        ...baseParams,
        maxSize: 10001,
        multipart: {
          ...baseParams.multipart,
          partSize: 1,
          totalSize: 10001
        }
      }).success
    ).toBe(false);
    expect(
      CreateS3UploadAccessUrlParamsSchema.safeParse({
        ...baseParams,
        multipart: {
          ...baseParams.multipart,
          completedAt: new Date()
        }
      }).success
    ).toBe(false);
  });

  it('marks an active multipart session aborted idempotently', async () => {
    const {
      createS3UploadAccessUrl,
      markS3MultipartUploadCompleted,
      markS3MultipartUploadAborted,
      MongoS3UploadSession
    } = await loadAccessLinkModules();
    const url = await createS3UploadAccessUrl({
      bucketName: 'fastgpt-private',
      objectKey: 'dataset/team-1/aborted-file.pdf',
      expiredTime: getFutureDate(30),
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

    expect(await markS3MultipartUploadAborted(token)).toBe(true);
    expect(await markS3MultipartUploadAborted(token)).toBe(false);
    expect(await markS3MultipartUploadCompleted(token, 'stale-attempt')).toBe(false);

    const session = await MongoS3UploadSession.findOne({}).lean();
    expect(session?.multipart?.status).toBe('aborted');
    expect(session?.multipart?.abortedAt).toBeInstanceOf(Date);
  });

  it('rejects expired and revoked upload sessions', async () => {
    const { createS3UploadAccessUrl, verifyS3UploadSessionToken, revokeS3UploadSessionToken } =
      await loadAccessLinkModules();
    const expiredToken = extractLastPathSegment(
      await createS3UploadAccessUrl({
        bucketName: 'fastgpt-private',
        objectKey: 'chat/app/user/chat/expired.txt',
        expiredTime: getFutureDate(-10),
        maxSize: 1024,
        uploadPolicy: {
          defaultContentType: 'text/plain'
        }
      })
    );
    const revokedToken = extractLastPathSegment(
      await createS3UploadAccessUrl({
        bucketName: 'fastgpt-private',
        objectKey: 'chat/app/user/chat/revoked.txt',
        expiredTime: getFutureDate(10),
        maxSize: 1024,
        uploadPolicy: {
          defaultContentType: 'text/plain'
        }
      })
    );

    await revokeS3UploadSessionToken(revokedToken);

    await expect(verifyS3UploadSessionToken(expiredToken)).rejects.toThrow(
      /UploadSessionExpired|UploadSessionNotFound/
    );
    await expect(verifyS3UploadSessionToken(revokedToken)).rejects.toThrow('UploadSessionRevoked');
  });
});

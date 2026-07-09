import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const strongFileTokenKey = '1234567890abcdef1234567890abcdef';
const originalEnv = {
  FILE_TOKEN_KEY: process.env.FILE_TOKEN_KEY,
  FILE_DOMAIN: process.env.FILE_DOMAIN,
  FE_DOMAIN: process.env.FE_DOMAIN,
  NEXT_PUBLIC_BASE_URL: process.env.NEXT_PUBLIC_BASE_URL
};

const loadAccessLinkModules = async () => {
  vi.resetModules();
  vi.stubEnv('FILE_TOKEN_KEY', strongFileTokenKey);
  vi.stubEnv('FILE_DOMAIN', 'https://files.example.com/');
  vi.stubEnv('FE_DOMAIN', undefined);
  vi.stubEnv('NEXT_PUBLIC_BASE_URL', '/fastgpt');

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
    vi.stubEnv('FILE_DOMAIN', originalEnv.FILE_DOMAIN);
    vi.stubEnv('FE_DOMAIN', originalEnv.FE_DOMAIN);
    vi.stubEnv('NEXT_PUBLIC_BASE_URL', originalEnv.NEXT_PUBLIC_BASE_URL);
    vi.restoreAllMocks();
  });

  it('creates stable short download URLs backed by one alias document', async () => {
    const {
      createS3DownloadAccessUrl,
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
      /^https:\/\/files\.example\.com\/fastgpt\/api\/system\/file\/d\/[A-Za-z0-9_-]{16}\.[0-9a-z]+\.[A-Za-z0-9_-]{22}$/
    );
    expect(firstUrl).not.toContain(params.objectKey);

    const aliases = await MongoS3DownloadAlias.find({}).lean();
    expect(aliases).toHaveLength(1);
    expect(aliases[0]?.bucketName).toBe(params.bucketName);
    expect(aliases[0]?.objectKey).toBe(params.objectKey);
    expect(aliases[0]?.purgeAt.getTime()).toBeGreaterThan(params.expiredTime.getTime());

    const verified = await verifyS3DownloadAccess(extractLastPathSegment(firstUrl));
    expect(verified).toMatchObject({
      bucketName: params.bucketName,
      objectKey: params.objectKey,
      filename: params.filename,
      responseContentType: params.responseContentType
    });
    expect(verified.expiresAt).toBeInstanceOf(Date);

    const aliasId = extractLastPathSegment(firstUrl).split('.')[0] || '';
    await revokeS3DownloadAlias(aliasId);

    await expect(verifyS3DownloadAccess(extractLastPathSegment(firstUrl))).rejects.toThrow(
      'DownloadAliasRevoked'
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
    const sig = signS3DownloadAlias({ aliasId, expMinute36 });
    const tamperedExpMinute36 = (Number.parseInt(expMinute36, 36) + 60).toString(36);
    const expiredExpMinute36 = encodeExpiresAtMinute(getFutureDate(-10));
    const expiredSig = signS3DownloadAlias({
      aliasId,
      expMinute36: expiredExpMinute36
    });

    expect(() =>
      assertS3DownloadAliasSignature(`${aliasId}.${tamperedExpMinute36}.${sig}`)
    ).toThrow('InvalidSignedAliasSignature');
    expect(() =>
      assertS3DownloadAliasSignature(`${aliasId}.${expiredExpMinute36}.${expiredSig}`)
    ).toThrow('ExpiredSignedAlias');
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

  it('rejects expired and revoked upload sessions', async () => {
    const { createS3UploadAccessUrl, verifyS3UploadSessionToken, revokeS3UploadSessionToken } =
      await loadAccessLinkModules();
    const expiredToken = extractLastPathSegment(
      await createS3UploadAccessUrl({
        bucketName: 'fastgpt-private',
        objectKey: 'chat/app/user/chat/expired.txt',
        expiredTime: getFutureDate(-10),
        maxSize: 1024,
        uploadConstraints: {
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
        uploadConstraints: {
          defaultContentType: 'text/plain'
        }
      })
    );

    await revokeS3UploadSessionToken(revokedToken);

    await expect(verifyS3UploadSessionToken(expiredToken)).rejects.toThrow('UploadSessionExpired');
    await expect(verifyS3UploadSessionToken(revokedToken)).rejects.toThrow('UploadSessionRevoked');
  });
});

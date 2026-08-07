import { describe, expect, it, vi } from 'vitest';
import { Readable } from 'node:stream';
import { createVitestStorageMock } from '@fastgpt-sdk/storage';
import { MongoS3TTL } from '@fastgpt/service/common/s3/models/ttl';
import { MongoS3UploadSession } from '@fastgpt/service/common/s3/accessLink/uploadSession/schema';
import { S3_MULTIPART_COMPLETING_LEASE_MS } from '@fastgpt/service/common/s3/config/constants';
import { MULTIPART_OBJECT_MARKER_METADATA_KEY } from '@fastgpt/global/common/file/constants';
import type { UploadPolicy } from '@fastgpt/service/common/s3/uploadPolicy/type';

const { S3BaseBucket } = await vi.importActual<
  typeof import('@fastgpt/service/common/s3/buckets/base')
>('@fastgpt/service/common/s3/buckets/base');

const fileKey = 'dataset/team-1/multipart-file.bin';
const multipartUploadPolicy: UploadPolicy = {
  defaultContentType: 'application/octet-stream',
  allowedExtensions: ['.bin'],
  extensionRules: [{ extension: '.bin', source: 'builtin', verification: 'opaque' }],
  allowedMimeTypes: [],
  fallbackExtension: '.bin',
  allowMissingExtension: false
};

const createBucket = () => {
  const storage = createVitestStorageMock({
    vi,
    bucketName: 'fastgpt-private',
    baseUrl: 'https://storage.example.com'
  });
  return {
    storage,
    bucket: new S3BaseBucket(storage, undefined)
  };
};

describe('S3BaseBucket Multipart helpers', () => {
  it('streams parts, completes the object, and keeps the final object TTL', async () => {
    const { storage, bucket } = createBucket();
    const result = await bucket.createMultipartUploadAccessUrl(
      {
        rawKey: fileKey,
        filename: 'multipart-file.bin',
        size: 10
      },
      {
        maxFileSize: 1,
        partSize: 4,
        uploadPolicy: multipartUploadPolicy
      }
    );
    const token = result.url.split('/').at(-1) || '';

    const firstPart = await bucket.uploadMultipartPart({
      token,
      partNumber: 1,
      body: Readable.from(Buffer.alloc(4, 1)),
      contentLength: 4
    });
    const secondPart = await bucket.uploadMultipartPart({
      token,
      partNumber: 2,
      body: Readable.from(Buffer.alloc(4, 2)),
      contentLength: 4
    });
    const lastPart = await bucket.uploadMultipartPart({
      token,
      partNumber: 3,
      body: Readable.from(Buffer.alloc(2, 3)),
      contentLength: 2
    });

    await expect(
      bucket.completeMultipartUpload({
        token,
        parts: [
          { partNumber: 1, etag: firstPart.etag },
          { partNumber: 2, etag: secondPart.etag },
          { partNumber: 3, etag: lastPart.etag }
        ]
      })
    ).resolves.toMatchObject({
      bucket: 'fastgpt-private',
      key: fileKey
    });

    expect(storage.__multipartUploads.size).toBe(0);
    expect(storage.__objects.get(fileKey)?.body).toEqual(
      Buffer.concat([Buffer.alloc(4, 1), Buffer.alloc(4, 2), Buffer.alloc(2, 3)])
    );
    const ttlRecords = await MongoS3TTL.find({
      bucketName: 'fastgpt-private',
      minioKey: fileKey
    }).lean();
    expect(ttlRecords).toHaveLength(1);
    expect(ttlRecords[0]?.multipart).toBeUndefined();
  });

  it('rejects an invalid part length before calling the storage adapter', async () => {
    const { storage, bucket } = createBucket();
    const result = await bucket.createMultipartUploadAccessUrl(
      {
        rawKey: fileKey,
        filename: 'multipart-file.bin',
        size: 10
      },
      {
        partSize: 4,
        uploadPolicy: multipartUploadPolicy
      }
    );
    const token = result.url.split('/').at(-1) || '';

    await expect(
      bucket.uploadMultipartPart({
        token,
        partNumber: 1,
        body: Buffer.alloc(3),
        contentLength: 3
      })
    ).rejects.toThrow('Multipart part length does not match session');
    expect(storage.uploadMultipartPart).not.toHaveBeenCalled();
  });

  it('aborts parts and removes the TTL record without deleting a final object', async () => {
    const { storage, bucket } = createBucket();
    const result = await bucket.createMultipartUploadAccessUrl(
      {
        rawKey: fileKey,
        filename: 'multipart-file.bin',
        size: 10
      },
      {
        partSize: 4,
        uploadPolicy: multipartUploadPolicy
      }
    );
    const token = result.url.split('/').at(-1) || '';

    await bucket.abortMultipartUpload({ token });

    expect(storage.abortMultipartUpload).toHaveBeenCalledTimes(1);
    expect(storage.__multipartUploads.size).toBe(0);
    expect(storage.__objects.has(fileKey)).toBe(false);
    expect(
      await MongoS3TTL.find({ bucketName: 'fastgpt-private', minioKey: fileKey })
    ).toHaveLength(0);
    await expect(bucket.abortMultipartUpload({ token })).resolves.toMatchObject({ key: fileKey });
    expect(storage.abortMultipartUpload).toHaveBeenCalledTimes(2);
  });

  it('aborts after complete failure and cleans the session TTL', async () => {
    const { storage, bucket } = createBucket();
    const result = await bucket.createMultipartUploadAccessUrl(
      {
        rawKey: fileKey,
        filename: 'multipart-file.bin',
        size: 4
      },
      {
        partSize: 4,
        uploadPolicy: multipartUploadPolicy
      }
    );
    const token = result.url.split('/').at(-1) || '';
    vi.spyOn(storage, 'completeMultipartUpload').mockRejectedValueOnce(
      new Error('complete failed')
    );
    vi.spyOn(storage, 'getObjectMetadata').mockRejectedValueOnce({ statusCode: 404 });

    await expect(
      bucket.completeMultipartUpload({
        token,
        parts: [{ partNumber: 1, etag: 'etag-1' }]
      })
    ).rejects.toThrow('complete failed');

    expect(storage.abortMultipartUpload).toHaveBeenCalledTimes(1);
    expect(storage.__multipartUploads.size).toBe(0);
    expect(
      await MongoS3TTL.find({ bucketName: 'fastgpt-private', minioKey: fileKey })
    ).toHaveLength(0);
  });

  it('converges the session when complete cleanup returns NoSuchUpload', async () => {
    const { storage, bucket } = createBucket();
    const result = await bucket.createMultipartUploadAccessUrl(
      {
        rawKey: fileKey,
        filename: 'multipart-file.bin',
        size: 4
      },
      {
        partSize: 4,
        uploadPolicy: multipartUploadPolicy
      }
    );
    const token = result.url.split('/').at(-1) || '';
    vi.spyOn(storage, 'completeMultipartUpload').mockRejectedValueOnce({ Code: 'NoSuchUpload' });
    vi.spyOn(storage, 'abortMultipartUpload').mockRejectedValueOnce({ Code: 'NoSuchUpload' });
    vi.spyOn(storage, 'getObjectMetadata').mockRejectedValue({ statusCode: 404 });

    await expect(
      bucket.completeMultipartUpload({
        token,
        parts: [{ partNumber: 1, etag: 'etag-1' }]
      })
    ).rejects.toMatchObject({ Code: 'NoSuchUpload' });

    expect(storage.abortMultipartUpload).toHaveBeenCalledTimes(1);
    expect((await MongoS3UploadSession.findOne({ objectKey: fileKey }))?.multipart).toMatchObject({
      status: 'aborted'
    });
    expect(
      await MongoS3TTL.find({ bucketName: 'fastgpt-private', minioKey: fileKey })
    ).toHaveLength(0);
  });

  it('keeps completing and TTL when complete and abort state cannot be reconciled', async () => {
    const { storage, bucket } = createBucket();
    const result = await bucket.createMultipartUploadAccessUrl(
      {
        rawKey: fileKey,
        filename: 'multipart-file.bin',
        size: 4
      },
      {
        partSize: 4,
        uploadPolicy: multipartUploadPolicy
      }
    );
    const token = result.url.split('/').at(-1) || '';
    vi.spyOn(storage, 'completeMultipartUpload').mockRejectedValueOnce(
      new Error('complete gateway timeout')
    );
    vi.spyOn(storage, 'abortMultipartUpload').mockRejectedValueOnce({ Code: 'NoSuchUpload' });
    vi.spyOn(storage, 'checkObjectExists').mockRejectedValueOnce(new Error('storage unavailable'));

    await expect(
      bucket.completeMultipartUpload({
        token,
        parts: [{ partNumber: 1, etag: 'etag-1' }]
      })
    ).rejects.toThrow('complete gateway timeout');

    expect((await MongoS3UploadSession.findOne({ objectKey: fileKey }))?.multipart).toMatchObject({
      status: 'completing'
    });
    expect(
      await MongoS3TTL.find({ bucketName: 'fastgpt-private', minioKey: fileKey })
    ).toHaveLength(1);
    expect(storage.__multipartUploads.size).toBe(1);

    await expect(
      bucket.completeMultipartUpload({
        token,
        parts: [{ partNumber: 1, etag: 'etag-1' }]
      })
    ).rejects.toThrow('Multipart upload session is completing');
  });

  it('retries a complete after the completing lease expires', async () => {
    const { storage, bucket } = createBucket();
    const result = await bucket.createMultipartUploadAccessUrl(
      {
        rawKey: fileKey,
        filename: 'multipart-file.bin',
        size: 4
      },
      {
        partSize: 4,
        uploadPolicy: multipartUploadPolicy
      }
    );
    const token = result.url.split('/').at(-1) || '';
    const part = await bucket.uploadMultipartPart({
      token,
      partNumber: 1,
      body: Buffer.alloc(4),
      contentLength: 4
    });

    await MongoS3UploadSession.updateOne(
      { objectKey: fileKey },
      {
        $set: {
          'multipart.status': 'completing',
          'multipart.completingAt': new Date(Date.now() - S3_MULTIPART_COMPLETING_LEASE_MS - 1)
        }
      }
    );

    await expect(
      bucket.completeMultipartUpload({
        token,
        parts: [{ partNumber: 1, etag: part.etag }]
      })
    ).resolves.toMatchObject({ key: fileKey });

    expect(storage.__multipartUploads.size).toBe(0);
    expect((await MongoS3UploadSession.findOne({ objectKey: fileKey }))?.multipart).toMatchObject({
      status: 'completed'
    });
  });

  it('does not abort the provider upload while complete owns the session', async () => {
    const { storage, bucket } = createBucket();
    const result = await bucket.createMultipartUploadAccessUrl(
      {
        rawKey: fileKey,
        filename: 'multipart-file.bin',
        size: 4
      },
      {
        partSize: 4,
        uploadPolicy: multipartUploadPolicy
      }
    );
    const token = result.url.split('/').at(-1) || '';
    let releaseComplete!: () => void;
    const completeGate = new Promise<void>((resolve) => {
      releaseComplete = resolve;
    });
    const completeStarted = new Promise<void>((resolve) => {
      vi.spyOn(storage, 'completeMultipartUpload').mockImplementation(async (params) => {
        resolve();
        await completeGate;
        return {
          bucket: params.key === fileKey ? 'fastgpt-private' : 'unexpected-bucket',
          key: params.key
        };
      });
    });

    const completePromise = bucket.completeMultipartUpload({
      token,
      parts: [{ partNumber: 1, etag: 'etag-1' }]
    });
    await Promise.race([
      completeStarted,
      completePromise.then(
        () => Promise.reject(new Error('Multipart complete finished before provider gate')),
        (error) => Promise.reject(error)
      )
    ]);

    await expect(bucket.abortMultipartUpload({ token })).resolves.toMatchObject({ key: fileKey });
    expect(storage.abortMultipartUpload).not.toHaveBeenCalled();
    releaseComplete();
    await expect(completePromise).resolves.toMatchObject({ key: fileKey });
    expect(
      await MongoS3TTL.find({ bucketName: 'fastgpt-private', minioKey: fileKey })
    ).toHaveLength(1);
    expect(
      (await MongoS3TTL.findOne({ bucketName: 'fastgpt-private', minioKey: fileKey }).lean())
        ?.multipart
    ).toBeUndefined();
  });

  it('claims an active session before aborting the provider upload', async () => {
    const { storage, bucket } = createBucket();
    const result = await bucket.createMultipartUploadAccessUrl(
      {
        rawKey: fileKey,
        filename: 'multipart-file.bin',
        size: 4
      },
      {
        partSize: 4,
        uploadPolicy: multipartUploadPolicy
      }
    );
    const token = result.url.split('/').at(-1) || '';
    let releaseAbort!: () => void;
    const abortGate = new Promise<void>((resolve) => {
      releaseAbort = resolve;
    });
    let abortStarted!: () => void;
    const providerAbortStarted = new Promise<void>((resolve) => {
      abortStarted = resolve;
    });

    vi.spyOn(storage, 'abortMultipartUpload').mockImplementation(async (params) => {
      abortStarted();
      await abortGate;
      return {
        bucket: 'fastgpt-private',
        key: params.key,
        uploadId: params.uploadId
      };
    });
    const providerComplete = vi.spyOn(storage, 'completeMultipartUpload');

    const abortPromise = bucket.abortMultipartUpload({ token });
    await providerAbortStarted;

    await expect(
      bucket.completeMultipartUpload({
        token,
        parts: [{ partNumber: 1, etag: 'etag-1' }]
      })
    ).rejects.toThrow('Multipart upload session is aborted');
    expect(providerComplete).not.toHaveBeenCalled();

    releaseAbort();
    await expect(abortPromise).resolves.toMatchObject({ key: fileKey });
    expect(
      await MongoS3TTL.find({ bucketName: 'fastgpt-private', minioKey: fileKey })
    ).toHaveLength(0);
  });

  it('keeps the TTL after an abort failure and retries an already aborted session', async () => {
    const { storage, bucket } = createBucket();
    const result = await bucket.createMultipartUploadAccessUrl(
      {
        rawKey: fileKey,
        filename: 'multipart-file.bin',
        size: 4
      },
      {
        partSize: 4,
        uploadPolicy: multipartUploadPolicy
      }
    );
    const token = result.url.split('/').at(-1) || '';
    const abortProvider = vi
      .spyOn(storage, 'abortMultipartUpload')
      .mockRejectedValueOnce(new Error('storage offline'));

    await expect(bucket.abortMultipartUpload({ token })).rejects.toThrow('storage offline');
    expect((await MongoS3UploadSession.findOne({ objectKey: fileKey }))?.multipart).toMatchObject({
      status: 'aborted'
    });
    expect(
      await MongoS3TTL.find({ bucketName: 'fastgpt-private', minioKey: fileKey })
    ).toHaveLength(1);

    abortProvider.mockResolvedValueOnce({
      bucket: 'fastgpt-private',
      key: fileKey,
      uploadId: 'retry-upload'
    });
    await expect(bucket.abortMultipartUpload({ token })).resolves.toMatchObject({ key: fileKey });
    expect(abortProvider).toHaveBeenCalledTimes(2);
    expect(
      await MongoS3TTL.find({ bucketName: 'fastgpt-private', minioKey: fileKey })
    ).toHaveLength(0);
  });

  it('keeps the final object when TTL finalization fails after provider complete', async () => {
    const { storage, bucket } = createBucket();
    const result = await bucket.createMultipartUploadAccessUrl(
      {
        rawKey: fileKey,
        filename: 'multipart-file.bin',
        size: 4
      },
      {
        partSize: 4,
        uploadPolicy: multipartUploadPolicy
      }
    );
    const token = result.url.split('/').at(-1) || '';
    await bucket.uploadMultipartPart({
      token,
      partNumber: 1,
      body: Buffer.alloc(4),
      contentLength: 4
    });
    const ttlUpdateSpy = vi
      .spyOn(MongoS3TTL, 'updateOne')
      .mockRejectedValueOnce(new Error('ttl update failed'));

    await expect(
      bucket.completeMultipartUpload({
        token,
        parts: [{ partNumber: 1, etag: 'etag-1' }]
      })
    ).rejects.toThrow('ttl update failed');
    ttlUpdateSpy.mockRestore();

    expect(storage.abortMultipartUpload).not.toHaveBeenCalled();
    expect(storage.__objects.get(fileKey)?.body).toEqual(Buffer.alloc(4));
    expect(
      (await MongoS3TTL.findOne({ bucketName: 'fastgpt-private', minioKey: fileKey }).lean())
        ?.multipart
    ).toMatchObject({
      uploadId: expect.any(String),
      objectMarker: expect.any(String),
      totalSize: 4
    });

    await expect(
      bucket.completeMultipartUpload({
        token,
        parts: [{ partNumber: 1, etag: 'etag-1' }]
      })
    ).resolves.toMatchObject({ key: fileKey });
    expect(
      (await MongoS3TTL.findOne({ bucketName: 'fastgpt-private', minioKey: fileKey }).lean())
        ?.multipart
    ).toBeUndefined();
  });

  it('reconciles a NoSuchUpload response when the final object already exists', async () => {
    const { storage, bucket } = createBucket();
    const result = await bucket.createMultipartUploadAccessUrl(
      {
        rawKey: fileKey,
        filename: 'multipart-file.bin',
        size: 4
      },
      {
        partSize: 4,
        uploadPolicy: multipartUploadPolicy
      }
    );
    const token = result.url.split('/').at(-1) || '';
    const multipartUpload = [...storage.__multipartUploads.values()][0];
    storage.__putObject(fileKey, {
      body: Buffer.alloc(4),
      metadata: multipartUpload?.metadata
    });
    vi.spyOn(storage, 'completeMultipartUpload').mockRejectedValueOnce({ Code: 'NoSuchUpload' });

    await expect(
      bucket.completeMultipartUpload({
        token,
        parts: [{ partNumber: 1, etag: 'etag-1' }]
      })
    ).resolves.toMatchObject({ key: fileKey });

    expect(storage.getObjectMetadata).toHaveBeenCalledWith({ key: fileKey });
    expect(storage.abortMultipartUpload).not.toHaveBeenCalled();
    expect((await MongoS3UploadSession.findOne({ objectKey: fileKey }))?.multipart?.status).toBe(
      'completed'
    );
    expect(
      (await MongoS3TTL.findOne({ bucketName: 'fastgpt-private', minioKey: fileKey }))?.multipart
    ).toBeUndefined();
  });

  it('does not reconcile a same-sized object with a different Multipart marker', async () => {
    const { storage, bucket } = createBucket();
    const result = await bucket.createMultipartUploadAccessUrl(
      {
        rawKey: fileKey,
        filename: 'multipart-file.bin',
        size: 4
      },
      {
        partSize: 4,
        uploadPolicy: multipartUploadPolicy
      }
    );
    const token = result.url.split('/').at(-1) || '';
    storage.__putObject(fileKey, {
      body: Buffer.alloc(4),
      metadata: {
        [MULTIPART_OBJECT_MARKER_METADATA_KEY]: 'previous-session-marker'
      }
    });
    vi.spyOn(storage, 'completeMultipartUpload').mockRejectedValueOnce({ Code: 'NoSuchUpload' });

    await expect(
      bucket.completeMultipartUpload({
        token,
        parts: [{ partNumber: 1, etag: 'etag-1' }]
      })
    ).rejects.toMatchObject({ Code: 'NoSuchUpload' });

    expect(storage.abortMultipartUpload).toHaveBeenCalledTimes(1);
    expect((await MongoS3UploadSession.findOne({ objectKey: fileKey }))?.multipart).toMatchObject({
      status: 'aborted'
    });
    expect(
      await MongoS3TTL.findOne({ bucketName: 'fastgpt-private', minioKey: fileKey })
    ).toBeNull();
    expect(storage.__objects.get(fileKey)?.metadata).toMatchObject({
      [MULTIPART_OBJECT_MARKER_METADATA_KEY]: 'previous-session-marker'
    });
  });

  it('cleans a final object that appears while abort handles NoSuchUpload', async () => {
    const { storage, bucket } = createBucket();
    const result = await bucket.createMultipartUploadAccessUrl(
      {
        rawKey: fileKey,
        filename: 'multipart-file.bin',
        size: 4
      },
      {
        partSize: 4,
        uploadPolicy: multipartUploadPolicy
      }
    );
    const token = result.url.split('/').at(-1) || '';
    const multipartUpload = [...storage.__multipartUploads.values()][0];
    let metadataCalls = 0;
    vi.spyOn(storage, 'completeMultipartUpload').mockRejectedValueOnce({ Code: 'NoSuchUpload' });
    vi.spyOn(storage, 'getObjectMetadata').mockImplementation(async ({ key }) => {
      metadataCalls += 1;
      if (metadataCalls === 1) {
        throw { statusCode: 404 };
      }
      const object = storage.__objects.get(key);
      if (!object) {
        throw { statusCode: 404 };
      }
      return {
        bucket: storage.bucketName,
        key,
        metadata: object.metadata,
        contentLength: object.contentLength,
        contentType: object.contentType,
        etag: object.etag
      };
    });
    vi.spyOn(storage, 'abortMultipartUpload').mockImplementation(async ({ key }) => {
      storage.__putObject(key, {
        body: Buffer.alloc(4),
        metadata: multipartUpload?.metadata
      });
      throw { Code: 'NoSuchUpload' };
    });
    const addDeleteJob = vi.spyOn(bucket, 'addDeleteJob').mockResolvedValue(undefined);

    await expect(
      bucket.completeMultipartUpload({
        token,
        parts: [{ partNumber: 1, etag: 'etag-1' }]
      })
    ).rejects.toMatchObject({ Code: 'NoSuchUpload' });

    expect(addDeleteJob).toHaveBeenCalledWith({ key: fileKey });
    expect(
      await MongoS3TTL.findOne({ bucketName: 'fastgpt-private', minioKey: fileKey })
    ).toBeNull();
  });

  it('aborts the provider upload when the upload session cannot be created', async () => {
    const { storage, bucket } = createBucket();
    const createSessionSpy = vi
      .spyOn(MongoS3UploadSession, 'create')
      .mockRejectedValueOnce(new Error('session create failed'));

    try {
      await expect(
        bucket.createMultipartUploadAccessUrl(
          {
            rawKey: fileKey,
            filename: 'multipart-file.bin',
            size: 4
          },
          {
            partSize: 4,
            uploadPolicy: multipartUploadPolicy
          }
        )
      ).rejects.toThrow('session create failed');
    } finally {
      createSessionSpy.mockRestore();
    }

    expect(storage.abortMultipartUpload).toHaveBeenCalledTimes(1);
    expect(storage.__multipartUploads.size).toBe(0);
    expect(
      await MongoS3TTL.find({ bucketName: 'fastgpt-private', minioKey: fileKey })
    ).toHaveLength(0);
  });

  it('keeps the TTL cleanup credential when session creation fails to abort', async () => {
    const { storage, bucket } = createBucket();
    const createSessionSpy = vi
      .spyOn(MongoS3UploadSession, 'create')
      .mockRejectedValueOnce(new Error('session create failed'));
    vi.spyOn(storage, 'abortMultipartUpload').mockRejectedValueOnce(new Error('storage offline'));

    try {
      await expect(
        bucket.createMultipartUploadAccessUrl(
          {
            rawKey: fileKey,
            filename: 'multipart-file.bin',
            size: 4
          },
          {
            partSize: 4,
            uploadPolicy: multipartUploadPolicy
          }
        )
      ).rejects.toThrow('session create failed');
    } finally {
      createSessionSpy.mockRestore();
    }

    expect(
      await MongoS3TTL.find({ bucketName: 'fastgpt-private', minioKey: fileKey })
    ).toHaveLength(1);
    expect(
      (await MongoS3TTL.findOne({ bucketName: 'fastgpt-private', minioKey: fileKey }).lean())
        ?.multipart
    ).toMatchObject({
      uploadId: expect.any(String),
      objectMarker: expect.any(String),
      totalSize: 4
    });
  });

  it('removes the TTL when initialization cleanup returns NoSuchUpload', async () => {
    const { storage, bucket } = createBucket();
    const createSessionSpy = vi
      .spyOn(MongoS3UploadSession, 'create')
      .mockRejectedValueOnce(new Error('session create failed'));
    vi.spyOn(storage, 'abortMultipartUpload').mockRejectedValueOnce({ Code: 'NoSuchUpload' });

    try {
      await expect(
        bucket.createMultipartUploadAccessUrl(
          {
            rawKey: fileKey,
            filename: 'multipart-file.bin',
            size: 4
          },
          {
            partSize: 4,
            uploadPolicy: multipartUploadPolicy
          }
        )
      ).rejects.toThrow('session create failed');
    } finally {
      createSessionSpy.mockRestore();
    }

    expect(
      await MongoS3TTL.find({ bucketName: 'fastgpt-private', minioKey: fileKey })
    ).toHaveLength(0);
  });

  it('treats a provider NoSuchUpload response as an idempotent cleanup success', async () => {
    const { storage, bucket } = createBucket();
    vi.spyOn(storage, 'abortMultipartUpload').mockRejectedValueOnce({ Code: 'NoSuchUpload' });

    await expect(
      bucket.abortMultipartUploadByUploadId({
        key: fileKey,
        uploadId: 'provider-cleaned-upload'
      })
    ).resolves.toBeUndefined();

    expect(storage.abortMultipartUpload).toHaveBeenCalledWith({
      key: fileKey,
      uploadId: 'provider-cleaned-upload'
    });
  });
});

describe('S3BaseBucket historical key compatibility', () => {
  it('falls back to the raw key for reads and existence checks', async () => {
    const { storage, bucket } = createBucket();
    const rawKey = 'legacy/user name/file.txt';
    const canonicalKey = 'legacy/user%20name/file.txt';
    vi.spyOn(storage, 'checkObjectExists')
      .mockResolvedValueOnce({ bucket: storage.bucketName, key: canonicalKey, exists: false })
      .mockResolvedValueOnce({ bucket: storage.bucketName, key: rawKey, exists: true });
    vi.spyOn(storage, 'getObjectMetadata')
      .mockRejectedValueOnce({ statusCode: 404 })
      .mockResolvedValueOnce({
        bucket: storage.bucketName,
        key: rawKey,
        metadata: { originFilename: encodeURIComponent('file.txt') },
        contentLength: 4,
        contentType: 'text/plain'
      });

    await expect(bucket.isObjectExists(rawKey)).resolves.toBe(true);
    await expect(bucket.getFileMetadata(rawKey)).resolves.toMatchObject({
      filename: 'file.txt',
      contentLength: 4
    });
    expect(storage.checkObjectExists).toHaveBeenNthCalledWith(1, { key: canonicalKey });
    expect(storage.checkObjectExists).toHaveBeenNthCalledWith(2, { key: rawKey });
    expect(storage.getObjectMetadata).toHaveBeenNthCalledWith(1, { key: canonicalKey });
    expect(storage.getObjectMetadata).toHaveBeenNthCalledWith(2, { key: rawKey });
  });

  it('uses the raw source as a copy fallback and deletes both key forms', async () => {
    const { storage, bucket } = createBucket();
    const rawKey = 'legacy/user name/file.txt';
    const canonicalKey = 'legacy/user%20name/file.txt';
    vi.spyOn(storage, 'copyObjectInSelfBucket')
      .mockRejectedValueOnce({ statusCode: 404 })
      .mockResolvedValueOnce({
        bucket: storage.bucketName,
        sourceKey: rawKey,
        targetKey: 'archive/file.txt'
      });

    await expect(bucket.copy({ from: rawKey, to: 'archive/file.txt' })).resolves.toMatchObject({
      sourceKey: rawKey,
      targetKey: 'archive/file.txt'
    });
    expect(storage.copyObjectInSelfBucket).toHaveBeenNthCalledWith(1, {
      sourceKey: canonicalKey,
      targetKey: 'archive/file.txt'
    });
    expect(storage.copyObjectInSelfBucket).toHaveBeenNthCalledWith(2, {
      sourceKey: rawKey,
      targetKey: 'archive/file.txt'
    });

    await bucket.removeObject(rawKey);
    expect(storage.deleteObject).toHaveBeenNthCalledWith(1, { key: canonicalKey });
    expect(storage.deleteObject).toHaveBeenNthCalledWith(2, { key: rawKey });
  });
});

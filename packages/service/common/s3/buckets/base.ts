import {
  type CreatePostPresignedUrlOptions,
  type CreatePostPresignedUrlParams,
  type CreateMultipartUploadAccessUrlOptions,
  type CreateMultipartUploadAccessUrlParams,
  type CreateMultipartUploadAccessUrlResult,
  type CreatePostPresignedUrlResult,
  type CreatePresignedPutUrlResult,
  type AbortMultipartUploadAccessParams,
  type CompleteMultipartUploadAccessParams,
  CreateMultipartUploadAccessUrlOptionsSchema,
  CreateMultipartUploadAccessUrlParamsSchema,
  type UploadMultipartPartAccessParams,
  type createPreviewUrlParams,
  CreateGetPresignedUrlParamsSchema,
  CreatePostPresignedUrlOptionsSchema,
  CreatePostPresignedUrlParamsSchema
} from '../contracts/type';
import {
  getSystemMaxFileSize,
  MAX_MULTIPART_PART_COUNT,
  S3_MULTIPART_CONCURRENCY,
  S3_MULTIPART_COMPLETING_LEASE_MS,
  S3_MULTIPART_UPLOAD_THRESHOLD_BYTES,
  S3_MULTIPART_MAX_RETRY,
  S3_MULTIPART_PART_SIZE_BYTES,
  S3_MULTIPART_SESSION_EXPIRE_HOURS
} from '../config/constants';
import { S3ErrEnum } from '@fastgpt/global/common/error/code/s3';
import { createUploadPolicy } from '../uploadPolicy/service';
import {
  assertActiveMultipartSession,
  assertCompletableMultipartSession,
  assertCompleteMultipartParts,
  getExpectedMultipartPartLength,
  isFileNotFoundError
} from '../utils/assert';
import path from 'node:path';
import { MongoS3TTL } from '../models/ttl';
import { addHours, addMinutes, differenceInHours, differenceInSeconds } from 'date-fns';
import { getLogger, LogCategories } from '../../logger';
import { addS3DelJob } from '../queue/delete';
import { type UploadFileByBodyParams, UploadFileByBodySchema } from '../contracts/type';
import type {
  CompleteMultipartUploadResult,
  UploadMultipartPartResult,
  IStorage
} from '@fastgpt-sdk/storage';
import { assertStorageObjectKey, isNoSuchMultipartUploadError } from '@fastgpt-sdk/storage';
import { getContentDisposition } from '@fastgpt/global/common/file/tools';
import {
  createS3DownloadAccessUrl,
  createS3UploadAccessUrl,
  deleteS3DownloadAliasByObjects,
  markS3MultipartUploadAborted,
  markS3MultipartUploadCompleteFailed,
  markS3MultipartUploadCompleting,
  markS3MultipartUploadCompleted,
  retryS3MultipartUploadCompleting,
  verifyS3MultipartUploadSessionToken
} from '../accessLink';
import { CommonErrEnum } from '@fastgpt/global/common/error/code/common';
import { MULTIPART_OBJECT_MARKER_METADATA_KEY } from '@fastgpt/global/common/file/constants';
import { randomUUID } from 'node:crypto';

const logger = getLogger(LogCategories.INFRA.S3);

const getStorageKeyCandidates = (key: string): string[] => {
  assertStorageObjectKey(key);
  const decodedSegments = key.split('/').map((segment) => {
    try {
      return decodeURIComponent(segment);
    } catch {
      return segment;
    }
  });

  // Legacy fallback 只能还原段内字符，不能让编码内容改变对象路径层级。
  if (decodedSegments.some((segment) => segment.includes('/'))) return [key];

  const legacyKey = decodedSegments.join('/');

  if (legacyKey === key) return [key];
  try {
    assertStorageObjectKey(legacyKey, 'legacyKey');
    return [key, legacyKey];
  } catch {
    return [key];
  }
};

const withStorageKeyFallback = async <T>(
  key: string,
  operation: (candidate: string) => Promise<T>
): Promise<T> => {
  const candidates = getStorageKeyCandidates(key);
  try {
    return await operation(candidates[0]);
  } catch (error) {
    if (candidates.length === 1 || !isFileNotFoundError(error)) throw error;
    return operation(candidates[1]);
  }
};

/** Decode an encoded key basename for download links when the caller has no original filename. */
const getDownloadFilenameFromKey = (key: string) => {
  const filename = path.basename(key);
  try {
    return decodeURIComponent(filename) || 'file';
  } catch {
    return filename || 'file';
  }
};

export class S3BaseBucket {
  constructor(
    private readonly _client: IStorage,
    private readonly _externalClient: IStorage | undefined
  ) {}

  get client(): IStorage {
    return this._client;
  }

  get externalClient(): IStorage {
    return this._externalClient ?? this._client;
  }

  get bucketName(): string {
    return this.client.bucketName;
  }

  async checkBucketHealth() {
    const key = `health-check/${Date.now()}-${Math.random().toString(36).slice(2)}.txt`;
    const filename = 'health-check.txt';

    await this.client.uploadObject({
      key,
      body: Buffer.from('ok'),
      contentType: 'text/plain',
      contentDisposition: getContentDisposition({ filename, type: 'attachment' }),
      metadata: {
        originFilename: filename,
        uploadTime: new Date().toISOString()
      }
    });

    try {
      await this.client.getObjectMetadata({ key });
      if (this._externalClient) {
        this._externalClient.checkObjectExists({ key }).catch((err) => {
          logger.warn('External S3 endpoint check failed, using internal only', {
            error: err?.message || String(err)
          });
        });
      }
    } finally {
      await this.client.deleteObject({ key }).catch((err) => {
        if (isFileNotFoundError(err)) {
          return Promise.resolve();
        }
        logger.warn('S3 health check cleanup failed', {
          key,
          code: err?.code,
          error: err
        });
      });
    }
  }

  async move({ from, to }: { from: string; to: string }): Promise<void> {
    await this.copy({ from, to, options: { temporary: false } });
    await this.removeObject(from);
  }

  async copy({
    from,
    to,
    options
  }: {
    from: string;
    to: string;
    options?: {
      temporary?: boolean;
    };
  }) {
    assertStorageObjectKey(to, 'targetKey');
    const targetKey = to;
    if (options?.temporary) {
      await MongoS3TTL.create({
        minioKey: targetKey,
        bucketName: this.bucketName,
        expiredTime: addHours(new Date(), 24)
      });
    }
    return withStorageKeyFallback(from, (sourceKey) =>
      this.client.copyObjectInSelfBucket({ sourceKey, targetKey })
    );
  }

  async removeObject(objectKey: string): Promise<void> {
    const resolvedKey = await this.resolveExistingObjectKey(objectKey);
    if (resolvedKey) {
      await this.client.deleteObject({ key: resolvedKey }).catch((err) => {
        if (!isFileNotFoundError(err)) {
          logger.error('S3 delete object failed', {
            key: resolvedKey,
            code: err?.code,
            error: err
          });
          throw err;
        }
      });
    }

    deleteS3DownloadAliasByObjects({
      bucketName: this.bucketName,
      objectKeys: resolvedKey ? [resolvedKey] : getStorageKeyCandidates(objectKey)
    }).catch((err) => {
      logger.warn('S3 download alias cleanup failed after object delete', {
        key: resolvedKey ?? objectKey,
        bucketName: this.bucketName,
        error: err
      });
    });
  }

  addDeleteJob(params: Omit<Parameters<typeof addS3DelJob>[0], 'bucketName'>) {
    return addS3DelJob({ ...params, bucketName: this.bucketName });
  }

  /** 通过 session marker 和 Content-Length 判断对象是否属于当前 Multipart session。 */
  private async isOwnedMultipartObject({
    key,
    objectMarker,
    totalSize
  }: {
    key: string;
    objectMarker: string;
    totalSize: number;
  }) {
    const metadata = await this.client.getObjectMetadata({ key });
    return (
      metadata.metadata[MULTIPART_OBJECT_MARKER_METADATA_KEY] === objectMarker &&
      metadata.contentLength === totalSize
    );
  }

  /** 仅删除能通过当前 Multipart marker 归属校验的最终对象，避免误删旧对象。 */
  private async scheduleOwnedMultipartObjectCleanup({
    key,
    objectMarker,
    totalSize
  }: {
    key: string;
    objectMarker: string;
    totalSize: number;
  }) {
    let ownedObject = false;
    try {
      ownedObject = await this.isOwnedMultipartObject({
        key,
        objectMarker,
        totalSize
      });
    } catch (error) {
      if (!isFileNotFoundError(error)) throw error;
    }

    if (ownedObject) {
      await this.addDeleteJob({ key });
    }
  }

  /** 将已完成的 Multipart TTL 转为普通对象 TTL；失败必须向上抛出以便后续重试。 */
  private async finalizeMultipartTtl({ key, uploadId }: { key: string; uploadId: string }) {
    const result = await MongoS3TTL.updateOne(
      {
        minioKey: key,
        bucketName: this.bucketName,
        'multipart.uploadId': uploadId
      },
      {
        $unset: {
          multipart: 1
        }
      }
    );

    if (result.matchedCount === 1) return;

    // completion 可以重复调用；如果 TTL 已经被成功转换，直接视为幂等成功。
    const pendingMultipartTtl = await MongoS3TTL.exists({
      minioKey: key,
      bucketName: this.bucketName,
      'multipart.uploadId': uploadId
    });
    if (pendingMultipartTtl) {
      throw new Error('Multipart TTL finalization did not remove the Multipart marker');
    }

    const finalizedTtl = await MongoS3TTL.exists({
      minioKey: key,
      bucketName: this.bucketName,
      multipart: { $exists: false }
    });
    if (!finalizedTtl) {
      throw new Error('Multipart TTL record not found during finalization');
    }
  }

  async isObjectExists(key: string) {
    return !!(await this.resolveExistingObjectKey(key));
  }

  /** 返回实际存在的 canonical 或 legacy key，供后续操作复用同一次 fallback 决策。 */
  async resolveExistingObjectKey(key: string): Promise<string | undefined> {
    const candidates = getStorageKeyCandidates(key);
    for (const candidate of candidates) {
      const { exists } = await this.client.checkObjectExists({ key: candidate });
      if (exists) return candidate;
    }
  }

  /**
   * 根据文件大小统一选择单 PUT 或 S3 Multipart 上传。
   * 未提供文件大小或文件小于阈值时返回 single；大文件创建 Multipart session。
   */
  async createUploadAccessUrl(
    params: CreatePostPresignedUrlParams,
    options: CreatePostPresignedUrlOptions = {}
  ): Promise<CreatePostPresignedUrlResult> {
    const parsedParams = CreatePostPresignedUrlParamsSchema.parse(params);
    const { size } = parsedParams;

    if (size !== undefined && size >= S3_MULTIPART_UPLOAD_THRESHOLD_BYTES) {
      return this.createMultipartUploadAccessUrl(
        {
          ...parsedParams,
          size
        },
        options
      );
    }

    return this.createPresignedPutUrl(parsedParams, options);
  }

  async createPresignedPutUrl(
    params: CreatePostPresignedUrlParams,
    options: CreatePostPresignedUrlOptions = {}
  ): Promise<CreatePresignedPutUrlResult> {
    try {
      const {
        expiredHours,
        maxFileSize = getSystemMaxFileSize(),
        uploadPolicy
      } = CreatePostPresignedUrlOptionsSchema.parse(options);
      const parsedParams = CreatePostPresignedUrlParamsSchema.parse(params);
      const formatMaxFileSize = maxFileSize * 1024 * 1024;
      const filename = parsedParams.filename;
      const resolvedFilename = parsedParams.declaredFilename || filename;
      const fileHint = {
        filename,
        ...(parsedParams.contentType ? { contentType: parsedParams.contentType } : {}),
        ...(parsedParams.declaredExtension
          ? { declaredExtension: parsedParams.declaredExtension }
          : {}),
        ...(parsedParams.declaredFilename
          ? { declaredFilename: parsedParams.declaredFilename }
          : {}),
        ...(parsedParams.source ? { source: parsedParams.source } : {}),
        ...(parsedParams.size !== undefined ? { size: parsedParams.size } : {})
      };
      const resolvedUploadPolicy = uploadPolicy ?? createUploadPolicy({ hint: fileHint });
      const expiredSeconds = differenceInSeconds(addMinutes(new Date(), 10), new Date());
      const metadata = {
        contentDisposition: getContentDisposition({
          filename: resolvedFilename,
          type: 'attachment'
        }),
        originFilename: encodeURIComponent(resolvedFilename),
        uploadTime: new Date().toISOString(),
        ...parsedParams.metadata
      };

      if (expiredHours) {
        await MongoS3TTL.create({
          minioKey: parsedParams.rawKey,
          bucketName: this.bucketName,
          expiredTime: addHours(new Date(), expiredHours)
        });
      }

      const { url: previewUrl } = await this.createExternalUrl({
        key: parsedParams.rawKey,
        expiredHours,
        filename: resolvedFilename
      });

      return {
        url: await createS3UploadAccessUrl({
          objectKey: parsedParams.rawKey,
          bucketName: this.bucketName,
          expiredTime: addMinutes(new Date(), Math.ceil(expiredSeconds / 60)),
          maxSize: formatMaxFileSize,
          uploadPolicy: resolvedUploadPolicy,
          fileHint,
          metadata
        }),
        key: parsedParams.rawKey,
        headers: {
          'content-type': resolvedUploadPolicy.defaultContentType
        },
        previewUrl,
        maxSize: formatMaxFileSize,
        uploadMode: 'single'
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      if (
        message === S3ErrEnum.invalidUploadFileType ||
        message === S3ErrEnum.uploadFileTypeMismatch
      ) {
        logger.info('Rejected S3 upload request', {
          key: params.rawKey,
          filename: params.filename,
          message
        });
        return Promise.reject(error);
      }

      logger.error('Failed to create S3 upload URL', {
        key: params.rawKey,
        filename: params.filename,
        error
      });

      return Promise.reject('Failed to create presigned put url');
    }
  }

  /**
   * 初始化知识库 Multipart 上传并创建服务端 upload session。
   *
   * uploadId 只保存在服务端 session 和 TTL，不返回给浏览器。对象存储初始化成功后，任意
   * session/TTL 创建失败都会尽力 abort；若 abort 失败，TTL 会保留 uploadId 供 cron 重试。
   */
  async createMultipartUploadAccessUrl(
    params: CreateMultipartUploadAccessUrlParams,
    options: CreateMultipartUploadAccessUrlOptions = {}
  ): Promise<CreateMultipartUploadAccessUrlResult> {
    return this.createMultipartUploadAccessUrlInternal(params, options);
  }

  private async createMultipartUploadAccessUrlInternal(
    params: CreateMultipartUploadAccessUrlParams,
    options: CreateMultipartUploadAccessUrlOptions = {}
  ): Promise<CreateMultipartUploadAccessUrlResult> {
    let multipartUpload: Awaited<ReturnType<IStorage['createMultipartUpload']>> | undefined;
    let multipartTtlCreated = false;

    try {
      const {
        expiredHours = S3_MULTIPART_SESSION_EXPIRE_HOURS,
        maxFileSize = getSystemMaxFileSize(),
        uploadPolicy,
        partSize = S3_MULTIPART_PART_SIZE_BYTES,
        concurrency = S3_MULTIPART_CONCURRENCY,
        maxRetry = S3_MULTIPART_MAX_RETRY
      } = CreateMultipartUploadAccessUrlOptionsSchema.parse(options);
      const parsedParams = CreateMultipartUploadAccessUrlParamsSchema.parse(params);
      const formatMaxFileSize = maxFileSize * 1024 * 1024;

      if (parsedParams.size > formatMaxFileSize) {
        throw new Error('EntityTooLarge');
      }

      if (Math.ceil(parsedParams.size / partSize) > MAX_MULTIPART_PART_COUNT) {
        throw new Error(`Multipart upload cannot exceed ${MAX_MULTIPART_PART_COUNT} parts`);
      }

      const resolvedFilename = parsedParams.declaredFilename || parsedParams.filename;
      const fileHint = {
        filename: parsedParams.filename,
        ...(parsedParams.contentType ? { contentType: parsedParams.contentType } : {}),
        ...(parsedParams.declaredExtension
          ? { declaredExtension: parsedParams.declaredExtension }
          : {}),
        ...(parsedParams.declaredFilename
          ? { declaredFilename: parsedParams.declaredFilename }
          : {}),
        ...(parsedParams.source ? { source: parsedParams.source } : {}),
        size: parsedParams.size
      };
      const resolvedUploadPolicy = uploadPolicy ?? createUploadPolicy({ hint: fileHint });
      const multipartObjectMarker = randomUUID();
      const metadata = {
        contentDisposition: getContentDisposition({
          filename: resolvedFilename,
          type: 'attachment'
        }),
        originFilename: encodeURIComponent(resolvedFilename),
        uploadTime: new Date().toISOString(),
        ...parsedParams.metadata,
        [MULTIPART_OBJECT_MARKER_METADATA_KEY]: multipartObjectMarker
      };

      multipartUpload = await this.client.createMultipartUpload({
        key: parsedParams.rawKey,
        contentType: resolvedUploadPolicy.defaultContentType,
        contentDisposition: metadata.contentDisposition,
        metadata
      });

      // 先保存 uploadId，再创建 session。若进程在 session 创建前退出，cron 仍能凭 TTL Abort 分片。
      await MongoS3TTL.create({
        minioKey: parsedParams.rawKey,
        bucketName: this.bucketName,
        expiredTime: addHours(new Date(), expiredHours),
        multipart: {
          uploadId: multipartUpload.uploadId,
          objectMarker: multipartObjectMarker,
          totalSize: parsedParams.size
        }
      });
      multipartTtlCreated = true;

      const uploadUrl = await createS3UploadAccessUrl({
        objectKey: parsedParams.rawKey,
        bucketName: this.bucketName,
        expiredTime: addHours(new Date(), expiredHours),
        maxSize: formatMaxFileSize,
        uploadPolicy: resolvedUploadPolicy,
        fileHint,
        metadata,
        multipart: {
          uploadId: multipartUpload.uploadId,
          partSize,
          totalSize: parsedParams.size,
          status: 'active'
        }
      });

      const { url: previewUrl } = await this.createExternalUrl({
        key: parsedParams.rawKey,
        expiredHours,
        filename: resolvedFilename
      });

      return {
        uploadMode: 'multipart',
        url: uploadUrl,
        completeUrl: `${uploadUrl}/complete`,
        abortUrl: `${uploadUrl}/abort`,
        key: parsedParams.rawKey,
        headers: {
          'content-type': resolvedUploadPolicy.defaultContentType
        },
        previewUrl,
        maxSize: formatMaxFileSize,
        partSize,
        concurrency,
        maxRetry
      };
    } catch (error) {
      if (multipartUpload) {
        let providerAbortConfirmed = false;
        try {
          await this.client.abortMultipartUpload({
            key: multipartUpload.key,
            uploadId: multipartUpload.uploadId
          });
          providerAbortConfirmed = true;
        } catch (abortError) {
          providerAbortConfirmed = isNoSuchMultipartUploadError(abortError);
          logger.error('Failed to abort Multipart upload after initialization error', {
            key: multipartUpload.key,
            error: abortError
          });
        }

        if (multipartTtlCreated && providerAbortConfirmed) {
          await MongoS3TTL.deleteOne({
            minioKey: multipartUpload.key,
            bucketName: this.bucketName,
            'multipart.uploadId': multipartUpload.uploadId
          }).catch((ttlError) => {
            logger.error('Failed to remove Multipart TTL after initialization cleanup', {
              key: multipartUpload?.key,
              error: ttlError
            });
          });
        }
      }

      const message = error instanceof Error ? error.message : String(error);
      if (
        message === S3ErrEnum.invalidUploadFileType ||
        message === S3ErrEnum.uploadFileTypeMismatch
      ) {
        return Promise.reject(error);
      }

      logger.error('Failed to create Multipart upload URL', {
        key: params.rawKey,
        filename: params.filename,
        error
      });
      return Promise.reject(error);
    }
  }

  /**
   * 将一个 HTTP 分片流直接转发到对象存储，并返回该分片的 ETag。
   *
   * 每个分片都会重新验证短 token，但不会把请求体读入 Buffer；除最后一个分片外，长度
   * 必须严格等于 session 中的 partSize，避免完成时形成不完整对象。
   */
  async uploadMultipartPart(
    params: UploadMultipartPartAccessParams
  ): Promise<UploadMultipartPartResult> {
    return this.uploadMultipartPartInternal(params);
  }

  private async uploadMultipartPartInternal(
    params: UploadMultipartPartAccessParams
  ): Promise<UploadMultipartPartResult> {
    const payload = await verifyS3MultipartUploadSessionToken(params.token);
    const multipart = payload.multipart;
    if (!multipart) {
      throw new Error('Not a multipart upload session');
    }
    assertActiveMultipartSession(multipart.status);

    const expectedLength = getExpectedMultipartPartLength({
      partNumber: params.partNumber,
      totalSize: multipart.totalSize,
      partSize: multipart.partSize
    });
    if (params.contentLength !== expectedLength) {
      throw new Error('Multipart part length does not match session');
    }

    return this.client.uploadMultipartPart({
      key: payload.objectKey,
      uploadId: multipart.uploadId,
      partNumber: params.partNumber,
      body: params.body,
      contentLength: params.contentLength
    });
  }

  /**
   * 合并客户端提交的分片清单，并在成功后原子地结束 upload session。
   *
   * 先以 CAS 占用 completing 状态，避免 abort 与重复 complete 并发操作同一个 uploadId；
   * provider complete 成功后不再反向 abort，避免删除已经生成的最终对象。
   */
  async completeMultipartUpload(
    params: CompleteMultipartUploadAccessParams
  ): Promise<CompleteMultipartUploadResult> {
    return this.completeMultipartUploadInternal(params);
  }

  private async completeMultipartUploadInternal(
    params: CompleteMultipartUploadAccessParams
  ): Promise<CompleteMultipartUploadResult> {
    const payload = await verifyS3MultipartUploadSessionToken(params.token);
    const multipart = payload.multipart;
    if (!multipart) {
      throw new Error('Not a multipart upload session');
    }

    if (multipart.status === 'completed') {
      await this.finalizeMultipartTtl({
        key: payload.objectKey,
        uploadId: multipart.uploadId
      });
      return {
        bucket: payload.bucketName,
        key: payload.objectKey
      };
    }
    assertCompletableMultipartSession(multipart.status);
    assertCompleteMultipartParts({
      parts: params.parts,
      totalSize: multipart.totalSize,
      partSize: multipart.partSize
    });

    let completionAttemptId: string | null = null;

    /** provider complete 成功或可确认最终对象已存在后，统一收敛 session 和 TTL 状态。 */
    const finalizeCompletedUpload = async (result: CompleteMultipartUploadResult) => {
      if (!completionAttemptId) {
        throw new Error('Multipart completion attempt is missing');
      }

      const markedCompleted = await markS3MultipartUploadCompleted(
        params.token,
        completionAttemptId
      );
      if (!markedCompleted) {
        throw new Error('Multipart upload session state changed during complete');
      }

      try {
        await this.finalizeMultipartTtl({
          key: payload.objectKey,
          uploadId: multipart.uploadId
        });
      } catch (ttlError) {
        logger.error('Failed to finalize Multipart TTL after provider complete', {
          key: payload.objectKey,
          error: ttlError
        });
        throw ttlError;
      }
      return result;
    };

    completionAttemptId = await markS3MultipartUploadCompleting(params.token);
    if (!completionAttemptId) {
      const currentPayload = await verifyS3MultipartUploadSessionToken(params.token);
      const currentMultipart = currentPayload.multipart;
      if (!currentMultipart) {
        throw new Error('Multipart upload session is invalid');
      }
      const currentStatus = currentMultipart.status;
      if (currentStatus === 'completed') {
        await this.finalizeMultipartTtl({
          key: currentPayload.objectKey,
          uploadId: currentMultipart.uploadId
        });
        return {
          bucket: payload.bucketName,
          key: payload.objectKey
        };
      }

      if (currentStatus === 'completing') {
        const reclaimBefore = new Date(Date.now() - S3_MULTIPART_COMPLETING_LEASE_MS);
        const completingAt = currentMultipart.completingAt;
        const leaseExpired = !completingAt || completingAt <= reclaimBefore;
        if (leaseExpired) {
          completionAttemptId = await retryS3MultipartUploadCompleting(params.token, reclaimBefore);
        }
      }

      if (!completionAttemptId) {
        const latestPayload = await verifyS3MultipartUploadSessionToken(params.token);
        if (latestPayload.multipart?.status === 'completed') {
          await this.finalizeMultipartTtl({
            key: latestPayload.objectKey,
            uploadId: latestPayload.multipart.uploadId
          });
          return {
            bucket: payload.bucketName,
            key: payload.objectKey
          };
        }
        throw new Error(
          `Multipart upload session is ${latestPayload.multipart?.status ?? 'invalid'}`
        );
      }
    }

    if (!completionAttemptId) {
      throw new Error('Multipart completion attempt is missing');
    }
    const activeCompletionAttemptId = completionAttemptId;

    let providerCompleted = false;
    try {
      const result = await this.client.completeMultipartUpload({
        key: payload.objectKey,
        uploadId: multipart.uploadId,
        parts: params.parts
      });
      providerCompleted = true;
      return finalizeCompletedUpload(result);
    } catch (error) {
      const reconcileFinalObject = async () => {
        try {
          const objectMarker = payload.metadata?.[MULTIPART_OBJECT_MARKER_METADATA_KEY];
          if (!objectMarker) return 'unmatched' as const;

          const owned = await this.isOwnedMultipartObject({
            key: payload.objectKey,
            objectMarker,
            totalSize: multipart.totalSize
          });
          return owned ? ('exists' as const) : ('unmatched' as const);
        } catch (reconcileError) {
          if (isFileNotFoundError(reconcileError)) return 'missing' as const;

          logger.warn('Failed to reconcile final object after Multipart complete failure', {
            key: payload.objectKey,
            error: reconcileError
          });
          return 'unknown' as const;
        }
      };

      if (providerCompleted) {
        logger.error('Multipart session state update failed after provider complete', {
          key: payload.objectKey,
          error
        });
        throw error;
      }

      const finalObjectState = await reconcileFinalObject();
      if (finalObjectState === 'exists') {
        providerCompleted = true;
        return await finalizeCompletedUpload({
          bucket: payload.bucketName,
          key: payload.objectKey
        });
      }
      if (finalObjectState === 'unknown') {
        // provider 状态不明确时不能 Abort，也不能让当前 attempt 覆盖后续恢复任务。
        throw error;
      }

      // 先用 attempt CAS 结束当前 completion 权，再执行 provider Abort。
      // 如果 worker 已被 reclaim，CAS 失败时必须直接退出，禁止 stale worker Abort 共享 uploadId。
      const markedAborted = await markS3MultipartUploadCompleteFailed(
        params.token,
        activeCompletionAttemptId
      );
      if (!markedAborted) {
        logger.warn('Multipart completion lease lost before abort', {
          key: payload.objectKey,
          completionAttemptId: activeCompletionAttemptId
        });
        throw error;
      }

      let providerAbortConfirmed = false;
      let providerUploadWasMissing = false;
      try {
        await this.client.abortMultipartUpload({
          key: payload.objectKey,
          uploadId: multipart.uploadId
        });
        providerAbortConfirmed = true;
      } catch (abortError) {
        if (isNoSuchMultipartUploadError(abortError)) {
          providerAbortConfirmed = true;
          providerUploadWasMissing = true;
          logger.warn('Multipart upload disappeared while handling complete failure', {
            key: payload.objectKey,
            error: abortError
          });
        } else {
          logger.warn('Failed to abort Multipart upload after complete error', {
            key: payload.objectKey,
            error: abortError
          });
        }
      }

      if (providerAbortConfirmed) {
        const objectMarker = payload.metadata?.[MULTIPART_OBJECT_MARKER_METADATA_KEY];
        if (providerUploadWasMissing && objectMarker) {
          await this.scheduleOwnedMultipartObjectCleanup({
            key: payload.objectKey,
            objectMarker,
            totalSize: multipart.totalSize
          });
        }
        await MongoS3TTL.deleteOne({
          minioKey: payload.objectKey,
          bucketName: payload.bucketName,
          'multipart.uploadId': multipart.uploadId
        });
      }
      throw error;
    }
  }

  /**
   * 取消 Multipart 并清理未完成分片。
   *
   * 必须先用 CAS 占用 active -> aborted，再调用 provider Abort，避免 abort 已经读到 active
   * 后被并发 complete 抢到 completing。provider Abort 失败时保留 TTL，之后仍可用 cron 或
   * 客户端重试；已处于 aborted 的重试也会再次调用 provider Abort。
   */
  async abortMultipartUpload(
    params: AbortMultipartUploadAccessParams
  ): Promise<{ bucket: string; key: string }> {
    return this.abortMultipartUploadInternal(params);
  }

  private async abortMultipartUploadInternal(
    params: AbortMultipartUploadAccessParams
  ): Promise<{ bucket: string; key: string }> {
    const payload = await verifyS3MultipartUploadSessionToken(params.token);
    const multipart = payload.multipart;
    if (!multipart) {
      throw new Error('Not a multipart upload session');
    }

    if (multipart.status === 'completing' || multipart.status === 'completed') {
      return {
        bucket: payload.bucketName,
        key: payload.objectKey
      };
    }

    const markedAborted = await markS3MultipartUploadAborted(params.token);
    if (!markedAborted) {
      const currentPayload = await verifyS3MultipartUploadSessionToken(params.token);
      const currentStatus = currentPayload.multipart?.status;

      if (currentStatus === 'completing' || currentStatus === 'completed') {
        return {
          bucket: payload.bucketName,
          key: payload.objectKey
        };
      }

      if (currentStatus !== 'aborted') {
        throw new Error(`Multipart upload session is ${currentStatus ?? 'invalid'}`);
      }
    }

    try {
      await this.client.abortMultipartUpload({
        key: payload.objectKey,
        uploadId: multipart.uploadId
      });
    } catch (error) {
      if (!isNoSuchMultipartUploadError(error)) throw error;
    }
    await MongoS3TTL.deleteOne({
      minioKey: payload.objectKey,
      bucketName: payload.bucketName,
      'multipart.uploadId': multipart.uploadId
    });

    return {
      bucket: payload.bucketName,
      key: payload.objectKey
    };
  }

  /**
   * 清理没有可用 upload session token 的过期 Multipart upload。
   * 对象存储返回 upload 不存在时按幂等成功处理，便于 TTL 任务重复执行。
   */
  async abortMultipartUploadByUploadId({
    key,
    uploadId,
    objectMarker,
    totalSize
  }: {
    key: string;
    uploadId: string;
    objectMarker?: string;
    totalSize?: number;
  }): Promise<void> {
    return this.abortMultipartUploadByUploadIdInternal({
      key,
      uploadId,
      objectMarker,
      totalSize
    });
  }

  private async abortMultipartUploadByUploadIdInternal({
    key,
    uploadId,
    objectMarker,
    totalSize
  }: {
    key: string;
    uploadId: string;
    objectMarker?: string;
    totalSize?: number;
  }): Promise<void> {
    try {
      await this.client.abortMultipartUpload({ key, uploadId });
    } catch (error) {
      if (!isNoSuchMultipartUploadError(error)) throw error;
    }

    if (objectMarker && totalSize !== undefined) {
      await this.scheduleOwnedMultipartObjectCleanup({
        key,
        objectMarker,
        totalSize
      });
    }
  }

  /**
   * 为对象 key 生成外部可访问 URL。
   *
   * 该方法只负责存储层签名，不做 team/app/dataset/user 的业务归属校验。任何 API 边界或
   * 用户可控 key 调用到这里前，必须先使用对应 S3 source 的 key helper 校验 key
   * 属于当前已鉴权资源。
   */
  async createExternalUrl(params: createPreviewUrlParams) {
    const parsed = CreateGetPresignedUrlParamsSchema.parse(params);

    const { key, expiredHours, responseContentType, filename } = parsed;
    const expires = expiredHours ? expiredHours * 60 * 60 : 30 * 60; // expires 的单位是秒 默认 30 分钟

    return {
      bucket: this.bucketName,
      key,
      url: await createS3DownloadAccessUrl({
        objectKey: key,
        bucketName: this.bucketName,
        expiredTime: addMinutes(new Date(), Math.ceil(expires / 60)),
        filename: filename ?? getDownloadFilenameFromKey(key),
        responseContentType
      })
    };
  }

  async createPreviewUrl(params: createPreviewUrlParams) {
    const parsed = CreateGetPresignedUrlParamsSchema.parse(params);

    const { key, expiredHours, responseContentType } = parsed;
    const expires = expiredHours ? expiredHours * 60 * 60 : 30 * 60; // expires 的单位是秒 默认 30 分钟

    return await this.client.generatePresignedGetUrl({
      key,
      expiredSeconds: expires,
      ...(responseContentType ? { responseContentType } : {})
    });
  }

  async uploadFileByBody(params: UploadFileByBodyParams) {
    const {
      key,
      body,
      filename,
      contentType,
      contentLength,
      expiredTime = addHours(new Date(), 1)
    } = UploadFileByBodySchema.parse(params);
    assertStorageObjectKey(key);

    await MongoS3TTL.create({
      minioKey: key,
      bucketName: this.bucketName,
      expiredTime
    });

    await this.client.uploadObject({
      key,
      body,
      contentType: contentType ?? 'application/octet-stream',
      contentLength,
      contentDisposition: getContentDisposition({ filename, type: 'attachment' }),
      metadata: {
        originFilename: encodeURIComponent(filename),
        uploadTime: new Date().toISOString()
      }
    });

    return {
      key,
      accessUrl: await this.createExternalUrl({
        key,
        expiredHours: Math.max(1, differenceInHours(expiredTime, new Date()))
      })
    };
  }

  async getFileMetadata(key: string) {
    const metadataResponse = await withStorageKeyFallback(key, (candidate) =>
      this.client.getObjectMetadata({ key: candidate })
    ).catch((error) => {
      if (isFileNotFoundError(error)) {
        throw CommonErrEnum.fileNotFound;
      }
      throw error;
    });
    if (!metadataResponse) return;

    const contentLength = metadataResponse.contentLength;
    const filename: string = decodeURIComponent(metadataResponse.metadata.originFilename || '');
    // originFilename 是解码后的纯文件名（不是 URL），直接用 path.extname 解析，
    // 避免 # / ? 等文件名合法字符被当作 URL fragment/query 截断导致扩展名丢失。
    const extension = path.extname(filename).replace(/^\./, '').toLowerCase();
    const contentType: string = metadataResponse.contentType || 'application/octet-stream';

    return {
      filename,
      extension,
      contentType,
      contentLength
    };
  }

  async getFileStream(key: string, options?: { abortSignal?: AbortSignal }) {
    const downloadResponse = await withStorageKeyFallback(key, (candidate) =>
      this.client.downloadObject({
        key: candidate,
        ...(options?.abortSignal ? { abortSignal: options.abortSignal } : {})
      })
    );
    if (!downloadResponse) return;

    return downloadResponse.body;
  }
}

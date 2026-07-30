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
  S3_MULTIPART_CONCURRENCY,
  S3_MULTIPART_COMPLETING_LEASE_MS,
  S3_MULTIPART_UPLOAD_ENABLED,
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
import { isNoSuchMultipartUploadError } from '@fastgpt-sdk/storage';
import { parseFileExtensionFromUrl } from '@fastgpt/global/common/string/tools';
import { getContentDisposition } from '@fastgpt/global/common/file/tools';
import {
  createS3DownloadAccessUrl,
  createS3UploadAccessUrl,
  deleteS3DownloadAliasByObject,
  markS3MultipartUploadAborted,
  markS3MultipartUploadCompleteFailed,
  markS3MultipartUploadCompleting,
  markS3MultipartUploadCompleted,
  retryS3MultipartUploadCompleting,
  verifyS3MultipartUploadSessionToken
} from '../accessLink';
import { CommonErrEnum } from '@fastgpt/global/common/error/code/common';

const logger = getLogger(LogCategories.INFRA.S3);

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
      metadata: {
        contentDisposition: getContentDisposition({ filename, type: 'attachment' }),
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
    if (options?.temporary) {
      await MongoS3TTL.create({
        minioKey: to,
        bucketName: this.bucketName,
        expiredTime: addHours(new Date(), 24)
      });
    }
    return this.client.copyObjectInSelfBucket({ sourceKey: from, targetKey: to });
  }

  async removeObject(objectKey: string): Promise<void> {
    await this.client.deleteObject({ key: objectKey }).catch((err) => {
      if (isFileNotFoundError(err)) {
        return Promise.resolve();
      }
      logger.error('S3 delete object failed', {
        key: objectKey,
        code: err?.code,
        error: err
      });
      throw err;
    });

    deleteS3DownloadAliasByObject({
      bucketName: this.bucketName,
      objectKey
    }).catch((err) => {
      logger.warn('S3 download alias cleanup failed after object delete', {
        key: objectKey,
        bucketName: this.bucketName,
        error: err
      });
    });
  }

  addDeleteJob(params: Omit<Parameters<typeof addS3DelJob>[0], 'bucketName'>) {
    return addS3DelJob({ ...params, bucketName: this.bucketName });
  }

  async isObjectExists(key: string) {
    const { exists } = await this.client.checkObjectExists({ key });

    return exists ?? false;
  }

  /**
   * 根据文件大小统一选择单 PUT 或 S3 Multipart 上传。
   * 未提供文件大小、未开启开关或文件小于阈值时返回 single；大文件才创建 Multipart session。
   */
  async createUploadAccessUrl(
    params: CreatePostPresignedUrlParams,
    options: CreatePostPresignedUrlOptions = {}
  ): Promise<CreatePostPresignedUrlResult> {
    const parsedParams = CreatePostPresignedUrlParamsSchema.parse(params);
    const { size } = parsedParams;

    if (
      S3_MULTIPART_UPLOAD_ENABLED &&
      size !== undefined &&
      size >= S3_MULTIPART_UPLOAD_THRESHOLD_BYTES
    ) {
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
        expiredHours
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
      const metadata = {
        contentDisposition: getContentDisposition({
          filename: resolvedFilename,
          type: 'attachment'
        }),
        originFilename: encodeURIComponent(resolvedFilename),
        uploadTime: new Date().toISOString(),
        ...parsedParams.metadata
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
          uploadId: multipartUpload.uploadId
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
        expiredHours
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

    /** provider complete 成功或可确认最终对象已存在后，统一收敛 session 和 TTL 状态。 */
    const finalizeCompletedUpload = async (result: CompleteMultipartUploadResult) => {
      const markedCompleted = await markS3MultipartUploadCompleted(params.token);
      if (!markedCompleted) {
        throw new Error('Multipart upload session state changed during complete');
      }

      // 最终对象已经存在时不能再 abort。TTL 更新失败保留 multipart 标记，交给清理任务
      // 通过 uploadId 幂等收尾，避免在状态不完整时提交最终对象删除任务。
      await MongoS3TTL.updateOne(
        {
          minioKey: payload.objectKey,
          bucketName: payload.bucketName,
          'multipart.uploadId': multipart.uploadId
        },
        {
          $unset: {
            multipart: 1
          }
        }
      ).catch((ttlError) => {
        logger.error('Failed to finalize Multipart TTL after provider complete', {
          key: payload.objectKey,
          error: ttlError
        });
      });
      return result;
    };

    let markedCompleting = await markS3MultipartUploadCompleting(params.token);
    if (!markedCompleting) {
      const currentPayload = await verifyS3MultipartUploadSessionToken(params.token);
      const currentStatus = currentPayload.multipart?.status;
      if (currentStatus === 'completed') {
        return {
          bucket: payload.bucketName,
          key: payload.objectKey
        };
      }

      if (currentStatus === 'completing') {
        const reclaimBefore = new Date(Date.now() - S3_MULTIPART_COMPLETING_LEASE_MS);
        const completingAt = currentPayload.multipart?.completingAt;
        const leaseExpired = !completingAt || completingAt <= reclaimBefore;
        if (leaseExpired) {
          markedCompleting = await retryS3MultipartUploadCompleting(params.token, reclaimBefore);
        }
      }

      if (!markedCompleting) {
        const latestPayload = await verifyS3MultipartUploadSessionToken(params.token);
        if (latestPayload.multipart?.status === 'completed') {
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
          const { exists } = await this.client.checkObjectExists({ key: payload.objectKey });
          return exists ? ('exists' as const) : ('missing' as const);
        } catch (reconcileError) {
          logger.warn('Failed to reconcile final object after Multipart complete failure', {
            key: payload.objectKey,
            error: reconcileError
          });
          return 'unknown' as const;
        }
      };

      if (!providerCompleted && isNoSuchMultipartUploadError(error)) {
        const finalObjectState = await reconcileFinalObject();
        if (finalObjectState === 'exists') {
          providerCompleted = true;
          return await finalizeCompletedUpload({
            bucket: payload.bucketName,
            key: payload.objectKey
          });
        }
        if (finalObjectState === 'unknown') {
          // NoSuchUpload 只说明 uploadId 不可用；最终对象查询失败时仍无法判断 complete 是否成功。
          // 保留 completing/TTL，等待后续 complete 重试或过期清理，不能先标记 aborted。
          throw error;
        }
      }

      if (providerCompleted) {
        logger.error('Multipart session state update failed after provider complete', {
          key: payload.objectKey,
          error
        });
        throw error;
      }

      let providerAbortConfirmed = false;
      let abortReturnedNoSuchUpload = false;
      try {
        await this.client.abortMultipartUpload({
          key: payload.objectKey,
          uploadId: multipart.uploadId
        });
        providerAbortConfirmed = true;
      } catch (abortError) {
        if (isNoSuchMultipartUploadError(abortError)) {
          // 对 complete 失败来说，Abort 的 NoSuchUpload 也可能是 complete 已经成功后的结果，
          // 必须先核对最终对象，不能直接把 session 收敛成 aborted。
          abortReturnedNoSuchUpload = true;
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

      if (abortReturnedNoSuchUpload) {
        const finalObjectState = await reconcileFinalObject();
        if (finalObjectState === 'exists') {
          providerCompleted = true;
          return await finalizeCompletedUpload({
            bucket: payload.bucketName,
            key: payload.objectKey
          });
        }
        if (finalObjectState === 'unknown') {
          // provider 状态不明确，保留 completing 和 TTL 让后续任务继续收敛。
          throw error;
        }
        providerAbortConfirmed = true;
      }

      if (providerAbortConfirmed) {
        const markedAborted = await markS3MultipartUploadCompleteFailed(params.token);
        if (markedAborted) {
          await MongoS3TTL.deleteOne({
            minioKey: payload.objectKey,
            bucketName: payload.bucketName,
            'multipart.uploadId': multipart.uploadId
          });
        }
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
    uploadId
  }: {
    key: string;
    uploadId: string;
  }): Promise<void> {
    return this.abortMultipartUploadByUploadIdInternal({ key, uploadId });
  }

  private async abortMultipartUploadByUploadIdInternal({
    key,
    uploadId
  }: {
    key: string;
    uploadId: string;
  }): Promise<void> {
    try {
      await this.client.abortMultipartUpload({ key, uploadId });
    } catch (error) {
      if (!isNoSuchMultipartUploadError(error)) throw error;
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

    const { key, expiredHours, responseContentType } = parsed;
    const expires = expiredHours ? expiredHours * 60 * 60 : 30 * 60; // expires 的单位是秒 默认 30 分钟

    return {
      bucket: this.bucketName,
      key,
      url: await createS3DownloadAccessUrl({
        objectKey: key,
        bucketName: this.bucketName,
        expiredTime: addMinutes(new Date(), Math.ceil(expires / 60)),
        filename: path.basename(key),
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
      metadata: {
        contentDisposition: `attachment; filename="${encodeURIComponent(filename)}"`,
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
    const metadataResponse = await this.client.getObjectMetadata({ key }).catch((error) => {
      if (isFileNotFoundError(error)) {
        throw CommonErrEnum.fileNotFound;
      }
      throw error;
    });
    if (!metadataResponse) return;

    const contentLength = metadataResponse.contentLength;
    const filename: string = decodeURIComponent(metadataResponse.metadata.originFilename || '');
    const extension = parseFileExtensionFromUrl(filename);
    const contentType: string = metadataResponse.contentType || 'application/octet-stream';

    return {
      filename,
      extension,
      contentType,
      contentLength
    };
  }

  async getFileStream(key: string, options?: { abortSignal?: AbortSignal }) {
    const downloadResponse = await this.client.downloadObject({
      key,
      ...(options?.abortSignal ? { abortSignal: options.abortSignal } : {})
    });
    if (!downloadResponse) return;

    return downloadResponse.body;
  }
}

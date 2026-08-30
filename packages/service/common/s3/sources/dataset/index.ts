import { S3Sources } from '../../contracts/type';
import { encodeS3ObjectKey } from '../../keySanitizer';
import { S3PrivateBucket } from '../../buckets/private';
import streamConsumer from 'node:stream/consumers';
import {
  type CreateGetDatasetFileURLParams,
  CreateGetDatasetFileURLParamsSchema,
  type CreateUploadDatasetFileParams,
  CreateUploadDatasetFileParamsSchema,
  type DeleteDatasetFilesByPrefixParams,
  DeleteDatasetFilesByPrefixParamsSchema,
  type GetDatasetFileContentParams,
  GetDatasetFileContentParamsSchema,
  type UploadParams,
  UploadParamsSchema
} from './type';
import { MongoS3TTL } from '../../models/ttl';
import { addHours } from 'date-fns';
import { getLogger, LogCategories } from '../../../logger';
import { readFileContentBySource } from '../../../file/read/utils';
import { ensureTextContentTypeCharset, isTextLikeFile, resolveMimeType } from '../../utils/mime';
import { createUploadConstraints, datasetAllowedExtensions } from '../../utils/uploadConstraints';
import { getFileS3Key } from '../../utils';
import { isAuthorizedDatasetFileS3Key } from './key';
import type { S3RawTextSource } from '../rawText';
import { getS3RawTextSource } from '../rawText';
import { getS3UploadContentDisposition, encodeS3Filename } from '../../filename';
import { CommonErrEnum } from '@fastgpt/global/common/error/code/common';
import { createS3FileSource } from '../../../file/read/source';

const logger = getLogger(LogCategories.INFRA.S3);

export class S3DatasetSource extends S3PrivateBucket {
  private rawTextSource: S3RawTextSource;

  constructor() {
    super();
    this.rawTextSource = getS3RawTextSource();
  }

  // 下载链接
  async createGetDatasetFileURL(params: CreateGetDatasetFileURLParams) {
    const { key, expiredHours, external } = CreateGetDatasetFileURLParamsSchema.parse(params);
    const fileMetadata = await this.getFileMetadata(key).catch((error) => {
      if (error === CommonErrEnum.fileNotFound) return undefined;
      throw error;
    });
    const responseContentType =
      fileMetadata && isTextLikeFile(fileMetadata)
        ? ensureTextContentTypeCharset({
            contentType: fileMetadata.contentType,
            filename: fileMetadata.filename
          })
        : undefined;

    if (external) {
      return await this.createExternalUrl({
        key,
        expiredHours,
        responseContentType,
        filename: fileMetadata?.filename
      });
    }
    return await this.createPreviewUrl({ key, expiredHours, responseContentType });
  }

  async createUploadDatasetFileURL(params: CreateUploadDatasetFileParams) {
    const { filename, datasetId, maxFileSize, size } =
      CreateUploadDatasetFileParamsSchema.parse(params);
    const { fileKey } = getFileS3Key.dataset({ datasetId, filename });
    const uploadPolicy = createUploadConstraints({
      filename,
      source: 'local-file',
      ...(size !== undefined ? { size } : {}),
      uploadConstraints: {
        allowedExtensions: datasetAllowedExtensions
      }
    });

    return await this.createUploadAccessUrl(
      {
        rawKey: fileKey,
        filename,
        source: 'local-file',
        ...(size !== undefined ? { size } : {})
      },
      {
        expiredHours: 3,
        maxFileSize,
        uploadPolicy
      }
    );
  }

  // 单个键删除
  deleteDatasetFileByKey(key?: string) {
    return this.addDeleteJob({ key });
  }

  // 多个键删除
  deleteDatasetFilesByKeys(keys: string[]) {
    return this.addDeleteJob({ keys });
  }

  /**
   * 清理尚未被 Collection 事务提升为永久对象的上传文件。必须先确认对象删除成功，再移除 TTL；
   * 删除失败时保留 TTL，让生命周期任务继续兜底。
   */
  async cleanupPendingDatasetFile(key: string) {
    try {
      await this.removeObject(key);
    } catch (error) {
      logger.warn('Pending dataset file cleanup failed; keep TTL for retry', { key, error });
      throw error;
    }

    await MongoS3TTL.deleteOne({ minioKey: key, bucketName: this.bucketName });
  }

  /**
   * 可以根据 datasetId 或者 prefix 删除文件
   * 如果存在 rawPrefix 则优先使用 rawPrefix 去删除文件，否则使用 datasetId 拼接前缀去删除文件
   * 比如根据被解析的文档前缀去删除解析出来的图片
   **/
  deleteDatasetFilesByPrefix(params: DeleteDatasetFilesByPrefixParams) {
    const { datasetId } = DeleteDatasetFilesByPrefixParamsSchema.parse(params);
    const prefix = encodeS3ObjectKey([S3Sources.dataset, datasetId].filter(Boolean).join('/'));
    return this.addDeleteJob({ prefix });
  }

  async getDatasetBase64Image(key: string): Promise<string> {
    const [downloadResponse, fileMetadata] = await Promise.all([
      this.client.downloadObject({ key }),
      this.getFileMetadata(key)
    ]);

    const buffer = await streamConsumer.buffer(downloadResponse.body);
    const base64 = buffer.toString('base64');
    return `data:${fileMetadata?.contentType || 'image/jpeg'};base64,${base64}`;
  }

  async getDatasetFileRawText(params: GetDatasetFileContentParams) {
    const { fileId, teamId, tmbId, customPdfParse, getFormatText, usageId, datasetId } =
      GetDatasetFileContentParamsSchema.parse(params);

    if (!isAuthorizedDatasetFileS3Key({ key: fileId, datasetId })) {
      return Promise.reject('Invalid dataset file key');
    }

    const rawTextBuffer = await this.rawTextSource.getRawTextBuffer({
      customPdfParse,
      sourceId: fileId
    });
    if (rawTextBuffer) {
      return {
        rawText: rawTextBuffer.text,
        filename: rawTextBuffer.filename
      };
    }

    const source = await this.getDatasetFileSource({ fileId, datasetId });
    const filename = source.metadata.filename || '';
    const { fileParsedPrefix } = getFileS3Key.s3Key(fileId);
    const { rawText } = await readFileContentBySource({
      teamId,
      tmbId,
      source,
      customPdfParse,
      usageId,
      getFormatText,
      imageKeyOptions: {
        prefix: fileParsedPrefix
      }
    });

    this.rawTextSource.addRawTextBuffer({
      sourceId: fileId,
      sourceName: filename,
      text: rawText,
      customPdfParse
    });

    return {
      rawText,
      filename
    };
  }

  /**
   * 为已鉴权的 Dataset 对象创建可信 S3 FileSource。HEAD 返回的 Content-Length 只用于解析资源准入，
   * 不重复执行上传阶段的业务大小校验。
   */
  async getDatasetFileSource({ fileId, datasetId }: { fileId: string; datasetId: string }) {
    if (!isAuthorizedDatasetFileS3Key({ key: fileId, datasetId })) {
      throw new Error('Invalid dataset file key');
    }

    const metadata = await this.getFileMetadata(fileId);
    const sizeBytes = metadata?.contentLength;
    if (
      !metadata ||
      typeof sizeBytes !== 'number' ||
      !Number.isSafeInteger(sizeBytes) ||
      sizeBytes < 0
    ) {
      throw new Error('Invalid S3 dataset file metadata');
    }

    return createS3FileSource({
      sizeBytes,
      metadata: {
        filename: metadata.filename,
        contentType: metadata.contentType,
        extension: metadata.extension
      },
      getStream: async (signal) => {
        const stream = await this.getFileStream(fileId, { abortSignal: signal });
        if (!stream) throw new Error('S3 dataset file stream is empty');
        return stream;
      }
    });
  }

  // 根据文件 Buffer 上传文件
  async upload(params: UploadParams): Promise<string> {
    const { datasetId, filename, contentType, ...file } = UploadParamsSchema.parse(params);

    const { fileKey: key } = getFileS3Key.dataset({ datasetId, filename });

    await MongoS3TTL.create({
      minioKey: key,
      bucketName: this.bucketName,
      expiredTime: addHours(new Date(), 3)
    });

    await this.client.uploadObject({
      key,
      body: 'buffer' in file ? file.buffer : file.stream,
      contentType: contentType || resolveMimeType([filename]),
      contentDisposition: getS3UploadContentDisposition({
        filename,
        type: 'attachment'
      }),
      metadata: {
        uploadTime: new Date().toISOString(),
        originFilename: encodeS3Filename(filename)
      }
    });

    return key;
  }
}

export function getS3DatasetSource() {
  if (global.datasetBucket) {
    return global.datasetBucket;
  }
  global.datasetBucket = new S3DatasetSource();
  return global.datasetBucket;
}

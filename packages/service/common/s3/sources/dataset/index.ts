import { S3Sources } from '../../type';
import { S3PrivateBucket } from '../../buckets/private';
import { parseFileExtensionFromUrl } from '@fastgpt/global/common/string/tools';
import {
  type AddRawTextBufferParams,
  AddRawTextBufferParamsSchema,
  type CreateGetDatasetFileURLParams,
  CreateGetDatasetFileURLParamsSchema,
  type CreateUploadDatasetFileParams,
  CreateUploadDatasetFileParamsSchema,
  type DeleteDatasetFilesByPrefixParams,
  DeleteDatasetFilesByPrefixParamsSchema,
  type GetDatasetFileContentParams,
  GetDatasetFileContentParamsSchema,
  type GetRawTextBufferParams,
  type UploadParams,
  UploadParamsSchema
} from './type';
import { MongoS3TTL } from '../../schema';
import { addHours, addMinutes } from 'date-fns';
import { addLog } from '../../../system/log';
import { detectFileEncoding } from '@fastgpt/global/common/file/tools';
import { readS3FileContentByBuffer } from '../../../file/read/utils';
import path from 'node:path';
import { Mimes } from '../../constants';
import { getFileS3Key, truncateFilename } from '../../utils';
import { createHash } from 'node:crypto';
import { S3Error } from 'minio';

export class S3DatasetSource {
  public bucket: S3PrivateBucket;

  constructor() {
    this.bucket = new S3PrivateBucket();
  }

  // 下载链接
  async createGetDatasetFileURL(params: CreateGetDatasetFileURLParams) {
    const { key, expiredHours, external } = CreateGetDatasetFileURLParamsSchema.parse(params);

    if (external) {
      return await this.bucket.createExternalUrl({ key, expiredHours });
    }
    return await this.bucket.createPreviewUrl({ key, expiredHours });
  }

  // 上传链接
  async createUploadDatasetFileURL(params: CreateUploadDatasetFileParams) {
    const { filename, datasetId } = CreateUploadDatasetFileParamsSchema.parse(params);
    const { fileKey } = getFileS3Key.dataset({ datasetId, filename });
    return await this.bucket.createPostPresignedUrl(
      { rawKey: fileKey, filename },
      { expiredHours: 3 }
    );
  }

  /**
   * 可以根据 datasetId 或者 prefix 删除文件
   * 如果存在 rawPrefix 则优先使用 rawPrefix 去删除文件，否则使用 datasetId 拼接前缀去删除文件
   * 比如根据被解析的文档前缀去删除解析出来的图片
   **/
  deleteDatasetFilesByPrefix(params: DeleteDatasetFilesByPrefixParams) {
    const { datasetId } = DeleteDatasetFilesByPrefixParamsSchema.parse(params);
    const prefix = [S3Sources.dataset, datasetId].filter(Boolean).join('/');
    return this.bucket.addDeleteJob({ prefix });
  }

  // 单个键删除
  deleteDatasetFileByKey(key?: string) {
    return this.bucket.addDeleteJob({ key });
  }

  // 多个键删除
  deleteDatasetFilesByKeys(keys: string[]) {
    return this.bucket.addDeleteJob({ keys });
  }

  // 获取文件流
  getDatasetFileStream(key: string) {
    return this.bucket.getObject(key);
  }

  // 获取文件状态
  getDatasetFileStat(key: string) {
    try {
      return this.bucket.statObject(key);
    } catch (error) {
      if (error instanceof S3Error && error.message === 'Not Found') {
        return null;
      }
      return Promise.reject(error);
    }
  }

  // 获取文件元数据
  async getFileMetadata(key: string) {
    const stat = await this.getDatasetFileStat(key);
    if (!stat) return { filename: '', extension: '', contentLength: 0, contentType: '' };

    const contentLength = stat.size;
    const filename: string = decodeURIComponent(stat.metaData['origin-filename']);
    const extension = parseFileExtensionFromUrl(filename);
    const contentType: string = stat.metaData['content-type'];
    return {
      filename,
      extension,
      contentType,
      contentLength
    };
  }

  async getDatasetBase64Image(key: string): Promise<string> {
    const [stream, metadata] = await Promise.all([
      this.getDatasetFileStream(key),
      this.getFileMetadata(key)
    ]);
    const buffer = await this.bucket.fileStreamToBuffer(stream);
    const base64 = buffer.toString('base64');
    return `data:${metadata.contentType || 'image/jpeg'};base64,${base64}`;
  }

  async getDatasetFileRawText(params: GetDatasetFileContentParams) {
    const { fileId, teamId, tmbId, customPdfParse, getFormatText, usageId } =
      GetDatasetFileContentParamsSchema.parse(params);

    const rawTextBuffer = await this.getRawTextBuffer({ customPdfParse, sourceId: fileId });
    if (rawTextBuffer) {
      return {
        rawText: rawTextBuffer.text,
        filename: rawTextBuffer.filename
      };
    }

    const [metadata, stream] = await Promise.all([
      this.getFileMetadata(fileId),
      this.getDatasetFileStream(fileId)
    ]);

    const extension = metadata.extension;
    const filename: string = decodeURIComponent(metadata.filename);

    const start = Date.now();
    const buffer = await this.bucket.fileStreamToBuffer(stream);
    addLog.debug('get dataset file buffer', { time: Date.now() - start });

    const encoding = detectFileEncoding(buffer);
    const { fileParsedPrefix } = getFileS3Key.s3Key(fileId);
    const { rawText } = await readS3FileContentByBuffer({
      teamId,
      tmbId,
      extension,
      buffer,
      encoding,
      customPdfParse,
      usageId,
      getFormatText,
      imageKeyOptions: {
        prefix: fileParsedPrefix
      }
    });

    this.addRawTextBuffer({
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

  // 根据文件 Buffer 上传文件
  async upload(params: UploadParams): Promise<string> {
    const { datasetId, filename, ...file } = UploadParamsSchema.parse(params);

    // 截断文件名以避免 S3 key 过长的问题
    const truncatedFilename = truncateFilename(filename);
    const { fileKey: key } = getFileS3Key.dataset({ datasetId, filename: truncatedFilename });

    const { stream, size } = (() => {
      if ('buffer' in file) {
        return {
          stream: file.buffer,
          size: file.buffer.length
        };
      }
      return {
        stream: file.stream,
        size: file.size
      };
    })();

    await MongoS3TTL.create({
      minioKey: key,
      bucketName: this.bucket.name,
      expiredTime: addHours(new Date(), 3)
    });

    await this.bucket.putObject(key, stream, size, {
      'content-type': Mimes[path.extname(truncatedFilename) as keyof typeof Mimes],
      'upload-time': new Date().toISOString(),
      'origin-filename': encodeURIComponent(truncatedFilename)
    });

    return key;
  }

  async addRawTextBuffer(params: AddRawTextBufferParams) {
    const { sourceId, sourceName, text, customPdfParse } =
      AddRawTextBufferParamsSchema.parse(params);

    // 因为 Key 唯一对应一个 Object 所以不需要根据文件内容计算 Hash 直接用 Key 计算 Hash 就行了
    const hash = createHash('md5').update(sourceId).digest('hex');
    const key = getFileS3Key.rawText({ hash, customPdfParse });

    await MongoS3TTL.create({
      minioKey: key,
      bucketName: this.bucket.name,
      expiredTime: addMinutes(new Date(), 20)
    });

    const buffer = Buffer.from(text);
    await this.bucket.putObject(key, buffer, buffer.length, {
      'content-type': 'text/plain',
      'origin-filename': encodeURIComponent(sourceName),
      'upload-time': new Date().toISOString()
    });

    return key;
  }

  async getRawTextBuffer(params: GetRawTextBufferParams) {
    const { customPdfParse, sourceId } = params;

    const hash = createHash('md5').update(sourceId).digest('hex');
    const key = getFileS3Key.rawText({ hash, customPdfParse });

    if (!(await this.bucket.isObjectExists(key))) return null;

    const [stream, metadata] = await Promise.all([
      this.bucket.getObject(key),
      this.getFileMetadata(key)
    ]);

    const buffer = await this.bucket.fileStreamToBuffer(stream);

    return {
      text: buffer.toString('utf-8'),
      filename: metadata.filename
    };
  }
}

export function getS3DatasetSource() {
  if (global.datasetBucket) {
    return global.datasetBucket;
  }
  global.datasetBucket = new S3DatasetSource();
  return global.datasetBucket;
}

declare global {
  var datasetBucket: S3DatasetSource;
}

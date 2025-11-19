import { S3Sources } from '../../type';
import { S3PrivateBucket } from '../../buckets/private';
import { getNanoid, parseFileExtensionFromUrl } from '@fastgpt/global/common/string/tools';
import {
  type CreateGetDatasetFileURLParams,
  CreateGetDatasetFileURLParamsSchema,
  type CreateUploadDatasetFileParams,
  CreateUploadDatasetFileParamsSchema,
  type DeleteDatasetFilesByPrefixParams,
  DeleteDatasetFilesByPrefixParamsSchema,
  type GetDatasetFileContentParams,
  GetDatasetFileContentParamsSchema,
  type UploadDatasetFileByBufferParams,
  UploadDatasetFileByBufferParamsSchema
} from './type';
import { MongoS3TTL } from '../../schema';
import {
  addDays,
  addHours,
  addMinutes,
  differenceInDays,
  differenceInMilliseconds
} from 'date-fns';
import { addLog } from '../../../system/log';
import { detectFileEncoding } from '@fastgpt/global/common/file/tools';
import { readS3FileContentByBuffer } from '../../../file/read/utils';
import { addRawTextBuffer, getRawTextBuffer } from '../../../buffer/rawText/controller';
import type { ClientSession } from '../../../mongo';
import { MongoDatasetData } from '../../../../core/dataset/data/schema';
import path from 'node:path';
import { Mimes } from '../../constants';
import jwt from 'jsonwebtoken';
import { ERROR_ENUM } from '@fastgpt/global/common/error/errorCode';

type DatasetObjectKey = `${typeof S3Sources.dataset}/${string}`;

class S3DatasetSource {
  public bucket: S3PrivateBucket;
  private static instance: S3DatasetSource;

  constructor() {
    this.bucket = new S3PrivateBucket();
  }

  static getInstance() {
    return (this.instance ??= new S3DatasetSource());
  }

  // 下载链接
  async createGetDatasetFileURL(params: CreateGetDatasetFileURLParams) {
    const { key, expiredHours, external } = CreateGetDatasetFileURLParamsSchema.parse(params);

    if (external) {
      return await this.bucket.createExtenalUrl({ key, expiredHours });
    }
    return await this.bucket.createPreviewlUrl({ key, expiredHours });
  }

  // 上传链接
  async createUploadDatasetFileURL(params: CreateUploadDatasetFileParams) {
    const { filename, datasetId } = CreateUploadDatasetFileParamsSchema.parse(params);
    const rawKey = [S3Sources.dataset, datasetId, `${getNanoid(6)}-${filename}`].join('/');
    return await this.bucket.createPostPresignedUrl({ rawKey, filename }, { expiredHours: 3 });
  }

  /**
   * 可以根据 datasetId 或者 prefix 删除文件
   * 如果存在 rawPrefix 则优先使用 rawPrefix 去删除文件，否则使用 datasetId 拼接前缀去删除文件
   * 比如根据被解析的文档前缀去删除解析出来的图片
   **/
  deleteDatasetFilesByPrefix(params: DeleteDatasetFilesByPrefixParams) {
    const { datasetId, rawPrefix } = DeleteDatasetFilesByPrefixParamsSchema.parse(params);
    const prefix = rawPrefix || [S3Sources.dataset, datasetId].filter(Boolean).join('/');
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
    return this.bucket.statObject(key);
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

  isDatasetObjectKey(key?: string): key is DatasetObjectKey {
    return typeof key === 'string' && key.startsWith(`${S3Sources.dataset}/`);
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
    const { fileId, teamId, tmbId, customPdfParse, getFormatText, usageId, datasetId } =
      GetDatasetFileContentParamsSchema.parse(params);

    const bufferId = `${fileId}-${customPdfParse}`;
    const fileBuffer = await getRawTextBuffer(bufferId);
    if (fileBuffer) {
      return {
        rawText: fileBuffer.text,
        filename: fileBuffer.sourceName
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
    const prefix = `${path.dirname(fileId)}/${path.basename(fileId, path.extname(fileId))}-parsed`;
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
        prefix: prefix
      }
    });

    addRawTextBuffer({
      sourceId: bufferId,
      sourceName: filename,
      text: rawText,
      expiredTime: addMinutes(new Date(), 20)
    });

    return {
      rawText,
      filename
    };
  }

  // 根据文件 Buffer 上传文件
  async uploadDatasetFileByBuffer(params: UploadDatasetFileByBufferParams): Promise<string> {
    const { datasetId, buffer, filename } = UploadDatasetFileByBufferParamsSchema.parse(params);

    const key = [S3Sources.dataset, datasetId, `${getNanoid(6)}-${filename}`].join('/');
    await this.bucket.putObject(key, buffer, buffer.length, {
      'content-type': Mimes[path.extname(filename) as keyof typeof Mimes],
      'upload-time': new Date().toISOString(),
      'origin-filename': encodeURIComponent(filename)
    });
    await MongoS3TTL.create({
      minioKey: key,
      bucketName: this.bucket.name,
      expiredTime: addHours(new Date(), 3)
    });
    return key;
  }
}

export function getS3DatasetSource() {
  return S3DatasetSource.getInstance();
}

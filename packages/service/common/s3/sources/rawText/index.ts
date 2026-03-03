import { S3PrivateBucket } from '../../buckets/private';
import {
  type AddRawTextBufferParams,
  AddRawTextBufferParamsSchema,
  type GetRawTextBufferParams
} from './type';
import { MongoS3TTL } from '../../schema';
import { addMinutes } from 'date-fns';
import { getFileS3Key } from '../../utils';
import { createHash } from 'node:crypto';
import streamConsumer from 'node:stream/consumers';

export class S3RawTextSource extends S3PrivateBucket {
  constructor() {
    super();
  }

  // 获取文件元数据
  async getFilename(key: string) {
    const metadataResponse = await this.client.getObjectMetadata({ key });
    if (!metadataResponse) return '';

    const filename: string = decodeURIComponent(metadataResponse.metadata.originFilename || '');
    return filename;
  }

  async addRawTextBuffer(params: AddRawTextBufferParams) {
    const { sourceId, sourceName, text, customPdfParse } =
      AddRawTextBufferParamsSchema.parse(params);

    // 因为 Key 唯一对应一个 Object 所以不需要根据文件内容计算 Hash 直接用 Key 计算 Hash 就行了
    const hash = createHash('md5').update(sourceId).digest('hex');
    const key = getFileS3Key.rawText({ hash, customPdfParse });
    const buffer = Buffer.from(text);

    await MongoS3TTL.create({
      minioKey: key,
      bucketName: this.bucketName,
      expiredTime: addMinutes(new Date(), 20)
    });

    await this.client.uploadObject({
      key,
      body: buffer,
      contentType: 'text/plain',
      metadata: {
        originFilename: encodeURIComponent(sourceName),
        uploadTime: new Date().toISOString()
      }
    });

    return key;
  }

  async getRawTextBuffer(params: GetRawTextBufferParams) {
    const { customPdfParse, sourceId } = params;

    const hash = createHash('md5').update(sourceId).digest('hex');
    const key = getFileS3Key.rawText({ hash, customPdfParse });

    if (!(await this.isObjectExists(key))) return null;

    const [downloadResponse, fileMetadata] = await Promise.all([
      this.client.downloadObject({ key }),
      this.getFileMetadata(key)
    ]);

    const buffer = await streamConsumer.buffer(downloadResponse.body);

    return {
      text: buffer.toString('utf-8'),
      filename: fileMetadata?.filename || ''
    };
  }
}

export function getS3RawTextSource() {
  if (global.rawTextBucket) {
    return global.rawTextBucket;
  }
  global.rawTextBucket = new S3RawTextSource();
  return global.rawTextBucket;
}

declare global {
  var rawTextBucket: S3RawTextSource;
}

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

export class S3RawTextSource extends S3PrivateBucket {
  constructor() {
    super();
  }

  // 获取文件元数据
  async getFilename(key: string) {
    const stat = await this.statObject(key);
    if (!stat) return '';

    const filename: string = decodeURIComponent(stat.metaData['origin-filename']);
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

    await this.putObject(key, buffer, buffer.length, {
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

    if (!(await this.isObjectExists(key))) return null;

    const [stream, filename] = await Promise.all([this.getFileStream(key), this.getFilename(key)]);

    const buffer = await this.fileStreamToBuffer(stream);

    return {
      text: buffer.toString('utf-8'),
      filename
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

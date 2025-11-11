import { getNanoid } from '@fastgpt/global/common/string/tools';
import { S3PrivateBucket } from '../../buckets/private';
import { S3Sources } from '../../type';
import {
  type CheckChatFileKeys,
  type DelChatFileByPrefixParams,
  ChatFileUploadSchema,
  DelChatFileByPrefixSchema
} from './type';
import { MongoS3TTL } from '../../schema';
import { addHours } from 'date-fns';

class S3ChatSource {
  private bucket: S3PrivateBucket;
  private static instance: S3ChatSource;

  constructor() {
    this.bucket = new S3PrivateBucket();
  }

  static getInstance() {
    return (this.instance ??= new S3ChatSource());
  }

  static isChatFileKey(key?: string): key is `${typeof S3Sources.chat}/${string}` {
    return key?.startsWith(`${S3Sources.chat}/`) ?? false;
  }

  async createGetChatFileURL(params: { key: string; expiredHours?: number; external: boolean }) {
    const { key, expiredHours = 1, external = false } = params; // 默认一个小时

    if (external) {
      return await this.bucket.createExtenalUrl({ key, expiredHours });
    }
    return await this.bucket.createPreviewlUrl({ key, expiredHours });
  }

  async createUploadChatFileURL(params: CheckChatFileKeys) {
    const { appId, chatId, uId, filename } = ChatFileUploadSchema.parse(params);
    const rawKey = [S3Sources.chat, appId, uId, chatId, `${getNanoid(6)}-${filename}`].join('/');
    await MongoS3TTL.create({
      minioKey: rawKey,
      bucketName: this.bucket.name,
      expiredTime: addHours(new Date(), 24)
    });
    return await this.bucket.createPostPresignedUrl({ rawKey, filename });
  }

  deleteChatFilesByPrefix(params: DelChatFileByPrefixParams) {
    const { appId, chatId, uId } = DelChatFileByPrefixSchema.parse(params);

    const prefix = [S3Sources.chat, appId, uId, chatId].filter(Boolean).join('/');
    return this.bucket.addDeleteJob({ prefix });
  }

  deleteChatFileByKey(key: string) {
    return this.bucket.addDeleteJob({ key });
  }
}

export function getS3ChatSource() {
  return S3ChatSource.getInstance();
}

import { getNanoid } from '@fastgpt/global/common/string/tools';
import { S3PrivateBucket } from '../../buckets/private';
import { S3Sources } from '../../type';
import { type CheckChatFileKeys, CheckChatFileKeysSchema } from './type';
import { z } from 'zod';

class S3ChatSource {
  private bucket: S3PrivateBucket;
  private static instance: S3ChatSource;

  constructor() {
    this.bucket = new S3PrivateBucket();
  }

  static getInstance() {
    return (this.instance ??= new S3ChatSource());
  }

  async createGetChatFileURL(params: { key: string; expiredHours?: number }) {
    const { key, expiredHours = 1 } = params; // 默认一个小时
    return await this.bucket.createGetPresignedUrl({ key, expiredHours });
  }

  async createUploadChatFileURL(params: CheckChatFileKeys) {
    const { appId, chatId, uId, filename } = CheckChatFileKeysSchema.parse(params);
    const rawKey = [S3Sources.chat, appId, uId, chatId, `${getNanoid(6)}-${filename}`].join('/');
    return await this.bucket.createPostPresignedUrl({ rawKey, filename });
  }

  deleteChatFilesByPrefix(
    params: Omit<CheckChatFileKeys, 'filename' | 'chatId'> & { chatId?: string }
  ) {
    const { appId, chatId, uId } = CheckChatFileKeysSchema.omit({ filename: true })
      .extend({ chatId: z.string().optional() })
      .parse(params);

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

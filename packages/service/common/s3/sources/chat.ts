import { getNanoid } from '@fastgpt/global/common/string/tools';
import { S3PrivateBucket } from '../buckets/private';
import { S3Sources } from '../type';

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

  async createUploadChatFileURL({
    filename,
    chatId,
    appId
  }: {
    filename: string;
    chatId: string;
    appId: string;
  }) {
    const rawKey = `${S3Sources.chat}/${appId}/${chatId}/${getNanoid(6)}-${filename}`;
    return await this.bucket.createPostPresignedUrl({ rawKey, filename });
  }

  private trimSlashes(str: string): string {
    let trimmed = str;
    if (trimmed.startsWith('/')) trimmed = trimmed.slice(1);
    if (trimmed.endsWith('/')) trimmed = trimmed.slice(0, -1);
    return trimmed;
  }

  deleteChatFilesByPrefix(prefix: string) {
    const objectPrefix = `${S3Sources.chat}/${this.trimSlashes(prefix)}`;

    return new Promise<boolean>((resolve, reject) => {
      const stream = this.bucket.listObjectsV2(objectPrefix, true);
      stream.on('data', (file) => {
        if (file.name) {
          this.bucket.delete(file.name);
        }
      });
      stream.on('error', (error) => {
        console.error(error);
        reject(error);
      });
      stream.on('end', () => {
        resolve(true);
      });
    });
  }

  deleteChatFileByKey(key: string) {
    return this.bucket.delete(key);
  }
}

export function getS3ChatSource() {
  return S3ChatSource.getInstance();
}

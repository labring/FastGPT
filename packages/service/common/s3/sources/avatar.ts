import { S3Sources } from '../type';
import { MongoS3TTL } from '../../file/s3Ttl/schema';
import { S3PublicBucket } from '../buckets/public';
import { imageBaseUrl } from '@fastgpt/global/common/file/image/constants';
import type { ClientSession } from '../../mongo';

class S3AvatarSource {
  private bucket: S3PublicBucket;
  private static instance: S3AvatarSource;

  constructor() {
    this.bucket = new S3PublicBucket();
  }

  static getInstance() {
    return (this.instance ??= new S3AvatarSource());
  }

  async createPostPresignedUrl(params: { filename: string; teamId: string }) {
    return this.bucket.createPostPresignedUrl(
      { ...params, source: S3Sources.avatar },
      { expiredHours: 1 * 24 } // 1 day
    );
  }

  createPublicUrl(objectKey: string): string {
    return this.bucket.createPublicUrl(objectKey);
  }

  async deleteAvatar(avatar: string, session?: ClientSession): Promise<string> {
    const key = avatar.slice(imageBaseUrl.length);
    await MongoS3TTL.deleteOne({ minioKey: key, bucketName: this.bucket.name }, { session });
    await this.bucket.delete(key);
    return key;
  }

  async removeAvatarTTL(avatar: string, session?: ClientSession): Promise<string> {
    const key = avatar.slice(imageBaseUrl.length);
    await MongoS3TTL.deleteOne({ minioKey: key, bucketName: this.bucket.name }, { session });
    return key;
  }
}

export function getS3AvatarSource() {
  return S3AvatarSource.getInstance();
}

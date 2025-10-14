import { S3Sources } from '../type';
import { MongoS3TTL } from '../schema';
import { S3PublicBucket } from '../buckets/public';
import { imageBaseUrl } from '@fastgpt/global/common/file/image/constants';

class S3AvatarSource {
  private bucket: S3PublicBucket;
  private static instance: S3AvatarSource;

  constructor() {
    this.bucket = new S3PublicBucket();
  }

  static getInstance() {
    return (this.instance ??= new S3AvatarSource());
  }

  get prefix(): string {
    return imageBaseUrl;
  }

  async createUploadAvatarURL(params: { filename: string; teamId: string }) {
    return this.bucket.createPostPresignedUrl(
      { ...params, source: S3Sources.avatar },
      { expiredHours: 1 * 24 } // 1 day
    );
  }

  createPublicUrl(objectKey: string): string {
    return this.bucket.createPublicUrl(objectKey);
  }

  async deleteAvatar(avatar: string): Promise<string> {
    const key = avatar.slice(this.prefix.length);

    // check if the avatar has a TTL record
    const snapshot = await MongoS3TTL.findOne({ minioKey: key, bucketName: this.bucket.name });
    if (snapshot) {
      // if has, delete both of the TTL record and the avatar in S3
      await MongoS3TTL.deleteOne({ minioKey: key, bucketName: this.bucket.name });

      try {
        await this.bucket.delete(key);
      } catch (error) {
        // do the compensate
        await MongoS3TTL.insertOne({
          minioKey: snapshot.minioKey,
          bucketName: snapshot.bucketName,
          expiredTime: snapshot.expiredTime
        });
        return Promise.reject(error);
      }
    } else {
      // if hasn't, only delete the avatar in S3 is enough
      await this.bucket.delete(key);
    }

    return key;
  }

  async removeAvatarTTL(avatar: string): Promise<string> {
    const key = avatar.slice(this.prefix.length);
    await MongoS3TTL.deleteOne({ minioKey: key, bucketName: this.bucket.name });
    return key;
  }
}

export function getS3AvatarSource() {
  return S3AvatarSource.getInstance();
}

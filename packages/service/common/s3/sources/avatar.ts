import { S3BaseSource } from './base';
import {
  S3Sources,
  S3APIPrefix,
  type CreatePostPresignedUrlOptions,
  type CreatePostPresignedUrlParams,
  type CreatePostPresignedUrlResult,
  type S3Options
} from '../type';
import type { S3PublicBucket } from '../buckets/public';
import { MongoS3Ttl } from '../../file/s3Ttl/schema';

class S3AvatarSource extends S3BaseSource<S3PublicBucket> {
  constructor(options?: Partial<S3Options>) {
    super(S3Sources.avatar, true, options);
  }

  static getInstance(options?: Partial<S3Options>): S3AvatarSource {
    return S3BaseSource._getInstance(S3AvatarSource, options);
  }

  override createPostPresignedUrl(
    params: Omit<CreatePostPresignedUrlParams, 'source' | 'visibility'>,
    options: CreatePostPresignedUrlOptions = {}
  ): Promise<CreatePostPresignedUrlResult> {
    return this.bucket.createPostPresignedUrl(
      {
        ...params,
        source: S3Sources.avatar
      },
      options
    );
  }

  createPublicUrl(objectKey: string): string {
    return this.bucket.createPublicUrl(objectKey);
  }

  createAvatarObjectKey(avatarWithPrefix: string): string {
    return avatarWithPrefix.replace(S3APIPrefix.avatar, '');
  }

  async removeAvatar(avatarWithPrefix: string): Promise<void> {
    const avatarObjectKey = this.createAvatarObjectKey(avatarWithPrefix);
    await MongoS3Ttl.deleteOne({ minioKey: avatarObjectKey, bucketName: this.bucketName });
    await this.bucket.delete(avatarObjectKey);
  }

  async moveAvatarFromTemp(tempAvatarWithPrefix: string): Promise<string> {
    const tempAvatarObjectKey = this.createAvatarObjectKey(tempAvatarWithPrefix);
    const avatarObjectKey = tempAvatarObjectKey.replace(`${S3Sources.temp}/`, '');

    try {
      const file = await MongoS3Ttl.findOne({
        bucketName: this.bucketName,
        minioKey: tempAvatarObjectKey
      });
      if (file) {
        file.set({ expiredTime: undefined, minioKey: avatarObjectKey });
        await file.save();
      }
    } catch (error) {
      console.error('Failed to convert TTL to permanent:', error);
    }

    await this.bucket.move(tempAvatarObjectKey, avatarObjectKey);

    return S3APIPrefix.avatar + avatarObjectKey;
  }
}

export function getS3AvatarSource() {
  return S3AvatarSource.getInstance();
}

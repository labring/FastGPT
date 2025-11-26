import { S3Sources } from '../type';
import { MongoS3TTL } from '../schema';
import { S3PublicBucket } from '../buckets/public';
import { imageBaseUrl } from '@fastgpt/global/common/file/image/constants';
import type { ClientSession } from 'mongoose';

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

  async createUploadAvatarURL({
    filename,
    teamId,
    autoExpired = true
  }: {
    filename: string;
    teamId: string;
    autoExpired?: boolean;
  }) {
    return this.bucket.createPostPresignedUrl(
      { filename, teamId, source: S3Sources.avatar },
      {
        expiredHours: autoExpired ? 1 : undefined, // 1 Hours
        maxFileSize: 5 // 5MB
      }
    );
  }

  createPublicUrl(objectKey: string): string {
    return this.bucket.createPublicUrl(objectKey);
  }

  async removeAvatarTTL(avatar: string, session?: ClientSession): Promise<void> {
    const key = avatar.slice(this.prefix.length);
    await MongoS3TTL.deleteOne({ minioKey: key, bucketName: this.bucket.name }, session);
  }

  async deleteAvatar(avatar: string, session?: ClientSession): Promise<void> {
    const key = avatar.slice(this.prefix.length);
    await MongoS3TTL.deleteOne({ minioKey: key, bucketName: this.bucket.name }, session);
    await this.bucket.delete(key);
  }

  async refreshAvatar(newAvatar?: string, oldAvatar?: string, session?: ClientSession) {
    if (!newAvatar || newAvatar === oldAvatar) return;

    // remove the TTL for the new avatar
    await this.removeAvatarTTL(newAvatar, session);

    if (oldAvatar) {
      // delete the old avatar
      // 1. delete the TTL record if it exists
      // 2. delete the avatar in S3
      await this.deleteAvatar(oldAvatar, session);
    }
  }

  async copyAvatar({
    key,
    teamId,
    filename,
    temporary = false
  }: {
    key: string;
    teamId: string;
    filename: string;
    temporary: boolean;
  }) {
    const from = key.slice(this.prefix.length);
    const to = `${S3Sources.avatar}/${teamId}/${filename}`;
    await this.bucket.copy({ from, to, options: { temporary } });
    return this.prefix.concat(to);
  }
}

export function getS3AvatarSource() {
  return S3AvatarSource.getInstance();
}
